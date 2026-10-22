// server/server.js
// Setup:  npm init -y && npm i express socket.io cors nodemailer dotenv pg
// Run:    node server.js
require("dotenv").config(); // loads server/.env (DATABASE_URL, SMTP settings, PUBLIC_URL)

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Family tree: relationship logic, persistence, real-time sync, email links
const { registerTreeHandlers, registerTreeRoutes, syncMembers } = require("./familyTree");

// Chat messages are stored in PostgreSQL (database: chat_app)
const {
  initDb,
  getHistory,
  saveMessage,
  deleteMessage,
  listMembers,
  findUser,
  getGroup,
  getGroupsFor,
  getGroupMembers,
  createGroup,
  leaveGroup,
} = require("./db");

// Chat images are saved on disk (server/uploads), only their URL goes in PostgreSQL
const { UPLOAD_DIR, MAX_IMAGE_BYTES, saveImage, removeImage } = require("./uploads");

const app = express();
app.use(cors());

// Serve the saved chat images. The file names are long random strings.
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "365d",
    immutable: true,
    index: false,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "CmyRoots server running on port 4000" });
});

const server = http.createServer(app);

const io = new Server(server, {
  // room for one image (max 5 MB) plus a little extra
  maxHttpBufferSize: MAX_IMAGE_BYTES + 512 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// The member list (loaded from PostgreSQL) for the app: chat contacts, Members page
app.get("/api/members", async (req, res) => {
  try {
    res.json(await listMembers());
  } catch (err) {
    console.error("🐘 could not load members:", err.message);
    res.status(500).json({ error: "Could not load members" });
  }
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

  // The groups this user belongs to
  getGroupsFor(username)
    .then((groups) => socket.emit("groups", groups))
    .catch((err) => {
      console.error("🐘 could not load groups:", err.message);
      socket.emit("groups", []);
    });

  const roomsOf = (names) => [...new Set(names)].map((n) => `user:${n}`);

  // Send a message to ONE person ({ to }) or ONE group ({ groupId }).
  // It can have text, an image ({ image: { data } }) or both.
  // It is saved in PostgreSQL first, then delivered.
  socket.on("message:send", async (payload, ack) => {
    const reply = (res) => typeof ack === "function" && ack(res);
    const { to, groupId, image } = payload || {};
    // Array.from keeps emojis whole (a plain slice could cut one in half)
    const text = Array.from(String((payload || {}).text || "").trim())
      .slice(0, 2000)
      .join("");

    let imageUrl = null;
    try {
      if (Boolean(to) === Boolean(groupId)) {
        return reply({ ok: false, error: "Choose one person or one group" });
      }
      if (!text && !image) return reply({ ok: false, error: "Empty message" });

      let recipients; // who gets "message:new"
      let target = null; // the person (for a private message)

      if (groupId) {
        const members = await getGroupMembers(groupId);
        if (!members.includes(username)) {
          return reply({ ok: false, error: "You are not in this group" });
        }
        recipients = members;
      } else {
        target = await findUser(to);
        if (!target) return reply({ ok: false, error: "That member does not exist" });
        recipients = [target, username];
      }

      if (image) {
        const saved = await saveImage(image.data);
        if (saved.error) return reply({ ok: false, error: saved.error });
        imageUrl = saved.url;
      }

      const message = await saveMessage({
        from: username,
        to: target,
        groupId: groupId ? String(groupId) : null,
        text,
        imageUrl,
      });

      // everyone involved, including the sender's other tabs
      io.to(roomsOf(recipients)).emit("message:new", message);
      reply({ ok: true });
    } catch (err) {
      if (imageUrl) removeImage(imageUrl); // don't keep a file with no message
      console.error("🐘 could not save message:", err.message);
      reply({ ok: false, error: "Could not save message" });
    }
  });

  // Create a group: { name, members: ["Mike", "Priya"] } (you are added automatically)
  socket.on("group:create", async (payload, ack) => {
    const reply = (res) => typeof ack === "function" && ack(res);
    try {
      const name = Array.from(String((payload || {}).name || "").replace(/\s+/g, " ").trim())
        .slice(0, 60)
        .join("");
      const members = (payload || {}).members;
      if (!name) return reply({ ok: false, error: "Please enter a group name" });
      if (!Array.isArray(members)) return reply({ ok: false, error: "Choose the members" });

      const result = await createGroup({
        name,
        creator: username,
        members: members.slice(0, 200).map(String),
      });
      if (result.error) return reply({ ok: false, error: result.error });

      io.to(roomsOf(result.group.members)).emit("group:new", result.group);
      reply({ ok: true, group: result.group });
    } catch (err) {
      console.error("🐘 could not create group:", err.message);
      reply({ ok: false, error: "Could not create group" });
    }
  });

  // Leave a group: { groupId }
  socket.on("group:leave", async (payload, ack) => {
    const reply = (res) => typeof ack === "function" && ack(res);
    try {
      const groupId = (payload || {}).groupId;
      const result = await leaveGroup({ groupId, username });
      if (!result) return reply({ ok: false, error: "You are not in this group" });

      result.images.forEach(removeImage); // the group was empty, so it was deleted

      // all my tabs drop the group...
      io.to(`user:${username}`).emit("group:left", { groupId: String(groupId) });
      // ...and the others see the new member list
      if (result.remaining.length) {
        const group = await getGroup(groupId);
        io.to(roomsOf(result.remaining)).emit("group:updated", group);
      }
      reply({ ok: true });
    } catch (err) {
      console.error("🐘 could not leave group:", err.message);
      reply({ ok: false, error: "Could not leave group" });
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

      if (deleted.imageUrl) removeImage(deleted.imageUrl); // delete the file too

      // everyone in this chat (in all their tabs) removes it from the screen
      const people = deleted.groupId
        ? [...(await getGroupMembers(deleted.groupId)), username]
        : [deleted.to, username];
      io.to(roomsOf(people)).emit("message:deleted", { id: deleted.id });

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

// Start-up, in two clearly separated steps so an error says what really failed
async function start() {
  // 1. the database
  try {
    await initDb();
  } catch (err) {
    console.error(
      "❌ Could not connect to PostgreSQL (database chat_app):",
      err.message,
      "\n   Check DATABASE_URL in server/.env and that PostgreSQL is running."
    );
    process.exit(1);
  }

  // 2. everything else
  try {
    // every member in the database also becomes a person in the family tree
    const members = await listMembers();
    syncMembers(members);
    console.log(`👥 ${members.length} members loaded`);
  } catch (err) {
    console.error(
      "❌ The database is fine, but start-up failed afterwards:",
      err.message,
      "\n   If it says 'syncMembers is not a function', your familyTree.js is an old copy:",
      "\n   replace it with the latest familyTree.js (it must export syncMembers)."
    );
    process.exit(1);
  }

  server.listen(PORT, () => console.log(`Socket server running on :${PORT}`));
}

start();