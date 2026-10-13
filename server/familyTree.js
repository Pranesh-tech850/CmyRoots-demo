/* =========================================================
   server/familyTree.js

   Single source of truth for the family tree.

   Stored data (persisted to server/data/family-tree.json):
     persons:        { [id]: { id, name, gender: "M" | "F" | null } }
     relationships:  [ { id, type, a, b } ]
        type "parent"  -> a is a PARENT of b          (directed)
        type "spouse"  -> a and b are spouses         (unordered)
        type "sibling" -> a and b are siblings        (unordered)
     requests:       [ { id, fromId, toId, relation, status, createdAt } ]
        status: "pending" | "accepted" | "rejected" | "cancelled"

   REQUEST MEANING (important):
     A request is   "TO is the <relation> of FROM".
     e.g. Mike sends { fromId: mike, toId: linda, relation: "Mother" }
          = "Linda is Mike's Mother". Linda must accept before
          anything is written to the tree.

   Labels such as Father / Son / Husband are NEVER stored.
   They are derived on the client from these edges + gender.

   Every change goes through commit(): clone -> mutate ->
   validate -> save -> version++ -> broadcast full snapshot.
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_FILE = path.join(__dirname, "data", "family-tree.json");

/* relation (as shown in the UI) -> how it maps to an edge.
   "N is the <relation> of X" */
const RELATIONS = {
  Father:   { kind: "parent",  gender: "M" },
  Mother:   { kind: "parent",  gender: "F" },
  Son:      { kind: "child",   gender: "M" },
  Daughter: { kind: "child",   gender: "F" },
  Brother:  { kind: "sibling", gender: "M" },
  Sister:   { kind: "sibling", gender: "F" },
  Husband:  { kind: "spouse",  gender: "M" },
  Wife:     { kind: "spouse",  gender: "F" },
  Spouse:   { kind: "spouse",  gender: null },
};

/* Genders of the demo family members */
const SEED_GENDER = { sarah: "F", robert: "M", linda: "F", mike: "M" };
const SEED_NAMES = ["Sarah", "Robert", "Linda", "Mike"];

/* ---------- helpers ---------- */

const cleanName = (s) =>
  String(s || "").replace(/\s+/g, " ").trim().slice(0, 80);
const norm = (s) => cleanName(s).toLowerCase();

const isUserId = (id) => String(id || "").startsWith("user:");

const linkId = (type, a, b) =>
  type === "parent"
    ? `parent:${a}>${b}`
    : `${type}:${[a, b].sort().join("|")}`;

const findByName = (s, name) =>
  Object.values(s.persons).find((p) => norm(p.name) === norm(name));

const parentsOf = (s, id) =>
  s.relationships.filter((r) => r.type === "parent" && r.b === id).map((r) => r.a);

const partnersOf = (s, id, type) =>
  s.relationships
    .filter((r) => r.type === type && (r.a === id || r.b === id))
    .map((r) => (r.a === id ? r.b : r.a));

const isAncestor = (s, anc, id, seen = new Set()) => {
  for (const p of parentsOf(s, id)) {
    if (p === anc) return true;
    if (!seen.has(p)) {
      seen.add(p);
      if (isAncestor(s, anc, p, seen)) return true;
    }
  }
  return false;
};

function addLink(s, type, a, b) {
  const id = linkId(type, a, b);
  if (!s.relationships.some((r) => r.id === id)) {
    s.relationships.push({ id, type, a, b });
  }
}

function addParent(s, parentId, childId) {
  if (parentId === childId || isAncestor(s, childId, parentId)) {
    return "That would make someone their own ancestor";
  }
  addLink(s, "parent", parentId, childId);
  return null;
}

function linkCouple(s, parentId, childId) {
  for (const other of parentsOf(s, childId)) {
    if (
      other !== parentId &&
      !partnersOf(s, parentId, "spouse").length &&
      !partnersOf(s, other, "spouse").length
    ) {
      addLink(s, "spouse", parentId, other);
    }
  }
}

function inheritParents(s, fromId, toId) {
  if (parentsOf(s, toId).length) return;
  parentsOf(s, fromId).forEach((p) => addParent(s, p, toId));
}

function prune(s) {
  const used = new Set();
  s.relationships.forEach((r) => {
    used.add(r.a);
    used.add(r.b);
  });
  Object.keys(s.persons).forEach((id) => {
    if (!used.has(id) && !id.startsWith("user:")) delete s.persons[id];
  });
}

/* ---------- state + persistence ---------- */

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    parsed.requests = parsed.requests || [];
    return parsed;
  } catch {
    return { version: 0, persons: {}, relationships: [], requests: [] };
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let state = load();

const snapshot = () => ({
  version: state.version,
  persons: Object.values(state.persons),
  relationships: state.relationships,
  requests: (state.requests || []).filter((r) => r.status === "pending"),
});

function commit(mutate) {
  const draft = JSON.parse(JSON.stringify(state));
  const error = mutate(draft);
  if (error) return { ok: false, error };
  draft.version = state.version + 1;
  state = draft;
  save();
  return { ok: true };
}

function ensureUser(username) {
  const name = cleanName(username);
  if (!name || findByName(state, name)) return false;
  return commit((s) => {
    const id = `user:${norm(name)}`;
    s.persons[id] = { id, name, gender: SEED_GENDER[norm(name)] || null };
  }).ok;
}

SEED_NAMES.forEach(ensureUser);

function seedDefaultRelationships() {
  if (state.relationships && state.relationships.length > 0) return;
  const sarahId  = "user:sarah";
  const robertId = "user:robert";
  const lindaId  = "user:linda";
  const mikeId   = "user:mike";

  if (
    state.persons[sarahId] &&
    state.persons[robertId] &&
    state.persons[lindaId] &&
    state.persons[mikeId]
  ) {
    state.relationships = [
      { id: "parent:user:robert>user:sarah", type: "parent",  a: robertId, b: sarahId },
      { id: "parent:user:linda>user:sarah",  type: "parent",  a: lindaId,  b: sarahId },
      { id: "parent:user:robert>user:mike",  type: "parent",  a: robertId, b: mikeId  },
      { id: "parent:user:linda>user:mike",   type: "parent",  a: lindaId,  b: mikeId  },
      { id: "spouse:user:linda|user:robert", type: "spouse",  a: robertId, b: lindaId },
      { id: "sibling:user:mike|user:sarah",  type: "sibling", a: sarahId,  b: mikeId  },
    ];
    state.version = (state.version || 0) + 1;
    save();
  }
}

seedDefaultRelationships();

/* ---------- pure mutator ---------- */

/* "name is the <relation> of personId" */
function applyRelative(s, { personId, relation, name }) {
  const spec = RELATIONS[relation];
  const clean = cleanName(name);
  if (!spec) return "Unknown relationship";
  if (!clean) return "Please enter a name";

  const x = s.persons[personId];
  if (!x) return "The selected person no longer exists";

  let y = findByName(s, clean);
  if (!y) {
    y = { id: `p_${crypto.randomUUID()}`, name: clean, gender: null };
    s.persons[y.id] = y;
  }
  if (x.id === y.id) return "A person cannot be related to themselves";

  if (spec.gender && y.gender && y.gender !== spec.gender) {
    return `${y.name} is recorded as ${
      y.gender === "M" ? "male" : "female"
    }, so cannot be added as ${relation}`;
  }

  const link =
    spec.kind === "parent"
      ? { type: "parent", a: y.id, b: x.id }
      : spec.kind === "child"
      ? { type: "parent", a: x.id, b: y.id }
      : { type: spec.kind, a: x.id, b: y.id };
  const id = linkId(link.type, link.a, link.b);

  const between = s.relationships.filter(
    (r) => [r.a, r.b].includes(x.id) && [r.a, r.b].includes(y.id)
  );
  if (
    between.length === 1 &&
    between[0].id === id &&
    (!spec.gender || y.gender === spec.gender)
  ) {
    return `${y.name} is already the ${relation} of ${x.name}`;
  }
  s.relationships = s.relationships.filter((r) => !between.includes(r));

  if (spec.gender) y.gender = spec.gender;

  switch (spec.kind) {
    case "parent": {
      const err = addParent(s, y.id, x.id);
      if (err) return err;
      partnersOf(s, x.id, "sibling").forEach((sib) => addParent(s, y.id, sib));
      linkCouple(s, y.id, x.id);
      break;
    }
    case "child": {
      const err = addParent(s, x.id, y.id);
      if (err) return err;
      const spouses = partnersOf(s, x.id, "spouse");
      if (spouses.length === 1) addParent(s, spouses[0], y.id);
      break;
    }
    case "sibling":
      addLink(s, "sibling", x.id, y.id);
      inheritParents(s, x.id, y.id);
      inheritParents(s, y.id, x.id);
      break;
    case "spouse":
      addLink(s, "spouse", x.id, y.id);
      break;
    default:
      return "Unsupported relationship";
  }
  prune(s);
  return null;
}

/* ---------- operations ---------- */

/* Direct add. Registered users (user:*) can NOT be added this way —
   they must accept a request first. Names that are not accounts
   (e.g. a grandmother without a login) can still be added directly. */
function addRelative(payload) {
  return commit((s) => {
    const existing = findByName(s, payload?.name);
    if (existing && isUserId(existing.id)) {
      return `${existing.name} has an account. Send them a request instead.`;
    }
    return applyRelative(s, payload);
  });
}

function removeRelation({ personId, otherId }) {
  return commit((s) => {
    const before = s.relationships.length;
    s.relationships = s.relationships.filter((r) =>
      otherId
        ? !([r.a, r.b].includes(personId) && [r.a, r.b].includes(otherId))
        : r.a !== personId && r.b !== personId
    );
    if (s.relationships.length === before)
      return "There is no relationship to remove";
    prune(s);
    return null;
  });
}

function setGender({ personId, gender }) {
  return commit((s) => {
    if (!s.persons[personId]) return "Person not found";
    if (!["M", "F"].includes(gender)) return "Invalid gender";
    s.persons[personId].gender = gender;
    return null;
  });
}

/* ---------- relationship requests ----------
   "TO is the <relation> of FROM" */

function createRequest({ fromId, toId, relation }) {
  if (!RELATIONS[relation]) return { ok: false, error: "Unknown relationship" };
  if (!fromId || !toId || fromId === toId)
    return { ok: false, error: "Invalid people" };

  return commit((s) => {
    const from = s.persons[fromId];
    const to = s.persons[toId];
    if (!from || !to) return "Person no longer exists";

    s.requests = s.requests || [];

    const dup = s.requests.some(
      (r) =>
        r.status === "pending" &&
        r.fromId === fromId &&
        r.toId === toId &&
        r.relation === relation
    );
    if (dup) return "Request already pending";

    const spec = RELATIONS[relation];

    /* fail early: don't ask Linda to be a "Father" */
    if (spec.gender && to.gender && to.gender !== spec.gender) {
      return `${to.name} is recorded as ${
        to.gender === "M" ? "male" : "female"
      }, so cannot be your ${relation}`;
    }

    /* "to is the <relation> of from" */
    const link =
      spec.kind === "parent"
        ? { type: "parent", a: toId, b: fromId }   // to is parent of from
        : spec.kind === "child"
        ? { type: "parent", a: fromId, b: toId }   // to is child of from
        : { type: spec.kind, a: fromId, b: toId };
    const id = linkId(link.type, link.a, link.b);
    if (s.relationships.some((r) => r.id === id)) {
      return `${to.name} is already the ${relation} of ${from.name}`;
    }

    s.requests.push({
      id: `req_${crypto.randomUUID()}`,
      fromId,
      toId,
      relation,
      status: "pending",
      createdAt: Date.now(),
    });
    return null;
  });
}

/* Only the RECIPIENT (toId) can accept / reject.
   Nothing touches the tree unless accepted. */
function respondRequest({ requestId, accept, responderId }) {
  return commit((s) => {
    const req = (s.requests || []).find(
      (r) => r.id === requestId && r.status === "pending"
    );
    if (!req) return "Request no longer exists";
    if (req.toId !== responderId) return "Only the recipient can respond";

    if (!accept) {
      req.status = "rejected";
      return null;
    }

    const from = s.persons[req.fromId];
    const to = s.persons[req.toId];
    if (!from || !to) return "Person no longer exists";

    /* "to is the <relation> of from" */
    const err = applyRelative(s, {
      personId: from.id,
      relation: req.relation,
      name: to.name,
    });
    if (err) return err;

    req.status = "accepted";
    return null;
  });
}

function cancelRequest({ requestId, fromId }) {
  return commit((s) => {
    const req = (s.requests || []).find(
      (r) => r.id === requestId && r.status === "pending"
    );
    if (!req) return "Request no longer exists";
    if (req.fromId !== fromId) return "You can only cancel your own requests";
    req.status = "cancelled";
    return null;
  });
}

/* ---------- socket wiring ---------- */

function registerTreeHandlers(io, socket) {
  const username = socket.handshake?.auth?.username;
  const name = cleanName(username);
  const myId = name ? `user:${norm(name)}` : null;

  console.log(
    "🔌 socket connected:",
    socket.id,
    "| username =",
    username,
    "| myId =",
    myId
  );

  if (name && ensureUser(name)) {
    io.emit("tree:state", snapshot());
  }

  if (myId) socket.join(myId);

  const run = (op) => (payload, ack) => {
    let res;
    try {
      res = op(payload || {});
    } catch (err) {
      console.error("tree op failed:", err);
      res = { ok: false, error: "Server error" };
    }
    if (res.ok) {
      io.emit("tree:state", snapshot());

      if (res.notifyTo && res.notifyPayload) {
        console.log(
          "📤 emitting tree:request to room",
          res.notifyTo,
          "payload:",
          res.notifyPayload
        );
        io.to(res.notifyTo).emit("tree:request", res.notifyPayload);
      }
    }
    if (typeof ack === "function") ack({ ok: res.ok, error: res.error });
  };

  socket.on("tree:get", (ack) => {
    if (typeof ack === "function") ack(snapshot());
  });

  socket.on("tree:addRelative", run(addRelative));

  /* the sender is ALWAYS the socket's own identity, never the payload */
  socket.on(
    "tree:sendRequest",
    run((payload) => {
      if (!myId) return { ok: false, error: "Not signed in" };
      console.log("📥 tree:sendRequest received:", payload);

      const clean = { toId: payload.toId, relation: payload.relation, fromId: myId };

      const result = createRequest(clean);
      if (!result.ok) return result;

      const req = state.requests.find(
        (r) =>
          r.status === "pending" &&
          r.fromId === clean.fromId &&
          r.toId === clean.toId &&
          r.relation === clean.relation
      );

      return {
        ok: true,
        notifyTo: clean.toId,
        notifyPayload: {
          ...req,
          fromName: state.persons[clean.fromId]?.name,
        },
      };
    })
  );

  socket.on(
    "tree:respondRequest",
    run((payload) => {
      if (!myId) return { ok: false, error: "Not signed in" };
      return respondRequest({ ...payload, responderId: myId });
    })
  );

  socket.on(
    "tree:cancelRequest",
    run((payload) => {
      if (!myId) return { ok: false, error: "Not signed in" };
      return cancelRequest({ ...payload, fromId: myId });
    })
  );

  socket.on("tree:removeRelation", run(removeRelation));
  socket.on("tree:setGender", run(setGender));

  socket.emit("tree:state", snapshot());
}

module.exports = { registerTreeHandlers };