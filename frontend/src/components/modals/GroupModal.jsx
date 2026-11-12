import React from "react";

const GroupModal = ({
  groupName,
  setGroupName,
  groupSearch,
  setGroupSearch,
  groupCandidates,
  groupPick,
  toggleGroupPick,
  createGroup,
  closeGroupModal,
}) => (
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
);

export default GroupModal;
