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
`;

/* shape the client already understands: { id, from, to, text, time } */
const toMessage = (row) => ({
  id: String(row.id),
  from: row.sender,
  to: row.receiver,
  text: row.text,
  time: row.created_at.toISOString(),
});

/* demo conversation, inserted only when the table is empty */
const SEED = [
  { from: "Linda",  to: "Sarah", text: "Don't forget family dinner this Sunday!", hoursAgo: 3 },
  { from: "Mike",   to: "Sarah", text: "Can you check the family tree?",           hoursAgo: 20 },
  { from: "Robert", to: "Sarah", text: "I uploaded the Easter photos.",            hoursAgo: 24 },
];

async function initDb() {
  await pool.query(SCHEMA);

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
       ORDER BY created_at DESC, id DESC
       LIMIT $2
     ) latest
     ORDER BY created_at ASC, id ASC`,
    [username, limit]
  );
  return rows.map(toMessage);
}

async function saveMessage({ from, to, text }) {
  const { rows } = await pool.query(
    `INSERT INTO messages (sender, receiver, text)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [from, to, text]
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

module.exports = { pool, initDb, getHistory, saveMessage, deleteMessage };