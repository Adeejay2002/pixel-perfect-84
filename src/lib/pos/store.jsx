import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  STORAGE_KEY, DEFAULT_OWNER_PASSCODE, DEFAULT_CASHIER_PASSCODE, hashCode, canSeeCost,
} from "./config";
import { SEED_PRODUCTS, SEED_CUSTOMERS, SEED_SALES, SEED_CATEGORIES } from "./seed";
import { computeDelta } from "./delta";
import { newId } from "./ids";
import { deriveEvents } from "./ledger";
import { computeAlerts } from "./alerts";

// ---------------------------------------------------------------------------
// Data access layer. Every read/write to persisted data goes through here so
// the whole thing can later be swapped for a backend without touching the UI.
// ---------------------------------------------------------------------------

const defaultSettings = () => ({
  ownerPasscodeHash: hashCode(DEFAULT_OWNER_PASSCODE),
  cashierPasscodeHash: hashCode(DEFAULT_CASHIER_PASSCODE),
  ownerPasscodeChanged: false,
  cashierPasscodeChanged: false,
  cashiers: [{ id: "ca1", name: "Cashier 1", passcodeHash: hashCode(DEFAULT_CASHIER_PASSCODE) }],
  idleMinutes: 5,
  taxRate: 0.08,
  currency: "Rs",
  shopName: "Nimal's Grocery",
  shopAddress: "142 Galle Road, Colombo 03",
  shopPhone: "011 234 5678",
  shopLogo: "", // data URL (base64) — shown on-screen and printed at the top of every receipt
  billDiscountEnabled: false,
  billDiscountPercent: 10,
  theme: "dark", // "dark" | "light" (switch button in the toolbar)
});

const defaultState = () => ({
  categories: SEED_CATEGORIES.map((c) => ({ ...c })),
  products: SEED_PRODUCTS,
  customers: SEED_CUSTOMERS,
  sales: SEED_SALES,
  heldSales: [],
  suppliers: [],
  purchases: [],
  batches: [],
  expenses: [],
  nextSaleNo: 1042,
  shift: null,
  shifts: [],
  settings: defaultSettings(),
});

// completely blank slate (used by the restricted system reboot action)
export const blankState = () => ({
  categories: [],
  products: [],
  customers: [{ id: "cu1", name: "Walk-in", phone: "", debt: 0 }],
  sales: [],
  heldSales: [],
  suppliers: [],
  purchases: [],
  batches: [],
  expenses: [],
  nextSaleNo: 1001,
  shift: null,
  shifts: [],
  settings: defaultSettings(),
});

function migrate(parsed) {
  const base = defaultState();
  const next = {
    ...base,
    ...parsed,
    settings: { ...base.settings, ...(parsed.settings || {}) },
  };
  const s = parsed.settings || {};
  // the old shared Super Admin passcode no longer exists: remove it from saved data
  delete next.settings.superAdminPasscodeHash;
  delete next.settings.superAdminPasscodeChanged;
  // legacy single client passcode becomes the owner passcode
  if (s.clientPasscodeHash && !s.ownerPasscodeHash) {
    next.settings.ownerPasscodeHash = s.clientPasscodeHash;
    next.settings.ownerPasscodeChanged = !!s.passcodeChanged;
  }
  // legacy single shared cashier passcode becomes the first named cashier
  if (!Array.isArray(s.cashiers)) {
    next.settings.cashiers = [
      { id: "ca1", name: "Cashier 1", passcodeHash: s.cashierPasscodeHash || hashCode(DEFAULT_CASHIER_PASSCODE) },
    ];
  }
  // legacy data had hardcoded category tiles — build the editable list from it
  if (!Array.isArray(parsed.categories)) {
    const names = [...new Set((parsed.products || []).map((p) => p.category).filter(Boolean))];
    next.categories = names.length
      ? names.map((name, i) => ({ id: `c${i + 1}`, name, tone: i % 2 === 0 ? "blue" : "purple" }))
      : SEED_CATEGORIES.map((c) => ({ ...c }));
  }
  // supplier link + reorder level feed the stock alerts / supplier shopping list
  next.products = (next.products || []).map((p) => ({ discountPercent: 0, supplierId: null, reorderLevel: 0, ...p }));
  for (const key of ["suppliers", "purchases", "batches", "expenses"]) {
    next[key] = Array.isArray(next[key]) ? next[key] : [];
  }
  // legacy seeded data stored prices in plain rupees while money() expects cents.
  // rescale only untouched seed rows (matched by id + the exact old value).
  if (!parsed.seedVersion) {
    const oldSeed = new Map(SEED_PRODUCTS.map((p) => [p.id, { price: p.price / 100, cost: p.cost / 100 }]));
    next.products = next.products.map((p) => {
      const o = oldSeed.get(p.id);
      if (!o) return p;
      const patch = {};
      if (p.price === o.price) patch.price = o.price * 100;
      if ((p.cost || 0) === o.cost) patch.cost = o.cost * 100;
      return { ...p, ...patch };
    });
  }
  next.customers = Array.isArray(next.customers) && next.customers.length ? next.customers : defaultState().customers;
  next.seedVersion = 2;
  next.sales = (next.sales || []).map((sale) => ({ items: [], refunded: false, ...sale }));
  next.heldSales = Array.isArray(next.heldSales) ? next.heldSales : [];
  next.shifts = Array.isArray(next.shifts) ? next.shifts : [];
  next.shift = next.shift || null;
  const maxSaleNo = Math.max(
    1041,
    ...next.sales.map((s) => Number(s.saleNo) || 0),
    ...next.heldSales.map((h) => Number(h.saleNo) || 0),
  );
  next.nextSaleNo = Math.max(Number(parsed.nextSaleNo) || 0, maxSaleNo + 1);
  return next;
}


// Returns { state, persisted }. `persisted` is true only when the state really
// came from the database on disk (Electron) — used to decide between a first
// full save and later delta saves.
async function load() {
  if (typeof window === "undefined") return { state: defaultState(), persisted: false };
  if (window.posData?.isElectron) {
    try {
      const saved = await window.posData.load();
      return saved ? { state: migrate(saved), persisted: true } : { state: defaultState(), persisted: false };
    } catch {
      return { state: defaultState(), persisted: false };
    }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: defaultState(), persisted: false };
    return { state: migrate(JSON.parse(raw)), persisted: false };
  } catch {
    return { state: defaultState(), persisted: false };
  }
}

export function discountedPrice(product) {
  const d = Number(product?.discountPercent || 0);
  if (!d) return product?.price || 0;
  return Math.round((product.price * (100 - d)) / 100);
}

const PosContext = createContext(null);

export function PosProvider({ children }) {
  const [db, setDb] = useState(defaultState);
  const [hydrated, setHydrated] = useState(false);
  // Last state known to be on disk (Electron). null = nothing persisted yet,
  // so the next save writes everything; after that only deltas are sent.
  const savedRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  // who is logged in right now (for the audit log); updated every render
  const actorRef = useRef({ name: null, role: null });

  // auth
  const [session, setSession] = useState(null); // { role: 'cashier' | 'owner' }
  // cart
  const saleNo = db.nextSaleNo || 1042;
  const setSaleNo = useCallback((fn) => {
    setDb((d) => ({ ...d, nextSaleNo: typeof fn === "function" ? fn(d.nextSaleNo || 1042) : fn }));
  }, []);
  const [lines, setLines] = useState([]);
  const [customerId, setCustomerId] = useState("cu1");
  const [comment, setComment] = useState(""); // note on the current ticket (saved with the sale, printed on the receipt)
  const [billDiscountOn, setBillDiscountOn] = useState(false);
  const [toast, setToast] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    load().then(({ state: loaded, persisted }) => {
      if (!cancelled) {
        savedRef.current = persisted ? loaded : null;
        setDb(loaded);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (window.posData?.isElectron) {
      const prev = savedRef.current;
      savedRef.current = db;
      // Saves run one after another so they reach the database in order.
      // history (stock movements, price changes, audit log) is derived from this change
      const events = prev ? deriveEvents(prev, db, actorRef.current) : null;
      saveChainRef.current = saveChainRef.current.then(async () => {
        try {
          if (prev && window.posData.saveDelta) {
            let delta = computeDelta(prev, db);
            if (events) {
              delta = delta || { upserts: {}, deletes: {}, scalars: {} };
              delta.upserts = { ...delta.upserts, ...events };
            }
            if (!delta) return; // nothing changed
            const res = await window.posData.saveDelta(delta);
            if (res?.ok || res?.blocked) return;
          }
          // first save, or the delta path was unavailable: write everything
          await window.posData.save(db);
        } catch {
          // force a full save on the next change
          savedRef.current = null;
        }
      });
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* ignore quota errors in mock phase */
    }
  }, [db, hydrated]);

  // apply the saved theme to the whole window (CSS reads data-theme on <html>)
  const theme = db.settings?.theme === "light" ? "light" : "dark";
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
  }, [theme]);

  // low stock + expiry, recomputed when products/batches change (and when the date rolls over)
  const alertDay = new Date().toDateString();
  const stockAlerts = useMemo(() => computeAlerts(db.products, db.batches), [db.products, db.batches, alertDay]);
  const stockAlertsRef = useRef(stockAlerts);
  stockAlertsRef.current = stockAlerts;

  const showToast = useCallback((message, tone = "success") => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- auth --------------------------------------------------------------
  const login = useCallback((role, name = null) => setSession({ role, name, at: Date.now() }), []);
  const logout = useCallback(() => setSession(null), []);
  const role = session?.role || null;
  const isOwner = role === "owner";
  const operatorName =
    session?.name || (role === "owner" ? "Owner" : "Cashier");
  actorRef.current = { name: operatorName, role };

  // Writes one entry straight to the audit log (things that are not a data change,
  // e.g. opening the cash drawer without a sale). Does nothing outside Electron.
  const logEvent = useCallback((action, details = {}) => {
    if (typeof window === "undefined" || !window.posData?.saveDelta) return;
    const entry = {
      id: newId("al"),
      at: new Date().toISOString(),
      action,
      actorName: actorRef.current.name,
      actorRole: actorRef.current.role,
      details,
    };
    saveChainRef.current = saveChainRef.current.then(() =>
      Promise.resolve(window.posData.saveDelta({ upserts: { auditLog: [entry] }, deletes: {}, scalars: {} })).catch(() => {}),
    );
  }, []);


  // ---- idle auto lock ----------------------------------------------------
  const idleRef = useRef(Date.now());
  useEffect(() => {
    if (!session) return undefined;
    const bump = () => (idleRef.current = Date.now());
    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump));
    const t = setInterval(() => {
      const limit = (db.settings.idleMinutes || 5) * 60 * 1000;
      if (Date.now() - idleRef.current > limit) setSession(null);
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [session, db.settings.idleMinutes]);

  // ---- cart --------------------------------------------------------------
  const addLine = useCallback((product) => {
    // soft warning only: the sale is not blocked (the date may be wrong in the system)
    if (stockAlertsRef.current.byProduct.get(product.id)?.expiry === "expired") {
      showToast(`${product.name}: expired stock on record. Check the date before selling.`, "error");
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.status === "new");
      if (existing) {
        return prev.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          id: `l${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
          productId: product.id,
          name: product.name,
          price: product.price,
          discountPercent: Number(product.discountPercent || 0),
          unitPrice: discountedPrice(product),
          cost: product.cost || 0,
          qty: 1,
          status: "new", // new | confirmed | void
          at: new Date().toISOString(),
        },
      ];
    });
  }, [showToast]);

  const addLineByCode = useCallback(
    (code) => {
      const trimmed = String(code || "").trim();
      if (!trimmed) return false;
      const match = db.products.find((p) => p.barcode === trimmed || p.code === trimmed);
      if (!match) return false;
      addLine(match);
      // an expired-stock warning (shown by addLine) must not be replaced by "added"
      if (stockAlertsRef.current.byProduct.get(match.id)?.expiry !== "expired") showToast(`${match.name} added`);
      return true;
    },
    [db.products, addLine, showToast],
  );

  const setLineStatus = useCallback((id, status, reason = null) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status, voidReason: status === "void" ? reason : null } : l)),
    );
  }, []);

  const setLineQty = useCallback((id, qty) => {
    setLines((prev) =>
      prev.flatMap((l) => (l.id !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty }])),
    );
  }, []);

  const clearCart = useCallback(() => {
    setLines([]);
    setBillDiscountOn(false);
    setComment("");
  }, []);

  const billDiscountAvailable = !!db.settings.billDiscountEnabled;

  const toggleBillDiscount = useCallback(() => {
    if (!db.settings.billDiscountEnabled) {
      showToast("Bill discount is disabled by the owner", "error");
      return;
    }
    setBillDiscountOn((v) => !v);
  }, [db.settings.billDiscountEnabled, showToast]);

  const totals = useMemo(() => {
    const active = lines.filter((l) => l.status !== "void");
    const gross = active.reduce((s, l) => s + l.price * l.qty, 0);
    const productDiscount = active.reduce((s, l) => s + (l.price - (l.unitPrice ?? l.price)) * l.qty, 0);
    const afterProduct = gross - productDiscount;
    const pct = Number(db.settings.billDiscountPercent || 0);
    const billApplied = billDiscountOn && db.settings.billDiscountEnabled;
    const billDiscount = billApplied ? Math.round((afterProduct * pct) / 100) : 0;
    const net = afterProduct - billDiscount;
    const tax = Math.round(net * (db.settings.taxRate || 0));
    return {
      subtotal: gross,
      productDiscount,
      billDiscount,
      billDiscountPercent: billApplied ? pct : 0,
      net,
      tax,
      total: net + tax,
    };
  }, [lines, db.settings.taxRate, db.settings.billDiscountEnabled, db.settings.billDiscountPercent, billDiscountOn]);

  const holdSale = useCallback(() => {
    if (!lines.length) {
      showToast("Nothing to save — ticket is empty", "error");
      return;
    }
    setDb((d) => ({
      ...d,
      heldSales: [
        ...d.heldSales,
        {
          id: newId("hold"),
          saleNo,
          lines,
          customerId,
          billDiscountOn,
          comment,
          cashierName: operatorName,
          at: new Date().toISOString(),
        },
      ],
      nextSaleNo: (d.nextSaleNo || saleNo) + 1,
    }));
    setLines([]);
    setBillDiscountOn(false);
    setComment("");
    showToast("Sale parked in Held Sales");
  }, [lines, saleNo, customerId, billDiscountOn, comment, operatorName, showToast]);

  const resumeHeld = useCallback((id) => {
    setDb((d) => {
      const held = d.heldSales.find((h) => h.id === id);
      if (!held) return d;
      setLines(held.lines || []);
      setCustomerId(held.customerId || "cu1");
      setBillDiscountOn(!!held.billDiscountOn);
      setComment(held.comment || "");
      return { ...d, heldSales: d.heldSales.filter((h) => h.id !== id) };
    });
    showToast("Held ticket resumed");
  }, [showToast]);

  const discardHeld = useCallback((id) => {
    setDb((d) => ({ ...d, heldSales: d.heldSales.filter((h) => h.id !== id) }));
    showToast("Held ticket discarded");
  }, [showToast]);

  // New sale parks the current ticket (if any) instead of throwing it away
  const newSale = useCallback(() => {
    if (lines.length) {
      holdSale();
      return;
    }
    setLines([]);
    setBillDiscountOn(false);
    setComment("");
  }, [lines, holdSale]);

  // Lock screen: a ticket in progress is parked in "Held" first, so the next
  // person to log in never sees (or sells from) someone else's open ticket.
  const lockScreen = useCallback(() => {
    if (lines.length) holdSale();
    setSession(null);
  }, [lines, holdSale]);

  // Void order discards the ticket and records the reason
  const voidOrder = useCallback((reason) => {
    if (!lines.length) return;
    setDb((d) => ({
      ...d,
      voidedOrders: [
        ...(d.voidedOrders || []),
        {
          id: newId("void"),
          saleNo,
          reason: reason || "No reason given",
          cashierName: operatorName,
          lines,
          at: new Date().toISOString(),
        },
      ],
      nextSaleNo: (d.nextSaleNo || saleNo) + 1,
    }));
    setLines([]);
    setBillDiscountOn(false);
    setComment("");
    showToast("Order voided");
  }, [lines, saleNo, operatorName, showToast]);

  const completeSale = useCallback(
    (method, tendered) => {
      const active = lines.filter((l) => l.status !== "void");
      if (!active.length) {
        showToast("Ticket is empty", "error");
        return null;
      }
      const customer = db.customers.find((c) => c.id === customerId);
      if (method === "Account" && (!customer || customer.name === "Walk-in")) {
        showToast("Select a real customer for an account sale", "error");
        return null;
      }
      const items = active.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        price: l.price,
        unitPrice: l.unitPrice ?? l.price,
        cost: l.cost || 0,
        lineTotal: (l.unitPrice ?? l.price) * l.qty,
        refundedQty: 0,
      }));
      const cost = items.reduce((s, i) => s + i.cost * i.qty, 0);
      // bill discount is spread over the whole ticket; revenue = net of discounts
      const revenue = totals.net;
      const payload = {
        id: newId("s"),
        saleNo,
        items,
        method,
        tendered,
        customerId,
        customerName: customer?.name || "Walk-in",
        cashierName: operatorName,
        cashierRole: role,
        shiftId: db.shift?.id || null,
        comment: comment.trim(),

        subtotal: totals.subtotal,
        productDiscount: totals.productDiscount,
        billDiscount: totals.billDiscount,
        billDiscountPercent: totals.billDiscountPercent,
        tax: totals.tax,
        total: totals.total,
        revenue,
        cost,
        profit: revenue - cost,
        refunded: false,
        refundedAmount: 0,
        voidedLines: lines
          .filter((l) => l.status === "void")
          .map((l) => ({ name: l.name, qty: l.qty, reason: l.voidReason || "No reason given" })),
        date: new Date().toISOString(),
        shop: {
          name: db.settings.shopName,
          address: db.settings.shopAddress,
          phone: db.settings.shopPhone,
          logo: db.settings.shopLogo || "",
        },
        currency: db.settings.currency,
      };
      // aggregate quantity per product across EVERY active line before deducting
      const qtyByProduct = new Map();
      active.forEach((l) => qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) || 0) + l.qty));
      setDb((d) => ({
        ...d,
        sales: [...d.sales, payload],
        nextSaleNo: (d.nextSaleNo || saleNo) + 1,
        customers:
          method === "Account"
            ? d.customers.map((cu) =>
                cu.id === customerId ? { ...cu, debt: (cu.debt || 0) + payload.total } : cu,
              )
            : d.customers,
        products: d.products.map((p) => {
          const q = qtyByProduct.get(p.id);
          return q ? { ...p, stock: Math.max(0, p.stock - q) } : p;
        }),
      }));
      if (typeof window !== "undefined" && window.posHardware?.printReceipt) {
        window.posHardware.printReceipt(payload);
      }
      setLines([]);
      setBillDiscountOn(false);
      setComment("");
      setReceipt(payload);
      showToast(
        method === "Account"
          ? `Charged to ${payload.customerName}'s account`
          : `Payment complete · ${method}`,
      );
      return payload;
    },
    [lines, db.customers, db.settings, db.shift, saleNo, customerId, totals, comment, showToast, operatorName, role],
  );

  const refundSale = useCallback((id) => {
    setDb((d) => {
      const sale = d.sales.find((s) => s.id === id);
      if (!sale || sale.refunded) return d;
      const restore = new Map();
      (sale.items || []).forEach((i) => {
        const left = i.qty - (i.refundedQty || 0);
        if (left > 0) restore.set(i.productId, (restore.get(i.productId) || 0) + left);
      });
      return {
        ...d,
        sales: d.sales.map((s) =>
          s.id === id
            ? {
                ...s,
                refunded: true,
                refundedAmount: s.total,
                revenue: 0,
                profit: 0,
                items: (s.items || []).map((i) => ({ ...i, refundedQty: i.qty })),
              }
            : s,
        ),
        products: d.products.map((p) => {
          const q = restore.get(p.id);
          return q ? { ...p, stock: p.stock + q } : p;
        }),
        customers:
          sale.method === "Account"
            ? d.customers.map((cu) =>
                cu.id === sale.customerId ? { ...cu, debt: Math.max(0, (cu.debt || 0) - sale.total) } : cu,
              )
            : d.customers,
      };
    });
    showToast("Sale refunded · stock restored");
  }, [showToast]);

  // refund a single line item (partial quantity allowed)
  const refundSaleItem = useCallback((saleId, productId, qty) => {
    let ok = false;
    setDb((d) => {
      const sale = d.sales.find((s) => s.id === saleId);
      if (!sale || sale.refunded) return d;
      const item = (sale.items || []).find((i) => i.productId === productId);
      if (!item) return d;
      const remaining = item.qty - (item.refundedQty || 0);
      const n = Math.min(Math.max(1, Number(qty) || 1), remaining);
      if (n <= 0) return d;
      ok = true;
      const lineRevenue = item.lineTotal / item.qty * n;
      const lineCost = (item.cost || 0) * n;
      const nextItems = sale.items.map((i) =>
        i.productId === productId ? { ...i, refundedQty: (i.refundedQty || 0) + n } : i,
      );
      const fullyRefunded = nextItems.every((i) => (i.refundedQty || 0) >= i.qty);
      const nextSale = {
        ...sale,
        items: nextItems,
        total: Math.max(0, (sale.total || 0) - Math.round(lineRevenue)),
        revenue: Math.max(0, (sale.revenue || 0) - Math.round(lineRevenue)),
        cost: Math.max(0, (sale.cost || 0) - lineCost),
        profit: Math.max(0, (sale.revenue || 0) - Math.round(lineRevenue)) - Math.max(0, (sale.cost || 0) - lineCost),
        refundedAmount: (sale.refundedAmount || 0) + Math.round(lineRevenue),
        refunded: fullyRefunded,
      };
      return {
        ...d,
        sales: d.sales.map((s) => (s.id === saleId ? nextSale : s)),
        products: d.products.map((p) => (p.id === productId ? { ...p, stock: p.stock + n } : p)),
        customers:
          sale.method === "Account"
            ? d.customers.map((cu) =>
                cu.id === sale.customerId
                  ? { ...cu, debt: Math.max(0, (cu.debt || 0) - Math.round(lineRevenue)) }
                  : cu,
              )
            : d.customers,
      };
    });
    showToast(ok ? "Item refunded · stock restored" : "Nothing left to refund", ok ? "success" : "error");
  }, [showToast]);

  // ---- shift / cash drawer ------------------------------------------------
  const openShift = useCallback((openingFloat, name) => {
    setDb((d) => ({
      ...d,
      shift: {
        id: newId("sh"),
        openingFloat: Math.round(Number(openingFloat) || 0),
        cashierName: name || operatorName,
        openedAt: new Date().toISOString(),
      },
    }));
    showToast("Shift opened");
  }, [operatorName, showToast]);

  const shiftSummary = useMemo(() => {
    const shift = db.shift;
    if (!shift) return null;
    const inShift = (db.sales || []).filter((s) => s.shiftId === shift.id);
    const cash = inShift.filter((s) => s.method === "Cash").reduce((a, s) => a + (s.total || 0), 0);
    const card = inShift
      .filter((s) => s.method === "Credit Card" || s.method === "Debit Card")
      .reduce((a, s) => a + (s.total || 0), 0);
    const account = inShift.filter((s) => s.method === "Account").reduce((a, s) => a + (s.total || 0), 0);
    const other = inShift.filter((s) => s.method === "Check" || s.method === "Bank Transfer").reduce((a, s) => a + (s.total || 0), 0);
    const refunds = inShift.reduce((a, s) => a + (s.refundedAmount || 0), 0);
    return {
      ...shift,
      bills: inShift.length,
      sales: inShift.reduce((a, s) => a + (s.total || 0), 0),
      cash,
      card,
      account,
      other,
      refunds,
      expectedCash: shift.openingFloat + cash - refunds,
    };
  }, [db.shift, db.sales]);

  const closeShift = useCallback((actualCash) => {
    const actual = Math.round(Number(actualCash) || 0);
    setDb((d) => {
      if (!d.shift) return d;
      const inShift = (d.sales || []).filter((s) => s.shiftId === d.shift.id);
      const cash = inShift.filter((s) => s.method === "Cash").reduce((a, s) => a + (s.total || 0), 0);
      const refunds = inShift.reduce((a, s) => a + (s.refundedAmount || 0), 0);
      const expected = d.shift.openingFloat + cash - refunds;
      return {
        ...d,
        shift: null,
        shifts: [
          ...(d.shifts || []),
          {
            ...d.shift,
            closedAt: new Date().toISOString(),
            bills: inShift.length,
            totalSales: inShift.reduce((a, s) => a + (s.total || 0), 0),
            cashSales: cash,
            cardSales: inShift
              .filter((s) => s.method === "Credit Card" || s.method === "Debit Card")
              .reduce((a, s) => a + (s.total || 0), 0),
            refunds,
            expectedCash: expected,
            actualCash: actual,
            variance: actual - expected,
          },
        ],
      };
    });
    showToast("Shift closed");
  }, [showToast]);


  // ---- entities ----------------------------------------------------------
  const updateProduct = useCallback((id, patch) => {
    setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, []);
  const addProduct = useCallback((product) => {
    setDb((d) => ({ ...d, products: [...d.products, { id: newId("p"), modifiers: false, discountPercent: 0, ...product }] }));
  }, []);
  const removeProduct = useCallback((id) => {
    setDb((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
  }, []);
  const settleDebt = useCallback((id, amount) => {
    setDb((d) => ({
      ...d,
      customers: d.customers.map((c) => (c.id === id ? { ...c, debt: Math.max(0, c.debt - amount) } : c)),
    }));
  }, []);
  const addCustomer = useCallback((name, phone) => {
    const trimmedName = String(name || "").trim();
    if (!trimmedName) return null;
    const newCustomer = { id: newId("cu"), name: trimmedName, phone: String(phone || "").trim(), debt: 0 };
    setDb((d) => ({ ...d, customers: [...(Array.isArray(d.customers) ? d.customers : []), newCustomer] }));
    return newCustomer;
  }, []);

  // Bulk import (CSV) — used by the "Import products / customers" buttons in
  // Inventory / Debt Management. Adds rows on top of whatever is already
  // there; never touches sales/settings, and skips rows that look like
  // duplicates (same barcode for products, same name for customers) so
  // re-importing the same file twice doesn't create doubles.
  const bulkAddProducts = useCallback((rows) => {
    let added = 0, skipped = 0;
    setDb((d) => {
      const existingBarcodes = new Set(d.products.map((p) => p.barcode));
      const toAdd = [];
      rows.forEach((r, i) => {
        const name = String(r.name || "").trim();
        if (!name) { skipped++; return; }
        const barcode = String(r.barcode || "").trim() || `imp${Date.now()}${i}`;
        if (existingBarcodes.has(barcode)) { skipped++; return; }
        existingBarcodes.add(barcode);
        added++;
        toAdd.push({
          id: newId("p"),
          name,
          category: String(r.category || "").trim() || "Uncategorized",
          price: Math.round((Number(r.price) || 0) * 100),
          cost: Math.round((Number(r.cost) || 0) * 100),
          discountPercent: Math.min(100, Math.max(0, Number(r.discountpercent ?? r.discountPercent) || 0)),
          stock: Math.max(0, Number(r.stock) || 0),
          barcode,
          code: String(Date.now() + i).slice(-4),
          modifiers: false,
        });
      });
      return toAdd.length ? { ...d, products: [...d.products, ...toAdd] } : d;
    });
    return { added, skipped };
  }, []);

  const bulkAddCustomers = useCallback((rows) => {
    let added = 0, skipped = 0;
    setDb((d) => {
      const existingNames = new Set((d.customers || []).map((c) => c.name.trim().toLowerCase()));
      const toAdd = [];
      rows.forEach((r, i) => {
        const name = String(r.name || "").trim();
        if (!name || existingNames.has(name.toLowerCase())) { skipped++; return; }
        existingNames.add(name.toLowerCase());
        added++;
        toAdd.push({
          id: newId("cu"),
          name,
          phone: String(r.phone || "").trim(),
          debt: Math.max(0, Math.round((Number(r.debt) || 0) * 100)),
        });
      });
      return toAdd.length
        ? { ...d, customers: [...(Array.isArray(d.customers) ? d.customers : []), ...toAdd] }
        : d;
    });
    return { added, skipped };
  }, []);
  const updateSettings = useCallback((patch) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);
  const setOwnerPasscode = useCallback((code) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, ownerPasscodeHash: hashCode(code), ownerPasscodeChanged: true } }));
  }, []);
  const setCashierPasscode = useCallback((code) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, cashierPasscodeHash: hashCode(code), cashierPasscodeChanged: true } }));
  }, []);
  const resetPasscodes = useCallback(() => {
    setDb((d) => ({
      ...d,
      settings: {
        ...d.settings,
        ownerPasscodeHash: hashCode(DEFAULT_OWNER_PASSCODE),
        cashierPasscodeHash: hashCode(DEFAULT_CASHIER_PASSCODE),
        ownerPasscodeChanged: false,
        cashierPasscodeChanged: false,
      },
    }));
  }, []);
  const addCashier = useCallback((name, code) => {
    setDb((d) => ({
      ...d,
      settings: {
        ...d.settings,
        cashiers: [
          ...(d.settings.cashiers || []),
          { id: newId("ca"), name, passcodeHash: hashCode(code) },
        ],
      },
    }));
  }, []);
  const removeCashier = useCallback((id) => {
    setDb((d) => ({
      ...d,
      settings: { ...d.settings, cashiers: (d.settings.cashiers || []).filter((c) => c.id !== id) },
    }));
  }, []);
  // ---- categories --------------------------------------------------------
  const addCategory = useCallback((name, tone = "blue") => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    setDb((d) => {
      if ((d.categories || []).some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return d;
      return { ...d, categories: [...(d.categories || []), { id: newId("cat"), name: trimmed, tone }] };
    });
    return true;
  }, []);

  const renameCategory = useCallback((id, name) => {
    setDb((d) => {
      const cat = (d.categories || []).find((c) => c.id === id);
      if (!cat) return d;
      return {
        ...d,
        categories: d.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        products: d.products.map((p) => (p.category === cat.name ? { ...p, category: name } : p)),
      };
    });
  }, []);

  const removeCategory = useCallback((id) => {
    setDb((d) => {
      const cat = (d.categories || []).find((c) => c.id === id);
      if (!cat) return d;
      return {
        ...d,
        categories: d.categories.filter((c) => c.id !== id),
        products: d.products.map((p) => (p.category === cat.name ? { ...p, category: "Uncategorized" } : p)),
      };
    });
  }, []);

  // ---- backup / restore ---------------------------------------------------
  const exportData = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jnex-pos-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  }, [db, showToast]);

  const validateBackup = useCallback((data) => (
    !!data &&
    typeof data === "object" &&
    Array.isArray(data.products) &&
    Array.isArray(data.sales) &&
    Array.isArray(data.customers) &&
    !!data.settings &&
    typeof data.settings === "object" &&
    !Array.isArray(data.settings)
  ), []);

  const importData = useCallback((data) => {
    if (!validateBackup(data)) {
      showToast("That file is not a valid Jnex POS backup", "error");
      return false;
    }
    setDb(migrate(data));
    setLines([]);
    setBillDiscountOn(false);
    setReceipt(null);
    showToast("Backup restored");
    return true;
  }, [validateBackup, showToast]);


  // ---- suppliers, expenses, purchases (feed the future AI assistant) --------
  const addSupplier = useCallback((supplier) => {
    const name = String(supplier?.name || "").trim();
    if (!name) return null;
    const row = { id: newId("sup"), name, phone: String(supplier.phone || "").trim(), note: String(supplier.note || "").trim() };
    setDb((d) => ({ ...d, suppliers: [...(d.suppliers || []), row] }));
    return row;
  }, []);
  const updateSupplier = useCallback((id, patch) => {
    setDb((d) => ({ ...d, suppliers: (d.suppliers || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }, []);
  const removeSupplier = useCallback((id) => {
    setDb((d) => ({
      ...d,
      suppliers: (d.suppliers || []).filter((x) => x.id !== id),
      products: d.products.map((p) => (p.supplierId === id ? { ...p, supplierId: null } : p)),
    }));
  }, []);

  // amount in cents; category e.g. rent / electricity / wages / transport / other
  const addExpense = useCallback((expense) => {
    const amount = Math.round(Number(expense?.amount) || 0);
    if (amount <= 0) return null;
    const row = {
      id: newId("ex"),
      date: expense.date || new Date().toISOString(),
      category: String(expense.category || "other").trim() || "other",
      amount,
      note: String(expense.note || "").trim(),
      by: operatorName,
    };
    setDb((d) => ({ ...d, expenses: [...(d.expenses || []), row] }));
    return row;
  }, [operatorName]);
  const removeExpense = useCallback((id) => {
    setDb((d) => ({ ...d, expenses: (d.expenses || []).filter((x) => x.id !== id) }));
  }, []);

  // Goods received from a supplier. items: [{ productId, qty, cost (cents), expiry? (YYYY-MM-DD) }].
  // Adds stock, updates the product's cost (price history records the change),
  // and creates a batch row for items with an expiry date.
  const receivePurchase = useCallback((purchase) => {
    const items = (purchase?.items || [])
      .map((i) => ({ productId: i.productId, qty: Math.floor(Number(i.qty) || 0), cost: Math.round(Number(i.cost) || 0), expiry: i.expiry || null }))
      .filter((i) => i.productId && i.qty > 0);
    if (!items.length) return null;
    const row = {
      id: newId("pu"),
      date: new Date().toISOString(),
      supplierId: purchase.supplierId || null,
      invoiceNo: String(purchase.invoiceNo || "").trim(),
      items,
      total: items.reduce((sum, i) => sum + i.qty * i.cost, 0),
      by: operatorName,
    };
    setDb((d) => {
      const qtyBy = new Map();
      const costBy = new Map();
      items.forEach((i) => {
        qtyBy.set(i.productId, (qtyBy.get(i.productId) || 0) + i.qty);
        if (i.cost > 0) costBy.set(i.productId, i.cost);
      });
      return {
        ...d,
        purchases: [...(d.purchases || []), row],
        batches: [
          ...(d.batches || []),
          ...items
            .filter((i) => i.expiry)
            .map((i) => ({ id: newId("bt"), productId: i.productId, purchaseId: row.id, qty: i.qty, remaining: i.qty, expiry: i.expiry, receivedAt: row.date })),
        ],
        products: d.products.map((p) => {
          const q = qtyBy.get(p.id);
          if (!q) return p;
          return { ...p, stock: (p.stock || 0) + q, ...(costBy.has(p.id) ? { cost: costBy.get(p.id) } : {}) };
        }),
      };
    });
    return row;
  }, [operatorName]);

  // Opens the drawer through the receipt printer and always records who did it.
  // reason: "manual" (button) or "sale" (cash payment).
  const openCashDrawer = useCallback(
    async (reason = "manual") => {
      const hw = typeof window !== "undefined" ? window.posHardware : null;
      if (!hw?.openDrawer) {
        logEvent("cash_drawer.open", { reason, ok: false, error: "desktop app only" });
        showToast("The cash drawer can only be opened from the desktop app", "error");
        return false;
      }
      let result;
      try {
        result = await hw.openDrawer();
      } catch (err) {
        result = { ok: false, error: String((err && err.message) || err) };
      }
      logEvent("cash_drawer.open", { reason, ok: !!result?.ok, ...(result?.ok ? {} : { error: result?.error || "failed" }) });
      if (result?.ok) {
        showToast("Cash drawer opened");
        return true;
      }
      showToast(`Could not open the cash drawer${result?.error ? ` — ${result.error}` : ""}`, "error");
      return false;
    },
    [logEvent, showToast],
  );

  const setTheme = useCallback((theme) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, theme: theme === "light" ? "light" : "dark" } }));
  }, []);

  const resetAll = useCallback(() => setDb(defaultState()), []);
  const rebootSystem = useCallback(() => {
    setDb(blankState());
    setLines([]);
    setBillDiscountOn(false);
    setReceipt(null);
  }, []);


  const value = {
    ...db,
    hydrated,
    session,
    role,
    isOwner,
    canSeeCost: canSeeCost(role),
    login,
    logout,
    saleNo,
    lines,
    addLine,
    addLineByCode,
    setLineStatus,
    setLineQty,
    clearCart,
    totals,
    billDiscountOn,
    billDiscountAvailable,
    toggleBillDiscount,
    holdSale,
    resumeHeld,
    discardHeld,
    newSale,
    voidOrder,
    completeSale,
    refundSale,
    refundSaleItem,
    receipt,
    setReceipt,
    customerId,
    setCustomerId,
    updateProduct,
    addProduct,
    removeProduct,
    settleDebt,
    addCustomer,
    bulkAddProducts,
    bulkAddCustomers,
    updateSettings,
    setOwnerPasscode,
    setCashierPasscode,
    resetPasscodes,
    addCashier,
    removeCashier,
    addCategory,
    renameCategory,
    removeCategory,
    exportData,
    importData,
    validateBackup,
    operatorName,
    rebootSystem,
    resetAll,
    setTheme,
    comment,
    setComment,
    stockAlerts,
    lockScreen,
    logEvent,
    openCashDrawer,
    addSupplier,
    updateSupplier,
    removeSupplier,
    addExpense,
    removeExpense,
    receivePurchase,

    toast,
    showToast,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used inside PosProvider");
  return ctx;
}

export function money(cents, currency = "Rs") {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}
