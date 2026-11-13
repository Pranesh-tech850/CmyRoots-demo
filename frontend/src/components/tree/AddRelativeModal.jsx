
import React from "react";
import { relationshipTemplates, GRAND } from "./familyLogic";

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
        <div className="tree-modal-header">
          <h2>
            {isPropose
              ? "Send Relationship Request"
              : "Invite Family Member"}
          </h2>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

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
            onChange={(event) =>
              setSelectedRelation(event.target.value)
            }
          >
            {relationshipTemplates.map((relation) => (
              <option
                key={relation.value}
                value={relation.value}
              >
                {relation.label}
              </option>
            ))}
          </select>
        </div>

        {GRAND[selectedRelation] && (
          <div className="tree-form-group">
            {parentOptions.length === 0 ? (
              <p style={{ fontSize: 13, color: "#b91c1c" }}>
                You need to add a parent before adding a grandparent.
              </p>
            ) : parentOptions.length === 1 ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>
                This will be the {GRAND[selectedRelation]} of{" "}
                <strong>{parentOptions[0].name}</strong>.
              </p>
            ) : (
              <>
                <label>Through which parent?</label>

                <select
                  value={
                    parentOptions.some(
                      (person) => person.id === viaParentId
                    )
                      ? viaParentId
                      : parentOptions[0].id
                  }
                  onChange={(event) =>
                    setViaParentId(event.target.value)
                  }
                >
                  {parentOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {!isPropose && (
          <>
            <div className="tree-form-group">
              <label>Family member's full name</label>

              <input
                type="text"
                placeholder="Enter their name"
                value={relativeName}
                onChange={(event) =>
                  setRelativeName(event.target.value)
                }
              />
            </div>

            <div className="tree-form-group">
              <label>Email address (required for invitations)</label>

              <input
                type="email"
                placeholder="name@example.com"
                value={relativeEmail}
                onChange={(event) =>
                  setRelativeEmail(event.target.value)
                }
                required
              />

              <p style={{ fontSize: 12, color: "#6b7280" }}>
                They do not need an account yet. We will email them
                an invitation. The relationship will only be added
                after they sign up and accept it.
              </p>
            </div>
          </>
        )}

        {isPropose && (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            The selected person will receive a relationship request.
            Your tree will change only after they accept.
          </p>
        )}

        <div className="tree-modal-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>

          <button className="add-btn" onClick={onAdd}>
            {isPropose ? "Send Request" : "Send Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddRelativeModal;
