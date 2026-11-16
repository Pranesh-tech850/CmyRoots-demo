import React, { useEffect, useMemo, useRef, useState } from "react";
import { Images, Plus, X, Send, Users, ImageOff } from "lucide-react";
import { SOCKET_URL, MAX_IMAGE_BYTES } from "../constant";

import "./ProfilePhotos.css";

const PREVIEW_COUNT = 5; // tiles shown before the "+N more" tile

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const ProfilePhotos = ({
  currentUser,
  chatMessages = [],
  contacts = [],
  groups = [],
  onSendPhoto,
}) => {
  const [tab, setTab] = useState("mine"); // "mine" | "shared"
  const [expanded, setExpanded] = useState(false);
  const [viewer, setViewer] = useState(null); // photo open in the lightbox
  const [showAdd, setShowAdd] = useState(false);

  /* every chat message that has a picture, newest first */
  const { mine, shared } = useMemo(() => {
    const withImage = chatMessages
      .filter((m) => m.imageUrl)
      .slice()
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    const groupName = (id) =>
      groups.find((g) => String(g.id) === String(id))?.name || "a group";

    const toPhoto = (m, isMine) => ({
      id: m.id,
      url: `${SOCKET_URL}${m.imageUrl}`,
      time: m.time,
      text: m.text,
      // mine: who I sent it to · shared: who sent it to me
      label: isMine
        ? `To ${m.groupId ? groupName(m.groupId) : m.to}`
        : m.groupId
        ? `${m.from} · ${groupName(m.groupId)}`
        : `From ${m.from}`,
    });

    return {
      mine: withImage.filter((m) => m.from === currentUser).map((m) => toPhoto(m, true)),
      shared: withImage.filter((m) => m.from !== currentUser).map((m) => toPhoto(m, false)),
    };
  }, [chatMessages, groups, currentUser]);

  const photos = tab === "mine" ? mine : shared;
  const visible = expanded ? photos : photos.slice(0, PREVIEW_COUNT);
  const hiddenCount = photos.length - PREVIEW_COUNT;
  const showMoreTile = !expanded && hiddenCount > 0;

  const switchTab = (next) => {
    setTab(next);
    setExpanded(false);
  };

  return (
    <div className="photos-card">
      <div className="photos-heading">
        <div className="photos-title">
          <Images size={22} />
          <h3>Photos</h3>
          <span className="photos-count">{mine.length + shared.length}</span>
        </div>

        <button type="button" className="photos-add-btn" onClick={() => setShowAdd(true)}>
          <Plus size={18} />
          Add
        </button>
      </div>

      <div className="photos-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={tab === "mine" ? "active" : ""}
          onClick={() => switchTab("mine")}
        >
          My photos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shared"}
          className={tab === "shared" ? "active" : ""}
          onClick={() => switchTab("shared")}
        >
          Shared with me
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="photos-empty">
          <ImageOff size={30} />
          <p>
            {tab === "mine"
              ? "You haven't sent any photos yet. Click Add to send one in a chat."
              : "No one has sent you a photo yet. Photos from your chats show up here."}
          </p>
        </div>
      ) : (
        <div className="photos-grid">
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              className="photo-tile"
              onClick={() => setViewer(p)}
              title={p.label}
            >
              <img src={p.url} alt={p.label} loading="lazy" />
              <span className="photo-tile-label">{p.label}</span>
            </button>
          ))}

          {showMoreTile && (
            <button
              type="button"
              className="photo-tile photo-more"
              onClick={() => setExpanded(true)}
            >
              <Plus size={30} />
              <span>+{hiddenCount} more</span>
            </button>
          )}
        </div>
      )}

      {expanded && photos.length > PREVIEW_COUNT && (
        <button type="button" className="photos-show-less" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}

      {/* full-size viewer */}
      {viewer && (
        <div className="photo-lightbox" onClick={() => setViewer(null)}>
          <button
            type="button"
            className="photo-lightbox-close"
            aria-label="Close"
            onClick={() => setViewer(null)}
          >
            <X size={22} />
          </button>
          <img src={viewer.url} alt={viewer.label} onClick={(e) => e.stopPropagation()} />
          <p onClick={(e) => e.stopPropagation()}>
            {viewer.label} · {formatDate(viewer.time)}
            {viewer.text ? ` — ${viewer.text}` : ""}
          </p>
        </div>
      )}

      {showAdd && (
        <SendPhotoModal
          contacts={contacts}
          groups={groups}
          onSendPhoto={onSendPhoto}
          onClose={() => setShowAdd(false)}
          onSent={() => {
            setShowAdd(false);
            switchTab("mine");
          }}
        />
      )}
    </div>
  );
};

/* ---------- "Add": pick a photo, pick who gets it, send ---------- */
const SendPhotoModal = ({ contacts, groups, onSendPhoto, onClose, onSent }) => {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [target, setTarget] = useState(""); // person's name, or "g:<id>"
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) {
      return setError("Please choose a PNG, JPG, GIF or WEBP image.");
    }
    if (f.size > MAX_IMAGE_BYTES) return setError("Image is too big (max 5 MB).");
    setError("");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const q = search.trim().toLowerCase();
  const people = contacts.filter((n) => n.toLowerCase().includes(q)).slice(0, 40);
  const myGroups = groups.filter((g) => g.name.toLowerCase().includes(q));

  const send = async () => {
    if (!file || !target || sending) return;
    setSending(true);
    setError("");
    const res = await onSendPhoto(file, target);
    setSending(false);
    if (!res?.ok) return setError(res?.error || "Could not send the photo.");
    onSent();
  };

  return (
    <div className="photo-modal-backdrop" onClick={onClose}>
      <div className="photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="photo-modal-header">
          <h4>Send a photo</h4>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <button type="button" className="photo-pick" onClick={() => inputRef.current?.click()}>
          {previewUrl ? (
            <img src={previewUrl} alt="Selected" />
          ) : (
            <>
              <Plus size={26} />
              <span>Choose a photo</span>
            </>
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pick} />

        <input
          className="photo-search"
          type="text"
          placeholder="Search people or groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="photo-targets">
          {myGroups.map((g) => {
            const key = `g:${g.id}`;
            return (
              <button
                key={key}
                type="button"
                className={target === key ? "selected" : ""}
                onClick={() => setTarget(key)}
              >
                <span className="photo-target-avatar"><Users size={15} /></span>
                {g.name}
              </button>
            );
          })}
          {people.map((name) => (
            <button
              key={name}
              type="button"
              className={target === name ? "selected" : ""}
              onClick={() => setTarget(name)}
            >
              <span className="photo-target-avatar">{name[0]}</span>
              {name}
            </button>
          ))}
          {myGroups.length === 0 && people.length === 0 && (
            <p className="photo-targets-empty">No match found</p>
          )}
        </div>

        {error && <p className="photo-modal-error">{error}</p>}

        <button
          type="button"
          className="photo-send-btn"
          disabled={!file || !target || sending}
          onClick={send}
        >
          <Send size={16} />
          {sending ? "Sending…" : "Send photo"}
        </button>
      </div>
    </div>
  );
};

export default ProfilePhotos;