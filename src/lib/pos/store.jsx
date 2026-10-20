import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  STORAGE_KEY, DEFAULT_OWNER_PASSCODE, DEFAULT_CASHIER_PASSCODE, SUPER_ADMIN_PASSCODE, hashCode, canSeeCost,
} from "./config";
import { SEED_PRODUCTS, SEED_CUSTOMERS, SEED_SALES, SEED_CATEGORIES } from "./seed";

// ---------------------------------------------------------------------------
// Data access layer. Every read/write to persisted data goes through here so
// the whole thing can later be swapped for a backend without touching the UI.
// ---------------------------------------------------------------------------

const defaultSettings = () => ({
  ownerPasscodeHash: hashCode(DEFAULT_OWNER_PASSCODE),
  cashierPasscodeHash: hashCode(DEFAULT_CASHIER_PASSCODE),
  superAdminPasscodeHash: hashCode(SUPER_ADMIN_PASSCODE),
  ownerPasscodeChanged: false,
  cashierPasscodeChanged: false,
  superAdminPasscodeChanged: false,
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
});

const defaultState = () => ({
  categories: SEED_CATEGORIES.map((c) => ({ ...c })),
  products: SEED_PRODUCTS,
  customers: SEED_CUSTOMERS,
  sales: SEED_SALES,
  heldSales: [],
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
  next.products = (next.products || []).map((p) => ({ discountPercent: 0, ...p }));
  // legacy seeded data stored prices in plain rupees while money() expects cents.
  // rescale only untouched seed rows (matched by id + the exact old value).
  // (the old demo cafe items are replaced wholesale below, so no rescale is needed)
  // seedVersion 3: the demo cafe menu became the restaurant menu. Data that still
  // holds ONLY the untouched old demo products (p1..p16) is swapped to the new menu;
  // anything the owner added or edited is left alone.
  if ((parsed.seedVersion || 0) < 3) {
    const onlyOldDemo =
      next.products.length > 0 &&
      next.products.length <= 16 &&
      next.products.every((p) => /^p([1-9]|1[0-6])$/.test(p.id) && /^500000000\d{3}$/.test(p.barcode || ""));
    if (onlyOldDemo) {
      next.products = base.products;
      next.categories = base.categories;
    }
  }
  next.customers = Array.isArray(next.customers) && next.customers.length ? next.customers : defaultState().customers;
  next.seedVersion = 3;
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


async function load() {
  if (typeof window === "undefined") return defaultState();
  if (window.posData?.isElectron) {
    try {
      const saved = await window.posData.load();
      return saved ? migrate(saved) : defaultState();
    } catch {
      return defaultState();
    }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
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

  // auth
  const [session, setSession] = useState(null); // { role: 'cashier' | 'owner' | 'super' }
  // cart
  const saleNo = db.nextSaleNo || 1042;
  const setSaleNo = useCallback((fn) => {
    setDb((d) => ({ ...d, nextSaleNo: typeof fn === "function" ? fn(d.nextSaleNo || 1042) : fn }));
  }, []);
  const [lines, setLines] = useState([]);
  const [customerId, setCustomerId] = useState("cu1");
  const [billDiscountOn, setBillDiscountOn] = useState(false);
  const [toast, setToast] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    load().then((loaded) => {
      if (!cancelled) {
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
      window.posData.save(db).catch(() => {});
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* ignore quota errors in mock phase */
    }
  }, [db, hydrated]);

  const showToast = useCallback((message, tone = "success") => {
    setToast({ message, tone, id: Date.now() });
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- auth --------------------------------------------------------------
  const login = useCallback((role, name = null) => setSession({ role, name, at: Date.now() }), []);
  const logout = useCallback(() => setSession(null), []);
  const role = session?.role || null;
  const isOwner = role === "owner" || role === "super";
  const operatorName =
    session?.name || (role === "owner" ? "Owner" : role === "super" ? "Admin" : "Cashier");


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
  // The line the numpad edits. Falls back to the newest non-void line (see selectedLine).
  const [selectedLineId, setSelectedLineId] = useState(null);
  const linesRef = useRef([]);
  linesRef.current = lines;

  const addLine = useCallback((product) => {
    const existingNow = linesRef.current.find((l) => l.productId === product.id && l.status === "new");
    const newId = `l${Date.now()}${Math.random().toString(16).slice(2, 6)}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.status === "new");
      if (existing) {
        return prev.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          id: newId,
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
    setSelectedLineId(existingNow ? existingNow.id : newId);
  }, []);

  const addLineByCode = useCallback(
    (code) => {
      const trimmed = String(code || "").trim();
      if (!trimmed) return false;
      const match = db.products.find((p) => p.barcode === trimmed || p.code === trimmed);
      if (!match) return false;
      addLine(match);
      showToast(`${match.name} added`);
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

  const selectedLine =
    lines.find((l) => l.id === selectedLineId && l.status !== "void") ||
    [...lines].reverse().find((l) => l.status !== "void") ||
    null;

  const clearCart = useCallback(() => {
    setLines([]);
    setSelectedLineId(null);
    setBillDiscountOn(false);
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
          id: `hold-${saleNo}-${Date.now()}`,
          saleNo,
          lines,
          customerId,
          billDiscountOn,
          cashierName: operatorName,
          at: new Date().toISOString(),
        },
      ],
      nextSaleNo: (d.nextSaleNo || saleNo) + 1,
    }));
    setLines([]);
    setBillDiscountOn(false);
    showToast("Sale parked in Held Sales");
  }, [lines, saleNo, customerId, billDiscountOn, operatorName, showToast]);

  const resumeHeld = useCallback((id) => {
    setDb((d) => {
      const held = d.heldSales.find((h) => h.id === id);
      if (!held) return d;
      setLines(held.lines || []);
      setCustomerId(held.customerId || "cu1");
      setBillDiscountOn(!!held.billDiscountOn);
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
  }, [lines, holdSale]);

  // Void order discards the ticket and records the reason
  const voidOrder = useCallback((reason) => {
    if (!lines.length) return;
    setDb((d) => ({
      ...d,
      voidedOrders: [
        ...(d.voidedOrders || []),
        {
          id: `void-${Date.now()}`,
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
        id: `s-${saleNo}-${Date.now()}`,
        saleNo,
        items,
        method,
        tendered,
        customerId,
        customerName: customer?.name || "Walk-in",
        cashierName: operatorName,
        cashierRole: role,
        shiftId: db.shift?.id || null,

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
      setReceipt(payload);
      showToast(
        method === "Account"
          ? `Charged to ${payload.customerName}'s account`
          : `Payment complete · ${method}`,
      );
      return payload;
    },
    [lines, db.customers, db.settings, db.shift, saleNo, customerId, totals, showToast, operatorName, role],
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
        id: `sh-${Date.now()}`,
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
    const other = inShift.filter((s) => s.method === "Check").reduce((a, s) => a + (s.total || 0), 0);
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
    setDb((d) => ({ ...d, products: [...d.products, { id: `p${Date.now()}`, modifiers: false, discountPercent: 0, ...product }] }));
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
    const newCustomer = { id: `cu${Date.now()}`, name: trimmedName, phone: String(phone || "").trim(), debt: 0 };
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
          id: `p${Date.now()}${i}`,
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
          id: `cu${Date.now()}${i}`,
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
  const setSuperAdminPasscode = useCallback((code) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, superAdminPasscodeHash: hashCode(code), superAdminPasscodeChanged: true } }));
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
          { id: `ca${Date.now()}`, name, passcodeHash: hashCode(code) },
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
      return { ...d, categories: [...(d.categories || []), { id: `cat${Date.now()}`, name: trimmed, tone }] };
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
    selectedLine,
    setSelectedLineId,
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
    setSuperAdminPasscode,
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
