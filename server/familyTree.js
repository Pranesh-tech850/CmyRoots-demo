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
const { sendRequestEmail } = require("./mailer");

const DATA_FILE = path.join(__dirname, "data", "family-tree.json");

/* base URL used inside emailed links (set PUBLIC_URL in .env) */
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:4000").replace(/\/$/, "");
/* an email request stays valid for 7 days */
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/* emails: how one user finds another */
const normEmail = (s) => String(s || "").trim().toLowerCase();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(s));
const defaultEmail = (name) =>
  `${norm(name).replace(/\s+/g, ".")}@example.com`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* a request is "live" while pending and not expired */
const isLive = (r) =>
  r.status === "pending" && (!r.expiresAt || r.expiresAt > Date.now());

/* NEVER send the secret token to clients */
const publicRequest = ({ token, ...rest }) => rest;

const findByEmail = (s, email) =>
  Object.values(s.persons).find(
    (p) => isUserId(p.id) && p.email && normEmail(p.email) === normEmail(email)
  );

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

/* older saved data has no emails: give every account one */
Object.values(state.persons).forEach((p) => {
  if (isUserId(p.id) && !p.email) p.email = defaultEmail(p.name);
});

const snapshot = () => ({
  version: state.version,
  persons: Object.values(state.persons),
  relationships: state.relationships,
  requests: (state.requests || []).filter(isLive).map(publicRequest),
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
    s.persons[id] = {
      id,
      name,
      email: defaultEmail(name),
      gender: SEED_GENDER[norm(name)] || null,
    };
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

/* ---------- accounts ---------- */

/* Make sure every member of the `users` table is also a person in the tree,
   so they can be found by email/name even before they have logged in.
   Existing people are never changed (only missing email/gender are filled). */
function syncMembers(members) {
  return commit((s) => {
    for (const m of members) {
      const name = cleanName(m.name);
      if (!name) continue;
      const id = `user:${norm(name)}`;
      const existing = s.persons[id];

      if (existing) {
        if (!existing.email) existing.email = normEmail(m.email) || defaultEmail(name);
        if (!existing.gender && m.gender) existing.gender = m.gender;
        continue;
      }
      if (findByName(s, name)) continue; // that name is used by a non-account person

      s.persons[id] = {
        id,
        name,
        email: normEmail(m.email) || defaultEmail(name),
        gender: m.gender || null,
      };
    }
    return null;
  });
}

function setEmail({ personId, email }) {
  return commit((s) => {
    const p = s.persons[personId];
    if (!p) return "Person not found";
    if (!isEmail(email)) return "Please enter a valid email address";
    const e = normEmail(email);
    const taken = Object.values(s.persons).find(
      (x) => x.id !== personId && x.email && normEmail(x.email) === e
    );
    if (taken) return "That email is already used by another member";
    p.email = e;
    return null;
  });
}

/* ---------- relationship requests ----------
   "TO is the <relation> of SUBJECT"
   SUBJECT is normally the sender (FROM). It can also be someone else in
   the tree, e.g. Mike asks Frank to be the Father of Robert (a grandfather).

   The recipient is either
     - a registered user (toId set), or
     - someone only known by email (toId null, toEmail + toName set).
       Their account entry is created ONLY when they accept.

   Every request has a secret one-time token. It is emailed to the
   recipient and is never included in the snapshot sent to clients. */

function createRequest({ fromId, subjectId, toId, toEmail, toName, relation }) {
  if (!RELATIONS[relation]) return { ok: false, error: "Unknown relationship" };
  if (!fromId || fromId === toId) return { ok: false, error: "Invalid people" };
  if (!toId && !toEmail) return { ok: false, error: "Invalid people" };
  subjectId = subjectId || fromId;
  if (subjectId === toId) {
    return { ok: false, error: "A person cannot be related to themselves" };
  }

  let created = null;

  const result = commit((s) => {
    const from = s.persons[fromId];
    const subject = s.persons[subjectId];
    if (!from || !subject) return "Person no longer exists";

    const to = toId ? s.persons[toId] : null;
    if (toId && !to) return "Person no longer exists";

    s.requests = s.requests || [];

    const email = normEmail(toEmail || to?.email || "");

    const dup = s.requests.some(
      (r) =>
        isLive(r) &&
        r.fromId === fromId &&
        (r.subjectId || r.fromId) === subjectId &&
        r.relation === relation &&
        (to ? r.toId === to.id : normEmail(r.toEmail) === email)
    );
    if (dup) return "Request already pending";

    const spec = RELATIONS[relation];
    let name;

    if (to) {
      name = to.name;

      /* fail early: don't ask Linda to be a "Father" */
      if (spec.gender && to.gender && to.gender !== spec.gender) {
        return `${to.name} is recorded as ${
          to.gender === "M" ? "male" : "female"
        }, so cannot be ${subjectId === fromId ? "your" : subject.name + "'s"} ${relation}`;
      }

      /* "to is the <relation> of subject" */
      const link =
        spec.kind === "parent"
          ? { type: "parent", a: to.id, b: subjectId }
          : spec.kind === "child"
          ? { type: "parent", a: subjectId, b: to.id }
          : { type: spec.kind, a: subjectId, b: to.id };
      if (s.relationships.some((r) => r.id === linkId(link.type, link.a, link.b))) {
        return `${to.name} is already the ${relation} of ${subject.name}`;
      }
    } else {
      /* not registered yet: we need a name to create them with */
      name = cleanName(toName);
      if (!name) {
        return "That email is not registered yet. Enter their name too and we will email them an invite.";
      }
      if (findByName(s, name)) {
        return `A member named ${name} already exists. Use a different name, or enter that person's registered email.`;
      }
    }

    created = {
      id: `req_${crypto.randomUUID()}`,
      token: crypto.randomBytes(24).toString("hex"),
      fromId,
      subjectId,
      toId: to ? to.id : null,
      toEmail: email,
      toName: name,
      relation,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + REQUEST_TTL_MS,
    };
    s.requests.push(created);
    return null;
  });

  return result.ok ? { ok: true, request: created } : result;
}

/* Used by BOTH the in-app Accept/Reject buttons and the emailed link.
   Nothing touches the tree unless accepted. */
function settleRequest(s, req, accept) {
  if (!accept) {
    req.status = "rejected";
    return null;
  }

  /* who the relation is about (the sender unless stated otherwise) */
  const subject = s.persons[req.subjectId || req.fromId];
  if (!subject) return "Person no longer exists";

  let to = req.toId ? s.persons[req.toId] : null;

  if (!to) {
    /* recipient only known by email: create them now */
    to = findByEmail(s, req.toEmail); // may have registered meanwhile
    if (!to) {
      const name = cleanName(req.toName);
      if (!name) return "Missing name";
      if (findByName(s, name)) return `A member named ${name} already exists`;
      const id = `user:${norm(name)}`;
      to = s.persons[id] = {
        id,
        name,
        email: normEmail(req.toEmail),
        gender: null,
      };
    }
    req.toId = to.id;
  }

  /* "to is the <relation> of subject" */
  const err = applyRelative(s, {
    personId: subject.id,
    relation: req.relation,
    name: to.name,
  });
  if (err) return err;

  req.status = "accepted";
  return null;
}

/* in-app popup: only the recipient can answer */
function respondRequest({ requestId, accept, responderId }) {
  return commit((s) => {
    const req = (s.requests || []).find((r) => r.id === requestId && isLive(r));
    if (!req) return "Request no longer exists or has expired";
    if (!req.toId || req.toId !== responderId) return "Only the recipient can respond";
    return settleRequest(s, req, accept);
  });
}

/* emailed link: the secret token proves the inbox owner answered */
function respondByToken({ token, accept }) {
  return commit((s) => {
    const req = (s.requests || []).find((r) => r.token === token && isLive(r));
    if (!req) {
      return "This request is no longer available (already answered, cancelled or expired)";
    }
    return settleRequest(s, req, accept);
  });
}

function cancelRequest({ requestId, fromId }) {
  return commit((s) => {
    const req = (s.requests || []).find((r) => r.id === requestId && isLive(r));
    if (!req) return "Request no longer exists";
    if (req.fromId !== fromId) return "You can only cancel your own requests";
    req.status = "cancelled";
    return null;
  });
}

/* fire-and-forget: a mail problem must never break the request */
function emailRequest(req) {
  const from = state.persons[req.fromId];
  if (!from || !req.toEmail) return;
  sendRequestEmail({
    to: req.toEmail,
    toName: req.toName,
    fromName: from.name,
    fromEmail: from.email,
    subjectName:
      req.subjectId && req.subjectId !== req.fromId
        ? state.persons[req.subjectId]?.name
        : null,
    relation: req.relation,
    link: `${PUBLIC_URL}/request/${req.token}`,
  }).catch((err) => console.error("✉️  email failed:", err.message));
}

/* ---------- HTTP routes for the emailed link ----------
   GET  /request/:token          -> shows who is asking + buttons
   POST /request/:token/accept   -> accepts
   POST /request/:token/reject   -> rejects

   The GET page never changes anything, so mail scanners that
   "click" links can't accept a request by accident. */

const TOKEN_RE = /^[a-f0-9]{48}$/;

const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font-family:Arial,sans-serif;background:#f6f6f4;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#fff;max-width:440px;margin:16px;padding:28px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h2{margin-top:0} .row{display:flex;gap:10px;margin-top:20px}
  button{flex:1;padding:12px;border:0;border-radius:8px;font-size:15px;cursor:pointer}
  .ok{background:#111;color:#fff} .no{background:#e5e7eb}
  .muted{color:#6b7280;font-size:13px}
</style></head>
<body><div class="card"><h2>${esc(title)}</h2>${body}</div></body></html>`;

function registerTreeRoutes(app, io) {
  const findLive = (token) =>
    TOKEN_RE.test(token || "")
      ? (state.requests || []).find((r) => r.token === token && isLive(r))
      : null;

  const gone = (res) =>
    res
      .status(404)
      .send(
        page(
          "Link not available",
          "<p>This request was already answered, cancelled or has expired.</p>"
        )
      );

  app.get("/request/:token", (req, res) => {
    const r = findLive(req.params.token);
    if (!r) return gone(res);
    const from = state.persons[r.fromId];
    const t = r.token;
    res.send(
      page(
        "Family connection request",
        `<p><strong>${esc(from?.name || "Someone")}</strong>${
          from?.email ? ` (${esc(from.email)})` : ""
        } says you are ${
          r.subjectId && r.subjectId !== r.fromId
            ? `<strong>${esc(state.persons[r.subjectId]?.name || "someone")}</strong>'s`
            : "their"
        } <strong>${esc(r.relation)}</strong>.</p>
         <p>Is this person your connection?</p>
         <div class="row">
           <form method="post" action="/request/${t}/accept" style="flex:1;display:flex"><button class="ok">Accept</button></form>
           <form method="post" action="/request/${t}/reject" style="flex:1;display:flex"><button class="no">Reject</button></form>
         </div>
         <p class="muted">Nothing is added to the family tree unless you accept.</p>`
      )
    );
  });

  app.post("/request/:token/:action", (req, res) => {
    const { token, action } = req.params;
    if (!["accept", "reject"].includes(action)) return gone(res);
    if (!findLive(token)) return gone(res);

    const accept = action === "accept";
    const result = respondByToken({ token, accept });

    if (!result.ok) {
      return res
        .status(400)
        .send(page("Could not complete", `<p>${esc(result.error)}</p>`));
    }

    io.emit("tree:state", snapshot()); // everyone's tree updates live

    res.send(
      accept
        ? page(
            "Connection added",
            "<p>You are now connected. It will appear on both family trees.</p>"
          )
        : page("Request declined", "<p>Nothing was added to the family tree.</p>")
    );
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
        console.log("📤 emitting tree:request to room", res.notifyTo);
        io.to(res.notifyTo).emit("tree:request", res.notifyPayload);
      }
    }
    if (typeof ack === "function") ack({ ok: res.ok, error: res.error });
  };

  socket.on("tree:get", (ack) => {
    if (typeof ack === "function") ack(snapshot());
  });

  socket.on("tree:addRelative", run(addRelative));

  /* the sender is ALWAYS the socket's own identity, never the payload.
     The recipient can be given by id OR by email. */
  socket.on(
    "tree:sendRequest",
    run((payload) => {
      if (!myId) return { ok: false, error: "Not signed in" };
      console.log("📥 tree:sendRequest received:", payload);

      let toId = payload.toId || null;
      const toEmail = payload.toEmail ? normEmail(payload.toEmail) : "";

      if (!toId && toEmail) {
        if (!isEmail(toEmail)) {
          return { ok: false, error: "Please enter a valid email address" };
        }
        const target = findByEmail(state, toEmail);
        if (target) toId = target.id;
      }

      if (!toId && !toEmail) {
        return { ok: false, error: "Please enter the person's email" };
      }
      if (toId === myId) {
        return { ok: false, error: "You can't send a request to yourself" };
      }
      const me = state.persons[myId];
      if (toEmail && me?.email && normEmail(me.email) === toEmail) {
        return { ok: false, error: "That is your own email" };
      }

      const result = createRequest({
        fromId: myId,
        subjectId: payload.subjectId || myId,
        toId,
        toEmail,
        toName: payload.toName,
        relation: payload.relation,
      });
      if (!result.ok) return result;

      const req = result.request;
      emailRequest(req);

      return {
        ok: true,
        notifyTo: req.toId || undefined, // live popup only if they have an account
        notifyPayload: {
          ...publicRequest(req),
          fromName: state.persons[myId]?.name,
          fromEmail: state.persons[myId]?.email,
          subjectName:
            req.subjectId && req.subjectId !== myId
              ? state.persons[req.subjectId]?.name
              : null,
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

  socket.on(
    "tree:setEmail",
    run((payload) => {
      if (!myId) return { ok: false, error: "Not signed in" };
      return setEmail({ personId: myId, email: payload.email });
    })
  );

  socket.on("tree:removeRelation", run(removeRelation));
  socket.on("tree:setGender", run(setGender));

  socket.emit("tree:state", snapshot());
}

module.exports = { registerTreeHandlers, registerTreeRoutes, syncMembers };