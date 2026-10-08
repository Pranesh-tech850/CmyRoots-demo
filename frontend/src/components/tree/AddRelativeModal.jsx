import React, { useState } from "react";

/* =========================================================
   RELATIONSHIP TEMPLATES

   `value` matches the strings already used by TreePage
   (RELATION_CONFIG, getPositionForRelation, getConnection),
   so no logic there needs to change.
========================================================= */

export const relationshipTemplates = [
  { value: "Father", label: "Father", hint: "Parent" },
  { value: "Mother", label: "Mother", hint: "Parent" },
  { value: "Brother", label: "Brother", hint: "Sibling" },
  { value: "Sister", label: "Sister", hint: "Sibling" },
  { value: "Spouse", label: "Spouse", hint: "Partner" },
  { value: "Son", label: "Son", hint: "Child" },
  { value: "Daughter", label: "Daughter", hint: "Child" },
];

const cardGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
  gap: "10px",
};

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2px",
  padding: "14px 8px",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  background: "#fff",
  cursor: "pointer",
};

const AddRelativeModal = ({
  initialStep = "relation",
  selectedPersonName,
  relativeName,
  setRelativeName,
  selectedRelation,
  setSelectedRelation,
  onAdd,
  onClose,
}) => {
  /* "relation" = pick a template, "details" = enter name */
  const [step, setStep] = useState(initialStep);

  const handleSelectTemplate = (value) => {
    setSelectedRelation(value);
    setStep("details");
  };

  return (
    <div
      className="tree-modal-overlay"
      onClick={onClose}
    >
      <div
        className="tree-modal"
        onClick={(event) => event.stopPropagation()}
      >
        {/* HEADER */}
        <div className="tree-modal-header">
          <h2>Add Relation</h2>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* WHO THE RELATION IS FOR */}
        {selectedPersonName && (
          <p style={{ margin: "0 0 14px", color: "#6b7280" }}>
            {step === "relation"
              ? `Select a relationship for ${selectedPersonName}`
              : `${selectedRelation} of ${selectedPersonName}`}
          </p>
        )}

        {/* STEP 1: RELATIONSHIP TEMPLATES */}
        {step === "relation" && (
          <>
            <div style={cardGridStyle}>
              {relationshipTemplates.map((template) => (
                <button
                  key={template.value}
                  type="button"
                  style={cardStyle}
                  onClick={() =>
                    handleSelectTemplate(template.value)
                  }
                >
                  <strong>{template.label}</strong>
                  <small style={{ color: "#6b7280" }}>
                    {template.hint}
                  </small>
                </button>
              ))}
            </div>

            <div className="tree-modal-actions">
              <button
                className="cancel-btn"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* STEP 2: DETAILS */}
        {step === "details" && (
          <>
            <div className="tree-form-group">
              <label>{selectedRelation}'s Name</label>

              <input
                type="text"
                autoFocus
                placeholder="Enter family member name"
                value={relativeName}
                onChange={(event) =>
                  setRelativeName(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onAdd();
                  }
                }}
              />
            </div>

            <div className="tree-modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setStep("relation")}
              >
                Back
              </button>

              <button
                className="add-btn"
                onClick={onAdd}
              >
                Add {selectedRelation}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddRelativeModal;