import React, { useState, useMemo, useEffect } from "react";

import { ReactFlow } from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { User, UserPlus, Trash2 } from "lucide-react";

import Swal from "sweetalert2";
import { SOCKET_URL } from "../constant";



import familyTree from "../../assets/family-tree.png";

import "../../styles/TreePage.css";



import FamilyNode from "./FamilyNode";

import AddRelativeModal from "./AddRelativeModal";

import ProfileModal from "./ProfileModal";

import { buildGraph, getLabel, layoutTree, normName, GRAND } from "./familyLogic";



const nodeTypes = { familyNode: FamilyNode };

const edgeStyle = { stroke: "#9ca3af", strokeWidth: 1.5 };



const TreePage = ({ socket, currentUser, requestToken, onInviteDone }) => {

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



  // An invitation link keeps its token in the URL through login/signup.
  // Once this page is mounted, verify the logged-in email and ask for an explicit decision.
  useEffect(() => {
    if (!requestToken) return;
    let cancelled = false;
    // forget the token everywhere (address bar AND App state) so the popup never repeats
    const clearTokenFromUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      if (typeof onInviteDone === "function") onInviteDone();
    };
    const runInvitation = async () => {
      try {
        const response = await fetch(`${SOCKET_URL}/api/tree/request/${encodeURIComponent(requestToken)}`, {
          credentials: "include",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load this invitation");
        if (cancelled) return;
        const request = data.request;
        const decision = await Swal.fire({
          title: "Family invitation",
          html: `<p><b>${String(request.fromName || "A member").replace(/[&<>"']/g, "")}</b> says you are <b>${String(request.subjectName || "their family member").replace(/[&<>"']/g, "")}'s ${String(request.relation || "relative").replace(/[&<>"']/g, "")}</b>.</p><p>Would you like to add this connection to your family tree?</p>`,
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: "Accept",
          denyButtonText: "Reject",
          cancelButtonText: "Decide later",
          confirmButtonColor: "#15803d",
          denyButtonColor: "#b91c1c",
        });
        if (cancelled || decision.isDismissed) return;
        const action = decision.isConfirmed ? "accept" : "reject";
        const result = await fetch(`${SOCKET_URL}/api/tree/request/${encodeURIComponent(requestToken)}/${action}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const resultData = await result.json().catch(() => ({}));
        if (!result.ok) throw new Error(resultData.error || "Could not respond to invitation");
        await Swal.fire({
          icon: action === "accept" ? "success" : "info",
          title: action === "accept" ? "Relationship added" : "Invitation rejected",
          text: action === "accept" ? "Your family tree has been updated." : "No relationship was added.",
          confirmButtonColor: "#111",
        });
        // answered: only now forget the token (clearing earlier would cancel this effect)
        clearTokenFromUrl();
      } catch (error) {
        if (!cancelled) {
          await Swal.fire({ icon: "error", title: "Invitation unavailable", text: error.message, confirmButtonColor: "#111" });
          clearTokenFromUrl();
        }
      }
    };
    runInvitation();
    return () => { cancelled = true; };
  }, [requestToken]);

  const [showAddRelative, setShowAddRelative] = useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [relativeName, setRelativeName] = useState("");

  const [relativeEmail, setRelativeEmail] = useState("");

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



  /* grandparents: which parent are they the parent of? */

  const [viaParentId, setViaParentId] = useState("");

  const modalSubjectId = modalMode === "propose" ? viewerId : activeId;

  const parentOptions = useMemo(

    () =>

      modalSubjectId

        ? [...graph.parents(modalSubjectId)]

            .filter((id) => graph.byId[id])

            .map((id) => ({ id, name: graph.byId[id].name }))

        : [],

    [graph, modalSubjectId]

  );



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

      id: `slot-${slot.slotOf}-${slot.slotRelation}`,

      type: "familyNode",

      position: slot.position,

      data: {

        name: "",

        relation: slot.relation,

        isMe: false,

        isEmpty: true,

        slotOf: slot.slotOf || viewerId,

        slotRelation: slot.slotRelation || slot.relation,

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



  const handleNodeClick = (event, node) => {

    if (node.data.isEmpty) {

      setSelectedPersonId(node.data.slotOf);

      setSelectedRelation(node.data.slotRelation || node.data.relation);

      setModalMode("direct");

      setModalStep("details");

      setShowAddRelative(true);

      return;

    }

    setSelectedPersonId(node.id);

  };



  /* add a relative to whoever is selected (e.g. select Dad -> add his Father) */

  const openAddToSelected = () => {

    if (!activeId) return;

    setModalMode("direct");

    setModalStep("details");

    setShowAddRelative(true);

  };



  const openAddRelative = () => {

    if (!viewerId) return;

    if (!activeId || activeId === viewerId) {

      showMessage(
        "Select a Person",
        "Please select another family member on the tree first.",
        "warning"
      );

      return;

    }

    setModalMode("propose");

    setModalStep("relation");

    setShowAddRelative(true);

  };



  const closeAddModal = () => {

    setRelativeName("");

    setRelativeEmail("");

    setViaParentId("");

    setSelectedRelation("Father");

    setShowAddRelative(false);

  };



  const showMessage = (title, text, icon = "info") => {

  return Swal.fire({

    title,

    text,

    icon,

    confirmButtonColor: "#222",

    confirmButtonText: "OK",

  });

};

  /* "your" / "Robert's" for the confirmation messages */

  const whose = (id) =>

    id === viewerId ? "your" : `${graph.byId[id]?.name || "their"}'s`;



  /* Grandfather/Grandmother -> Father/Mother of one of the subject's parents.

     Everything else is sent unchanged. */

  const resolveRelation = (subjectId) => {

    const up = GRAND[selectedRelation];

    if (!up) return { relation: selectedRelation, subjectId };



    if (!parentOptions.length) {

      return {

        error:

          subjectId === viewerId

            ? "You have no parents on the tree yet. Add a father or mother first, then add the grandparent."

            : `${graph.byId[subjectId]?.name || "They"} has no parents on the tree yet. To add their father or mother, choose Father or Mother. To add YOUR grandparent, click your own card first.`,

      };

    }

    const via = parentOptions.some((p) => p.id === viaParentId)

      ? viaParentId

      : parentOptions[0].id;

    return { relation: up, subjectId: via };

  };



 
const handleModalSubmit = () => {
  if (!socket || !activeId) {
    showMessage(
      "Connection Error",
      "You are not connected to the server. Please try again.",
      "error"
    );
    return;
  }

  const isDirect = modalMode === "direct";
  const owner = isDirect ? activeId : viewerId;

  const target = resolveRelation(owner);

  if (target.error) {
    showMessage(
      "Invalid Relationship",
      target.error,
      "warning"
    );
    return;
  }

  // CASE 1: Adding a new person through an empty family-tree slot.
  if (isDirect) {
    const name = relativeName.trim();
    const email = relativeEmail.trim().toLowerCase();

    if (!name) {
      showMessage(
        "Name Required",
        "Please enter the family member's name.",
        "warning"
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Email is mandatory for both registered and anonymous recipients.
    // Without an email, we cannot send an invitation.
    if (!email) {
      showMessage(
        "Email Required",
        "Please enter the recipient's email address. Even if they don't have a CmyRoots account, they can receive an invitation by email.",
        "warning"
      );
      return;
    }

    if (!emailRegex.test(email)) {
      showMessage(
        "Invalid Email",
        "Please enter a valid email address.",
        "warning"
      );
      return;
    }

    const me = snapshot.persons.find(
      (person) => person.id === viewerId
    );

    if (
      me?.email &&
      me.email.toLowerCase() === email
    ) {
      showMessage(
        "Invalid Email",
        "You cannot send an invitation to your own email address.",
        "warning"
      );
      return;
    }

    const registered = snapshot.persons.find(
      (person) =>
        person.id.startsWith("user:") &&
        (
          person.email?.toLowerCase() === email ||
          normName(person.name) === normName(name)
        )
    );

    if (
      registered &&
      (
        registered.id === viewerId ||
        registered.id === target.subjectId
      )
    ) {
      showMessage(
        "Invalid Request",
        "You cannot create a relationship with yourself.",
        "warning"
      );
      return;
    }

    // Both registered and unregistered recipients use the same
    // invitation workflow. The backend resolves the account by email.
    socket.emit(
      "tree:sendRequest",
      {
        subjectId: target.subjectId,
        toEmail: email,
        toName: name,
        relation: target.relation,
      },
      (res) => {
        if (!res?.ok) {
          showMessage(
            "Invitation Failed",
            res?.error || "Could not send the invitation.",
            "error"
          );
          return;
        }

        showMessage(
          "Invitation Sent",
          `An invitation has been sent to ${email}. The relationship will appear only after the recipient signs in and accepts.`,
          "success"
        );

        closeAddModal();
      }
    );

    return;
  }

  // CASE 2: Proposing a relationship to an existing family-tree user.
  if (activeId === viewerId) {
    showMessage(
      "Invalid Request",
      "You cannot send a relationship request to yourself.",
      "warning"
    );
    return;
  }

  socket.emit(
    "tree:sendRequest",
    {
      subjectId: target.subjectId,
      toId: activeId,
      relation: target.relation,
    },
    (res) => {
      if (!res?.ok) {
        showMessage(
          "Request Failed",
          res?.error || "Could not send the request.",
          "error"
        );
        return;
      }

      showMessage(
        "Request Sent",
        `Your relationship request has been sent to ${graph.byId[activeId]?.name || "the selected person"}. The tree will update after they accept.`,
        "success"
      );

      closeAddModal();
    }
  );
};




  const handleRemove = async () => {
    if (!socket || !activeId || activeId === viewerId) return;

    const result = await Swal.fire({
      title: "Remove Family Member?",
      text: `Are you sure you want to remove ${graph.byId[activeId].name} from your tree?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#777",
      confirmButtonText: "Yes, remove",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    socket.emit("tree:removeRelation", { personId: activeId }, (res) => {
      if (!res?.ok) {
        showMessage("Removal Failed", res?.error || "Could not remove this family member.", "error");
      } else {
        setSelectedPersonId(null);
        showMessage("Removed", "Family member removed successfully.", "success");
      }
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

            onClick={openAddToSelected}

            disabled={!viewerId || !activeId}

            title="Add a father, mother, spouse, child... to the selected person"

          >

            <UserPlus size={18} />

            <span>Add Relative</span>

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

            panOnDrag={false}

            selectionOnDrag={false}

            panOnScroll={false}

            nodeDragThreshold={9999}

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

          selectedPersonName={

            modalMode === "direct" && activeId === viewerId

              ? undefined

              : activeNode?.data?.name

          }

          relativeName={relativeName}

          setRelativeName={setRelativeName}

          relativeEmail={relativeEmail}

          setRelativeEmail={setRelativeEmail}

          parentOptions={parentOptions}

          viaParentId={viaParentId}

          setViaParentId={setViaParentId}

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