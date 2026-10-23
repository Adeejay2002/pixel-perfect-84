// Low-stock and expiry alerts. One place decides what counts as "low" or
// "expiring", so the product tiles, the Alerts panel and the toolbar badge
// always agree (and the future AI assistant can use the same rules).

export const DEFAULT_LOW_STOCK = 5; // used for products that have no reorder level set
export const EXPIRY_WARN_DAYS = 30; // "expiring soon" = within this many days

// whole days from today until a YYYY-MM-DD date (0 = today, negative = already past)
export function daysUntil(day, now = new Date()) {
  const target = new Date(`${day}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// Sales are not deducted from individual batches, so the stock on hand is
// assumed to be made of the most recently received batches (oldest goods are
// sold first). Returns one row per batch that still has units, soonest expiry first.
export function estimateBatchStock(batches = [], productById, now = new Date()) {
  const byProduct = new Map();
  for (const b of batches) {
    if (!byProduct.has(b.productId)) byProduct.set(b.productId, []);
    byProduct.get(b.productId).push(b);
  }
  const rows = [];
  for (const [pid, list] of byProduct) {
    const p = productById.get(pid);
    if (!p) continue;
    let left = p.stock || 0;
    [...list]
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .forEach((b) => {
        const est = Math.min(b.qty, left);
        left -= est;
        if (est > 0) rows.push({ id: b.id, productId: pid, name: p.name, expiry: b.expiry, est, days: daysUntil(b.expiry, now) });
      });
  }
  return rows.sort((a, b) => a.days - b.days);
}

export function computeAlerts(products = [], batches = [], now = new Date()) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const byProduct = new Map(); // productId -> { stock: "out"|"low"|null, expiry: "expired"|"soon"|null, days }
  const lowItems = [];

  for (const p of products) {
    const stock = p.stock || 0;
    const level = p.reorderLevel > 0 ? p.reorderLevel : null;
    const out = stock <= 0;
    const low = !out && (level !== null ? stock <= level : stock < DEFAULT_LOW_STOCK);
    if (out || low) {
      lowItems.push({ product: p, stock, level: level ?? DEFAULT_LOW_STOCK, hasLevel: level !== null, out });
      byProduct.set(p.id, { stock: out ? "out" : "low", expiry: null, days: null });
    }
  }
  lowItems.sort((a, b) => Number(b.out) - Number(a.out) || a.stock - b.stock || a.product.name.localeCompare(b.product.name));

  const rows = estimateBatchStock(batches, productById, now);
  const expiredRows = rows.filter((r) => r.days < 0);
  const soonRows = rows.filter((r) => r.days >= 0 && r.days <= EXPIRY_WARN_DAYS);
  for (const r of [...expiredRows, ...soonRows]) {
    const cur = byProduct.get(r.productId) || { stock: null, expiry: null, days: null };
    // keep the most urgent batch for the tile badge (rows are already soonest-first)
    if (cur.expiry === null) {
      cur.expiry = r.days < 0 ? "expired" : "soon";
      cur.days = r.days;
    }
    byProduct.set(r.productId, cur);
  }

  const out = lowItems.filter((i) => i.out).length;
  return {
    byProduct,
    lowItems,
    expiredRows,
    soonRows,
    counts: { out, low: lowItems.length - out, expired: expiredRows.length, soon: soonRows.length, products: byProduct.size },
  };
}
