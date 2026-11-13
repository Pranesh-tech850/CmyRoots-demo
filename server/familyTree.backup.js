
// server/familyTree.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/*
 * Family tree storage:
 * server/data/family-tree.json
 *
 * persons: { [id]: person }
 * relationships: [{ id, type, a, b }]
 * requests: [{ id, fromId, subjectId, toId, relation, status, ... }]
 */

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "family-tree.json");

const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RELATIONS = {
  Father: { kind: "parent", gender: "M" },
  Mother: { kind: "parent", gender: "F" },
  Son: { kind: "child", gender: "M" },
  Daughter: { kind: "child", gender: "F" },
  Brother: { kind: "sibling", gender: "M" },
  Sister: { kind: "sibling", gender: "F" },
  Spouse: { kind: "spouse" },
  Husband: { kind: "spouse", gender: "M" },
  Wife: { kind: "spouse", gender: "F" },
};

function emptyState() {
  return {
    version: 0,
    persons: {},
    relationships: [],
    requests: [],
  };
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(emptyState(), null, 2)
    );
  }
}

function readState() {
  ensureStorage();

  try {
    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      version: Number(parsed.version) || 0,
      persons: parsed.persons || {},
      relationships: Array.isArray(parsed.relationships)
        ? parsed.relationships
        : [],
      requests: Array.isArray(parsed.requests)
        ? parsed.requests
        : [],
    };
  } catch (error) {
    console.error("Family tree file could not be read:", error);
    throw error;
  }
}

function writeState(state) {
  ensureStorage();

  const tempFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(state, null, 2)
  );

  fs.renameSync(tempFile, DATA_FILE);
}

function commit(callback) {
  try {
    const state = readState();
    const result = callback(state);

    if (typeof result === "string") {
      return { ok: false, error: result };
    }

    state.version += 1;
    writeState(state);

    return { ok: true, data: result };
  } catch (error) {
    console.error("Family tree update failed:", error);

    return {
      ok: false,
      error: "Could not update the family tree",
    };
  }
}

function cleanName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function normName(value) {
  return cleanName(value).toLowerCase();
}

function normEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isUserId(id) {
  return typeof id === "string" && id.startsWith("user:");
}

function makePersonId() {
  return `person:${crypto.randomUUID()}`;
}

function linkId(type, a, b) {
  if (type === "parent") {
    return `parent:${a}:${b}`;
  }

  const [first, second] = [a, b].sort();

  return `${type}:${first}:${second}`;
}

function makeRelationship(type, a, b) {
  if (type !== "parent" && b.localeCompare(a) < 0) {
    [a, b] = [b, a];
  }

  return {
    id: linkId(type, a, b),
    type,
    a,
    b,
  };
}

function connectedTo(state, startId) {
  const visited = new Set();
  const queue = [startId];

  while (queue.length) {
    const current = queue.shift();

    if (visited.has(current)) continue;

    visited.add(current);

    for (const relation of state.relationships) {
      if (relation.a === current) {
        queue.push(relation.b);
      }

      if (relation.b === current) {
        queue.push(relation.a);
      }
    }
  }

  return visited;
}

function findByName(state, name) {
  const target = normName(name);

  return Object.values(state.persons).find(
    (person) => normName(person.name) === target
  );
}

function isLive(request) {
  return (
    request.status === "pending" &&
    (!request.expiresAt || request.expiresAt > Date.now())
  );
}

function publicSnapshot(state) {
  return {
    version: state.version,
    persons: Object.values(state.persons).map((person) => ({
      id: person.id,
      name: person.name,
      gender: person.gender || null,
      email: person.email || null,
    })),
    relationships: state.relationships,
    requests: state.requests.map((request) => ({
      id: request.id,
      fromId: request.fromId,
      subjectId: request.subjectId,
      toId: request.toId,
      toEmail: request.toEmail,
      toName: request.toName,
      relation: request.relation,
      status: request.status,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
    })),
  };
}

function getSnapshot() {
  return publicSnapshot(readState());
}

function broadcastTree(io) {
  io.emit("tree:state", getSnapshot());
}

/* ---------------------------------------------------------
   CREATE RELATIONSHIP REQUEST
--------------------------------------------------------- */

function createRequest({
  fromId,
  subjectId,
  toId,
  toEmail,
  toName,
  relation,
}) {
  if (!RELATIONS[relation]) {
    return { ok: false, error: "Unknown relationship" };
  }

  if (!fromId || fromId === toId) {
    return { ok: false, error: "Invalid people" };
  }

  subjectId = subjectId || fromId;

  if (subjectId === toId) {
    return {
      ok: false,
      error: "A person cannot be related to themselves",
    };
  }

  if (!toId && !toEmail) {
    return { ok: false, error: "Invalid people" };
  }

  if (toId && !isUserId(toId)) {
    return {
      ok: false,
      error: "The recipient must be a registered account",
    };
  }

  let created = null;

  const result = commit((s) => {
    const from = s.persons[fromId];
    const subject = s.persons[subjectId];

    if (!from || !subject) {
      return "Person no longer exists";
    }

    if (!isUserId(fromId)) {
      return "Invalid sender account";
    }

    if (!connectedTo(s, fromId).has(subjectId)) {
      return "You can only create requests for your own family";
    }

    const to = toId ? s.persons[toId] : null;

    if (toId && (!to || !isUserId(to.id))) {
      return "Recipient account not found";
    }

    const email = normEmail(toEmail || to?.email || "");

    if (!to && !isEmail(email)) {
      return "Please enter a valid email address";
    }

    if (to && to.id === fromId) {
      return "You can't send a request to yourself";
    }

    if (to && to.id === subjectId) {
      return "A person cannot be related to themselves";
    }

    s.requests = s.requests || [];

    const duplicate = s.requests.some(
      (request) =>
        isLive(request) &&
        request.fromId === fromId &&
        (request.subjectId || request.fromId) === subjectId &&
        request.relation === relation &&
        (to
          ? request.toId === to.id
          : normEmail(request.toEmail) === email)
    );

    if (duplicate) {
      return "Request already pending";
    }

    const spec = RELATIONS[relation];
    let name;

    if (to) {
      name = to.name;

      if (
        spec.gender &&
        to.gender &&
        to.gender !== spec.gender
      ) {
        return `${to.name} is recorded as ${
          to.gender === "M" ? "male" : "female"
        }, so cannot be ${relation}`;
      }

      const link =
        spec.kind === "parent"
          ? { type: "parent", a: to.id, b: subjectId }
          : spec.kind === "child"
          ? { type: "parent", a: subjectId, b: to.id }
          : { type: spec.kind, a: subjectId, b: to.id };

      if (
        s.relationships.some(
          (item) =>
            item.id === linkId(link.type, link.a, link.b)
        )
      ) {
        return `${to.name} is already the ${relation} of ${subject.name}`;
      }
    } else {
      name = cleanName(toName);

      if (!name) {
        return "Enter the recipient's name too";
      }

      if (findByName(s, name)) {
        return `A member named ${name} already exists. Use their registered account instead.`;
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

  return result.ok
    ? { ok: true, request: created }
    : result;
}

/* ---------------------------------------------------------
   ADD A RELATIVE DIRECTLY
--------------------------------------------------------- */

function addRelative({ ownerId, relation, name }) {
  const clean = cleanName(name);
  const spec = RELATIONS[relation];

  if (!spec) {
    return { ok: false, error: "Unknown relationship" };
  }

  if (!clean) {
    return { ok: false, error: "Please enter a name" };
  }

  let createdPerson = null;

  const result = commit((s) => {
    const owner = s.persons[ownerId];

    if (!owner) {
      return "Person no longer exists";
    }

    if (findByName(s, clean)) {
      return "A person with this name already exists";
    }

    const id = makePersonId();

    createdPerson = {
      id,
      name: clean,
      gender: spec.gender || null,
    };

    s.persons[id] = createdPerson;

    const link =
      spec.kind === "parent"
        ? makeRelationship("parent", id, ownerId)
        : spec.kind === "child"
        ? makeRelationship("parent", ownerId, id)
        : makeRelationship(spec.kind, ownerId, id);

    s.relationships.push(link);

    return null;
  });

  return result.ok
    ? { ok: true, person: createdPerson }
    : result;
}

/* ---------------------------------------------------------
   REMOVE A PERSON AND THEIR TREE CONNECTIONS
--------------------------------------------------------- */

function removeRelation({ ownerId, personId }) {
  if (!personId || personId === ownerId) {
    return { ok: false, error: "Invalid person" };
  }

  const result = commit((s) => {
    if (!s.persons[ownerId] || !s.persons[personId]) {
      return "Person not found";
    }

    const connected = connectedTo(s, ownerId);

    if (!connected.has(personId)) {
      return "This person is not in your connected family";
    }

    s.relationships = s.relationships.filter(
      (relation) =>
        !(
          (relation.a === ownerId && relation.b === personId) ||
          (relation.a === personId && relation.b === ownerId)
        )
    );

    return null;
  });

  return result;
}

/* ---------------------------------------------------------
   MEMBER SYNCHRONIZATION
--------------------------------------------------------- */

function syncMembers(members = []) {
  return commit((s) => {
    for (const member of members) {
      const name = cleanName(member.name);
      const email = normEmail(member.email);

      if (!name || !email) continue;

      const id = `user:${name}`;

      const existing = s.persons[id];

      s.persons[id] = {
        ...(existing || {}),
        id,
        name,
        email,
        gender: member.gender || existing?.gender || null,
      };
    }

    return null;
  });
}

function removeMembers(names = []) {
  const targets = new Set(
    names.map((name) => normName(name))
  );

  return commit((s) => {
    const ids = Object.values(s.persons)
      .filter(
        (person) =>
          isUserId(person.id) &&
          targets.has(normName(person.name))
      )
      .map((person) => person.id);

    for (const id of ids) {
      delete s.persons[id];
    }

    const removed = new Set(ids);

    s.relationships = s.relationships.filter(
      (relation) =>
        !removed.has(relation.a) &&
        !removed.has(relation.b)
    );

    s.requests = s.requests.filter(
      (request) =>
        !removed.has(request.fromId) &&
        !removed.has(request.toId) &&
        !removed.has(request.subjectId)
    );

    return null;
  });
}

function getConnectedNames(username) {
  const state = readState();
  const id = `user:${username}`;

  if (!state.persons[id]) return [];

  const connected = connectedTo(state, id);

  return [...connected]
    .map((personId) => state.persons[personId])
    .filter(Boolean)
    .map((person) => person.name);
}

/* ---------------------------------------------------------
   SOCKET.IO HANDLERS
--------------------------------------------------------- */

function registerTreeHandlers(io, socket) {
  const username = socket.username;
  const fromId = `user:${username}`;

  socket.on("tree:get", (ack) => {
    if (typeof ack === "function") {
      ack(getSnapshot());
    }
  });

  socket.on("tree:addRelative", (payload = {}, ack) => {
    const reply = (value) => {
      if (typeof ack === "function") ack(value);
    };

    const result = addRelative({
      ownerId: payload.personId,
      relation: payload.relation,
      name: payload.name,
    });

    if (!result.ok) {
      return reply(result);
    }

    broadcastTree(io);
    reply({ ok: true, person: result.person });
  });

  socket.on("tree:sendRequest", (payload = {}, ack) => {
    const reply = (value) => {
      if (typeof ack === "function") ack(value);
    };

    const result = createRequest({
      fromId,
      subjectId: payload.subjectId || fromId,
      toId: payload.toId,
      toEmail: payload.toEmail,
      toName: payload.toName,
      relation: payload.relation,
    });

    if (!result.ok) {
      return reply(result);
    }

    broadcastTree(io);

    reply({
      ok: true,
      request: {
        id: result.request.id,
        status: result.request.status,
      },
    });
  });

  socket.on("tree:removeRelation", (payload = {}, ack) => {
    const result = removeRelation({
      ownerId: fromId,
      personId: payload.personId,
    });

    if (!result.ok) {
      if (typeof ack === "function") ack(result);
      return;
    }

    broadcastTree(io);

    if (typeof ack === "function") {
      ack({ ok: true });
    }
  });
}

/* ---------------------------------------------------------
   INVITATION TOKEN ROUTES
--------------------------------------------------------- */

function registerTreeRoutes(app, io) {
  app.get("/api/tree/request/:token", (req, res) => {
    const state = readState();

    const request = state.requests.find(
      (item) =>
        item.token === req.params.token &&
        isLive(item)
    );

    if (!request) {
      return res.status(404).json({
        error: "Invitation not found or expired",
      });
    }

    return res.json({
      request: {
        toName: request.toName,
        relation: request.relation,
        status: request.status,
      },
    });
  });

  app.post(
    "/api/tree/request/:token/:action",
    (req, res) => {
      const { token, action } = req.params;

      if (!["accept", "reject"].includes(action)) {
        return res.status(400).json({
          error: "Invalid invitation action",
        });
      }

      let accepted = false;

      const result = commit((s) => {
        const request = s.requests.find(
          (item) =>
            item.token === token &&
            isLive(item)
        );

        if (!request) {
          return "Invitation not found or expired";
        }

        if (action === "reject") {
          request.status = "rejected";
          return null;
        }

        if (!request.toId) {
          return "The invited person must register before accepting";
        }

        const subject = s.persons[request.subjectId];
        const recipient = s.persons[request.toId];

        if (!subject || !recipient) {
          return "Person no longer exists";
        }

        const spec = RELATIONS[request.relation];

        if (!spec) {
          return "Unknown relationship";
        }

        const link =
          spec.kind === "parent"
            ? makeRelationship(
                "parent",
                recipient.id,
                subject.id
              )
            : spec.kind === "child"
            ? makeRelationship(
                "parent",
                subject.id,
                recipient.id
              )
            : makeRelationship(
                spec.kind,
                subject.id,
                recipient.id
              );

        if (
          s.relationships.some(
            (item) => item.id === link.id
          )
        ) {
          return "This relationship already exists";
        }

        s.relationships.push(link);
        request.status = "accepted";
        accepted = true;

        return null;
      });

      if (!result.ok) {
        return res.status(400).json({
          error: result.error,
        });
      }

      broadcastTree(io);

      return res.json({
        ok: true,
        accepted,
        status: action === "accept" ? "accepted" : "rejected",
      });
    }
  );
}

/* ---------------------------------------------------------
   EXPORTS
--------------------------------------------------------- */

module.exports = {
  registerTreeHandlers,
  registerTreeRoutes,
  syncMembers,
  getSnapshot,
  removeMembers,
  getConnectedNames,
};
