import { newId } from "./ids";

// Append-only history, derived by comparing the state before and after a change:
//   stockMovements  every change of a product's stock (sale, refund, purchase, ...)
//   priceHistory    every price / cost change
//   auditLog        who did what (refunds, price changes, deletions, shifts, ...)
//
// These records are written straight to the database and are NOT kept in the
// React state, so they can grow for years without slowing the app. The
// database refuses to edit or delete auditLog rows.

export const LEDGER_COLLECTIONS = ["stockMovements", "priceHistory", "auditLog"];

export function deriveEvents(prev, next, actor = {}) {
  if (!prev || !next || prev === next) return null;

  const at = new Date().toISOString();
  const who = { actorName: actor.name || null, actorRole: actor.role || null };
  const audit = [];
  const movements = [];
  const prices = [];
  const log = (action, details) => audit.push({ id: newId("al"), at, action, ...who, details });

  const prevSales = prev.sales || [];
  const nextSales = next.sales || [];
  const prevProducts = prev.products || [];
  const nextProducts = next.products || [];

  // The restricted "system reboot" wipes everything: record that once, not
  // thousands of individual deletions.
  if (prevSales.length > 0 && nextSales.length === 0 && nextProducts.length === 0) {
    log("system.reboot", { salesCleared: prevSales.length, productsCleared: prevProducts.length });
    return { auditLog: audit };
  }

  // --- what happened to sales -------------------------------------------
  const newSales = nextSales.length > prevSales.length ? nextSales.slice(prevSales.length) : [];
  const refundedSales = [];
  if (nextSales !== prevSales && nextSales.length >= prevSales.length) {
    for (let i = 0; i < prevSales.length; i++) {
      const a = prevSales[i];
      const b = nextSales[i];
      if (a !== b && (b.refundedAmount || 0) > (a.refundedAmount || 0)) {
        refundedSales.push(b);
        log("refund", {
          saleId: b.id,
          saleNo: b.saleNo,
          amount: (b.refundedAmount || 0) - (a.refundedAmount || 0),
          fullyRefunded: !!b.refunded,
          method: b.method,
        });
      }
    }
  }
  const soldQty = new Map();
  for (const s of newSales) for (const it of s.items || []) soldQty.set(it.productId, (soldQty.get(it.productId) || 0) + it.qty);
  const lastSaleId = newSales.length ? newSales[newSales.length - 1].id : null;
  const purchaseAdded = (next.purchases || []).length > (prev.purchases || []).length;

  // --- products: stock movements, price history, deletions ---------------
  if (nextProducts !== prevProducts) {
    const prevById = new Map(prevProducts.map((p) => [p.id, p]));
    const nextIds = new Set();
    for (const np of nextProducts) {
      nextIds.add(np.id);
      const pp = prevById.get(np.id);
      if (pp === np) continue;
      if (!pp) {
        log("product.add", { productId: np.id, name: np.name, price: np.price, cost: np.cost, stock: np.stock });
        if (np.stock > 0) {
          movements.push({ id: newId("sm"), at, productId: np.id, productName: np.name, type: "opening", delta: np.stock, balance: np.stock, ref: null, ...who });
        }
        continue;
      }
      const delta = (np.stock || 0) - (pp.stock || 0);
      if (delta !== 0) {
        let type = "adjustment";
        let ref = null;
        if (delta < 0 && soldQty.has(np.id)) {
          type = "sale";
          ref = lastSaleId;
        } else if (delta > 0 && refundedSales.length) {
          type = "refund";
          ref = refundedSales[0].id;
        } else if (delta > 0 && purchaseAdded) {
          type = "purchase";
          ref = next.purchases[next.purchases.length - 1].id;
        }
        const m = { id: newId("sm"), at, productId: np.id, productName: np.name, type, delta, balance: np.stock, ref, ...who };
        if (type === "sale" && soldQty.get(np.id) > -delta) m.oversold = soldQty.get(np.id) + delta; // sold more than the system had
        movements.push(m);
        if (type === "adjustment") {
          log("stock.adjust", { productId: np.id, name: np.name, from: pp.stock, to: np.stock });
        }
      }
      if (pp.price !== np.price || (pp.cost || 0) !== (np.cost || 0)) {
        prices.push({
          id: newId("ph"), at, productId: np.id, productName: np.name,
          oldPrice: pp.price, newPrice: np.price, oldCost: pp.cost || 0, newCost: np.cost || 0, ...who,
        });
        log("product.price_change", {
          productId: np.id, name: np.name,
          oldPrice: pp.price, newPrice: np.price, oldCost: pp.cost || 0, newCost: np.cost || 0,
        });
      }
    }
    for (const pp of prevProducts) {
      if (!nextIds.has(pp.id)) log("product.delete", { productId: pp.id, name: pp.name, stock: pp.stock });
    }
  }

  // --- records that can be deleted: keep a trace of who removed them ---------
  if (next.expenses !== prev.expenses) {
    const nextIds = new Set((next.expenses || []).map((x) => x.id));
    for (const x of prev.expenses || []) {
      if (!nextIds.has(x.id)) log("expense.delete", { expenseId: x.id, category: x.category, amount: x.amount, date: x.date, note: x.note });
    }
  }
  if (next.suppliers !== prev.suppliers) {
    const nextIds = new Set((next.suppliers || []).map((x) => x.id));
    for (const x of prev.suppliers || []) {
      if (!nextIds.has(x.id)) log("supplier.delete", { supplierId: x.id, name: x.name });
    }
  }

  // --- shifts -------------------------------------------------------------
  if (!prev.shift && next.shift) {
    log("shift.open", { shiftId: next.shift.id, openingFloat: next.shift.openingFloat, cashier: next.shift.cashierName });
  }
  const prevShifts = prev.shifts || [];
  const nextShifts = next.shifts || [];
  if (nextShifts.length > prevShifts.length) {
    const closed = nextShifts[nextShifts.length - 1];
    log("shift.close", { shiftId: closed.id, variance: closed.variance, actualCash: closed.actualCash });
  }

  // --- settings (never the passcodes themselves) ---------------------------
  const ps = prev.settings || {};
  const ns = next.settings || {};
  if (ps !== ns) {
    if (ps.ownerPasscodeHash !== ns.ownerPasscodeHash) log("settings.owner_passcode_changed", {});
    if (ps.cashierPasscodeHash !== ns.cashierPasscodeHash || ps.cashiers !== ns.cashiers) {
      log("settings.cashiers_changed", { cashiers: (ns.cashiers || []).length });
    }
    if (ps.taxRate !== ns.taxRate) log("settings.tax_changed", { from: ps.taxRate, to: ns.taxRate });
    if (ps.billDiscountEnabled !== ns.billDiscountEnabled || ps.billDiscountPercent !== ns.billDiscountPercent) {
      log("settings.bill_discount_changed", {
        from: { enabled: ps.billDiscountEnabled, percent: ps.billDiscountPercent },
        to: { enabled: ns.billDiscountEnabled, percent: ns.billDiscountPercent },
      });
    }
  }

  // --- customer debt paid off outside a refund -----------------------------
  if (next.customers !== prev.customers && !refundedSales.length && !newSales.length) {
    const prevById = new Map((prev.customers || []).map((c) => [c.id, c]));
    for (const c of next.customers || []) {
      const pc = prevById.get(c.id);
      if (pc && pc !== c && (c.debt || 0) < (pc.debt || 0)) {
        log("customer.debt_settled", { customerId: c.id, name: c.name, amount: (pc.debt || 0) - (c.debt || 0), balance: c.debt || 0 });
      }
    }
  }

  const out = {};
  if (movements.length) out.stockMovements = movements;
  if (prices.length) out.priceHistory = prices;
  if (audit.length) out.auditLog = audit;
  return Object.keys(out).length ? out : null;
}
