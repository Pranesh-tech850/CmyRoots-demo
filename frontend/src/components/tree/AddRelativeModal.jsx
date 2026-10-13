import React from "react";
import { relationshipTemplates } from "./familyLogic";

/*
  mode = "propose"
     The person selected on the tree already has an account.
     Sentence:  "<selectedPersonName> is my  [relation]"
     Submitting sends a REQUEST; nothing changes until they accept.

  mode = "direct"
     Clicked an empty slot card. Adds someone who has no account,
     so there is a name field and no approval step.
     (The server rejects names that belong to a registered user.)
*/
const AddRelativeModal = ({
  mode = "propose",
  selectedPersonName,
  relativeName,
  setRelativeName,
  selectedRelation,
  setSelectedRelation,
  onAdd,
  onClose,
}) => {
  const isPropose = mode === "propose";

  return (
    <div className="tree-modal-overlay" onClick={onClose}>
      <div
        className="tree-modal"
        onClick={(event) => event.stopPropagation()}
      >
        {/* HEADER */}
        <div className="tree-modal-header">
          <h2>{isPropose ? "Send Relationship Request" : "Add Family Member"}</h2>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* RELATIONSHIP */}
        <div className="tree-form-group">
          <label>
            {isPropose
              ? `${selectedPersonName || "They"} is my…`
              : "Relationship"}
          </label>

          <select
            value={selectedRelation}
            onChange={(event) => setSelectedRelation(event.target.value)}
          >
            {relationshipTemplates.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* NAME (only for people without an account) */}
        {!isPropose && (
          <div className="tree-form-group">
            <label>Name</label>

            <input
              type="text"
              placeholder="Enter family member name"
              value={relativeName}
              onChange={(event) => setRelativeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onAdd();
              }}
            />
          </div>
        )}

        {isPropose && (
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            {selectedPersonName || "They"} will get a request and the tree only
            changes if they accept.
          </p>
        )}

        {/* ACTIONS */}
        <div className="tree-modal-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>

          <button className="add-btn" onClick={onAdd}>
            {isPropose ? "Send Request" : "Add Relative"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddRelativeModal;