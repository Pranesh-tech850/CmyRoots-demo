// server/server.js
// Setup:  npm init -y && npm i express socket.io cors nodemailer dotenv pg
// Run:    node server.js
require("dotenv").config(); // loads server/.env (DATABASE_URL, SMTP settings, PUBLIC_URL)

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Family tree: relationship logic, persistence, real-time sync, email links
const { registerTreeHandlers, registerTreeRoutes } = require("./familyTree");

// Chat messages are stored in PostgreSQL (database: chat_app)
const { initDb, getHistory, saveMessage, deleteMessage } = require("./db");

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "CmyRoots server running on port 4000" });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Pages opened from the request email: /request/:token (+ accept / reject)
registerTreeRoutes(app, io);

const onlineCount = {}; // username -> number of open tabs/sockets

const broadcastPresence = () => {
  io.emit("presence", Object.keys(onlineCount));
};

// Every connection must say who it is
io.use((socket, next) => {
  const username = socket.handshake.auth?.username;
  if (!username) return next(new Error("username required"));
  socket.username = username;
  next();
});

io.on("connection", (socket) => {
  const { username } = socket;

  // Personal room: lets us reach a user in ALL of their tabs/devices
  socket.join(`user:${username}`);
  onlineCount[username] = (onlineCount[username] || 0) + 1;
  broadcastPresence();

  // Family tree events: tree:get, tree:addRelative, tree:sendRequest,
  // tree:respondRequest, tree:cancelRequest, tree:setEmail, ...
  registerTreeHandlers(io, socket);

  // Send this user their past conversations (loaded from PostgreSQL)
  getHistory(username)
    .then((history) => socket.emit("history", history))
    .catch((err) => {
      console.error("🐘 could not load chat history:", err.message);
      socket.emit("history", []);
    });

  // Send a message: save it in PostgreSQL first, then deliver it
  socket.on("message:send", async ({ to, text } = {}, ack) => {
    const clean = String(text || "").trim().slice(0, 2000);
    if (!to || !clean) {
      if (typeof ack === "function") ack({ ok: false, error: "Empty message" });
      return;
    }

    try {
      const message = await saveMessage({ from: username, to, text: clean });

      // deliver to receiver AND sender (so sender's other tabs update too)
      io.to(`user:${to}`).to(`user:${username}`).emit("message:new", message);

      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("🐘 could not save message:", err.message);
      if (typeof ack === "function") ack({ ok: false, error: "Could not save message" });
    }
  });

  // Delete one of MY messages: remove it from PostgreSQL, then tell both people
  socket.on("message:delete", async ({ id } = {}, ack) => {
    try {
      const deleted = await deleteMessage({ id, username });

      if (!deleted) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message not found, or it is not yours" });
        }
        return;
      }

      // both users (in all their tabs) remove it from the screen
      io.to(`user:${deleted.to}`)
        .to(`user:${username}`)
        .emit("message:deleted", { id: deleted.id });

      if (typeof ack === "function") ack({ ok: true });
    } catch (err) {
      console.error("🐘 could not delete message:", err.message);
      if (typeof ack === "function") ack({ ok: false, error: "Could not delete message" });
    }
  });

  // Typing indicator
  socket.on("typing", ({ to, isTyping }) => {
    io.to(`user:${to}`).emit("typing", { from: username, isTyping });
  });

  socket.on("disconnect", () => {
    onlineCount[username] -= 1;
    if (onlineCount[username] <= 0) delete onlineCount[username];
    broadcastPresence();
  });
});

const PORT = 4000;

// Connect to PostgreSQL first, then start accepting connections
initDb()
  .then(() =>
    server.listen(PORT, () => console.log(`Socket server running on :${PORT}`))
  )
  .catch((err) => {
    console.error(
      "❌ Could not connect to PostgreSQL (database chat_app):",
      err.message,
      "\n   Check DATABASE_URL in server/.env and that PostgreSQL is running."
    );
    process.exit(1);
  });