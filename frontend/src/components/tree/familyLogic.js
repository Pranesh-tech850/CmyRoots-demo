/* =========================================================
   familyLogic.js  (pure functions, no React)

   Takes the server snapshot { persons, relationships } and
   derives everything the UI needs:
     - buildGraph : fast lookups (parents / children / spouses / siblings)
     - getLabel   : "Father", "Son", "Wife"... relative to the viewer
     - layoutTree : generation rows -> x/y positions
                    + empty "Add person" cards (slots)
                      for you AND for your parents' missing parents
                      (Grandfather / Grandmother)
========================================================= */

export const relationshipTemplates = [
  { value: "Father", label: "Father", hint: "Parent" },
  { value: "Mother", label: "Mother", hint: "Parent" },
  { value: "Brother", label: "Brother", hint: "Sibling" },
  { value: "Sister", label: "Sister", hint: "Sibling" },
  { value: "Husband", label: "Husband", hint: "Partner" },
  { value: "Wife", label: "Wife", hint: "Partner" },
  { value: "Spouse", label: "Spouse", hint: "Partner" },
  { value: "Son", label: "Son", hint: "Child" },
  { value: "Daughter", label: "Daughter", hint: "Child" },
  { value: "Grandfather", label: "Grandfather", hint: "Grandparent" },
  { value: "Grandmother", label: "Grandmother", hint: "Grandparent" },
];

/* The server only knows direct relations. A grandparent is added as the
   Father / Mother of one of the person's PARENTS, so the UI converts:
     Grandfather of X  ->  Father of (a parent of X)
     Grandmother of X  ->  Mother of (a parent of X)                    */
export const GRAND = { Grandfather: "Father", Grandmother: "Mother" };

export const normName = (n) => String(n || "").replace(/\s+/g, " ").trim().toLowerCase();

const EMPTY = new Set();

export function buildGraph({ persons = [], relationships = [] } = {}) {
  const byId = {};
  persons.forEach((p) => (byId[p.id] = p));

  const parents = {};
  const children = {};
  const spouses = {};
  const explicitSiblings = {};
  const add = (map, k, v) => {
    (map[k] = map[k] || new Set()).add(v);
  };

  relationships.forEach((r) => {
    if (r.type === "parent") {
      add(parents, r.b, r.a);
      add(children, r.a, r.b);
    } else if (r.type === "spouse") {
      add(spouses, r.a, r.b);
      add(spouses, r.b, r.a);
    } else if (r.type === "sibling") {
      add(explicitSiblings, r.a, r.b);
      add(explicitSiblings, r.b, r.a);
    }
  });

  const get = (map, id) => map[id] || EMPTY;

  return {
    byId,
    parents: (id) => get(parents, id),
    children: (id) => get(children, id),
    spouses: (id) => get(spouses, id),
    /* explicit sibling edges + anyone who shares a parent */
    siblings: (id) => {
      const out = new Set(get(explicitSiblings, id));
      get(parents, id).forEach((p) =>
        get(children, p).forEach((c) => c !== id && out.add(c))
      );
      return out;
    },
  };
}

/* =========================================================
   LABELS (derived, never stored)
========================================================= */

const byGender = (gender, m, f, neutral) =>
  gender === "M" ? m : gender === "F" ? f : neutral;

/* how many generations up `target` is from `from` (0 = not an ancestor) */
function ancestorDepth(g, from, target) {
  let level = new Set([from]);
  const seen = new Set([from]);
  for (let d = 1; d <= 8; d++) {
    const next = new Set();
    level.forEach((id) =>
      g.parents(id).forEach((p) => {
        if (!seen.has(p)) {
          seen.add(p);
          next.add(p);
        }
      })
    );
    if (next.has(target)) return d;
    if (!next.size) return 0;
    level = next;
  }
  return 0;
}

export function getLabel(g, viewerId, id) {
  if (id === viewerId) return "Me";
  const gender = g.byId[id]?.gender;

  if (g.parents(viewerId).has(id)) return byGender(gender, "Father", "Mother", "Parent");
  if (g.children(viewerId).has(id)) return byGender(gender, "Son", "Daughter", "Child");
  if (g.spouses(viewerId).has(id)) return byGender(gender, "Husband", "Wife", "Spouse");
  if (g.siblings(viewerId).has(id)) return byGender(gender, "Brother", "Sister", "Sibling");

  const up = ancestorDepth(g, viewerId, id);
  if (up >= 2) {
    return "Great-".repeat(up - 2) + byGender(gender, "Grandfather", "Grandmother", "Grandparent");
  }
  const down = ancestorDepth(g, id, viewerId);
  if (down >= 2) {
    return "Great-".repeat(down - 2) + byGender(gender, "Grandson", "Granddaughter", "Grandchild");
  }

  for (const p of g.parents(viewerId)) {
    if (g.siblings(p).has(id)) return byGender(gender, "Uncle", "Aunt", "Parent's sibling");
    for (const s of g.siblings(p)) {
      if (g.children(s).has(id)) return "Cousin";
    }
  }
  for (const s of g.siblings(viewerId)) {
    if (g.children(s).has(id)) return byGender(gender, "Nephew", "Niece", "Sibling's child");
    if (g.spouses(s).has(id)) return byGender(gender, "Brother-in-law", "Sister-in-law", "Sibling-in-law");
  }
  for (const sp of g.spouses(viewerId)) {
    if (g.parents(sp).has(id)) return byGender(gender, "Father-in-law", "Mother-in-law", "Parent-in-law");
    if (g.siblings(sp).has(id)) return byGender(gender, "Brother-in-law", "Sister-in-law", "Sibling-in-law");
  }
  for (const c of g.children(viewerId)) {
    if (g.spouses(c).has(id)) return byGender(gender, "Son-in-law", "Daughter-in-law", "Child-in-law");
  }
  return "Relative";
}

/* =========================================================
   GRANDPARENT SLOTS

   For every parent of the focus person that is missing a father
   and/or a mother, we add an invisible "virtual person" to a
   COPY of the graph. The layout then treats it like any other
   person (so spacing and centring are handled for us), and at
   the end it is turned into an empty "Add person" card.

   Clicking such a card means:
     "add a <Father|Mother> to <that parent>"
========================================================= */

const unionSet = (a, b) => {
  if (!b || !b.size) return a;
  const out = new Set(a);
  b.forEach((v) => out.add(v));
  return out;
};

function withGrandparentSlots(g, focusId) {
  const byId = { ...g.byId };
  const extraParents = {};
  const extraChildren = {};
  const extraSpouses = {};
  const put = (map, k, v) => (map[k] = map[k] || new Set()).add(v);

  [...g.parents(focusId)]
    .filter((p) => g.byId[p])
    .forEach((p) => {
      const grandparents = [...g.parents(p)].filter((id) => g.byId[id]);
      const hasFather = grandparents.some((id) => g.byId[id].gender === "M");
      const hasMother = grandparents.some((id) => g.byId[id].gender === "F");

      const make = (relation, gender, label) => {
        const vid = `__slot:${p}:${relation}`;
        byId[vid] = { id: vid, name: "", gender, __slot: { slotOf: p, relation, label } };
        put(extraParents, p, vid);
        put(extraChildren, vid, p);
        return vid;
      };

      const virtuals = [];
      if (!hasFather) virtuals.push(make("Father", "M", "Grandfather"));
      if (!hasMother) virtuals.push(make("Mother", "F", "Grandmother"));

      /* keep the two grandparents side by side as a couple */
      if (virtuals.length === 2) {
        put(extraSpouses, virtuals[0], virtuals[1]);
        put(extraSpouses, virtuals[1], virtuals[0]);
      } else if (virtuals.length === 1 && grandparents.length) {
        put(extraSpouses, virtuals[0], grandparents[0]);
        put(extraSpouses, grandparents[0], virtuals[0]);
      }
    });

  return {
    byId,
    parents: (id) => unionSet(g.parents(id), extraParents[id]),
    children: (id) => unionSet(g.children(id), extraChildren[id]),
    spouses: (id) => unionSet(g.spouses(id), extraSpouses[id]),
    siblings: (id) => g.siblings(id),
  };
}

/* =========================================================
   LAYOUT

   1. Generation of everyone connected to the viewer
      (parent = -1, child = +1, spouse/sibling = same row).
   2. Top-down: each row is split into "units" (a person plus
      their spouse(s), kept side by side). Units that share the
      same parents form a cluster centred under those parents.
   3. Overlaps are resolved left to right.

   Returns:
     positions     { personId: {x, y} }
     placeholders  [ { relation,      <- label shown on the card
                       slotRelation,  <- relation sent to the server
                       slotOf,        <- person the new relative is added to
                       position } ]
========================================================= */

export const GAP_X = 220;
export const GAP_Y = 190;

export function layoutTree(realGraph, focusId) {
  const g = withGrandparentSlots(realGraph, focusId);

  /* ---- 1. generations ---- */
  const gen = { [focusId]: 0 };
  const queue = [focusId];
  while (queue.length) {
    const id = queue.shift();
    const visit = (n, l) => {
      if (!(n in gen)) {
        gen[n] = l;
        queue.push(n);
      }
    };
    g.parents(id).forEach((n) => visit(n, gen[id] - 1));
    g.children(id).forEach((n) => visit(n, gen[id] + 1));
    g.spouses(id).forEach((n) => visit(n, gen[id]));
    g.siblings(id).forEach((n) => visit(n, gen[id]));
  }

  const rows = {};
  Object.keys(gen).forEach((id) => {
    (rows[gen[id]] = rows[gen[id]] || []).push(id);
  });

  /* ---- 2. x positions ---- */
  const x = {};
  const genderRank = (id) => ({ M: 0, F: 1 }[g.byId[id]?.gender] ?? 2);
  const order = (a, b) =>
    (a === focusId ? -1 : b === focusId ? 1 : 0) ||
    genderRank(a) - genderRank(b) ||
    (g.byId[a]?.name || "").localeCompare(g.byId[b]?.name || "");

  Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((L) => {
      const ids = rows[L].sort(order);
      const seen = new Set();
      const clusters = [];
      const byKey = {};

      ids.forEach((id) => {
        if (seen.has(id)) return;
        const unit = [
          id,
          ...[...g.spouses(id)]
            .filter((s) => s !== id && gen[s] === L && !seen.has(s))
            .sort(order),
        ];
        if (id === focusId && L === 0 && !g.spouses(focusId).size) {
          unit.push("__spouse_slot__");
        }
        unit.forEach((m) => seen.add(m));

        const ps = unit
          .filter((m) => m !== "__spouse_slot__")
          .flatMap((m) => [...g.parents(m)])
          .filter((p) => p in x);
        const desired = ps.length ? ps.reduce((sum, p) => sum + x[p], 0) / ps.length : null;
        const key = desired === null ? `n${clusters.length}` : String(Math.round(desired));

        if (!byKey[key]) {
          byKey[key] = { desired, members: [] };
          clusters.push(byKey[key]);
        }
        byKey[key].members.push(...unit);
      });

      clusters.sort(
        (a, b) =>
          (a.desired === null) - (b.desired === null) || (a.desired ?? 0) - (b.desired ?? 0)
      );

      let cursor = null;
      clusters.forEach((c) => {
        const width = (c.members.length - 1) * GAP_X;
        let left = c.desired === null ? (cursor === null ? 0 : cursor + GAP_X) : c.desired - width / 2;
        if (cursor !== null) left = Math.max(left, cursor + GAP_X);
        c.members.forEach((m, i) => {
          x[m] = left + i * GAP_X;
        });
        cursor = left + width;
      });
    });

  /* ---- 3. empty "add person" cards around the viewer ---- */
  const realRows = (L) => (rows[L] || []).filter((id) => id !== "__spouse_slot__");
  const rowStats = (L) => {
    const xs = realRows(L).map((id) => x[id]);
    return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
  };
  const hasGender = (set, gender) => [...set].some((id) => g.byId[id]?.gender === gender);
  const fx = x[focusId];
  const placeholders = [];
  const slot = (relation, px, L) =>
    placeholders.push({
      relation,
      slotRelation: relation,
      slotOf: focusId,
      position: { x: px, y: L * GAP_Y },
    });

  const up = rowStats(-1);
  if (!hasGender(g.parents(focusId), "M")) slot("Father", up ? up.min - GAP_X : fx - GAP_X / 2, -1);
  if (!hasGender(g.parents(focusId), "F")) slot("Mother", up ? up.max + GAP_X : fx + GAP_X / 2, -1);

  const mid = rowStats(0);
  let left = mid ? mid.min : fx;
  if (!hasGender(g.siblings(focusId), "M")) slot("Brother", (left -= GAP_X), 0);
  if (!hasGender(g.siblings(focusId), "F")) slot("Sister", (left -= GAP_X), 0);

  if (x["__spouse_slot__"] !== undefined) {
    slot("Spouse", x["__spouse_slot__"], 0);
    delete x["__spouse_slot__"];
  } else if (!g.spouses(focusId).size) {
    let right = mid ? mid.max : fx;
    slot("Spouse", (right += GAP_X), 0);
  }

  const spouses = [...g.spouses(focusId)].filter((s) => s in x);
  const coupleMid = spouses.length ? (fx + x[spouses[0]]) / 2 : fx;
  const down = rowStats(1);
  if (!hasGender(g.children(focusId), "M")) slot("Son", down ? down.min - GAP_X : coupleMid - GAP_X / 2, 1);
  if (!hasGender(g.children(focusId), "F")) slot("Daughter", down ? down.max + GAP_X : coupleMid + GAP_X / 2, 1);

  /* ---- 4. real people -> positions, virtual people -> grandparent cards ---- */
  const positions = {};
  Object.keys(gen).forEach((id) => {
    const pos = { x: x[id], y: gen[id] * GAP_Y };
    const v = g.byId[id]?.__slot;
    if (v) {
      placeholders.push({
        relation: v.label, // shown on the card: "Grandfather"
        slotRelation: v.relation, // sent to the server: "Father" (of slotOf)
        slotOf: v.slotOf,
        position: pos,
      });
    } else {
      positions[id] = pos;
    }
  });

  return { positions, placeholders };
}