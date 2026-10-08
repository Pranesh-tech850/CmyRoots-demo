import React from "react";
import { User } from "lucide-react";

const ProfileModal = ({
  memberCount,
  selectedPerson,
  onClose,
}) => {
  const person = selectedPerson || {
    name: "Tom Smith",
    relation: "Me",
    isMe: true,
  };

  return (
    <div
      className="relative-modal-overlay"
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
        >
          ×
        </button>

        {/* AVATAR */}
        <div className="profile-large-avatar">
          <User size={42} />
        </div>

        {/* NAME */}
        <h2>{person.name}</h2>

        <span>
          {person.isMe ? "Me" : person.relation}
        </span>

        {/* INFORMATION */}
        <div className="profile-info">
          <div>
            <small>Relationship</small>

            <strong>
              {person.isMe ? "Self" : person.relation}
            </strong>
          </div>

          <div>
            <small>Family Members</small>

            <strong>{memberCount}</strong>
          </div>
        </div>

        {/* CLOSE BUTTON */}
        <button
          className="relative-add-button profile-close-button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default ProfileModal;