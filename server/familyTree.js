
function createRequest({ fromId, subjectId, toId, toEmail, toName, relation }) {
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

    // Sender must be an account.
    if (!isUserId(fromId)) {
      return "Invalid sender account";
    }

    // Subject must belong to the sender's connected family.
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

    const dup = s.requests.some(
      (r) =>
        isLive(r) &&
        r.fromId === fromId &&
        (r.subjectId || r.fromId) === subjectId &&
        r.relation === relation &&
        (to
          ? r.toId === to.id
          : normEmail(r.toEmail) === email)
    );

    if (dup) {
      return "Request already pending";
    }

    const spec = RELATIONS[relation];
    let name;

    if (to) {
      name = to.name;

      if (spec.gender && to.gender && to.gender !== spec.gender) {
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
          (r) => r.id === linkId(link.type, link.a, link.b)
        )
      ) {
        return `${to.name} is already the ${relation} of ${subject.name}`;
      }
    } else {
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

  return result.ok
    ? { ok: true, request: created }
    : result;
}
module.exports = {
  registerTreeHandlers,
  registerTreeRoutes,
  syncMembers,
  getSnapshot,
  removeMembers,
  getConnectedNames,
};