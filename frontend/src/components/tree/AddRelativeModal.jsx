import React from "react";
import { relationshipTemplates, GRAND } from "./familyLogic";

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
  relativeEmail = "",
  setRelativeEmail = () => {},
  parentOptions = [],
  viaParentId = "",
  setViaParentId = () => {},
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
              : selectedPersonName
              ? `The new person is ${selectedPersonName}'s…`
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

        {/* GRANDPARENT: which parent are they the parent of? */}
        {GRAND[selectedRelation] && (
          <div className="tree-form-group">
            {parentOptions.length === 0 ? (
              <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>
                {!isPropose && selectedPersonName ? (
                  <>
                    {selectedPersonName} has no parents on the tree yet, so
                    there is no grandparent to add for {selectedPersonName}. To
                    add {selectedPersonName}&apos;s own father or mother, choose
                    Father or Mother. To add <strong>your</strong> grandparent,
                    click your own card first, then Add Relative.
                  </>
                ) : (
                  <>
                    You have no parents on the tree yet. Add a father or mother
                    first, then add the grandparent.
                  </>
                )}
              </p>
            ) : parentOptions.length === 1 ? (
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Added as the {GRAND[selectedRelation]} of{" "}
                <strong>{parentOptions[0].name}</strong>.
              </p>
            ) : (
              <>
                <label>Through which parent?</label>
                <select
                  value={
                    parentOptions.some((p) => p.id === viaParentId)
                      ? viaParentId
                      : parentOptions[0].id
                  }
                  onChange={(event) => setViaParentId(event.target.value)}
                >
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}&apos;s {GRAND[selectedRelation]}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {/* EMAIL (registered family member -> they get a request) */}
        {!isPropose && (
          <div className="tree-form-group">
            <label>Email (they get an email and must accept)</label>

            <input
              type="email"
              placeholder="name@example.com"
              value={relativeEmail}
              onChange={(event) => setRelativeEmail(event.target.value)}
            />
          </div>
        )}

        {/* NAME (only for people without an account) */}
        {!isPropose && (
          <div className="tree-form-group">
            <label>
              {relativeEmail.trim()
                ? "Name (needed only if they have no account yet)"
                : "Name"}
            </label>

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
