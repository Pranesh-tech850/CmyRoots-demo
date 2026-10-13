// server/server.js
// Setup:  npm init -y && npm i express socket.io cors
// Run:    node server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Family tree: relationship logic, persistence, real-time sync
const { registerTreeHandlers } = require("./familyTree");

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

// In-memory store (replace with MongoDB/Postgres later)
const messages = [
  {
    id: "m-1",
    from: "Linda",
    to: "Sarah",
    text: "Don't forget family dinner this Sunday!",
    time: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: "m-2",
    from: "Robert",
    to: "Sarah",
    text: "I uploaded the Easter photos.",
    time: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: "m-3",
    from: "Mike",
    to: "Sarah",
    text: "Can you check the family tree?",
    time: new Date(Date.now() - 3600000 * 20).toISOString(),
  },
];
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

  // Family tree events: tree:get, tree:addRelative, tree:removeRelation, tree:setGender
  registerTreeHandlers(io, socket);

  // Send this user their past conversations
  socket.emit(
    "history",
    messages.filter((m) => m.from === username || m.to === username)
  );

  // Send a message
  socket.on("message:send", ({ to, text }, ack) => {
    if (!to || !text || !text.trim()) return;

    const message = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      from: username,
      to,
      text: text.trim(),
      time: new Date().toISOString(),
    };

    messages.push(message);

    // deliver to receiver AND sender (so sender's other tabs update too)
    io.to(`user:${to}`).to(`user:${username}`).emit("message:new", message);

    if (typeof ack === "function") ack({ ok: true });
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
server.listen(PORT, () => console.log(`Socket server running on :${PORT}`));