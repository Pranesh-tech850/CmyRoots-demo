import React, { useState, useMemo, useEffect } from "react";
import { ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { User, UserPlus, Trash2 } from "lucide-react";

import familyTree from "../../assets/family-tree.png";
import "../../styles/TreePage.css";

import FamilyNode from "./FamilyNode";
import AddRelativeModal from "./AddRelativeModal";
import ProfileModal from "./ProfileModal";
import { buildGraph, getLabel, layoutTree, normName } from "./familyLogic";

const nodeTypes = { familyNode: FamilyNode };
const edgeStyle = { stroke: "#9ca3af", strokeWidth: 1.5 };

const TreePage = ({ socket, currentUser }) => {
  const [snapshot, setSnapshot] = useState({
    version: 0,
    persons: [],
    relationships: [],
    requests: [],
  });

  useEffect(() => {
    if (!socket) return;

    const fetchState = () =>
      socket.emit("tree:get", (state) => state && setSnapshot(state));

    socket.on("tree:state", setSnapshot);
    socket.on("connect", fetchState);
    fetchState();

    return () => {
      socket.off("tree:state", setSnapshot);
      socket.off("connect", fetchState);
    };
  }, [socket]);

  const [showAddRelative, setShowAddRelative] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [relativeName, setRelativeName] = useState("");
  const [selectedRelation, setSelectedRelation] = useState("Father");
  const [modalStep, setModalStep] = useState("relation");
  const [modalMode, setModalMode] = useState("propose");
  const [selectedPersonId, setSelectedPersonId] = useState(null);

  const graph = useMemo(() => buildGraph(snapshot), [snapshot]);

  const viewerId = useMemo(
    () =>
      snapshot.persons.find((p) => normName(p.name) === normName(currentUser))?.id,
    [snapshot, currentUser]
  );

  const activeId = graph.byId[selectedPersonId] ? selectedPersonId : viewerId;

  const { nodes, edges } = useMemo(() => {
    if (!viewerId) return { nodes: [], edges: [] };

    const { positions, placeholders } = layoutTree(graph, viewerId);

    const personNodes = Object.keys(positions).map((id) => ({
      id,
      type: "familyNode",
      position: positions[id],
      data: {
        name: graph.byId[id].name,
        relation: getLabel(graph, viewerId, id),
        isMe: id === viewerId,
        isSelected: id === activeId,
      },
    }));

    const slotNodes = placeholders.map((slot) => ({
      id: `slot-${slot.relation.toLowerCase()}`,
      type: "familyNode",
      position: slot.position,
      data: {
        name: "",
        relation: slot.relation,
        isMe: false,
        isEmpty: true,
        slotOf: viewerId,
      },
    }));

    const treeEdges = snapshot.relationships
      .filter((r) => positions[r.a] && positions[r.b])
      .flatMap((r) => {
        if (r.type === "parent") {
          return [{
            id: r.id,
            source: r.a, sourceHandle: "bottom",
            target: r.b, targetHandle: "top",
            type: "smoothstep", style: edgeStyle,
          }];
        }

        if (
          r.type === "sibling" &&
          [...graph.parents(r.a)].some((p) => graph.parents(r.b).has(p))
        ) return [];

        const [l, rt] =
          positions[r.a].x <= positions[r.b].x ? [r.a, r.b] : [r.b, r.a];

        return [{
          id: r.id,
          source: l, sourceHandle: "right",
          target: rt, targetHandle: "left",
          type: "smoothstep",
          style: r.type === "sibling"
            ? { ...edgeStyle, strokeDasharray: "5 4" }
            : edgeStyle,
        }];
      });

    return { nodes: [...personNodes, ...slotNodes], edges: treeEdges };
  }, [graph, snapshot.relationships, viewerId, activeId]);

  const activeNode = nodes.find((n) => n.id === activeId);

  const handleNodeClick = (_event, node) => {
    if (node.data.isEmpty) {
      setSelectedPersonId(node.data.slotOf);
      setSelectedRelation(node.data.relation);
      setModalMode("direct");
      setModalStep("details");
      setShowAddRelative(true);
      return;
    }
    setSelectedPersonId(node.id);
  };

  const openAddRelative = () => {
    if (!viewerId) return;
    if (!activeId || activeId === viewerId) {
      alert("Select another person on the tree first.");
      return;
    }
    setModalMode("propose");
    setModalStep("relation");
    setShowAddRelative(true);
  };

  const closeAddModal = () => {
    setRelativeName("");
    setSelectedRelation("Father");
    setShowAddRelative(false);
  };

  const handleModalSubmit = () => {
    if (!socket || !activeId) {
      alert("Not connected to the server yet");
      return;
    }

    /* ---- slot card: name typed in the box ---- */
    if (modalMode === "direct") {
      if (!relativeName.trim()) return alert("Please enter family member name");

      /* the name belongs to a registered user -> needs THEIR approval,
         so send a request: "<that user> is my <relation>" */
      const registered = snapshot.persons.find(
        (p) => p.id.startsWith("user:") && normName(p.name) === normName(relativeName)
      );
      if (registered) {
        if (registered.id === viewerId) {
          return alert("You can't send a request to yourself.");
        }
        socket.emit(
          "tree:sendRequest",
          { toId: registered.id, relation: selectedRelation },
          (res) => {
            if (!res?.ok) return alert(res?.error || "Could not send request");
            alert(
              `Request sent: you asked ${registered.name} to be your ${selectedRelation}. Waiting for them to accept.`
            );
            closeAddModal();
          }
        );
        return;
      }

      /* no account -> add directly, no approval needed */
      socket.emit(
        "tree:addRelative",
        { personId: activeId, relation: selectedRelation, name: relativeName.trim() },
        (res) => {
          if (!res?.ok) return alert(res?.error || "Could not add relative");
          closeAddModal();
        }
      );
      return;
    }

    /* ---- propose: "<selected person> is my <relation>" ---- */
    if (activeId === viewerId) {
      alert("You can't send a request to yourself.");
      return;
    }

    /* the server fills in fromId from the socket identity */
    socket.emit(
      "tree:sendRequest",
      { toId: activeId, relation: selectedRelation },
      (res) => {
        if (!res?.ok) return alert(res?.error || "Could not send request");
        alert(
          `Request sent: you asked ${
            graph.byId[activeId]?.name || "them"
          } to be your ${selectedRelation}. Waiting for them to accept.`
        );
        closeAddModal();
      }
    );
  };

  const handleRemove = () => {
    if (!socket || !activeId || activeId === viewerId) return;
    if (!window.confirm(`Remove ${graph.byId[activeId].name} from your tree?`)) return;
    socket.emit("tree:removeRelation", { personId: activeId }, (res) => {
      if (!res?.ok) alert(res?.error || "Could not remove");
      else setSelectedPersonId(null);
    });
  };

  return (
    <main className="tree-page">
      <div className="tree-header">
        <div>
          <h1>Family Tree</h1>
          <p>
            {socket && viewerId
              ? "Explore and manage your family relationships"
              : "Connecting to the server…"}
          </p>
        </div>

        <div className="tree-actions">
          <button
            className="tree-action-btn"
            onClick={openAddRelative}
            disabled={!viewerId || !activeId || activeId === viewerId}
          >
            <UserPlus size={18} />
            <span>Add Relation</span>
          </button>

          <button
            className="tree-action-btn"
            onClick={() => setShowProfile(true)}
            disabled={!viewerId}
          >
            <User size={18} />
            <span>View Profile</span>
          </button>

          {activeId && activeId !== viewerId && (
            <button className="tree-action-btn" onClick={handleRemove}>
              <Trash2 size={18} />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>

      <section className="family-tree-area">
        <img
          src={familyTree}
          alt="Family Tree"
          className="family-tree-background"
        />
        <div className="family-tree-flow">
          <ReactFlow
            key={`${viewerId}-${snapshot.version}`}
            nodes={nodes}
            edges={edges}
            onNodesChange={() => {}}
            onEdgesChange={() => {}}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.3}
            maxZoom={1}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </section>

      {showAddRelative && (
        <AddRelativeModal
          initialStep={modalStep}
          mode={modalMode}
          selectedPersonName={activeNode?.data?.name}
          relativeName={relativeName}
          setRelativeName={setRelativeName}
          selectedRelation={selectedRelation}
          setSelectedRelation={setSelectedRelation}
          onAdd={handleModalSubmit}
          onClose={closeAddModal}
        />
      )}

      {showProfile && (
        <ProfileModal
          memberCount={nodes.filter((n) => !n.data.isEmpty).length}
          selectedPerson={activeNode?.data || (currentUser ? { name: currentUser, relation: "Me", isMe: true } : undefined)}
          onClose={() => setShowProfile(false)}
        />
      )}
    </main>
  );
};

export default TreePage;