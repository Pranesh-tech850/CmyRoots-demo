// server/familyTree.js
// Family-tree data is stored in server/data/family-tree.json.
// Account and session data remain in PostgreSQL.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendRequestEmail } = require('./mailer');
const db = require('./db');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'family-tree.json');
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const RELATIONS = {
  Father: { kind: 'parent', gender: 'M' }, Mother: { kind: 'parent', gender: 'F' },
  Son: { kind: 'child', gender: 'M' }, Daughter: { kind: 'child', gender: 'F' },
  Brother: { kind: 'sibling', gender: 'M' }, Sister: { kind: 'sibling', gender: 'F' },
  Spouse: { kind: 'spouse' }, Husband: { kind: 'spouse', gender: 'M' }, Wife: { kind: 'spouse', gender: 'F' },
};

function emptyState() { return { version: 0, persons: {}, relationships: [], requests: [] }; }
function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(emptyState(), null, 2));
}
function readState() {
  ensureStorage();
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return { version: Number(parsed.version) || 0, persons: parsed.persons || {}, relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [], requests: Array.isArray(parsed.requests) ? parsed.requests : [] };
}
function writeState(state) {
  ensureStorage();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function commit(fn) {
  try {
    const state = readState();
    const result = fn(state);
    if (typeof result === 'string') return { ok: false, error: result };
    state.version += 1;
    writeState(state);
    return { ok: true, data: result };
  } catch (err) {
    console.error('Family tree update failed:', err);
    return { ok: false, error: 'Could not update the family tree' };
  }
}
function cleanName(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60); }
function normName(v) { return cleanName(v).toLowerCase(); }
function normEmail(v) { return String(v || '').trim().toLowerCase(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function isUserId(v) { return typeof v === 'string' && v.startsWith('user:'); }
function userId(username) { return `user:${cleanName(username).toLowerCase()}`; }
function makePersonId() { return `person:${crypto.randomUUID()}`; }
function linkId(type, a, b) {
  if (type === 'parent') return `parent:${a}:${b}`;
  const [x, y] = [a, b].sort();
  return `${type}:${x}:${y}`;
}
function makeRelationship(type, a, b) {
  if (type !== 'parent' && b.localeCompare(a) < 0) [a, b] = [b, a];
  return { id: linkId(type, a, b), type, a, b };
}
function connectedTo(state, startId) {
  const seen = new Set(); const queue = [startId];
  while (queue.length) {
    const current = queue.shift(); if (seen.has(current)) continue; seen.add(current);
    for (const rel of state.relationships) {
      if (rel.a === current) queue.push(rel.b);
      if (rel.b === current) queue.push(rel.a);
    }
  }
  return seen;
}
function findByName(state, name) {
  const target = normName(name);
  return Object.values(state.persons).find(p => normName(p.name) === target);
}
function findByEmail(state, email) {
  const target = normEmail(email);
  return Object.values(state.persons).find(p => isUserId(p.id) && normEmail(p.email) === target);
}

// Real database check: does this email belong to a registered account (has a password)?
async function accountFor(email) {
  try {
    const row = await db.findAccount(normEmail(email));
    return row && row.password_hash ? row : null;
  } catch (err) {
    console.error('Account lookup failed:', err.message);
    return null;
  }
}
function isLive(r) { return r.status === 'pending' && (!r.expiresAt || r.expiresAt > Date.now()); }
function publicSnapshot(state) {
  return {
    version: state.version,
    persons: Object.values(state.persons).map(p => ({ id: p.id, name: p.name, gender: p.gender || null, email: p.email || null })),
    relationships: state.relationships,
    // Never expose invitation tokens in a broadcast snapshot.
    requests: state.requests.map(({ token, ...r }) => ({ ...r })),
  };
}
function getSnapshot() { return publicSnapshot(readState()); }
function broadcastTree(io) { io.emit('tree:state', getSnapshot()); }
function relationFor(subjectId, recipientId, relation) {
  const spec = RELATIONS[relation];
  if (!spec) return null;
  if (spec.kind === 'parent') return makeRelationship('parent', recipientId, subjectId);
  if (spec.kind === 'child') return makeRelationship('parent', subjectId, recipientId);
  return makeRelationship(spec.kind, subjectId, recipientId);
}

function createRequest({ fromId, subjectId, toId, toEmail, toName, relation }) {
  if (!RELATIONS[relation]) return { ok: false, error: 'Unknown relationship' };
  if (!fromId || fromId === toId) return { ok: false, error: 'Invalid people' };
  subjectId = subjectId || fromId;
  if (subjectId === toId) return { ok: false, error: 'A person cannot be related to themselves' };
  const email = normEmail(toEmail);
  if (!toId && !isEmail(email)) return { ok: false, error: 'Please enter a valid email address' };
  let created = null;
  const result = commit(s => {
    const sender = s.persons[fromId]; const subject = s.persons[subjectId];
    if (!sender || !subject || !isUserId(fromId)) return 'Your account or selected family member was not found';
    if (!connectedTo(s, fromId).has(subjectId)) return 'You can only create requests for your own connected family';
    // Resolve by account ID OR email. This is the key fix for registered users entered by email.
    const recipient = toId ? s.persons[toId] : (email ? findByEmail(s, email) : null);
    if (toId && (!recipient || !isUserId(recipient.id))) return 'Recipient account not found';
    const recipientEmail = normEmail(recipient?.email || email);
    if (!isEmail(recipientEmail)) return 'The recipient account does not have a valid email address';
    if (recipient && recipient.id === fromId) return "You can't send a request to yourself";
    if (recipient && recipient.id === subjectId) return 'A person cannot be related to themselves';
    const duplicate = s.requests.some(r => isLive(r) && r.fromId === fromId && r.subjectId === subjectId && r.relation === relation && (recipient ? r.toId === recipient.id : normEmail(r.toEmail) === recipientEmail));
    if (duplicate) return 'A request to this person is already pending';
    const spec = RELATIONS[relation];
    if (recipient && spec.gender && recipient.gender && recipient.gender !== spec.gender) return `${recipient.name} cannot be selected as ${relation} because their profile gender does not match`;
    if (recipient) {
      const link = relationFor(subjectId, recipient.id, relation);
      if (s.relationships.some(r => r.id === link.id)) return `${recipient.name} is already connected with this relationship`;
    }
    const name = recipient?.name || cleanName(toName);
    if (!recipient && !name) return "Please enter the recipient's name too";
    created = {
      id: `req_${crypto.randomUUID()}`, token: crypto.randomBytes(32).toString('hex'),
      fromId, subjectId, toId: recipient?.id || null, toEmail: recipientEmail,
      toName: name, relation, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + REQUEST_TTL_MS,
    };
    s.requests.push(created);
    return null;
  });
  return result.ok ? { ok: true, request: created } : result;
}

function addRelative({ requesterId, ownerId, relation, name }) {
  const clean = cleanName(name); const spec = RELATIONS[relation];
  if (!spec) return { ok: false, error: 'Unknown relationship' };
  if (!clean) return { ok: false, error: 'Please enter a name' };
  let person = null;
  const result = commit(s => {
    if (!s.persons[requesterId] || !s.persons[ownerId]) return 'Person no longer exists';
    if (!connectedTo(s, requesterId).has(ownerId)) return 'You can only add relatives to your connected family';
    if (findByName(s, clean)) return 'A person with this name already exists';
    const id = makePersonId(); person = { id, name: clean, gender: spec.gender || null };
    s.persons[id] = person;
    const rel = spec.kind === 'parent' ? makeRelationship('parent', id, ownerId) : spec.kind === 'child' ? makeRelationship('parent', ownerId, id) : makeRelationship(spec.kind, ownerId, id);
    s.relationships.push(rel); return null;
  });
  return result.ok ? { ok: true, person } : result;
}
function removeRelation({ ownerId, personId }) {
  if (!personId || personId === ownerId) return { ok: false, error: 'Invalid person' };
  return commit(s => {
    if (!s.persons[ownerId] || !s.persons[personId]) return 'Person not found';
    if (!connectedTo(s, ownerId).has(personId)) return 'This person is not in your connected family';
    s.relationships = s.relationships.filter(r => !((r.a === ownerId && r.b === personId) || (r.a === personId && r.b === ownerId)));
    return null;
  });
}
function syncMembers(members = []) {
  return commit(s => {
    for (const member of members) {
      const name = cleanName(member.name); const email = normEmail(member.email);
      if (!name || !isEmail(email)) continue;
      const id = userId(name); const old = s.persons[id];
      // Someone accepted an invitation by email BEFORE having an account: a placeholder person
      // was created for them. Merge it into this real account now.
      const ph = Object.values(s.persons).find(p => !isUserId(p.id) && p.pendingEmail && normEmail(p.pendingEmail) === email);
      s.persons[id] = { ...(old || {}), id, name, email, gender: member.gender || old?.gender || ph?.gender || null };
      if (ph) {
        const swap = x => (x === ph.id ? id : x);
        const seen = new Set();
        s.relationships = s.relationships
          .map(rel => (rel.a === ph.id || rel.b === ph.id) ? makeRelationship(rel.type, swap(rel.a), swap(rel.b)) : rel)
          .filter(rel => rel.a !== rel.b && !seen.has(rel.id) && seen.add(rel.id));
        for (const r of s.requests) { r.fromId = swap(r.fromId); r.subjectId = swap(r.subjectId); if (r.toId) r.toId = swap(r.toId); if (r.toPersonId) r.toPersonId = swap(r.toPersonId); }
        delete s.persons[ph.id];
      }
      // Bind pending email invitations to the account after registration.
      for (const request of s.requests) {
        if (isLive(request) && !request.toId && normEmail(request.toEmail) === email) request.toId = id;
      }
    }
    return null;
  });
}
function removeMembers(names = []) {
  const targets = new Set(names.map(normName));
  return commit(s => {
    const ids = Object.values(s.persons).filter(p => isUserId(p.id) && targets.has(normName(p.name))).map(p => p.id);
    ids.forEach(id => delete s.persons[id]); const removed = new Set(ids);
    s.relationships = s.relationships.filter(r => !removed.has(r.a) && !removed.has(r.b));
    s.requests = s.requests.filter(r => !removed.has(r.fromId) && !removed.has(r.toId) && !removed.has(r.subjectId));
    return null;
  });
}
function getConnectedNames(username) {
  const s = readState(); const id = userId(username); if (!s.persons[id]) return [];
  return [...connectedTo(s, id)].map(pid => s.persons[pid]).filter(Boolean).map(p => p.name);
}

async function deliverInvitation(request, senderEmail) {
  const s = readState(); const sender = s.persons[request.fromId]; const subject = s.persons[request.subjectId];
  const link = `${FRONTEND_URL}/?token=${encodeURIComponent(request.token)}`;
  return sendRequestEmail({ to: request.toEmail, toName: request.toName, fromName: sender?.name || 'A CmyRoots member', fromEmail: senderEmail || sender?.email || '', subjectName: subject?.name || null, relation: request.relation, link, isRegistered: Boolean(await accountFor(request.toEmail)) });
}

function registerTreeHandlers(io, socket) {
  const fromId = userId(socket.username);
  socket.on('tree:get', ack => { if (typeof ack === 'function') ack(getSnapshot()); });
  socket.on('tree:addRelative', (payload = {}, ack) => {
    const result = addRelative({ requesterId: fromId, ownerId: payload.personId, relation: payload.relation, name: payload.name });
    if (result.ok) broadcastTree(io);
    if (typeof ack === 'function') ack(result.ok ? { ok: true, person: result.person } : result);
  });
  socket.on('tree:sendRequest', async (payload = {}, ack) => {
    const result = createRequest({ fromId, subjectId: payload.subjectId || fromId, toId: payload.toId, toEmail: payload.toEmail, toName: payload.toName, relation: payload.relation });
    if (!result.ok) { if (typeof ack === 'function') ack(result); return; }
    try {
      await deliverInvitation(result.request, socket.email);
      broadcastTree(io);
      if (typeof ack === 'function') ack({ ok: true, request: { id: result.request.id, status: 'pending' } });
      // If recipient is currently connected, notify their dashboard too.
      if (result.request.toId) {
        const recipient = readState().persons[result.request.toId];
        if (recipient) io.to(`user:${recipient.name}`).emit('tree:request', { ...result.request, token: undefined });
      }
    } catch (err) {
      console.error('Invitation email failed:', err);
      commit(s => { const r = s.requests.find(x => x.id === result.request.id); if (r && r.status === 'pending') r.status = 'email_failed'; return null; });
      if (typeof ack === 'function') ack({ ok: false, error: 'Request could not be emailed. Check SMTP settings and try again.' });
      broadcastTree(io);
    }
  });
  socket.on('tree:respondRequest', (payload = {}, ack) => {
    const result = respondToRequest({ requestId: payload.requestId, recipientId: fromId, accept: Boolean(payload.accept) });
    if (result.ok) broadcastTree(io);
    if (typeof ack === 'function') ack(result);
  });
  socket.on('tree:cancelRequest', (payload = {}, ack) => {
    const result = commit(s => {
      const r = s.requests.find(x => x.id === payload.requestId && x.fromId === fromId && isLive(x));
      if (!r) return 'Pending request not found'; r.status = 'cancelled'; return null;
    });
    if (result.ok) broadcastTree(io);
    if (typeof ack === 'function') ack(result.ok ? { ok: true } : result);
  });
  socket.on('tree:removeRelation', (payload = {}, ack) => {
    const result = removeRelation({ ownerId: fromId, personId: payload.personId });
    if (result.ok) broadcastTree(io);
    if (typeof ack === 'function') ack(result.ok ? { ok: true } : result);
  });
}
function respondToRequest({ requestId, recipientId, email, accept }) {
  return commit(s => {
    const r = s.requests.find(x => x.id === requestId && isLive(x));
    if (!r) return 'Invitation not found or expired';
    const recipient = r.toId ? s.persons[r.toId] : findByEmail(s, email || '');
    if (!recipient || (recipient.id !== recipientId && normEmail(recipient.email) !== normEmail(email))) return 'This invitation belongs to another email address';
    if (!accept) { r.status = 'rejected'; return null; }
    if (!r.toId) r.toId = recipient.id;
    const subject = s.persons[r.subjectId];
    if (!subject) return 'The family member who sent this invitation no longer exists';
    const spec = RELATIONS[r.relation]; if (!spec) return 'Unknown relationship';
    if (spec.gender && recipient.gender && recipient.gender !== spec.gender) return `Your profile gender does not match the requested ${r.relation} relationship`;
    const rel = relationFor(r.subjectId, recipient.id, r.relation);
    if (s.relationships.some(x => x.id === rel.id)) return 'This relationship already exists';
    s.relationships.push(rel); r.status = 'accepted'; r.respondedAt = Date.now(); return null;
  });
}
// Accept / reject straight from the emailed link. NO login needed for people who already
// have an account (the secret link only went to their email). Accepting REQUIRES an account.
function respondByToken({ token, accept }) {
  return commit(s => {
    const r = s.requests.find(x => x.token === token && isLive(x));
    if (!r) return 'This invitation is invalid, already answered, or expired';
    if (!accept) { r.status = 'rejected'; r.respondedAt = Date.now(); return null; }
    const subject = s.persons[r.subjectId];
    if (!subject) return 'The family member who sent this invitation no longer exists';
    const spec = RELATIONS[r.relation]; if (!spec) return 'Unknown relationship';
    const recipient = r.toId ? s.persons[r.toId] : findByEmail(s, r.toEmail);
    if (!recipient) return 'NO_ACCOUNT';
    if (recipient.id === r.subjectId) return 'A person cannot be related to themselves';
    if (spec.gender && recipient.gender && recipient.gender !== spec.gender) return `Your profile gender does not match the requested ${r.relation} relationship`;
    const rel = relationFor(r.subjectId, recipient.id, r.relation);
    r.toId = recipient.id; const hasAccount = true;
    if (s.relationships.some(x => x.id === rel.id)) return 'This relationship already exists';
    s.relationships.push(rel);
    r.status = 'accepted'; r.respondedAt = Date.now();
    return { hasAccount };
  });
}
function registerTreeRoutes(app, io, requireAuth) {
  // PUBLIC preview (no login). The 64-char token is the secret, so only the person who
  // received the email can call it. Lets the login/signup screen explain what to do.
  app.get('/api/tree/invite/:token/info', async (req, res) => {
    const s = readState(); const r = s.requests.find(x => x.token === req.params.token && isLive(x));
    if (!r) return res.status(404).json({ error: 'This invitation is invalid, already used, or expired' });
    const sender = s.persons[r.fromId]; const subject = s.persons[r.subjectId];
    return res.json({ invite: {
      fromName: sender?.name || 'A CmyRoots member',
      subjectName: subject && subject.id !== r.fromId ? subject.name : null,
      relation: r.relation, toEmail: r.toEmail, toName: r.toName || '',
      registered: Boolean(await accountFor(r.toEmail)),
    } });
  });
  // PUBLIC accept / reject from the email link (no login or signup required).
  app.post('/api/tree/invite/:token/:action', async (req, res) => {
    const { token, action } = req.params;
    if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid invitation action' });
    const pending = readState().requests.find(x => x.token === token && isLive(x));
    if (!pending) return res.status(404).json({ error: 'This invitation is invalid, already answered, or expired' });

    if (action === 'accept') {
      // Check the database: is this email registered?
      const account = await accountFor(pending.toEmail);
      if (!account) {
        return res.status(409).json({
          code: 'NO_ACCOUNT',
          email: pending.toEmail,
          error: "You don't have an account in CmyRoots. Please create an account with this email, then accept the relation.",
        });
      }
      // make sure the account exists as a person in the tree before linking
      syncMembers([{ name: account.username, email: account.email, gender: account.gender }]);
    }

    const result = respondByToken({ token, accept: action === 'accept' });
    if (!result.ok) {
      if (result.error === 'NO_ACCOUNT') return res.status(409).json({ code: 'NO_ACCOUNT', email: pending.toEmail, error: "You don't have an account in CmyRoots. Please create an account with this email, then accept the relation." });
      return res.status(400).json({ error: result.error });
    }
    broadcastTree(io);
    return res.json({ ok: true, status: action === 'accept' ? 'accepted' : 'rejected', hasAccount: action === 'accept' });
  });
  app.get('/api/tree/request/:token', requireAuth, (req, res) => {
    const s = readState(); const r = s.requests.find(x => x.token === req.params.token && isLive(x));
    if (!r) return res.status(404).json({ error: 'Invitation not found or expired' });
    if (normEmail(r.toEmail) !== normEmail(req.user.email)) return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    const sender = s.persons[r.fromId]; const subject = s.persons[r.subjectId];
    return res.json({ request: { id: r.id, fromName: sender?.name || 'A CmyRoots member', subjectName: subject?.name || 'their family member', relation: r.relation, toName: r.toName, status: r.status } });
  });
  app.post('/api/tree/request/:token/:action', requireAuth, (req, res) => {
    const { token, action } = req.params;
    if (!['accept', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid invitation action' });
    const s = readState(); const found = s.requests.find(x => x.token === token && isLive(x));
    if (!found) return res.status(404).json({ error: 'Invitation not found or expired' });
    if (normEmail(found.toEmail) !== normEmail(req.user.email)) return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    const result = respondToRequest({ requestId: found.id, recipientId: userId(req.username), email: req.user.email, accept: action === 'accept' });
    if (!result.ok) return res.status(400).json({ error: result.error });
    broadcastTree(io);
    return res.json({ ok: true, status: action === 'accept' ? 'accepted' : 'rejected' });
  });
}

module.exports = { registerTreeHandlers, registerTreeRoutes, syncMembers, getSnapshot, removeMembers, getConnectedNames };