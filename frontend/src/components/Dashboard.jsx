import React, { useState, useEffect, useMemo, useRef } from "react";
import { io } from "socket.io-client";

import {
  LayoutDashboard,
  Network,
  MessageSquare,
  Users,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Plus,
  UserPlus,
  Send,
  Shield,
  Lock,
  User,
  Save,
  Trash2,
  Smile,
  Image as ImageIcon,
  X,
} from "lucide-react";

import "../styles/Dashboard.css";

import TreePage from "./tree/TreePage";
import { buildGraph, getLabel, normName, connectedIds } from "./tree/familyLogic";

/* ⚠️ MUST match your server's listen() port */
const SOCKET_URL = "http://localhost:4000";

/* chat: emojis for the picker, image limit, and group keys.
   A group chat is selected with the key "g:<id>", a person with their name. */
const EMOJIS = (
  "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 " +
  "😢 😭 😤 😡 🥺 😱 😴 🤔 🙄 😬 🤗 🤭 🤫 😷 🤒 🥶 🥵 🤯 😐 😮 " +
  "👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🤙 👀 🫶 " +
  "❤️ 🧡 💛 💚 💙 💜 🖤 💔 💕 💖 " +
  "🎉 🎊 🎁 🎂 🔥 ✨ ⭐ 🌟 💯 ✅ ❌ 🏠 👨‍👩‍👧‍👦 🌳 🌸 🍕 🍔 🍰 ☕ 🎵 📷 ✈️ 🚗 🌞 🌙"
).split(" ");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const isGroupKey = (k) => typeof k === "string" && k.startsWith("g:");

/* shown until the real list arrives from the server (and quick-switch users) */
const DEFAULT_MEMBERS = [
  { name: "Sarah",  email: "sarah@example.com",  avatar: "👩🏻" },
  { name: "Robert", email: "robert@example.com", avatar: "👨🏻" },
  { name: "Linda",  email: "linda@example.com",  avatar: "👩🏻" },
  { name: "Mike",   email: "mike@example.com",   avatar: "👦🏻" },
];
const QUICK_USERS = DEFAULT_MEMBERS.map((m) => m.name);

/* relations before the tree has loaded */
const DEFAULT_RELATIONS = {
  Sarah:  { Robert: "Father", Linda: "Mother", Mike: "Brother" },
  Robert: { Sarah: "Daughter", Linda: "Wife",  Mike: "Son" },
  Linda:  { Sarah: "Daughter", Robert: "Husband", Mike: "Son" },
  Mike:   { Sarah: "Sister", Robert: "Father", Linda: "Mother" },
};

const Dashboard = () => {
  /* ---------- members (loaded from PostgreSQL through the server) ---------- */
  const [members, setMembers] = useState(DEFAULT_MEMBERS);

  useEffect(() => {
    fetch(`${SOCKET_URL}/api/members`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list) && list.length) setMembers(list);
      })
      .catch(() => {}); // keep the default list if the server is not reachable
  }, []);

  const [pickerSearch, setPickerSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [memberLimit, setMemberLimit] = useState(25);

  /* ---------- current user ---------- */
  const getInitialUser = () => {
    const fromUrl = new URLSearchParams(window.location.search).get("user");
    if (fromUrl) {
      sessionStorage.setItem("chatUser", fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem("chatUser") || "Sarah";
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const chooseUser = (name) => {
    sessionStorage.setItem("chatUser", name);
    setCurrentUser(name);
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  const switchUser = () => {
    sessionStorage.removeItem("chatUser");
    setCurrentUser(null);
  };

  const emailInputRef = useRef(null);

  const currentUserAvatar =
    members.find((m) => m.name === currentUser)?.avatar || "👤";

  const contacts = useMemo(
    () => members.map((m) => m.name).filter((name) => name !== currentUser),
    [members, currentUser]
  );

  /* ---------- state ---------- */
  const [activePage, setActivePage] = useState("dashboard");

  const [chatMessages, setChatMessages] = useState([]);
  const [groups, setGroups] = useState([]); // group chats I belong to
  const [selectedContact, setSelectedContact] = useState(
    () => contacts[0] || "Robert"
  );
  /* a person's name, or "g:<id>" for a group */
  const activeContact = isGroupKey(selectedContact)
    ? groups.some((g) => `g:${g.id}` === selectedContact)
      ? selectedContact
      : contacts[0] || ""
    : contacts.includes(selectedContact)
    ? selectedContact
    : contacts[0] || "";
  const activeGroup = isGroupKey(activeContact)
    ? groups.find((g) => `g:${g.id}` === activeContact)
    : null;
  const [chatText, setChatText] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingFrom, setTypingFrom] = useState({});
  const [unread, setUnread] = useState({});

  /* emoji picker, image attachment, group creation */
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [sending, setSending] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPick, setGroupPick] = useState([]);
  const [groupSearch, setGroupSearch] = useState("");

  /* chat list for many members: unread first, then most recent chat,
     then online, then A-Z; filtered by the search box */
  const lastTalk = useMemo(() => {
    const t = {};
    chatMessages.forEach((m) => {
      const other = m.groupId
        ? `g:${m.groupId}`
        : m.from === currentUser
        ? m.to
        : m.from;
      const ts = Date.parse(m.time) || 0;
      if (ts > (t[other] || 0)) t[other] = ts;
    });
    return t;
  }, [chatMessages, currentUser]);

  /* my groups, same order rules as people: unread, recent, A-Z */
  const visibleGroups = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return groups
      .filter((g) => g.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (unread[`g:${b.id}`] || 0) - (unread[`g:${a.id}`] || 0) ||
          (lastTalk[`g:${b.id}`] || 0) - (lastTalk[`g:${a.id}`] || 0) ||
          a.name.localeCompare(b.name)
      );
  }, [groups, contactSearch, unread, lastTalk]);

  const visibleContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts
      .filter((name) => name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (unread[b] || 0) - (unread[a] || 0) ||
          (lastTalk[b] || 0) - (lastTalk[a] || 0) ||
          Number(onlineUsers.includes(b)) - Number(onlineUsers.includes(a)) ||
          a.localeCompare(b)
      );
  }, [contacts, contactSearch, unread, lastTalk, onlineUsers]);

  const [treeSocket, setTreeSocket] = useState(null);
  const [treeSnapshot, setTreeSnapshot] = useState(null);

  /* ---- global request state ---- */
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [outgoingRequests, setOutgoingRequests] = useState([]);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeout = useRef(null);
  const activeContactRef = useRef(activeContact);
  const activePageRef = useRef(activePage);

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  /* ---------- socket connection ---------- */
  useEffect(() => {
    if (!currentUser) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setTreeSocket(null);
      return;
    }

    setTreeSocket(null);

    console.log("→ creating socket for", currentUser);
    const socket = io(SOCKET_URL, {
      auth: { username: currentUser },
    });

    socketRef.current = socket;
    setTreeSocket(socket);

    socket.on("connect", () => {
      console.log("✅ socket connected as", currentUser, socket.id);
    });

    socket.on("connect_error", (err) => {
      console.log("❌ socket error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 socket disconnected:", reason);
    });

    socket.on("tree:state", (state) => setTreeSnapshot(state));

    socket.emit("tree:get", (state) => {
      if (state) setTreeSnapshot(state);
    });

    socket.on("history", (history) => setChatMessages(history));

    socket.on("message:new", (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      setTypingFrom((t) => ({ ...t, [msg.from]: false }));

      /* which chat does this belong to: a group, or the person who wrote it */
      const chatKey = msg.groupId ? `g:${msg.groupId}` : msg.from;

      const chatIsOpen =
        activePageRef.current === "messages" &&
        activeContactRef.current === chatKey;

      if (msg.from !== currentUser && !chatIsOpen) {
        setUnread((u) => ({ ...u, [chatKey]: (u[chatKey] || 0) + 1 }));
      }
    });

    /* ---- group chats ---- */
    socket.on("groups", (list) => setGroups(list));
    socket.on("group:new", (g) =>
      setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev : [...prev, g]))
    );
    socket.on("group:updated", (g) =>
      setGroups((prev) => prev.map((x) => (x.id === g.id ? g : x)))
    );
    socket.on("group:left", ({ groupId }) => {
      setGroups((prev) => prev.filter((x) => x.id !== groupId));
      setChatMessages((prev) => prev.filter((m) => m.groupId !== groupId));
      setUnread((u) => {
        const rest = { ...u };
        delete rest[`g:${groupId}`];
        return rest;
      });
    });

    /* a message was deleted (by me or by the other person's delete of their own) */
    socket.on("message:deleted", ({ id }) =>
      setChatMessages((prev) => prev.filter((m) => m.id !== id))
    );

    socket.on("presence", (users) => setOnlineUsers(users));

    socket.on("typing", ({ from, isTyping }) =>
      setTypingFrom((t) => ({ ...t, [from]: isTyping }))
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setTreeSocket(null);
    };
  }, [currentUser]);

  /* ---------- incoming / outgoing request handling ---------- */

  /* listen for tree:request at the Dashboard level so the popup
     shows up on EVERY page, not just Tree */
  useEffect(() => {
    if (!treeSocket || !currentUser) return;
    const myId = `user:${currentUser.toLowerCase()}`;

    const onRequest = (req) => {
      console.log("📨 tree:request received:", req);
      if (!req) return;
      if (req.fromId === myId) return; // ignore own
      setIncomingRequest((prev) => prev || req);
    };

    treeSocket.on("tree:request", onRequest);
    return () => treeSocket.off("tree:request", onRequest);
  }, [treeSocket, currentUser]);

  /* keep outgoing bar in sync + resurface pending inbox after a reload */
  useEffect(() => {
    if (!treeSnapshot || !currentUser) return;
    const myId = `user:${currentUser.toLowerCase()}`;

    setOutgoingRequests(
      (treeSnapshot.requests || []).filter((r) => r.fromId === myId)
    );

    const inbox = (treeSnapshot.requests || []).filter((r) => r.toId === myId);

    setIncomingRequest((prev) => {
      /* keep the current popup while it is still pending */
      if (prev && inbox.some((r) => r.id === prev.id)) return prev;

      /* otherwise show the next pending one (or close the popup) */
      const first = inbox[0];
      if (!first) return null;
      const sender = treeSnapshot.persons.find((p) => p.id === first.fromId);
      const subject =
        first.subjectId && first.subjectId !== first.fromId
          ? treeSnapshot.persons.find((p) => p.id === first.subjectId)
          : null;
      return {
        ...first,
        fromName: sender?.name || "Someone",
        fromEmail: sender?.email || "",
        subjectName: subject?.name || null,
      };
    });
  }, [treeSnapshot, currentUser]);

  const respondToRequest = (accept) => {
    if (!treeSocket || !incomingRequest) return;
    treeSocket.emit(
      "tree:respondRequest",
      { requestId: incomingRequest.id, accept },
      (res) => {
        if (!res?.ok) alert(res?.error || "Could not respond");
        /* popup closes by itself when tree:state arrives */
      }
    );
  };

  const cancelOutgoing = (requestId) => {
    if (!treeSocket || !currentUser) return;
    treeSocket.emit(
      "tree:cancelRequest",
      { requestId },
      (res) => {
        if (!res?.ok) alert(res?.error || "Could not cancel");
      }
    );
  };

  /* my real email, as saved on the server */
  const myEmail =
    treeSnapshot?.persons?.find(
      (p) => p.id === `user:${String(currentUser || "").toLowerCase()}`
    )?.email || `${String(currentUser || "").toLowerCase()}@example.com`;

  const getMemberEmail = (m) =>
    treeSnapshot?.persons?.find(
      (p) => p.id === `user:${m.name.toLowerCase()}`
    )?.email || m.email;

  const saveSettings = () => {
    const email = emailInputRef.current?.value.trim();
    if (!treeSocket) return alert("Not connected to the server yet");
    treeSocket.emit("tree:setEmail", { email }, (res) => {
      alert(res?.ok ? "Settings saved successfully!" : res?.error || "Could not save");
    });
  };

  /* ---------- who is in MY family tree ---------- */
  const myPersonId = `user:${normName(currentUser)}`;

  const treeGraph = useMemo(
    () => (treeSnapshot ? buildGraph(treeSnapshot) : null),
    [treeSnapshot]
  );

  /* ids of everyone linked to me by any chain of relatives */
  const connected = useMemo(
    () =>
      treeGraph && treeGraph.byId[myPersonId]
        ? connectedIds(treeGraph, myPersonId)
        : null,
    [treeGraph, myPersonId]
  );

  /* ---------- dynamic relation helper ---------- */
  const getMemberRelation = (memberName) => {
    if (memberName === currentUser) return "You";

    if (treeGraph && connected) {
      const mId = `user:${normName(memberName)}`;
      if (!connected.has(mId)) return "Not connected";
      return getLabel(treeGraph, myPersonId, mId);
    }

    return DEFAULT_RELATIONS[currentUser]?.[memberName] || "Not connected";
  };

  /* ---------- chat ---------- */
  const conversation = useMemo(
    () =>
      chatMessages.filter((m) =>
        activeGroup
          ? m.groupId === activeGroup.id
          : !m.groupId &&
            ((m.from === currentUser && m.to === activeContact) ||
              (m.from === activeContact && m.to === currentUser))
      ),
    [chatMessages, activeContact, activeGroup, currentUser]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, typingFrom, activePage]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const clearPendingImage = () => {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* name = a person's name, or "g:<id>" for a group */
  const openChat = (name) => {
    setSelectedContact(name);
    setUnread((u) => ({ ...u, [name]: 0 }));
    setShowEmoji(false);
    clearPendingImage(); // never send a picked image to a different chat by mistake
  };

  const handleNavigate = (page) => {
    setActivePage(page);
    if (page === "messages" && activeContact) {
      setUnread((u) => ({ ...u, [activeContact]: 0 }));
    }
  };

  const handleChatInput = (e) => {
    setChatText(e.target.value);
    const socket = socketRef.current;
    if (!socket || !activeContact || activeGroup) return; // no typing signal in groups

    socket.emit("typing", { to: activeContact, isTyping: true });

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(
      () =>
        socketRef.current?.emit("typing", {
          to: activeContact,
          isTyping: false,
        }),
      1200
    );
  };

  /* put an emoji where the cursor is in the message box */
  const insertEmoji = (emoji) => {
    const el = chatInputRef.current;
    const start = el?.selectionStart ?? chatText.length;
    const end = el?.selectionEnd ?? chatText.length;
    setChatText(chatText.slice(0, start) + emoji + chatText.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  /* the image picked from the file dialog (checked again by the server) */
  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      return alert("Please choose a PNG, JPG, GIF or WEBP image");
    }
    if (file.size > MAX_IMAGE_BYTES) return alert("Image is too big (max 5 MB)");
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    const text = chatText.trim();
    if ((!text && !pendingImage) || !activeContact || sending) return;
    const socket = socketRef.current;
    if (!socket) return;

    /* to ONE group, or to ONE person */
    const payload = activeGroup
      ? { groupId: activeGroup.id, text }
      : { to: activeContact, text };

    setSending(true);
    if (pendingImage) {
      try {
        payload.image = {
          data: await pendingImage.file.arrayBuffer(), // sent as binary
          type: pendingImage.file.type,
        };
      } catch {
        setSending(false);
        return alert("Could not read that image");
      }
    }

    /* if the connection drops and no answer ever comes, don't stay stuck on "Sending…" */
    const failSafe = setTimeout(() => setSending(false), 15000);

    socket.emit("message:send", payload, (res) => {
      clearTimeout(failSafe);
      setSending(false);
      if (!res?.ok) return alert(res?.error || "Could not send message");
      /* sent: now clear the box. The bubble appears when "message:new" arrives */
      setChatText("");
      clearPendingImage();
      setShowEmoji(false);
    });

    if (!activeGroup) {
      socket.emit("typing", { to: activeContact, isTyping: false });
    }
  };

  /* ---- group chats ---- */
  const toggleGroupPick = (name) =>
    setGroupPick((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );

  const closeGroupModal = () => {
    setShowGroupModal(false);
    setGroupName("");
    setGroupPick([]);
    setGroupSearch("");
  };

  const createGroup = () => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("group:create", { name: groupName, members: groupPick }, (res) => {
      if (!res?.ok) return alert(res?.error || "Could not create group");
      setGroups((prev) =>
        prev.some((x) => x.id === res.group.id) ? prev : [...prev, res.group]
      );
      closeGroupModal();
      openChat(`g:${res.group.id}`);
    });
  };

  const leaveGroup = () => {
    const socket = socketRef.current;
    if (!socket || !activeGroup) return;
    if (!window.confirm(`Leave "${activeGroup.name}"? You will lose its messages.`)) return;
    socket.emit("group:leave", { groupId: activeGroup.id }, (res) => {
      if (!res?.ok) alert(res?.error || "Could not leave group");
      /* on success the server sends "group:left" and the group disappears */
    });
  };

  const deleteChatMessage = (id) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!window.confirm("Delete this message for everyone?")) return;
    socket.emit("message:delete", { id }, (res) => {
      if (!res?.ok) alert(res?.error || "Could not delete message");
      /* on success the server sends "message:deleted" and the bubble disappears */
    });
  };

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  /* ---------- sidebar ---------- */
  const menuItems = [
    { name: "Dashboard", icon: <LayoutDashboard size={21} />, page: "dashboard" },
    { name: "Tree",      icon: <Network size={21} />,         page: "tree" },
    { name: "Messages",  icon: <MessageSquare size={21} />,   page: "messages" },
    { name: "Members",   icon: <Users size={21} />,           page: "members" },
    { name: "Settings",  icon: <Settings size={21} />,        page: "settings" },
  ];

  /* ---------- dashboard data ---------- */
  const recentActivities = [
    { name: "Robert", text: "Robert uploaded 5 photos from Easter Sunday", time: "2 hours ago", avatar: "👨🏻" },
    { name: "Linda",  text: "Linda added a new tradition: Sunday Morning Pancakes", time: "Yesterday", avatar: "👩🏻" },
    { name: "Mike",   text: "Mike shared a new document: Family Tree Chart", time: "3 days ago", avatar: "👦🏻" },
  ];

  /* ---------- page renderers ---------- */
  const renderDashboardPage = () => {
    /* only people connected to ME, not every member of the app */
    const memberCount = connected ? connected.size : 1;
    const connectionCount = connected
      ? (treeSnapshot?.relationships || []).filter(
          (r) => connected.has(r.a) && connected.has(r.b)
        ).length
      : 0;

    return (
      <main className="page-content">
        <section className="welcome-section">
          <div>
            <p className="welcome-small">Welcome back,</p>
            <h1>{currentUser}</h1>
            <p className="welcome-description">Your family network is growing</p>
          </div>
          <div className="welcome-avatar">{currentUserAvatar}</div>
        </section>

        <section className="stats-container">
          <div className="stat-card">
            <div className="stat-title"><Users size={21} /><span>Family Members</span></div>
            <h2>{memberCount}</h2>
            <p>Active in tree</p>
          </div>
          <div className="stat-card">
            <div className="stat-title"><Network size={21} /><span>Connections</span></div>
            <h2>{connectionCount}</h2>
            <p>Relationships tracked</p>
          </div>
        </section>

        <section className="activity-section">
          <div className="section-header">
            <h2>Recent Activity</h2>
            <button type="button" onClick={() => handleNavigate("tree")}>
              View tree <ChevronRight size={17} />
            </button>
          </div>
          <div className="activity-list">
            {recentActivities.map((activity, index) => (
              <div className="activity-item" key={index}>
                <div className="activity-avatar">{activity.avatar}</div>
                <div className="activity-info">
                  <p>{activity.text}</p>
                  <span>{activity.time}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="birthday-card">
          <div className="birthday-date">
            <CalendarDays size={20} />
            <span>MAY</span><strong>15</strong><small>2026</small>
          </div>
          <div className="birthday-content">
            <div className="birthday-top">
              <div className="birthday-label"><CalendarDays size={15} />Birthday</div>
              <span>5 days</span>
            </div>
            <h2>Uncle James turns 65</h2>
            <p>Create an event, invite family members and surprise uncle James</p>
            <button
              type="button"
              className="create-event-btn"
              onClick={() => alert("Birthday event created!")}
            >
              <Plus size={17} /> Create Event
            </button>
          </div>
        </section>
      </main>
    );
  };

  const renderMessagesPage = () => (
    <main className="page-content">
      <div className="page-title">
        <div>
          <h1>Messages</h1>
          <p>
            You are chatting as <strong>{currentUser}</strong>{" · "}
            <a href="#switch" onClick={(e) => { e.preventDefault(); switchUser(); }}>
              switch user
            </a>
          </p>
        </div>
      </div>

      <section className="chat-layout">
        <aside
          className="chat-contacts"
          style={{ overflowY: "auto", maxHeight: "calc(100vh - 230px)" }}
        >
          <input
            type="text"
            placeholder={`Search ${contacts.length} members...`}
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              marginBottom: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          />
          {/* ---- groups ---- */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
              fontWeight: 700,
              opacity: 0.7,
              padding: "4px 4px 6px",
            }}
          >
            <span>GROUPS ({groups.length})</span>
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              title="Create a group chat"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                padding: "2px 8px",
                cursor: "pointer",
                fontSize: 12,
                color: "inherit",
              }}
            >
              <Plus size={13} /> New
            </button>
          </div>
          {visibleGroups.map((g) => {
            const key = `g:${g.id}`;
            return (
              <button
                key={key}
                type="button"
                className={`chat-contact ${key === activeContact ? "active" : ""}`}
                onClick={() => openChat(key)}
              >
                <span className="chat-avatar">
                  <Users size={16} />
                </span>
                <span className="chat-contact-name">{g.name}</span>
                {unread[key] > 0 && <span className="chat-badge">{unread[key]}</span>}
              </button>
            );
          })}
          {groups.length === 0 && (
            <p style={{ fontSize: 12, opacity: 0.55, padding: "0 4px 8px" }}>
              No groups yet. Click New to create one.
            </p>
          )}

          {/* ---- people ---- */}
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7, padding: "10px 4px 6px" }}>
            PEOPLE
          </div>
          {visibleContacts.length === 0 && (
            <p style={{ fontSize: 13, opacity: 0.6, padding: "8px 4px" }}>
              No member found
            </p>
          )}
          {visibleContacts.map((name) => (
            <button
              key={name}
              type="button"
              className={`chat-contact ${name === activeContact ? "active" : ""}`}
              onClick={() => openChat(name)}
            >
              <span className="chat-avatar">
                {name[0]}
                <i className={onlineUsers.includes(name) ? "dot online" : "dot"} />
              </span>
              <span className="chat-contact-name">{name}</span>
              {unread[name] > 0 && <span className="chat-badge">{unread[name]}</span>}
            </button>
          ))}
        </aside>

        <div className="chat-window">
          <div className="chat-header">
            <h3>{activeGroup ? activeGroup.name : activeContact}</h3>
            {activeGroup ? (
              <span
                title={activeGroup.members.join(", ")}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                {activeGroup.members.length} members
                <button
                  type="button"
                  onClick={leaveGroup}
                  style={{
                    background: "none",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    padding: "2px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "inherit",
                  }}
                >
                  Leave
                </button>
              </span>
            ) : (
              <span>{onlineUsers.includes(activeContact) ? "Online" : "Offline"}</span>
            )}
          </div>

          <div className="chat-messages">
            {conversation.map((m) => (
              <div
                key={m.id}
                className={`chat-bubble ${m.from === currentUser ? "mine" : "theirs"}`}
              >
                {activeGroup && m.from !== currentUser && (
                  <span
                    style={{ display: "block", fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 2 }}
                  >
                    {m.from}
                  </span>
                )}
                {m.imageUrl && (
                  <img
                    src={`${SOCKET_URL}${m.imageUrl}`}
                    alt="shared"
                    loading="lazy"
                    onLoad={() => bottomRef.current?.scrollIntoView()}
                    onClick={() =>
                      window.open(`${SOCKET_URL}${m.imageUrl}`, "_blank", "noopener")
                    }
                    style={{
                      display: "block",
                      maxWidth: 240,
                      maxHeight: 240,
                      borderRadius: 8,
                      marginBottom: m.text ? 6 : 0,
                      cursor: "zoom-in",
                    }}
                  />
                )}
                {m.text && <p>{m.text}</p>}
                <small>{formatTime(m.time)}</small>
                {m.from === currentUser && (
                  <button
                    type="button"
                    className="chat-delete"
                    title="Delete message"
                    onClick={() => deleteChatMessage(m.id)}
                    style={{
                      marginLeft: 8,
                      background: "none",
                      border: "none",
                      color: "inherit",
                      opacity: 0.6,
                      cursor: "pointer",
                      verticalAlign: "middle",
                      padding: 0,
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}

            {typingFrom[activeContact] && (
              <div className="chat-typing">{activeContact} is typing…</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* picked image, shown before it is sent */}
          {pendingImage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <img
                src={pendingImage.previewUrl}
                alt="preview"
                style={{ height: 56, borderRadius: 6 }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  opacity: 0.7,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pendingImage.file.name}
              </span>
              <button
                type="button"
                onClick={clearPendingImage}
                title="Remove image"
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              >
                <X size={18} />
              </button>
            </div>
          )}

          <form
            className="chat-input"
            onSubmit={sendChatMessage}
            style={{ position: "relative" }}
          >
            {/* emoji picker */}
            {showEmoji && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: 0,
                  zIndex: 5,
                  width: 320,
                  maxWidth: "92vw",
                  maxHeight: 210,
                  overflowY: "auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: 2,
                  padding: 8,
                  background: "#fff",
                  color: "#111",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                }}
              >
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 20,
                      padding: 4,
                      borderRadius: 6,
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              title="Emoji"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 6px" }}
            >
              <Smile size={21} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Send an image"
              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 6px" }}
            >
              <ImageIcon size={21} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={pickImage}
              style={{ display: "none" }}
            />

            <input
              ref={chatInputRef}
              type="text"
              placeholder={`Message ${activeGroup ? activeGroup.name : activeContact}...`}
              value={chatText}
              onChange={handleChatInput}
            />
            <button type="submit" className="black-button" disabled={sending}>
              <Send size={17} /> {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );

  const renderMembersPage = () => {
    const q = searchTerm.toLowerCase();
    const filteredMembers = members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          getMemberRelation(m.name).toLowerCase().includes(q)
      )
      /* me first, then my relatives, then everyone else A-Z */
      .sort(
        (a, b) =>
          Number(b.name === currentUser) - Number(a.name === currentUser) ||
          Number(getMemberRelation(a.name) === "Not connected") -
            Number(getMemberRelation(b.name) === "Not connected") ||
          a.name.localeCompare(b.name)
      );
    const shownMembers = filteredMembers.slice(0, memberLimit);

    return (
      <main className="page-content">
        <div className="page-title">
          <div>
            <h1>Family Members</h1>
            <p>Manage everyone in your family network</p>
          </div>
          <button type="button" className="black-button" onClick={() => handleNavigate("tree")}>
            <UserPlus size={18} /> Add Member in Tree
          </button>
        </div>

        <section className="members-card">
          <div className="members-table-header">
            <span>Member</span><span>Relation</span><span>Email</span><span>Status</span>
          </div>
          {shownMembers.map((member) => {
            const rel = getMemberRelation(member.name);
            return (
              <div className="members-row" key={member.name}>
                <div className="member-name-cell">
                  <div className="member-avatar">{member.avatar}</div>
                  <div>
                    <h3>{member.name}</h3>
                    <p>{rel}</p>
                  </div>
                </div>
                <span>{rel}</span>
                <span>{getMemberEmail(member)}</span>
                <span className="status">
                  {onlineUsers.includes(member.name) ? "Online" : "Offline"}
                </span>
              </div>
            );
          })}

          <div style={{ padding: 16, textAlign: "center", fontSize: 13 }}>
            <span style={{ opacity: 0.7 }}>
              Showing {shownMembers.length} of {filteredMembers.length} members
            </span>
            {filteredMembers.length > shownMembers.length && (
              <button
                type="button"
                className="black-button"
                style={{ marginLeft: 12 }}
                onClick={() => setMemberLimit((n) => n + 25)}
              >
                Show 25 more
              </button>
            )}
          </div>
        </section>
      </main>
    );
  };

  const renderSettingsPage = () => (
    <main className="page-content">
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Manage your account preferences</p>
        </div>
      </div>

      <section className="settings-card">
        <div className="settings-section">
          <div className="settings-heading">
            <User size={21} />
            <div>
              <h2>Profile</h2>
              <p>Update your personal information</p>
            </div>
          </div>
          <div className="settings-form" key={`${currentUser}-${myEmail}`}>
            <div className="input-group">
              <label>Full Name</label>
              <input type="text" defaultValue={currentUser} />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" defaultValue={myEmail} ref={emailInputRef} />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-heading">
            <Lock size={21} />
            <div>
              <h2>Security</h2>
              <p>Manage your account security</p>
            </div>
          </div>
          <button
            type="button"
            className="settings-option"
            onClick={() => alert("Password reset link sent.")}
          >
            <Shield size={20} />
            <div>
              <h3>Change Password</h3>
              <p>Update your account password</p>
            </div>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-heading">
            <Bell size={21} />
            <div>
              <h2>Notifications</h2>
              <p>Manage your notification preferences</p>
            </div>
          </div>
          <label className="notification-setting">
            <div><h3>Family Updates</h3><p>Receive updates about your family</p></div>
            <input type="checkbox" defaultChecked />
          </label>
          <label className="notification-setting">
            <div><h3>Messages</h3><p>Receive notifications for new messages</p></div>
            <input type="checkbox" defaultChecked />
          </label>
        </div>

        <button
          type="button"
          className="save-button"
          onClick={saveSettings}
        >
          <Save size={17} /> Save Changes
        </button>
      </section>
    </main>
  );

  /* ---------- page switcher ---------- */
  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return renderDashboardPage();
      case "tree":      return <TreePage socket={treeSocket} currentUser={currentUser} />;
      case "messages":  return renderMessagesPage();
      case "members":   return renderMembersPage();
      case "settings":  return renderSettingsPage();
      default:          return renderDashboardPage();
    }
  };

  /* ---------- no user picked ---------- */
  if (!currentUser) {
    const pq = pickerSearch.trim().toLowerCase();
    const matches = members.filter((m) => m.name.toLowerCase().includes(pq));
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <h2>Who are you?</h2>
        <p>Pick a family member for this browser tab ({members.length} members)</p>
        <input
          type="text"
          autoFocus
          placeholder="Search by name..."
          value={pickerSearch}
          onChange={(e) => setPickerSearch(e.target.value)}
          style={{ padding: "10px 14px", width: 280, marginTop: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
            marginTop: 20,
            maxWidth: 760,
            marginInline: "auto",
          }}
        >
          {matches.slice(0, 40).map((m) => (
            <button
              key={m.name}
              type="button"
              className="black-button"
              onClick={() => {
                setPickerSearch("");
                chooseUser(m.name);
              }}
            >
              {m.avatar} {m.name}
            </button>
          ))}
        </div>
        {matches.length > 40 && (
          <p style={{ opacity: 0.6, fontSize: 13, marginTop: 14 }}>
            Showing 40 of {matches.length}. Type to narrow the list.
          </p>
        )}
        {matches.length === 0 && <p style={{ opacity: 0.6 }}>No member found</p>}
      </div>
    );
  }

  /* people who can be added to a new group (first 60 matches; search to narrow) */
  const groupCandidates = members
    .filter(
      (m) =>
        m.name !== currentUser &&
        m.name.toLowerCase().includes(groupSearch.trim().toLowerCase())
    )
    .slice(0, 60);

  /* =======================================================
     MAIN RENDER
  ======================================================= */
  return (
    <div
      className="dashboard-layout"
      onClick={() => profileDropdownOpen && setProfileDropdownOpen(false)}
    >
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon"><Users size={30} /></div>
          <h2>FamilyTree</h2>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebar-item ${activePage === item.page ? "active" : ""}`}
              onClick={() => handleNavigate(item.page)}
            >
              {item.icon}
              <span>{item.name}</span>
              {item.page === "messages" && totalUnread > 0 && (
                <span className="message-dot"></span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <Network size={24} />
          <p>Stronger<br />Together<span> ♥</span></p>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="search-box">
            <Search size={21} />
            <input
              type="text"
              placeholder="Search family members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="topbar-right">
            <div
              className="notification"
              title="Notifications"
              onClick={() => handleNavigate("messages")}
            >
              <Bell size={23} />
              {totalUnread > 0 && (
                <span className="notification-badge">{totalUnread}</span>
              )}
            </div>

            <div
              className="profile"
              style={{ position: "relative", cursor: "pointer", userSelect: "none" }}
              onClick={(e) => {
                e.stopPropagation();
                setProfileDropdownOpen((prev) => !prev);
              }}
            >
              <div className="profile-avatar">{currentUserAvatar}</div>
              <span style={{ fontWeight: 600, fontSize: "14px" }}>{currentUser}</span>
              <ChevronDown size={17} />

              {profileDropdownOpen && (
                <div
                  className="profile-dropdown-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="profile-dropdown-header">
                    <strong>{currentUser}</strong>
                    <small>{myEmail}</small>
                  </div>
                  <div className="profile-dropdown-divider" />
                  <div className="profile-dropdown-label">Switch User</div>
                  {members
                    .filter((m) => QUICK_USERS.includes(m.name) || m.name === currentUser)
                    .map((m) => (
                    <button
                      key={m.name}
                      type="button"
                      className={`profile-dropdown-item ${m.name === currentUser ? "active" : ""}`}
                      onClick={() => {
                        chooseUser(m.name);
                        setProfileDropdownOpen(false);
                      }}
                    >
                      <span>{m.avatar}</span>
                      <span>{m.name}</span>
                      {m.name === currentUser && <small>(You)</small>}
                    </button>
                  ))}
                  <div className="profile-dropdown-divider" />
                  <button
                    type="button"
                    className="profile-dropdown-item logout"
                    onClick={() => {
                      switchUser();
                      setProfileDropdownOpen(false);
                    }}
                  >
                    Logout / Pick Member
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {renderPage()}
      </div>

      {/* ============ NEW GROUP POPUP ============ */}
      {showGroupModal && (
        <div className="request-overlay" onClick={closeGroupModal}>
          <div
            className="request-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 420, maxWidth: "92vw", textAlign: "left" }}
          >
            <h3>New group</h3>

            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              maxLength={60}
              onChange={(e) => setGroupName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", marginBottom: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
            <input
              type="text"
              placeholder="Search members to add..."
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", marginBottom: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
            />

            <div
              style={{
                maxHeight: 230,
                overflowY: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 4,
              }}
            >
              {groupCandidates.map((m) => (
                <label
                  key={m.name}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={groupPick.includes(m.name)}
                    onChange={() => toggleGroupPick(m.name)}
                  />
                  <span>{m.avatar}</span>
                  <span>{m.name}</span>
                </label>
              ))}
              {groupCandidates.length === 0 && (
                <p style={{ fontSize: 13, opacity: 0.6, padding: 8 }}>No member found</p>
              )}
            </div>

            <p style={{ fontSize: 12, opacity: 0.7, margin: "8px 0" }}>
              {groupPick.length} selected. You are added automatically.
              {groupPick.length > 0 && ` (${groupPick.slice(0, 4).join(", ")}${groupPick.length > 4 ? "…" : ""})`}
            </p>

            <div className="request-actions">
              <button
                className="tree-action-btn accept"
                onClick={createGroup}
                disabled={!groupName.trim() || groupPick.length < 1}
              >
                Create group
              </button>
              <button className="tree-action-btn reject" onClick={closeGroupModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ GLOBAL REQUEST POPUP ============ */}
      {incomingRequest && (
        <div className="request-overlay">
          <div className="request-card">
            <h3>Relationship Request</h3>
            <p>
              <strong>{incomingRequest.fromName || "Someone"}</strong>
              {incomingRequest.fromEmail && (
                <> ({incomingRequest.fromEmail})</>
              )}{" "}
              says you are{" "}
              {incomingRequest.subjectName
                ? `${incomingRequest.subjectName}'s`
                : "their"}{" "}
              <strong>{incomingRequest.relation}</strong>.
            </p>
            <p style={{ fontSize: 13, opacity: 0.75 }}>
              Is this person your connection? Only accept if you know them.
            </p>
            <div className="request-actions">
              <button
                className="tree-action-btn accept"
                onClick={() => respondToRequest(true)}
              >
                Accept
              </button>
              <button
                className="tree-action-btn reject"
                onClick={() => respondToRequest(false)}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ OUTGOING REQUESTS BAR ============ */}
      {outgoingRequests.length > 0 && (
        <div className="outgoing-requests">
          <Bell size={16} />
          <span>
            {outgoingRequests.length} pending request
            {outgoingRequests.length > 1 ? "s" : ""}:
          </span>
          {outgoingRequests.map((r) => {
            const target =
              treeSnapshot?.persons?.find((p) => p.id === r.toId)?.name ||
              r.toName ||
              r.toEmail ||
              "?";
            return (
              <span key={r.id} className="outgoing-chip">
                {target} as{" "}
                {r.subjectId && r.subjectId !== r.fromId
                  ? `${
                      treeSnapshot?.persons?.find((p) => p.id === r.subjectId)
                        ?.name || "their"
                    }'s `
                  : ""}
                {r.relation}
                <button
                  className="chip-cancel"
                  onClick={() => cancelOutgoing(r.id)}
                  title="Cancel"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Dashboard;