
/* =========================================================
   server/db.js

   PostgreSQL storage for:
   - Chat messages
   - Users and accounts
   - Group chats
   - User login sessions

   Configure in server/.env:

   DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/chat_app

   Or use:
   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
========================================================= */

const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { database: process.env.PGDATABASE || "chat_app" }
);

/* An idle-client error must not crash the server */
pool.on("error", (err) => {
  console.error("🐘 postgres pool error:", err.message);
});

/* =========================================================
   DATABASE SCHEMA
========================================================= */

const SCHEMA = `
  /* ---------------- messages ---------------- */

  CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    sender      TEXT NOT NULL,
    receiver    TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON messages (sender, created_at);

  CREATE INDEX IF NOT EXISTS messages_receiver_idx
  ON messages (receiver, created_at);


  /* ---------------- users ---------------- */

  CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    username    TEXT NOT NULL,
    email       TEXT NOT NULL,
    gender      CHAR(1) CHECK (gender IN ('M', 'F')),
    avatar      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_username_key
  ON users (lower(username));

  CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
  ON users (lower(email));

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dob DATE;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_place TEXT;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_city TEXT;

  ALTER TABLE users
  ADD COLUMN IF NOT EXISTS occupation TEXT;


  /* ---------------- group chats ---------------- */

  CREATE TABLE IF NOT EXISTS chat_groups (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id    BIGINT NOT NULL
                REFERENCES chat_groups(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, username)
  );

  CREATE INDEX IF NOT EXISTS group_members_user_idx
  ON group_members (username);


  /* ---------------- group messages ---------------- */

  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS group_id BIGINT
  REFERENCES chat_groups(id) ON DELETE CASCADE;

  ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

  ALTER TABLE messages
  ALTER COLUMN receiver DROP NOT NULL;

  CREATE INDEX IF NOT EXISTS messages_group_idx
  ON messages (group_id, created_at);

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'messages_target_chk'
    ) THEN
      ALTER TABLE messages
      ADD CONSTRAINT messages_target_chk
      CHECK (
        (receiver IS NOT NULL) <> (group_id IS NOT NULL)
      );
    END IF;
  END $$;


  /* ---------------- user sessions ---------------- */

  CREATE TABLE IF NOT EXISTS user_sessions (
    id                  BIGSERIAL PRIMARY KEY,

    user_id             BIGINT NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,

    session_token_hash  TEXT NOT NULL UNIQUE,

    expires_at          TIMESTAMPTZ NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx
  ON user_sessions (user_id);

  CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx
  ON user_sessions (expires_at);
`;


/* =========================================================
   HELPERS
========================================================= */

const OLD_DEMO_NAMES = [
  "sarah",
  "robert",
  "linda",
  "mike",
];

const emailFor = (name) =>
  `${name.toLowerCase()}@example.com`;

/* Convert the raw session token into a SHA-256 hash.
   Only the hash is stored in PostgreSQL. */
function hashSessionToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}


/* =========================================================
   MESSAGE HELPERS
========================================================= */

const toMessage = (row) => ({
  id: String(row.id),
  from: row.sender,
  to: row.receiver,
  groupId: row.group_id ? String(row.group_id) : null,
  text: row.text,
  imageUrl: row.image_url || null,
  time: row.created_at.toISOString(),
});


/* =========================================================
   USERS
========================================================= */

async function addMembers(list) {
  let added = 0;

  for (const m of list) {
    const r = await pool.query(
      `INSERT INTO users
       (username, email, gender, avatar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [
        m.username,
        m.email || emailFor(m.username),
        m.gender || null,
        m.avatar || null,
      ]
    );

    added += r.rowCount;
  }

  return added;
}


async function listMembers() {
  const { rows } = await pool.query(
    `SELECT username, email, gender, avatar
     FROM users
     ORDER BY lower(username)`
  );

  return rows.map((r) => ({
    name: r.username,
    email: r.email,
    gender: r.gender,
    avatar: r.avatar || "👤",
  }));
}


async function findUser(name) {
  const { rows } = await pool.query(
    `SELECT username
     FROM users
     WHERE lower(username) = lower($1)`,
    [String(name || "")]
  );

  return rows[0] ? rows[0].username : null;
}


/* =========================================================
   ACCOUNTS
========================================================= */

/* Find account using username or email.
   Includes id because sessions refer to users.id. */

async function updateEmail({ username, email }) {
  const cleanUsername = String(username || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanUsername || !cleanEmail) {
    return { error: "Username and email are required" };
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET email = $1
       WHERE lower(username) = lower($2)
       RETURNING id, username, email`,
      [cleanEmail, cleanUsername]
    );

    if (!rows.length) {
      return { error: "Account not found" };
    }

    return { user: rows[0] };

  } catch (err) {
    if (err.code === "23505") {
      return { error: "That email address is already being used" };
    }

    console.error("Email update failed:", err.message);

    return { error: "Could not update email address" };
  }
}

async function findAccount(identifier) {
  const id = String(identifier || "").trim();

  if (!id) return null;

  const { rows } = await pool.query(
    `SELECT id, username, email, gender, avatar, password_hash
     FROM users
     WHERE lower(username) = lower($1)
        OR lower(email) = lower($1)
     ORDER BY (lower(username) = lower($1)) DESC
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}


/* Create a new account.
   Existing members without a password can claim their account. */

async function createAccount({
  username,
  email,
  gender,
  passwordHash,
}) {
  const avatar =
    gender === "M"
      ? "👨🏻"
      : gender === "F"
        ? "👩🏻"
        : "👤";

  const old = await pool.query(
    `SELECT id
     FROM users
     WHERE lower(username) = lower($1)
       AND lower(email) = lower($2)
       AND password_hash IS NULL`,
    [username, email]
  );

  if (old.rows[0]) {
    const { rows } = await pool.query(
      `UPDATE users
       SET password_hash = $1,
           gender = COALESCE($2, gender)
       WHERE id = $3
       RETURNING id, username, email, gender, avatar`,
      [
        passwordHash,
        gender || null,
        old.rows[0].id,
      ]
    );

    return { user: rows[0] };
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users
       (username, email, gender, avatar, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, gender, avatar`,
      [
        username,
        email,
        gender || null,
        avatar,
        passwordHash,
      ]
    );

    return { user: rows[0] };

  } catch (err) {
    if (err.code === "23505") {
      const byName = /username/.test(
        err.constraint || err.detail || ""
      );

      return {
        error: byName
          ? "That name is already taken. Add a last name or number. (If it is your old account, sign up with the email it was created with.)"
          : "An account with that email already exists. Try logging in.",
      };
    }

    throw err;
  }
}


/* =========================================================
   SESSION MANAGEMENT
========================================================= */

/* Create a session record.

   token = original random token generated by auth.js
   expiresAt = JavaScript Date representing expiry

   We store only its SHA-256 hash.
*/

async function createSession(userId, token, expiresAt) {
  if (!userId || !token || !expiresAt) {
    throw new Error("Missing session information");
  }

  const tokenHash = hashSessionToken(token);

  const { rows } = await pool.query(
    `INSERT INTO user_sessions
     (user_id, session_token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt]
  );

  return rows[0];
}


/* Validate a session using the original cookie token.
   Expired sessions are rejected automatically.
*/

async function findSession(token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);

  const { rows } = await pool.query(
    `SELECT
       s.id AS session_id,
       s.user_id,
       s.expires_at,
       u.username,
       u.email,
       u.gender,
       u.avatar
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = $1
       AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );

  return rows[0] || null;
}


/* Delete one session.
   Used during logout.
*/

async function deleteSession(token) {
  if (!token) return false;

  const tokenHash = hashSessionToken(token);

  const result = await pool.query(
    `DELETE FROM user_sessions
     WHERE session_token_hash = $1`,
    [tokenHash]
  );

  return result.rowCount > 0;
}


/* Remove all expired sessions.
   Can be called periodically or during server startup.
*/

async function deleteExpiredSessions() {
  const result = await pool.query(
    `DELETE FROM user_sessions
     WHERE expires_at <= now()`
  );

  return result.rowCount;
}


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDb() {
  await pool.query(SCHEMA);

  console.log(
    "🐘 PostgreSQL connected. Chat, users, groups and sessions are ready."
  );
}


/* =========================================================
   DEMO ACCOUNT CLEANUP
========================================================= */

async function removeDemoAccounts() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const del = await client.query(
      `DELETE FROM users
       WHERE lower(username) = ANY($1::text[])
         AND lower(email) =
             (lower(username) || '@example.com')
       RETURNING username`,
      [OLD_DEMO_NAMES]
    );

    const names = del.rows.map((r) => r.username);

    let images = [];

    if (names.length) {
      const imgs = await client.query(
        `SELECT image_url
         FROM messages
         WHERE image_url IS NOT NULL
           AND (
             sender = ANY($1::text[])
             OR receiver = ANY($1::text[])
           )`,
        [names]
      );

      images = imgs.rows.map((r) => r.image_url);

      await client.query(
        `DELETE FROM messages
         WHERE sender = ANY($1::text[])
            OR receiver = ANY($1::text[])`,
        [names]
      );

      await client.query(
        `DELETE FROM group_members
         WHERE username = ANY($1::text[])`,
        [names]
      );

      await client.query(
        `DELETE FROM chat_groups g
         WHERE NOT EXISTS (
           SELECT 1
           FROM group_members m
           WHERE m.group_id = g.id
         )`
      );
    }

    await client.query("COMMIT");

    return { names, images };

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;

  } finally {
    client.release();
  }
}


/* =========================================================
   PRIVATE CHAT HISTORY
========================================================= */

async function getHistory(username, limit = 500) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT *
       FROM messages
       WHERE sender = $1
          OR receiver = $1
          OR group_id IN (
            SELECT group_id
            FROM group_members
            WHERE username = $1
          )
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     ) latest
     ORDER BY created_at ASC, id ASC`,
    [username, limit]
  );

  return rows.map(toMessage);
}


/* =========================================================
   SAVE MESSAGE
========================================================= */

async function saveMessage({
  from,
  to = null,
  groupId = null,
  text = "",
  imageUrl = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO messages
     (sender, receiver, group_id, text, image_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [from, to, groupId, text, imageUrl]
  );

  return toMessage(rows[0]);
}


/* =========================================================
   DELETE MESSAGE
========================================================= */

async function deleteMessage({ id, username }) {
  if (!/^\d+$/.test(String(id))) return null;

  const { rows } = await pool.query(
    `DELETE FROM messages
     WHERE id = $1
       AND sender = $2
     RETURNING *`,
    [id, username]
  );

  return rows[0] ? toMessage(rows[0]) : null;
}


/* =========================================================
   GROUP CHATS
========================================================= */

const isId = (v) => /^\d+$/.test(String(v));


const toGroup = (row) => ({
  id: String(row.id),
  name: row.name,
  createdBy: row.created_by,
  members: row.members,
});


async function getGroupMembers(groupId) {
  if (!isId(groupId)) return [];

  const { rows } = await pool.query(
    `SELECT username
     FROM group_members
     WHERE group_id = $1
     ORDER BY lower(username)`,
    [groupId]
  );

  return rows.map((r) => r.username);
}


const GROUP_SELECT = `
  SELECT
    g.id,
    g.name,
    g.created_by,
    ARRAY(
      SELECT username
      FROM group_members
      WHERE group_id = g.id
      ORDER BY lower(username)
    ) AS members
  FROM chat_groups g
`;


async function getGroup(groupId) {
  if (!isId(groupId)) return null;

  const { rows } = await pool.query(
    `${GROUP_SELECT} WHERE g.id = $1`,
    [groupId]
  );

  return rows[0] ? toGroup(rows[0]) : null;
}


async function getGroupsFor(username) {
  const { rows } = await pool.query(
    `${GROUP_SELECT}
     WHERE EXISTS (
       SELECT 1
       FROM group_members m
       WHERE m.group_id = g.id
         AND m.username = $1
     )
     ORDER BY g.created_at, g.id`,
    [username]
  );

  return rows.map(toGroup);
}


/* =========================================================
   CREATE GROUP
========================================================= */

async function createGroup({
  name,
  creator,
  members,
}) {
  const wanted = [
    ...new Set(
      [creator, ...members].map((m) =>
        String(m).toLowerCase()
      )
    ),
  ];

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query(
      `SELECT username
       FROM users
       WHERE lower(username) = ANY($1::text[])
       ORDER BY lower(username)`,
      [wanted]
    );

    const names = found.rows.map((r) => r.username);

    const me = names.find(
      (n) =>
        n.toLowerCase() === String(creator).toLowerCase()
    );

    if (!me) {
      await client.query("ROLLBACK");
      return { error: "Unknown user" };
    }

    if (names.length < 2) {
      await client.query("ROLLBACK");
      return {
        error: "A group needs at least 2 members",
      };
    }

    const g = await client.query(
      `INSERT INTO chat_groups
       (name, created_by)
       VALUES ($1, $2)
       RETURNING *`,
      [name, me]
    );

    for (const n of names) {
      await client.query(
        `INSERT INTO group_members
         (group_id, username)
         VALUES ($1, $2)`,
        [g.rows[0].id, n]
      );
    }

    await client.query("COMMIT");

    return {
      group: toGroup({
        ...g.rows[0],
        members: names,
      }),
    };

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;

  } finally {
    client.release();
  }
}


/* =========================================================
   LEAVE GROUP
========================================================= */

async function leaveGroup({
  groupId,
  username,
}) {
  if (!isId(groupId)) return null;

  const left = await pool.query(
    `DELETE FROM group_members
     WHERE group_id = $1
       AND username = $2`,
    [groupId, username]
  );

  if (left.rowCount === 0) return null;

  const remaining = await getGroupMembers(groupId);

  let images = [];

  if (remaining.length === 0) {
    const r = await pool.query(
      `SELECT image_url
       FROM messages
       WHERE group_id = $1
         AND image_url IS NOT NULL`,
      [groupId]
    );

    images = r.rows.map((x) => x.image_url);

    await pool.query(
      `DELETE FROM chat_groups
       WHERE id = $1`,
      [groupId]
    );
  }

  return {
    remaining,
    images,
  };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  pool,
  initDb,

  // Messages
  getHistory,
  saveMessage,
  deleteMessage,

  // Users
  addMembers,
  listMembers,
  findUser,

  // Groups
  getGroup,
  getGroupsFor,
  getGroupMembers,
  createGroup,
  leaveGroup,

  // Accounts
  findAccount,
  createAccount,
  updateEmail,

  // Sessions
  createSession,
  findSession,
  deleteSession,
  deleteExpiredSessions,

  // Cleanup
  removeDemoAccounts,
};
