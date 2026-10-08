import React from "react";
import { Handle, Position } from "@xyflow/react";
import { User, Plus } from "lucide-react";

const FamilyNode = ({ data }) => {
  const isEmpty = data.isEmpty;

  return (
    <div
      className={`family-node ${
        data.isMe ? "family-node-me" : ""
      } ${data.isSelected ? "family-node-selected" : ""} ${
        isEmpty ? "family-node-empty" : ""
      }`}
      style={{
        ...(data.isSelected
          ? { outline: "2px solid #2563eb", outlineOffset: "3px" }
          : {}),
        ...(isEmpty ? { opacity: 0.6, cursor: "pointer" } : {}),
      }}
    >
      {/* TOP */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="family-handle"
      />

      {/* BOTTOM */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="family-handle"
      />

      {/* LEFT */}
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="family-handle"
      />

      {/* RIGHT */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="family-handle"
      />

      {/* AVATAR */}
      <div
        className="family-node-avatar"
        style={
          isEmpty
            ? { border: "2px dashed #9ca3af", background: "transparent" }
            : undefined
        }
      >
        {isEmpty ? <Plus size={24} /> : <User size={24} />}
      </div>

      {/* NAME */}
      <div className="family-node-name">
        {isEmpty ? "Add person" : data.name}
      </div>

      {/* RELATION */}
      <div className="family-node-relation">
        {data.relation}
      </div>
    </div>
  );
};

export default FamilyNode;