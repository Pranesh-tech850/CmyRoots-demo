import React from "react";

const RequestPopup = ({ incomingRequest, respondToRequest }) => (
<div className="request-overlay">
  <div className="request-card">
    <h3>Relationship Request</h3>
    <p>
      <strong>{incomingRequest.fromName || "Someone"}</strong>
      {incomingRequest.fromEmail && (
        <> ({incomingRequest.fromEmail})</>
      )}{" "}
      says you are{" "}
      {incomingRequest.subjectName
        ? `${incomingRequest.subjectName}'s`
        : "their"}{" "}
      <strong>{incomingRequest.relation}</strong>.
    </p>
    <p style={{ fontSize: 13, opacity: 0.75 }}>
      Is this person your connection? Only accept if you know them.
    </p>
    <div className="request-actions">
      <button
        className="tree-action-btn accept"
        onClick={() => respondToRequest(true)}
      >
        Accept
      </button>
      <button
        className="tree-action-btn reject"
        onClick={() => respondToRequest(false)}
      >
        Reject
      </button>
    </div>
  </div>
</div>
);

export default RequestPopup;
