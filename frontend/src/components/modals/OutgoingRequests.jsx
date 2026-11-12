import React from "react";
import { Bell } from "lucide-react";

const OutgoingRequests = ({ outgoingRequests, treeSnapshot, cancelOutgoing }) => (
<div className="outgoing-requests">
  <Bell size={16} />
  <span>
    {outgoingRequests.length} pending request
    {outgoingRequests.length > 1 ? "s" : ""}:
  </span>
  {outgoingRequests.map((r) => {
    const target =
      treeSnapshot?.persons?.find((p) => p.id === r.toId)?.name ||
      r.toName ||
      r.toEmail ||
      "?";
    return (
      <span key={r.id} className="outgoing-chip">
        {target} as{" "}
        {r.subjectId && r.subjectId !== r.fromId
          ? `${
              treeSnapshot?.persons?.find((p) => p.id === r.subjectId)
                ?.name || "their"
            }'s `
          : ""}
        {r.relation}
        <button
          className="chip-cancel"
          onClick={() => cancelOutgoing(r.id)}
          title="Cancel"
        >
          ×
        </button>
      </span>
    );
  })}
</div>
);

export default OutgoingRequests;
