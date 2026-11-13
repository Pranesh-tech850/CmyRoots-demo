
// server/server.js
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// Family tree
const {
  registerTreeHandlers,
  registerTreeRoutes,
  syncMembers,
  getSnapshot,
  removeMembers,
  getConnectedNames,
} = require("./familyTree.js");

// Cookie-based authentication
const {
  registerAuthRoutes,
  requireAuth,
  getCookieToken,
} = require("./auth");

// PostgreSQL
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
  findSession,
  removeDemoAccounts,
} = require("./db");

// Uploads
const {
  UPLOAD_DIR,
  MAX_IMAGE_BYTES,
  saveImage,
  removeImage,
} = require("./uploads");


/* =========================================================
   EXPRESS CONFIGURATION
========================================================= */

const app = express();

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
  })
);

app.use(express.json());


// Static image uploads
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "365d",
    immutable: true,
    index: false,
    setHeaders: (res) =>
      res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);


// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "CmyRoots server running",
  });
});


/* =========================================================
   HTTP SERVER AND SOCKET.IO
========================================================= */

const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: MAX_IMAGE_BYTES + 512 * 1024,

  cors: {
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST"],
  },
});


/* =========================================================
   AUTHENTICATION ROUTES
========================================================= */

registerAuthRoutes(app, {

  // Runs after a new account is created.
  onNewMember: async (user) => {
    syncMembers([
      {
        name: user.username,
        email: user.email,
        gender: user.gender,
      },
    ]);

    io.emit("tree:state", getSnapshot());
  },


  // Runs after a user logs out.
  onLogout: async (session) => {
    const sockets = await io.fetchSockets();

    for (const socket of sockets) {
      // Disconnect only the socket belonging to this session.
      if (socket.sessionId === session.session_id) {
        socket.disconnect(true);
      }
    }

    console.log(
      `User session ${session.session_id} logged out`
    );
  },

});


/* =========================================================
   MEMBERS API
========================================================= */

app.get(
  "/api/members",
  requireAuth,
  async (req, res) => {
    try {
      const mine = new Set(
        getConnectedNames(req.username).map(
          (name) => name.toLowerCase()
        )
      );

      mine.add(req.username.toLowerCase());

      const all = await listMembers();

      res.json(
        all.filter((member) =>
          mine.has(member.name.toLowerCase())
        )
      );

    } catch (err) {
      console.error(
        "🐘 could not load members:",
        err.message
      );

      res.status(500).json({
        error: "Could not load members",
      });
    }
  }
);


/* =========================================================
   FAMILY TREE REQUEST ROUTES
========================================================= */

// These are separate email-invitation token routes.
// They are intentionally not protected by login sessions.
registerTreeRoutes(app, io);


/* =========================================================
   ONLINE PRESENCE
========================================================= */

const onlineCount = {};

const broadcastPresence = () => {
  io.emit("presence", Object.keys(onlineCount));
};


/* =========================================================
   SOCKET.IO AUTHENTICATION
   Validate HttpOnly session cookie using PostgreSQL
========================================================= */

io.use(async (socket, next) => {
  try {
    // Read cookie from Socket.IO handshake headers.
    const token = getCookieToken({
      headers: socket.handshake.headers,
    });

    if (!token) {
      return next(new Error("unauthorized"));
    }

    // Validate session against PostgreSQL.
    const session = await findSession(token);

    if (!session) {
      return next(new Error("unauthorized"));
    }

    // Attach authenticated account information.
    socket.username = session.username;
    socket.userId = session.user_id;
    socket.sessionId = session.session_id;

    return next();

  } catch (err) {
    console.error(
      "Socket authentication failed:",
      err.message
    );

    return next(new Error("unauthorized"));
  }
});


/* =========================================================
   SOCKET.IO CONNECTION
========================================================= */

io.on("connection", (socket) => {
  const { username } = socket;

  // Private user room.
  socket.join(`user:${username}`);

  // Session-specific room.
  socket.join(`session:${socket.sessionId}`);

  // Update online count.
  onlineCount[username] =
    (onlineCount[username] || 0) + 1;

  broadcastPresence();


  /* -------------------------------------------------------
     FAMILY TREE EVENTS
  ------------------------------------------------------- */

  registerTreeHandlers(io, socket);


  /* -------------------------------------------------------
     CHAT HISTORY
  ------------------------------------------------------- */

  getHistory(username)
    .then((history) => {
      socket.emit("history", history);
    })
    .catch((err) => {
      console.error(
        "🐘 could not load chat history:",
        err.message
      );

      socket.emit("history", []);
    });


  /* -------------------------------------------------------
     GROUP LIST
  ------------------------------------------------------- */

  getGroupsFor(username)
    .then((groups) => {
      socket.emit("groups", groups);
    })
    .catch((err) => {
      console.error(
        "🐘 could not load groups:",
        err.message
      );

      socket.emit("groups", []);
    });


  /* -------------------------------------------------------
     ROOM HELPER
  ------------------------------------------------------- */

  const roomsOf = (names) =>
    [...new Set(names)].map(
      (name) => `user:${name}`
    );


  /* =======================================================
     SEND PRIVATE OR GROUP MESSAGE
  ======================================================= */

  socket.on("message:send", async (payload, ack) => {
    const reply = (result) =>
      typeof ack === "function" && ack(result);

    const { to, groupId, image } = payload || {};

    const text = Array.from(
      String((payload || {}).text || "").trim()
    )
      .slice(0, 2000)
      .join("");

    let imageUrl = null;

    try {
      if (Boolean(to) === Boolean(groupId)) {
        return reply({
          ok: false,
          error: "Choose one person or one group",
        });
      }

      if (!text && !image) {
        return reply({
          ok: false,
          error: "Empty message",
        });
      }

      let recipients;
      let target = null;


      // Group message
      if (groupId) {
        const members = await getGroupMembers(groupId);

        if (!members.includes(username)) {
          return reply({
            ok: false,
            error: "You are not in this group",
          });
        }

        recipients = members;

      } else {

        // Private message
        target = await findUser(to);

        if (!target) {
          return reply({
            ok: false,
            error: "That member does not exist",
          });
        }

        recipients = [target, username];
      }


      // Image upload
      if (image) {
        const saved = await saveImage(image.data);

        if (saved.error) {
          return reply({
            ok: false,
            error: saved.error,
          });
        }

        imageUrl = saved.url;
      }


      // Save message in PostgreSQL
      const message = await saveMessage({
        from: username,
        to: target,
        groupId: groupId ? String(groupId) : null,
        text,
        imageUrl,
      });


      // Broadcast message
      io.to(roomsOf(recipients)).emit(
        "message:new",
        message
      );

      reply({ ok: true });

    } catch (err) {
      if (imageUrl) {
        removeImage(imageUrl);
      }

      console.error(
        "🐘 could not save message:",
        err.message
      );

      reply({
        ok: false,
        error: "Could not save message",
      });
    }
  });


  /* =======================================================
     CREATE GROUP
  ======================================================= */

  socket.on("group:create", async (payload, ack) => {
    const reply = (result) =>
      typeof ack === "function" && ack(result);

    try {
      const name = Array.from(
        String((payload || {}).name || "")
          .replace(/\s+/g, " ")
          .trim()
      )
        .slice(0, 60)
        .join("");

      const members = (payload || {}).members;

      if (!name) {
        return reply({
          ok: false,
          error: "Please enter a group name",
        });
      }

      if (!Array.isArray(members)) {
        return reply({
          ok: false,
          error: "Choose the members",
        });
      }

      const result = await createGroup({
        name,
        creator: username,
        members: members.slice(0, 200).map(String),
      });

      if (result.error) {
        return reply({
          ok: false,
          error: result.error,
        });
      }

      io.to(roomsOf(result.group.members)).emit(
        "group:new",
        result.group
      );

      reply({
        ok: true,
        group: result.group,
      });

    } catch (err) {
      console.error(
        "🐘 could not create group:",
        err.message
      );

      reply({
        ok: false,
        error: "Could not create group",
      });
    }
  });


  /* =======================================================
     LEAVE GROUP
  ======================================================= */

  socket.on("group:leave", async (payload, ack) => {
    const reply = (result) =>
      typeof ack === "function" && ack(result);

    try {
      const groupId = (payload || {}).groupId;

      const result = await leaveGroup({
        groupId,
        username,
      });

      if (!result) {
        return reply({
          ok: false,
          error: "You are not in this group",
        });
      }

      result.images.forEach(removeImage);

      io.to(`user:${username}`).emit("group:left", {
        groupId: String(groupId),
      });

      if (result.remaining.length) {
        const group = await getGroup(groupId);

        io.to(roomsOf(result.remaining)).emit(
          "group:updated",
          group
        );
      }

      reply({ ok: true });

    } catch (err) {
      console.error(
        "🐘 could not leave group:",
        err.message
      );

      reply({
        ok: false,
        error: "Could not leave group",
      });
    }
  });


  /* =======================================================
     DELETE OWN MESSAGE
  ======================================================= */

  socket.on("message:delete", async ({ id } = {}, ack) => {
    try {
      const deleted = await deleteMessage({
        id,
        username,
      });

      if (!deleted) {
        if (typeof ack === "function") {
          ack({
            ok: false,
            error: "Message not found, or it is not yours",
          });
        }

        return;
      }

      if (deleted.imageUrl) {
        removeImage(deleted.imageUrl);
      }

      const people = deleted.groupId
        ? [
            ...(await getGroupMembers(deleted.groupId)),
            username,
          ]
        : [deleted.to, username];

      io.to(roomsOf(people)).emit(
        "message:deleted",
        {
          id: deleted.id,
        }
      );

      if (typeof ack === "function") {
        ack({ ok: true });
      }

    } catch (err) {
      console.error(
        "🐘 could not delete message:",
        err.message
      );

      if (typeof ack === "function") {
        ack({
          ok: false,
          error: "Could not delete message",
        });
      }
    }
  });


  /* =======================================================
     TYPING INDICATOR
  ======================================================= */

  socket.on("typing", ({ to, isTyping }) => {
    io.to(`user:${to}`).emit("typing", {
      from: username,
      isTyping,
    });
  });


  /* =======================================================
     DISCONNECT
  ======================================================= */

  socket.on("disconnect", () => {
    onlineCount[username] -= 1;

    if (onlineCount[username] <= 0) {
      delete onlineCount[username];
    }

    broadcastPresence();
  });

});


/* =========================================================
   SERVER STARTUP
========================================================= */

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await initDb();

  } catch (err) {
    console.error(
      "❌ Could not connect to PostgreSQL:",
      err.message,
      "\nCheck DATABASE_URL in server/.env and ensure PostgreSQL is running."
    );

    process.exit(1);
  }


  /* -------------------------------------------------------
     REMOVE DEMO ACCOUNTS
  ------------------------------------------------------- */

  try {
    const demo = await removeDemoAccounts();

    if (demo.names.length) {
      removeMembers(demo.names);

      demo.images.forEach(removeImage);

      console.log(
        `🧹 removed old demo members: ${demo.names.join(", ")}`
      );
    }


    /* -----------------------------------------------------
       LOAD EXISTING MEMBERS
    ----------------------------------------------------- */

    const members = await listMembers();

    syncMembers(members);

    console.log(
      `👥 ${members.length} members loaded`
    );

  } catch (err) {
    console.error(
      "❌ Database startup operation failed:",
      err.message,
      "\nCheck familyTree.js and database configuration."
    );

    process.exit(1);
  }


  /* -------------------------------------------------------
     START HTTP + SOCKET.IO SERVER
  ------------------------------------------------------- */

  server.listen(PORT, () => {
    console.log(
      `Socket server running on port ${PORT}`
    );
  });
}

start();
