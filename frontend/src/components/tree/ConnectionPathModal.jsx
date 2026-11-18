import React from "react";
import { User } from "lucide-react";

/* Shows HOW the selected person is related to the viewer, step by step. */
const ConnectionPathModal = ({ steps, personName, relation, onClose }) => {
  return (
    <div className="tree-modal-overlay" onClick={onClose}>
      <div
        className="tree-modal connection-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tree-modal-header">
          <h2>Connection path</h2>
          <button className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <p className="tree-modal-description">
          {steps.length > 1
            ? `${personName} is your ${relation.toLowerCase()}. Here is how you are connected:`
            : "No connection was found between you and this person."}
        </p>

        {steps.length > 1 && (
          <ol className="connection-path">
            {steps.map((step, i) => {
              const isFirst = i === 0;
              const isLast = i === steps.length - 1;
              const from = steps[i - 1];

              return (
                <li key={step.id} className="connection-step">
                  {!isFirst && (
                    <div className="connection-link">
                      <span className="connection-link-line" />
                      <span className="connection-link-text">
                        {i === 1 ? (
                          <>{step.name} is your <b>{step.label}</b></>
                        ) : (
                          <>{step.name} is {from.name}&apos;s <b>{step.label}</b></>
                        )}
                      </span>
                    </div>
                  )}

                  <div
                    className={`connection-person ${isFirst ? "is-start" : ""} ${
                      isLast ? "is-end" : ""
                    }`}
                  >
                    <div className="connection-avatar">
                      <User size={18} />
                    </div>
                    <div>
                      <div className="connection-name">{step.name}</div>
                      <div className="connection-role">
                        {isFirst ? "You" : step.relToYou}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="tree-modal-actions">
          <button className="tree-modal-add" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionPathModal;