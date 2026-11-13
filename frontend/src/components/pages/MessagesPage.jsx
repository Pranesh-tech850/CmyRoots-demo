import React from "react";
import { Plus, Users, Trash2, Smile, Image as ImageIcon, Send, X } from "lucide-react";
import { SOCKET_URL, EMOJIS } from "../constant";

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const MessagesPage = ({
  currentUser,
  logout,
  contacts,
  contactSearch,
  setContactSearch,
  groups,
  visibleGroups,
  visibleContacts,
  activeContact,
  activeGroup,
  unread,
  onlineUsers,
  typingFrom,
  conversation,
  openChat,
  setShowGroupModal,
  leaveGroup,
  deleteChatMessage,
  pendingImage,
  clearPendingImage,
  showEmoji,
  setShowEmoji,
  insertEmoji,
  pickImage,
  sending,
  chatText,
  handleChatInput,
  sendChatMessage,
  bottomRef,
  chatInputRef,
  fileInputRef,
}) => (
  <main className="page-content">
    <div className="page-title">
      <div>
        <h1>Messages</h1>
        <p>
          You are chatting as <strong>{currentUser}</strong>{" · "}
          <a
  href="#logout"
  onClick={(e) => {
    e.preventDefault();
    logout();
  }}
>
  log out
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

export default MessagesPage;