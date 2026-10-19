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
} from "lucide-react";

import "../styles/Dashboard.css";

import TreePage from "./tree/TreePage";
import { buildGraph, getLabel, normName } from "./tree/familyLogic";

/* ⚠️ MUST match your server's listen() port */
const SOCKET_URL = "http://localhost:4000";

const Dashboard = () => {
  /* ---------- members ---------- */
  const members = useMemo(
    () => [
      { name: "Sarah",  relation: "You",    email: "sarah@example.com",  status: "Active", avatar: "👩🏻" },
      { name: "Robert", relation: "Father", email: "robert@example.com", status: "Active", avatar: "👨🏻" },
      { name: "Linda",  relation: "Mother", email: "linda@example.com",  status: "Active", avatar: "👩🏻" },
      { name: "Mike",   relation: "Brother",email: "mike@example.com",   status: "Active", avatar: "👦🏻" },
    ],
    []
  );

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
  const [selectedContact, setSelectedContact] = useState(
    () => contacts[0] || "Robert"
  );
  const activeContact = contacts.includes(selectedContact)
    ? selectedContact
    : contacts[0] || "";
  const [chatText, setChatText] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingFrom, setTypingFrom] = useState({});
  const [unread, setUnread] = useState({});

  const [treeSocket, setTreeSocket] = useState(null);
  const [treeSnapshot, setTreeSnapshot] = useState(null);

  /* ---- global request state ---- */
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [outgoingRequests, setOutgoingRequests] = useState([]);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
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

      const chatIsOpen =
        activePageRef.current === "messages" &&
        activeContactRef.current === msg.from;

      if (msg.from !== currentUser && !chatIsOpen) {
        setUnread((u) => ({ ...u, [msg.from]: (u[msg.from] || 0) + 1 }));
      }
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

  /* ---------- dynamic relation helper ---------- */
  const getMemberRelation = (memberName) => {
    if (memberName === currentUser) return "You";

    if (treeSnapshot && treeSnapshot.persons && treeSnapshot.relationships) {
      const g = buildGraph(treeSnapshot);
      const vId = treeSnapshot.persons.find(
        (p) => normName(p.name) === normName(currentUser)
      )?.id;
      const mId = treeSnapshot.persons.find(
        (p) => normName(p.name) === normName(memberName)
      )?.id;
      if (vId && mId) return getLabel(g, vId, mId);
    }

    const defaultRelations = {
      Sarah:  { Robert: "Father", Linda: "Mother", Mike: "Brother" },
      Robert: { Sarah: "Daughter", Linda: "Wife",  Mike: "Son" },
      Linda:  { Sarah: "Daughter", Robert: "Husband", Mike: "Son" },
      Mike:   { Sarah: "Sister", Robert: "Father", Linda: "Mother" },
    };
    return defaultRelations[currentUser]?.[memberName] || "Relative";
  };

  /* ---------- chat ---------- */
  const conversation = useMemo(
    () =>
      chatMessages.filter(
        (m) =>
          (m.from === currentUser && m.to === activeContact) ||
          (m.from === activeContact && m.to === currentUser)
      ),
    [chatMessages, activeContact, currentUser]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, typingFrom, activePage]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  const openChat = (name) => {
    setSelectedContact(name);
    setUnread((u) => ({ ...u, [name]: 0 }));
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
    if (!socket || !activeContact) return;

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

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatText.trim() || !activeContact) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit("message:send", { to: activeContact, text: chatText });
    socket.emit("typing", { to: activeContact, isTyping: false });
    setChatText("");
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
    const memberCount = treeSnapshot?.persons?.length || members.length;
    const connectionCount = treeSnapshot?.relationships?.length || 6;

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
        <aside className="chat-contacts">
          {contacts.map((name) => (
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
            <h3>{activeContact}</h3>
            <span>{onlineUsers.includes(activeContact) ? "Online" : "Offline"}</span>
          </div>

          <div className="chat-messages">
            {conversation.map((m) => (
              <div
                key={m.id}
                className={`chat-bubble ${m.from === currentUser ? "mine" : "theirs"}`}
              >
                <p>{m.text}</p>
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

          <form className="chat-input" onSubmit={sendChatMessage}>
            <input
              type="text"
              placeholder={`Message ${activeContact}...`}
              value={chatText}
              onChange={handleChatInput}
            />
            <button type="submit" className="black-button">
              <Send size={17} /> Send
            </button>
          </form>
        </div>
      </section>
    </main>
  );

  const renderMembersPage = () => {
    const filteredMembers = members.filter(
      (m) =>
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getMemberRelation(m.name).toLowerCase().includes(searchTerm.toLowerCase())
    );

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
          {filteredMembers.map((member, index) => {
            const rel = getMemberRelation(member.name);
            return (
              <div className="members-row" key={index}>
                <div className="member-name-cell">
                  <div className="member-avatar">{member.avatar}</div>
                  <div>
                    <h3>{member.name}</h3>
                    <p>{rel}</p>
                  </div>
                </div>
                <span>{rel}</span>
                <span>{getMemberEmail(member)}</span>
                <span className="status">{member.status}</span>
              </div>
            );
          })}
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
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <h2>Who are you?</h2>
        <p>Pick a family member for this browser tab</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
          {members.map((m) => (
            <button
              key={m.name}
              type="button"
              className="black-button"
              onClick={() => chooseUser(m.name)}
            >
              {m.avatar} {m.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

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
                  {members.map((m) => (
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