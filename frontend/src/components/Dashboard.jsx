import React, { useState, useEffect, useMemo, useRef } from "react";
import { io } from "socket.io-client";

import "../styles/Dashboard.css";

import TreePage from "./tree/TreePage";
import { buildGraph, getLabel, normName, connectedIds } from "./tree/familyLogic";

import {
  SOCKET_URL,
  isGroupKey,
  MAX_IMAGE_BYTES,
} from "./constant";

import Sidebar from "./layout/Sidebar";
import Topbar from "./layout/Topbar";
import DashboardHome from "./pages/DashboardHome";
import MessagesPage from "./pages/MessagesPage";
import MembersPage from "./pages/MembersPage";
import SettingsPage from "./pages/SettingsPage";
import GroupModal from "./modals/GroupModal";
import RequestPopup from "./modals/RequestPopup";
import OutgoingRequests from "./modals/OutgoingRequests";
import MyProfilePage from "./pages/MyProfilePage";

const Dashboard = ({ session, onLogout }) => {
  /* who is logged in (verified by the server with the login token) */
  const currentUser = session.user.name;
  const token = session.token;

  /* ---------- members: ME + the people linked to me in my family tree ----------
     (the server sends only these; a brand-new account sees only itself) */
  const [members, setMembers] = useState(() => [session.user]);


  const [contactSearch, setContactSearch] = useState("");
  const [memberLimit, setMemberLimit] = useState(25);

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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
    () => contacts[0] || ""
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

  /* load my members, and again whenever my tree changes (a new relative accepted) */

  const treeVersion = treeSnapshot?.version;
  useEffect(() => {
    fetch(`${SOCKET_URL}/api/members`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          onLogout(); // the login expired
          return null;
        }
        return r.json();
      })
      .then((list) => {
        if (Array.isArray(list) && list.length) setMembers(list);
      })
      .catch(() => {}); // keep the current list if the server is not reachable
  }, [token, onLogout, treeVersion]);

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
    setTreeSocket(null);

    console.log("→ creating socket for", currentUser);
    const socket = io(SOCKET_URL, {
      auth: { token }, // the server reads who you are from the token
    });

    socketRef.current = socket;
    setTreeSocket(socket);

    socket.on("connect", () => {
      console.log("✅ socket connected as", currentUser, socket.id);
    });

    socket.on("connect_error", (err) => {
      console.log("❌ socket error:", err.message);
      if (err.message === "unauthorized") onLogout(); // login expired or account removed
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
  }, [token, currentUser, onLogout]);

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
    )?.email || session.user.email;

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

    return "Not connected";
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

  /* ---------- dashboard numbers (only people connected to ME) ---------- */
  const memberCount = connected ? connected.size : 1;
  const connectionCount = connected
    ? (treeSnapshot?.relationships || []).filter(
        (r) => connected.has(r.a) && connected.has(r.b)
      ).length
    : 0;

  /* ---------- page switcher ---------- */
  const renderPage = () => {
    switch (activePage) {
      case "tree":
        return <TreePage socket={treeSocket} currentUser={currentUser} />;
      case "messages":
        return (
          <MessagesPage
            currentUser={currentUser}
            logout={onLogout}
            contacts={contacts}
            contactSearch={contactSearch}
            setContactSearch={setContactSearch}
            groups={groups}
            visibleGroups={visibleGroups}
            visibleContacts={visibleContacts}
            activeContact={activeContact}

            activeGroup={activeGroup}
            unread={unread}
            onlineUsers={onlineUsers}
            typingFrom={typingFrom}
            conversation={conversation}
            openChat={openChat}
            setShowGroupModal={setShowGroupModal}
            leaveGroup={leaveGroup}
            deleteChatMessage={deleteChatMessage}
            pendingImage={pendingImage}
            clearPendingImage={clearPendingImage}
            showEmoji={showEmoji}
            setShowEmoji={setShowEmoji}
            insertEmoji={insertEmoji}
            pickImage={pickImage}
            sending={sending}
            chatText={chatText}
            handleChatInput={handleChatInput}
            sendChatMessage={sendChatMessage}
            bottomRef={bottomRef}
            chatInputRef={chatInputRef}
            fileInputRef={fileInputRef}
          />
        );
      case "members":
        return (
          <MembersPage
            members={members}
            searchTerm={searchTerm}
            currentUser={currentUser}
            getMemberRelation={getMemberRelation}
            getMemberEmail={getMemberEmail}

            onlineUsers={onlineUsers}
            memberLimit={memberLimit}
            setMemberLimit={setMemberLimit}
            onNavigate={handleNavigate}
          />
        );
      case "settings":
        return (
         <SettingsPage
  currentUser={currentUser}
  myEmail={myEmail}
  onOpenProfile={() => setActivePage("my-profile")}
  onCreateEvent={() => setActivePage("events")}
/>
        );
        case "my-profile":
  return (
    <MyProfilePage
      currentUser={currentUser}
      myEmail={myEmail}
      onBack={() => handleNavigate("settings")}
    />
  );
      default:
        return (
          <DashboardHome
            currentUser={currentUser}
            currentUserAvatar={currentUserAvatar}
            memberCount={memberCount}
            connectionCount={connectionCount}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  /* people who can be added to a new group (first 60 matches; search to narrow) */
  const groupCandidates = members
    .filter(
      (m) =>

        m.name !== currentUser &&
        m.name.toLowerCase().includes(groupSearch.trim().toLowerCase())
    )
    .slice(0, 60);

  return (
    <div
      className="dashboard-layout"
      onClick={() => profileDropdownOpen && setProfileDropdownOpen(false)}
    >
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        totalUnread={totalUnread}
      />

      <div className="main-area">
        <Topbar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          totalUnread={totalUnread}
          onNavigate={handleNavigate}
          currentUser={currentUser}
          currentUserAvatar={currentUserAvatar}
          myEmail={myEmail}
          profileDropdownOpen={profileDropdownOpen}
          setProfileDropdownOpen={setProfileDropdownOpen}
          logout={onLogout}
        />

        {renderPage()}
      </div>


      {showGroupModal && (
        <GroupModal
          groupName={groupName}
          setGroupName={setGroupName}
          groupSearch={groupSearch}
          setGroupSearch={setGroupSearch}
          groupCandidates={groupCandidates}
          groupPick={groupPick}
          toggleGroupPick={toggleGroupPick}
          createGroup={createGroup}
          closeGroupModal={closeGroupModal}
        />
      )}

      {incomingRequest && (
        <RequestPopup
          incomingRequest={incomingRequest}
          respondToRequest={respondToRequest}
        />
      )}

      {outgoingRequests.length > 0 && (
        <OutgoingRequests
          outgoingRequests={outgoingRequests}
          treeSnapshot={treeSnapshot}
          cancelOutgoing={cancelOutgoing}
        />
      )}
    </div>
  );
};


export default Dashboard;