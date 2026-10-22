/* =========================================================
   server/db.js

   PostgreSQL storage for chat messages (database: chat_app).

   Configure in server/.env :
     DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/chat_app
   or the separate variables:
     PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE

   The table is created automatically on start-up (see schema.sql).
========================================================= */

const { Pool } = require("pg");

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { database: process.env.PGDATABASE || "chat_app" } // host/user/password: PG* env vars
);

/* an idle-client error must not crash the server */
pool.on("error", (err) => console.error("🐘 postgres pool error:", err.message));

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL    PRIMARY KEY,
    sender      TEXT         NOT NULL,
    receiver    TEXT         NOT NULL,
    text        TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS messages_sender_idx   ON messages (sender,   created_at);
  CREATE INDEX IF NOT EXISTS messages_receiver_idx ON messages (receiver, created_at);

  /* family members (the people who can log in / chat) */
  CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL    PRIMARY KEY,
    username    TEXT         NOT NULL,
    email       TEXT         NOT NULL,
    gender      CHAR(1)      CHECK (gender IN ('M', 'F')),
    avatar      TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
  );
  /* no two members with the same name / email (ignoring upper/lower case) */
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON users (lower(email));

  /* group chats */
  CREATE TABLE IF NOT EXISTS chat_groups (
    id          BIGSERIAL    PRIMARY KEY,
    name        TEXT         NOT NULL,
    created_by  TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id    BIGINT       NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
    username    TEXT         NOT NULL,
    joined_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, username)
  );
  CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (username);

  /* messages can now go to a group, and can carry an image.
     (these ALTERs are safe to run again on an existing database) */
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS group_id  BIGINT REFERENCES chat_groups(id) ON DELETE CASCADE;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
  ALTER TABLE messages ALTER COLUMN receiver DROP NOT NULL;
  CREATE INDEX IF NOT EXISTS messages_group_idx ON messages (group_id, created_at);

  /* a message goes to exactly ONE target: a person OR a group */
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_target_chk') THEN
      ALTER TABLE messages
        ADD CONSTRAINT messages_target_chk
        CHECK ((receiver IS NOT NULL) <> (group_id IS NOT NULL));
    END IF;
  END $$;
`;

/* the original four, always present */
const DEMO_USERS = [
  { username: "Sarah",  gender: "F", avatar: "👩🏻" },
  { username: "Robert", gender: "M", avatar: "👨🏻" },
  { username: "Linda",  gender: "F", avatar: "👩🏻" },
  { username: "Mike",   gender: "M", avatar: "👦🏻" },
];

const emailFor = (name) => `${name.toLowerCase()}@example.com`;

/* shape the client already understands: { id, from, to, text, time } */
const toMessage = (row) => ({
  id: String(row.id),
  from: row.sender,
  to: row.receiver, // null for group messages
  groupId: row.group_id ? String(row.group_id) : null,
  text: row.text,
  imageUrl: row.image_url || null, // e.g. "/uploads/ab12....png"
  time: row.created_at.toISOString(),
});

/* demo conversation, inserted only when the table is empty */
const SEED = [
  { from: "Linda",  to: "Sarah", text: "Don't forget family dinner this Sunday!", hoursAgo: 3 },
  { from: "Mike",   to: "Sarah", text: "Can you check the family tree?",           hoursAgo: 20 },
  { from: "Robert", to: "Sarah", text: "I uploaded the Easter photos.",            hoursAgo: 24 },
];

/* Insert members. Names/emails that already exist are skipped, so this is
   safe to run again and again. Returns how many were really added. */
async function addMembers(list) {
  let added = 0;
  for (const m of list) {
    const r = await pool.query(
      `INSERT INTO users (username, email, gender, avatar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [m.username, m.email || emailFor(m.username), m.gender || null, m.avatar || null]
    );
    added += r.rowCount;
  }
  return added;
}

/* everyone, A-Z, in the shape the client uses */
async function listMembers() {
  const { rows } = await pool.query(
    `SELECT username, email, gender, avatar FROM users ORDER BY lower(username)`
  );
  return rows.map((r) => ({
    name: r.username,
    email: r.email,
    gender: r.gender,
    avatar: r.avatar || "👤",
  }));
}

async function initDb() {
  await pool.query(SCHEMA);
  await addMembers(DEMO_USERS);

  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM messages");
  if (rows[0].n === 0) {
    for (const m of SEED) {
      await pool.query(
        `INSERT INTO messages (sender, receiver, text, created_at)
         VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
        [m.from, m.to, m.text, String(m.hoursAgo)]
      );
    }
    console.log("🐘 inserted demo chat messages");
  }
  console.log("🐘 PostgreSQL connected, chat messages table ready");
}

/* the user's latest conversations, oldest first */
async function getHistory(username, limit = 500) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM messages
       WHERE sender = $1 OR receiver = $1
          OR group_id IN (SELECT group_id FROM group_members WHERE username = $1)
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     ) latest
     ORDER BY created_at ASC, id ASC`,
    [username, limit]
  );
  return rows.map(toMessage);
}

/* send to a person (`to`) OR to a group (`groupId`), with text and/or an image */
async function saveMessage({ from, to = null, groupId = null, text = "", imageUrl = null }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (sender, receiver, group_id, text, image_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [from, to, groupId, text, imageUrl]
  );
  return toMessage(rows[0]);
}

/* Delete a message, but ONLY if `username` is the one who sent it.
   The "AND sender = $2" is the permission check: someone else's message
   matches nothing, so nothing is deleted.
   Returns the deleted message (so we know who to notify) or null. */
async function deleteMessage({ id, username }) {
  if (!/^\d+$/.test(String(id))) return null; // ids are numbers only
  const { rows } = await pool.query(
    `DELETE FROM messages
     WHERE id = $1 AND sender = $2
     RETURNING *`,
    [id, username]
  );
  return rows[0] ? toMessage(rows[0]) : null;
}

/* the real (correctly capitalised) username, or null if nobody has that name */
async function findUser(name) {
  const { rows } = await pool.query(
    `SELECT username FROM users WHERE lower(username) = lower($1)`,
    [String(name || "")]
  );
  return rows[0] ? rows[0].username : null;
}

/* ---------------- groups ---------------- */

const isId = (v) => /^\d+$/.test(String(v));

const toGroup = (row) => ({
  id: String(row.id),
  name: row.name,
  createdBy: row.created_by,
  members: row.members,
});

/* everyone in a group, as an array of usernames */
async function getGroupMembers(groupId) {
  if (!isId(groupId)) return [];
  const { rows } = await pool.query(
    `SELECT username FROM group_members WHERE group_id = $1 ORDER BY lower(username)`,
    [groupId]
  );
  return rows.map((r) => r.username);
}

const GROUP_SELECT = `
  SELECT g.id, g.name, g.created_by,
         ARRAY(SELECT username FROM group_members
               WHERE group_id = g.id ORDER BY lower(username)) AS members
  FROM chat_groups g`;

async function getGroup(groupId) {
  if (!isId(groupId)) return null;
  const { rows } = await pool.query(`${GROUP_SELECT} WHERE g.id = $1`, [groupId]);
  return rows[0] ? toGroup(rows[0]) : null;
}

/* all the groups a user belongs to */
async function getGroupsFor(username) {
  const { rows } = await pool.query(
    `${GROUP_SELECT}
     WHERE EXISTS (SELECT 1 FROM group_members m
                   WHERE m.group_id = g.id AND m.username = $1)
     ORDER BY g.created_at, g.id`,
    [username]
  );
  return rows.map(toGroup);
}

/* Create a group. Only real members are kept; the creator is always included.
   Returns { group } or { error }. */
async function createGroup({ name, creator, members }) {
  const wanted = [...new Set([creator, ...members].map((m) => String(m).toLowerCase()))];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT username FROM users WHERE lower(username) = ANY($1::text[]) ORDER BY lower(username)`,
      [wanted]
    );
    const names = found.rows.map((r) => r.username);
    const me = names.find((n) => n.toLowerCase() === String(creator).toLowerCase());

    if (!me) {
      await client.query("ROLLBACK");
      return { error: "Unknown user" };
    }
    if (names.length < 2) {
      await client.query("ROLLBACK");
      return { error: "A group needs at least 2 members" };
    }

    const g = await client.query(
      `INSERT INTO chat_groups (name, created_by) VALUES ($1, $2) RETURNING *`,
      [name, me]
    );
    for (const n of names) {
      await client.query(
        `INSERT INTO group_members (group_id, username) VALUES ($1, $2)`,
        [g.rows[0].id, n]
      );
    }
    await client.query("COMMIT");
    return { group: toGroup({ ...g.rows[0], members: names }) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* Leave a group. When the last person leaves, the group and all its messages
   are deleted. Returns { remaining, images } or null if you were not a member.
   `images` = files of a deleted group, so the server can remove them from disk. */
async function leaveGroup({ groupId, username }) {
  if (!isId(groupId)) return null;
  const left = await pool.query(
    `DELETE FROM group_members WHERE group_id = $1 AND username = $2`,
    [groupId, username]
  );
  if (left.rowCount === 0) return null;

  const remaining = await getGroupMembers(groupId);
  let images = [];
  if (remaining.length === 0) {
    const r = await pool.query(
      `SELECT image_url FROM messages WHERE group_id = $1 AND image_url IS NOT NULL`,
      [groupId]
    );
    images = r.rows.map((x) => x.image_url);
    await pool.query(`DELETE FROM chat_groups WHERE id = $1`, [groupId]); // messages cascade
  }
  return { remaining, images };
}

module.exports = {
  pool,
  initDb,
  getHistory,
  saveMessage,
  deleteMessage,
  addMembers,
  listMembers,
  findUser,
  getGroup,
  getGroupsFor,
  getGroupMembers,
  createGroup,
  leaveGroup,
};
