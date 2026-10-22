// Works out what changed between two versions of the POS state so only those
// rows are sent to the SQLite layer. Relies on React-style immutable updates:
// an untouched record keeps the same object reference, so "changed" is a cheap
// reference comparison instead of a deep compare.

export const COLLECTIONS = [
  "categories", "products", "customers", "sales", "heldSales", "shifts",
  // agent-ready business data
  "suppliers", "purchases", "batches", "expenses",
];

export function computeDelta(prev, next) {
  const upserts = {};
  const deletes = {};
  const scalars = {};
  let changed = false;

  for (const c of COLLECTIONS) {
    const a = Array.isArray(prev?.[c]) ? prev[c] : [];
    const b = Array.isArray(next?.[c]) ? next[c] : [];
    if (a === b) continue;

    // Fast path (the common case): records only appended and/or edited in
    // place, none removed or reordered. No Map needed, one pass.
    if (b.length >= a.length) {
      const fast = [];
      let ok = true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) continue;
        if (a[i]?.id !== undefined && a[i]?.id === b[i]?.id) fast.push(b[i]);
        else {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let i = a.length; i < b.length; i++) fast.push(b[i]);
        if (fast.length) {
          upserts[c] = fast;
          changed = true;
        }
        continue;
      }
    }

    const prevById = new Map();
    for (const r of a) prevById.set(r?.id, r);

    const ups = [];
    const seen = new Set();
    for (const r of b) {
      seen.add(r?.id);
      if (prevById.get(r?.id) !== r) ups.push(r);
    }
    const dels = [];
    for (const id of prevById.keys()) if (!seen.has(id)) dels.push(id);

    if (ups.length) {
      upserts[c] = ups;
      changed = true;
    }
    if (dels.length) {
      deletes[c] = dels;
      changed = true;
    }
  }

  for (const k of Object.keys(next || {})) {
    if (COLLECTIONS.includes(k)) continue;
    if (prev?.[k] !== next[k]) {
      scalars[k] = next[k];
      changed = true;
    }
  }

  return changed ? { upserts, deletes, scalars } : null;
}
