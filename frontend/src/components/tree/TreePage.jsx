import React, { useState, useMemo } from "react";

import {
  ReactFlow,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import {
  User,
  UserPlus,
} from "lucide-react";

import familyTree from "../../assets/family-tree.png";

import "../../styles/TreePage.css";

import FamilyNode from "./FamilyNode";
import AddRelativeModal from "./AddRelativeModal";
import ProfileModal from "./ProfileModal";

/* =========================================================
   NODE TYPE
========================================================= */

const nodeTypes = {
  familyNode: FamilyNode,
};

/* =========================================================
   RELATION SLOTS (predefined templates)

   Offsets are relative to the person the slot belongs to.
   `dir` is the side extra people of the same relation
   are pushed to when the slot is already filled.

            Father      Mother

   Brother  -----  Me  -----  Spouse
   Sister

            Son         Daughter
========================================================= */

const SLOT_OFFSETS = {
  Father: { x: -100, y: -190, dir: -1 },
  Mother: { x: 100, y: -190, dir: 1 },
  Brother: { x: -240, y: -70, dir: -1 },
  Sister: { x: -240, y: 90, dir: -1 },
  Spouse: { x: 240, y: 0, dir: 1 },
  Son: { x: -100, y: 190, dir: -1 },
  Daughter: { x: 100, y: 190, dir: 1 },
};

const buildEmptySlots = (ownerId, ownerPosition) =>
  Object.entries(SLOT_OFFSETS).map(([relation, offset]) => ({
    id: `${ownerId}-slot-${relation.toLowerCase()}`,
    type: "familyNode",
    position: {
      x: ownerPosition.x + offset.x,
      y: ownerPosition.y + offset.y,
    },
    data: {
      name: "",
      relation,
      isMe: false,
      isEmpty: true,
      slotOf: ownerId,
    },
  }));

/* =========================================================
   INITIAL NODE
========================================================= */

const initialNodes = [
  {
    id: "tom",

    type: "familyNode",

    position: {
      x: 500,
      y: 300,
    },

    data: {
      name: "Tom Smith",
      relation: "Me",
      isMe: true,
    },
  },

  /* Empty template cards around Me */
  ...buildEmptySlots("tom", { x: 500, y: 300 }),
];

/* =========================================================
   INITIAL EDGES
========================================================= */

const initialEdges = [];

/* =========================================================
   RELATION CONFIGURATION

   Father    -> TOP
   Mother    -> TOP

   Brother   -> RIGHT
   Sister    -> LEFT
   Spouse    -> LEFT

   Son       -> BOTTOM
   Daughter  -> BOTTOM
========================================================= */

const RELATION_CONFIG = {
  Father: {
    direction: "top",
  },

  Mother: {
    direction: "top",
  },

  Brother: {
    direction: "right",
  },

  Sister: {
    direction: "left",
  },

  Spouse: {
    direction: "left",
  },

  Son: {
    direction: "bottom",
  },

  Daughter: {
    direction: "bottom",
  },
};

/* =========================================================
   TREE PAGE
========================================================= */

const TreePage = () => {

  /* =======================================================
     MODAL STATES
  ======================================================= */

  const [showAddRelative, setShowAddRelative] =
    useState(false);

  const [showProfile, setShowProfile] =
    useState(false);


  /* =======================================================
     FORM STATES
  ======================================================= */

  const [relativeName, setRelativeName] =
    useState("");

  const [selectedRelation, setSelectedRelation] =
    useState("Father");


  const [modalStep, setModalStep] =
    useState("relation");


  /* =======================================================
     SELECTED PERSON
  ======================================================= */

  const [selectedPersonId, setSelectedPersonId] =
    useState("tom");


  /* =======================================================
     REACT FLOW STATES
  ======================================================= */

  const [nodes, setNodes, onNodesChange] =
    useNodesState(initialNodes);

  const [edges, setEdges, onEdgesChange] =
    useEdgesState(initialEdges);


  /* =======================================================
     FIND SELECTED PERSON
  ======================================================= */

  const getSelectedPerson = () => {

    return nodes.find(
      (node) =>
        node.id === selectedPersonId
    );

  };


  /* =======================================================
     NODES WITH SELECTION FLAG (for highlighting)
  ======================================================= */

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedPersonId,
        },
      })),
    [nodes, selectedPersonId]
  );


  /* =======================================================
     NODE CLICK
  ======================================================= */

  const handleNodeClick = (event, node) => {

    /* Empty template card -> add that relation for its owner */

    if (node.data.isEmpty) {
      setSelectedPersonId(node.data.slotOf);
      setSelectedRelation(node.data.relation);
      setModalStep("details");
      setShowAddRelative(true);
      return;
    }

    setSelectedPersonId(node.id);

    console.log(
      "Selected person:",
      node.data.name
    );

  };


  /* =======================================================
     GET RELATIVES OF SELECTED PERSON
  ======================================================= */

  const getRelatives = (relation) => {

    return nodes.filter((node) => {

      /* Don't count selected person */

      if (node.id === selectedPersonId) {
        return false;
      }


      /* Check relation */

      if (
        node.data.relation !== relation
      ) {
        return false;
      }


      /* Check whether connected */

      return edges.some((edge) => {

        return (

          (
            edge.source === node.id &&
            edge.target === selectedPersonId
          )

          ||

          (
            edge.target === node.id &&
            edge.source === selectedPersonId
          )

        );

      });

    });

  };


  /* =======================================================
     GET RELATION COUNT
  ======================================================= */

  const getRelationCount = (relation) => {

    return getRelatives(relation).length;

  };


  /* =======================================================
     GET POSITION FOR RELATION
  ======================================================= */

  const getPositionForRelation = (
    relation,
    selectedNode
  ) => {

    const slot = SLOT_OFFSETS[relation];

    /* Unknown relation -> simple fallback */

    if (!slot) {
      return {
        x: selectedNode.position.x + 220,
        y: selectedNode.position.y,
      };
    }

    /* Slot already filled -> push further out on its side */

    const count = getRelationCount(relation);

    return {
      x:
        selectedNode.position.x +
        slot.x +
        slot.dir * 200 * count,

      y:
        selectedNode.position.y + slot.y,
    };

  };


  /* =======================================================
     GET CONNECTION
  ======================================================= */

  const getConnection = (
    relation,
    selectedNode,
    newNodeId
  ) => {


    /* =====================================================
       FATHER
       
       Father
          |
         Tom
    ===================================================== */

    if (relation === "Father") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          newNodeId,

        sourceHandle:
          "bottom",

        target:
          selectedNode.id,

        targetHandle:
          "top",

      };

    }


    /* =====================================================
       MOTHER
    ===================================================== */

    if (relation === "Mother") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          newNodeId,

        sourceHandle:
          "bottom",

        target:
          selectedNode.id,

        targetHandle:
          "top",

      };

    }


    /* =====================================================
       BROTHER
       
       Tom -------- Brother
    ===================================================== */

    if (relation === "Brother") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          newNodeId,

        sourceHandle:
          "right",

        target:
          selectedNode.id,

        targetHandle:
          "left",

      };

    }


    /* =====================================================
       SISTER
       
       Sister -------- Tom
    ===================================================== */

    if (relation === "Sister") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          newNodeId,

        sourceHandle:
          "right",

        target:
          selectedNode.id,

        targetHandle:
          "left",

      };

    }


    /* =====================================================
       SPOUSE
       
       Spouse -------- Tom
    ===================================================== */

    if (relation === "Spouse") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          selectedNode.id,

        sourceHandle:
          "right",

        target:
          newNodeId,

        targetHandle:
          "left",

      };

    }


    /* =====================================================
       SON
       
       Tom
        |
       Son
    ===================================================== */

    if (relation === "Son") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          selectedNode.id,

        sourceHandle:
          "bottom",

        target:
          newNodeId,

        targetHandle:
          "top",

      };

    }


    /* =====================================================
       DAUGHTER
       
       Tom
        |
       Daughter
    ===================================================== */

    if (relation === "Daughter") {

      return {

        id:
          `edge-${selectedNode.id}-${newNodeId}`,

        source:
          selectedNode.id,

        sourceHandle:
          "bottom",

        target:
          newNodeId,

        targetHandle:
          "top",

      };

    }


    /* =====================================================
       DEFAULT
    ===================================================== */

    return {

      id:
        `edge-${selectedNode.id}-${newNodeId}`,

      source:
        selectedNode.id,

      target:
        newNodeId,

      type:
        "smoothstep",

    };

  };


  /* =======================================================
     FIND SPOUSE
  ======================================================= */

  const getSpouse = () => {

    return nodes.find((node) => {

      if (
        node.data.relation !== "Spouse"
      ) {
        return false;
      }


      return edges.some((edge) => {

        return (

          (
            edge.source === selectedPersonId &&
            edge.target === node.id
          )

          ||

          (
            edge.target === selectedPersonId &&
            edge.source === node.id
          )

        );

      });

    });

  };


  /* =======================================================
     OPEN ADD RELATIVE
  ======================================================= */

  const openAddRelative = () => {

    setModalStep("relation");

    if (!selectedPersonId) {

      setSelectedPersonId("tom");

    }

    setShowAddRelative(true);

  };


  /* =======================================================
     ADD RELATIVE
  ======================================================= */

  const handleAddRelative = () => {

    /* =====================================================
       VALIDATE NAME
    ===================================================== */

    if (!relativeName.trim()) {

      alert(
        "Please enter family member name"
      );

      return;

    }


    /* =====================================================
       GET SELECTED PERSON
    ===================================================== */

    const selectedNode =
      getSelectedPerson();


    if (!selectedNode) {

      alert(
        "Please select a family member first"
      );

      return;

    }


    /* =====================================================
       CREATE UNIQUE ID
    ===================================================== */

    /* Empty template card for this relation (if any) */

    const emptySlot = nodes.find(
      (node) =>
        node.data.isEmpty &&
        node.data.slotOf === selectedPersonId &&
        node.data.relation === selectedRelation
    );

    const newNodeId = emptySlot
      ? emptySlot.id
      : `${selectedRelation.toLowerCase()}-${Date.now()}`;


    /* =====================================================
       FIND SPOUSE
    ===================================================== */

    const spouseNode =
      getSpouse();


    /* =====================================================
       CALCULATE POSITION
    ===================================================== */

    const position = emptySlot
      ? emptySlot.position
      : getPositionForRelation(
          selectedRelation,
          selectedNode
        );


    /* =====================================================
       CREATE NEW NODE
    ===================================================== */

    const newNode = {

      id:
        newNodeId,

      type:
        "familyNode",

      position:
        position,

      data: {

        name:
          relativeName.trim(),

        relation:
          selectedRelation,

        isMe:
          false,

      },

    };


    /* =====================================================
       ADD NODE
    ===================================================== */

    setNodes((currentNodes) =>
      emptySlot
        ? currentNodes.map((node) =>
            node.id === emptySlot.id ? newNode : node
          )
        : [...currentNodes, newNode]
    );


    /* =====================================================
       CHILD + SPOUSE

       Connect BOTH parents to child.
    ===================================================== */

    if (

      (
        selectedRelation === "Son" ||
        selectedRelation === "Daughter"
      )

      &&

      spouseNode

    ) {

      const parentEdge1 = {

        id:
          `edge-${selectedPersonId}-${newNodeId}`,

        source:
          selectedPersonId,

        sourceHandle:
          "bottom",

        target:
          newNodeId,

        targetHandle:
          "top",

        type:
          "smoothstep",

        style: {

          stroke:
            "#9ca3af",

          strokeWidth:
            1.5,

        },

      };


      const parentEdge2 = {

        id:
          `edge-${spouseNode.id}-${newNodeId}`,

        source:
          spouseNode.id,

        sourceHandle:
          "bottom",

        target:
          newNodeId,

        targetHandle:
          "top",

        type:
          "smoothstep",

        style: {

          stroke:
            "#9ca3af",

          strokeWidth:
            1.5,

        },

      };


      setEdges((currentEdges) => [

        ...currentEdges,

        parentEdge1,

        parentEdge2,

      ]);

    }


    /* =====================================================
       NORMAL SINGLE RELATION
    ===================================================== */

    else {

      const connection =
        getConnection(

          selectedRelation,

          selectedNode,

          newNodeId

        );


      const newEdge = {

        ...connection,

        type:
          "smoothstep",

        style: {

          stroke:
            "#9ca3af",

          strokeWidth:
            1.5,

        },

      };


      setEdges((currentEdges) => [

        ...currentEdges,

        newEdge,

      ]);

    }


    /* =====================================================
       RESET
    ===================================================== */

    setRelativeName("");

    setSelectedRelation("Father");

    setShowAddRelative(false);

  };


  /* =======================================================
     CLOSE ADD MODAL
  ======================================================= */

  const closeAddModal = () => {

    setRelativeName("");

    setSelectedRelation("Father");

    setShowAddRelative(false);

  };


  /* =======================================================
     SELECTED PERSON DATA
  ======================================================= */

  const selectedPerson =
    getSelectedPerson();


  /* =======================================================
     RENDER
  ======================================================= */

  return (

    <main className="tree-page">

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="tree-header">

        <div>

          <h1>
            Family Tree
          </h1>

          <p>
            Explore and manage your family relationships
          </p>

        </div>


        {/* =================================================
            ACTION BUTTONS
        ================================================= */}

        <div className="tree-actions">

          {/* ADD RELATIVE */}

          <button
            className="tree-action-btn"
            onClick={openAddRelative}
          >

            <UserPlus size={18} />

            <span>
              Add Relation
            </span>

          </button>


          {/* PROFILE */}

          <button
            className="tree-action-btn"
            onClick={() =>
              setShowProfile(true)
            }
          >

            <User size={18} />

            <span>
              View Profile
            </span>

          </button>

        </div>

      </div>


      {/* =================================================
          FAMILY TREE
      ================================================= */}

      <section className="family-tree-area">

        {/* BACKGROUND */}

        <img
          src={familyTree}
          alt="Family Tree"
          className="family-tree-background"
        />


        {/* REACT FLOW */}

        <div className="family-tree-flow">

          <ReactFlow

            nodes={displayNodes}

            edges={edges}

            onNodesChange={
              onNodesChange
            }

            onEdgesChange={
              onEdgesChange
            }

            onNodeClick={
              handleNodeClick
            }

            nodeTypes={
              nodeTypes
            }


            /* -----------------------------------------
               NODE SETTINGS
            ----------------------------------------- */

            nodesDraggable={
              false
            }

            nodesConnectable={
              false
            }

            elementsSelectable={
              true
            }


            /* -----------------------------------------
               PAN / ZOOM
            ----------------------------------------- */

            panOnDrag={
              false
            }

            zoomOnScroll={
              false
            }

            zoomOnPinch={
              false
            }

            zoomOnDoubleClick={
              false
            }


            /* -----------------------------------------
               ZOOM RANGE
            ----------------------------------------- */

            minZoom={
              0.45
            }

            maxZoom={
              1
            }


            /* -----------------------------------------
               NO FIT VIEW
            ----------------------------------------- */

            defaultViewport={{
              x: 0,
              y: 0,
              zoom: 1,
            }}


            /* -----------------------------------------
               HIDE ATTRIBUTION
            ----------------------------------------- */

            proOptions={{
              hideAttribution:
                true,
            }}

          />

        </div>

      </section>


      {/* =================================================
          ADD RELATIVE MODAL
      ================================================= */}

      {showAddRelative && (

        <AddRelativeModal
          initialStep={modalStep}
          selectedPersonName={selectedPerson?.data.name}

          relativeName={
            relativeName
          }

          setRelativeName={
            setRelativeName
          }

          selectedRelation={
            selectedRelation
          }

          setSelectedRelation={
            setSelectedRelation
          }

          onAdd={
            handleAddRelative
          }

          onClose={
            closeAddModal
          }

        />

      )}


      {/* =================================================
          PROFILE MODAL
      ================================================= */}

      {showProfile && (

        <ProfileModal

          memberCount={
            nodes.filter((node) => !node.data.isEmpty).length
          }

          selectedPerson={
            selectedPerson?.data
          }

          onClose={() =>
            setShowProfile(false)
          }

        />

      )}

    </main>

  );
};


export default TreePage;