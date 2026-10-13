import React from "react";
import { User } from "lucide-react";

const ProfileModal = ({
  memberCount,
  selectedPerson,
  onClose,
}) => {
  const person = selectedPerson || {
    name: "Family Member",
    relation: "Me",
    isMe: true,
  };

  return (
    <div
      className="tree-modal-overlay"
      onClick={onClose}
    >
      <div
        className="profile-modal"
        onClick={(event) => event.stopPropagation()}
      >
        {/* CLOSE */}
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        {/* AVATAR */}
        <div className="profile-modal-avatar">
          <User size={36} />
        </div>

        {/* NAME */}
        <h2>{person.name}</h2>

        <p style={{ margin: "4px 0 16px", color: "#888", fontSize: "14px" }}>
          {person.isMe ? "You" : person.relation}
        </p>

        {/* DETAILS */}
        <div className="profile-details">
          <div className="profile-detail-card">
            <span>Relationship</span>
            <strong>{person.isMe ? "Self" : person.relation}</strong>
          </div>

          <div className="profile-detail-card">
            <span>Family Members</span>
            <strong>{memberCount}</strong>
          </div>
        </div>

        {/* CLOSE BUTTON */}
        <button
          className="profile-close-btn"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ProfileModal;