import { useMemo, useState } from "react";
import { X, Plus, Trash2, AlertTriangle } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

// Owner-only screens: Suppliers, Goods Received (purchases + expiry) and
// Expenses. They fill the data the AI assistant needs later (stock alerts,
// supplier shopping list, real profit) but are useful on their own today.

// ---- small helpers ---------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");
const dayString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toCents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};
const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};
// whole days from today until a YYYY-MM-DD date (0 = today, negative = already past)
function daysUntil(day) {
  const target = new Date(`${day}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
// a picked date keeps the current time when it is today, otherwise noon that day
function dateToIso(day) {
  if (!day || day === dayString()) return new Date().toISOString();
  return new Date(`${day}T12:00:00`).toISOString();
}

const input = "h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none";
const cell = "rounded bg-pos-tile px-2 py-1 text-xs text-foreground outline-none";
const label = "mb-1 block text-[11px] text-muted-foreground";
const primaryBtn = "h-9 rounded bg-pos-blue px-4 text-xs font-semibold text-white disabled:opacity-40";

function Shell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-pos-border">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 text-xs font-semibold ${
            value === t.id ? "border-b-2 border-pos-blue text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export function Suppliers({ onClose }) {
  const { suppliers = [], products, addSupplier, updateSupplier, removeSupplier, updateProduct, showToast } = usePos();
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [q, setQ] = useState("");

  const submit = () => {
    const created = addSupplier(form);
    if (!created) return showToast("Supplier name is required", "error");
    setForm({ name: "", phone: "", note: "" });
    showToast(`${created.name} added`);
  };

  const linked = useMemo(() => {
    const counts = new Map();
    products.forEach((p) => p.supplierId && counts.set(p.supplierId, (counts.get(p.supplierId) || 0) + 1));
    return counts;
  }, [products]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? products.filter((p) => p.name.toLowerCase().includes(s) || String(p.barcode || "").includes(s)) : products;
  }, [products, q]);

  return (
    <Shell title="Suppliers" onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-pos-border bg-pos-tile p-3">
        <div className="min-w-[160px] flex-1">
          <label className={label}>Supplier name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className={label}>Phone (optional)</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={input} />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={label}>Note (optional)</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. delivers Tuesdays" className={input} />
        </div>
        <button type="button" onClick={submit} className={primaryBtn}>
          Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">No suppliers yet — add one above.</p>
      ) : (
        <div className="mb-6 space-y-2">
          {suppliers.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-pos-border bg-pos-tile px-3 py-2">
              <input value={s.name} onChange={(e) => updateSupplier(s.id, { name: e.target.value })} className={`${cell} w-48 font-semibold`} />
              <input value={s.phone || ""} onChange={(e) => updateSupplier(s.id, { phone: e.target.value })} placeholder="Phone" className={`${cell} w-36`} />
              <input value={s.note || ""} onChange={(e) => updateSupplier(s.id, { note: e.target.value })} placeholder="Note" className={`${cell} min-w-[140px] flex-1`} />
              <span className="text-[11px] text-muted-foreground">{linked.get(s.id) || 0} product(s)</span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete supplier "${s.name}"? Their products will have no supplier.`)) removeSupplier(s.id);
                }}
                className="rounded p-1 text-pos-red hover:bg-pos-hover"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground">Products: supplier &amp; reorder level</h3>
          <p className="text-[11px] text-muted-foreground">
            Reorder level = the stock at which an item counts as &quot;low&quot; (0 = not set).
          </p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product / barcode" className={`${input} max-w-xs`} />
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-pos-border">
            <th className="py-2">Product</th>
            <th>Stock</th>
            <th>Supplier</th>
            <th>Reorder level</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => {
            const low = (p.reorderLevel || 0) > 0 && p.stock <= p.reorderLevel;
            return (
              <tr key={p.id} className="border-b border-pos-border text-foreground">
                <td className="py-1.5">{p.name}</td>
                <td className={low ? "font-semibold text-pos-red" : ""}>{p.stock}</td>
                <td>
                  <select
                    value={p.supplierId || ""}
                    onChange={(e) => updateProduct(p.id, { supplierId: e.target.value || null })}
                    className={`${cell} w-44`}
                  >
                    <option value="">No supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={p.reorderLevel || 0}
                    onChange={(e) => updateProduct(p.id, { reorderLevel: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    className={`${cell} w-20`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Goods received (purchases) + expiry
// ---------------------------------------------------------------------------

let lineKey = 0;

export function Purchases({ onClose }) {
  const { products, suppliers = [], purchases = [], batches = [], receivePurchase, showToast, settings } = usePos();
  const cur = settings.currency;
  const [tab, setTab] = useState("new");

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  return (
    <Shell title="Goods Received" onClose={onClose}>
      <Tabs
        tabs={[
          { id: "new", label: "New purchase" },
          { id: "history", label: `History (${purchases.length})` },
          { id: "expiry", label: "Expiry" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "new" && (
        <NewPurchase products={products} suppliers={suppliers} cur={cur} receivePurchase={receivePurchase} showToast={showToast} />
      )}
      {tab === "history" && <PurchaseHistory purchases={purchases} productById={productById} supplierById={supplierById} cur={cur} />}
      {tab === "expiry" && <ExpiryList batches={batches} productById={productById} />}
    </Shell>
  );
}

function NewPurchase({ products, suppliers, cur, receivePurchase, showToast }) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState([]);
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(s) || String(p.barcode || "") === search.trim() || String(p.code || "") === search.trim())
      .slice(0, 6);
  }, [products, search]);

  const addProductLine = (p) => {
    setLines((cur0) => {
      const existing = cur0.find((l) => l.productId === p.id);
      if (existing) return cur0.map((l) => (l === existing ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      return [...cur0, { key: ++lineKey, productId: p.id, qty: "1", cost: String((p.cost || 0) / 100), expiry: "" }];
    });
    setSearch("");
  };

  // Enter (e.g. after a barcode scan) adds an exact match, or the only result
  const onSearchKey = (e) => {
    if (e.key !== "Enter") return;
    const code = search.trim();
    const exact = products.find((p) => String(p.barcode || "") === code || String(p.code || "") === code);
    if (exact) addProductLine(exact);
    else if (results.length === 1) addProductLine(results[0]);
  };

  const patchLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const total = lines.reduce((sum, l) => sum + (Math.floor(Number(l.qty)) || 0) * toCents(l.cost), 0);

  const save = () => {
    const items = lines
      .map((l) => ({ productId: l.productId, qty: Math.floor(Number(l.qty) || 0), cost: toCents(l.cost), expiry: l.expiry || null }))
      .filter((i) => i.qty > 0);
    if (!items.length) return showToast("Add at least one item with a quantity", "error");
    const past = items.find((i) => i.expiry && daysUntil(i.expiry) < 0);
    if (past) return showToast(`Expiry date for ${productById.get(past.productId)?.name || "an item"} is in the past`, "error");
    const row = receivePurchase({ supplierId: supplierId || null, invoiceNo, items });
    if (!row) return showToast("Could not save the purchase", "error");
    showToast(`Purchase received · ${items.length} item(s) · ${money(row.total, cur)}`);
    setLines([]);
    setInvoiceNo("");
    setSupplierId("");
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-pos-border bg-pos-tile p-3">
        <div className="min-w-[180px] flex-1">
          <label className={label}>Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={label}>Invoice / bill no. (optional)</label>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={input} />
        </div>
      </div>

      <div className="relative mb-3">
        <label className={label}>Add item (name, barcode or code · press Enter after scanning)</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKey} placeholder="Search product…" className={input} />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-pos-border bg-pos-panel shadow-xl">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProductLine(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-foreground hover:bg-pos-hover"
              >
                <span>{p.name}</span>
                <span className="text-muted-foreground">in stock: {p.stock}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">Search for the products you received and add them here.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-pos-border">
              <th className="py-2">Product</th>
              <th>Qty</th>
              <th>Cost each ({cur})</th>
              <th>Expiry (optional)</th>
              <th className="text-right">Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = productById.get(l.productId);
              const newCost = toCents(l.cost);
              const changed = p && newCost !== (p.cost || 0);
              return (
                <tr key={l.key} className="border-b border-pos-border align-top text-foreground">
                  <td className="py-1.5">
                    {p?.name || "(deleted product)"}
                    <div className="text-[10px] text-muted-foreground">in stock: {p?.stock ?? 0}</div>
                  </td>
                  <td>
                    <input type="number" min="1" value={l.qty} onChange={(e) => patchLine(l.key, { qty: e.target.value })} className={`${cell} w-16`} />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.01" value={l.cost} onChange={(e) => patchLine(l.key, { cost: e.target.value })} className={`${cell} w-24`} />
                    {changed && (
                      <div className={`text-[10px] ${newCost > (p.cost || 0) ? "text-pos-red" : "text-pos-green"}`}>
                        was {money(p.cost || 0, cur)}
                      </div>
                    )}
                  </td>
                  <td>
                    <input type="date" value={l.expiry} onChange={(e) => patchLine(l.key, { expiry: e.target.value })} className={`${cell} w-36`} />
                  </td>
                  <td className="text-right">{money((Math.floor(Number(l.qty)) || 0) * newCost, cur)}</td>
                  <td className="text-right">
                    <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-pos-red hover:bg-pos-hover">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center justify-between rounded-md border border-pos-border bg-pos-tile px-4 py-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-lg font-bold text-foreground">{money(total, cur)}</p>
        </div>
        <button type="button" onClick={save} disabled={!lines.length} className={primaryBtn}>
          Receive goods
        </button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Saving adds the quantities to stock and sets each product&apos;s cost price to the cost entered here. Items with an expiry date are tracked in the Expiry tab.
      </p>
    </div>
  );
}

function PurchaseHistory({ purchases, productById, supplierById, cur }) {
  const [open, setOpen] = useState(null);
  const list = useMemo(() => [...purchases].sort((a, b) => String(b.date).localeCompare(String(a.date))), [purchases]);
  if (!list.length) return <p className="p-6 text-center text-xs text-muted-foreground">No purchases recorded yet.</p>;
  return (
    <div className="space-y-2">
      {list.map((pu) => (
        <div key={pu.id} className="rounded-md border border-pos-border bg-pos-tile">
          <button type="button" onClick={() => setOpen(open === pu.id ? null : pu.id)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {supplierById.get(pu.supplierId)?.name || "No supplier"}
                {pu.invoiceNo ? ` · #${pu.invoiceNo}` : ""}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {shortDate(pu.date)} · {pu.items.length} item(s){pu.by ? ` · ${pu.by}` : ""}
              </p>
            </div>
            <span className="text-sm font-bold text-foreground">{money(pu.total, cur)}</span>
          </button>
          {open === pu.id && (
            <table className="w-full border-t border-pos-border text-left text-xs">
              <tbody>
                {pu.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-pos-border text-foreground last:border-0">
                    <td className="px-4 py-1.5">{productById.get(i.productId)?.name || "(deleted product)"}</td>
                    <td>×{i.qty}</td>
                    <td>@ {money(i.cost, cur)}</td>
                    <td className="text-muted-foreground">{i.expiry ? `exp ${i.expiry}` : ""}</td>
                    <td className="pr-4 text-right">{money(i.qty * i.cost, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

// The system does not deduct sales from individual batches. Instead the stock
// currently on hand is assumed to come from the most recently received batches
// (oldest goods are sold first), which gives a good estimate of what is left.
function ExpiryList({ batches, productById }) {
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    const byProduct = new Map();
    for (const b of batches) {
      if (!byProduct.has(b.productId)) byProduct.set(b.productId, []);
      byProduct.get(b.productId).push(b);
    }
    const out = [];
    for (const [pid, list] of byProduct) {
      const p = productById.get(pid);
      if (!p) continue;
      let left = p.stock || 0;
      [...list]
        .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
        .forEach((b) => {
          const est = Math.min(b.qty, left);
          left -= est;
          if (est > 0) out.push({ id: b.id, name: p.name, expiry: b.expiry, est, days: daysUntil(b.expiry) });
        });
    }
    return out.sort((a, b) => a.days - b.days);
  }, [batches, productById]);

  const expired = rows.filter((r) => r.days < 0);
  const soon = rows.filter((r) => r.days >= 0 && r.days <= 30);
  const shown = filter === "expired" ? expired : filter === "soon" ? soon : rows;

  const chip = (id, text) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === id ? "bg-pos-blue text-white" : "bg-pos-tile text-muted-foreground"}`}
    >
      {text}
    </button>
  );

  return (
    <div>
      {expired.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-pos-red bg-pos-red/10 px-3 py-2 text-xs text-pos-red">
          <AlertTriangle size={14} /> {expired.reduce((s, r) => s + r.est, 0)} unit(s) in {expired.length} batch(es) have expired. Remove them from sale and correct the stock in Inventory.
        </div>
      )}
      <div className="mb-3 flex gap-2">
        {chip("all", `All (${rows.length})`)}
        {chip("expired", `Expired (${expired.length})`)}
        {chip("soon", `Within 30 days (${soon.length})`)}
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">
          {batches.length === 0 ? "No expiry dates recorded yet. Add an expiry date when you receive goods." : "Nothing to show."}
        </p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-pos-border">
              <th className="py-2">Product</th>
              <th>Expiry</th>
              <th>Status</th>
              <th className="text-right">Est. units left</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-pos-border text-foreground">
                <td className="py-1.5">{r.name}</td>
                <td>{r.expiry}</td>
                <td>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      r.days < 0 ? "bg-pos-red/20 text-pos-red" : r.days <= 30 ? "bg-pos-amber/20 text-pos-amber" : "bg-pos-green/20 text-pos-green"
                    }`}
                  >
                    {r.days < 0 ? `Expired ${-r.days} day(s) ago` : r.days === 0 ? "Expires today" : `${r.days} day(s) left`}
                  </span>
                </td>
                <td className="text-right">{r.est}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Units left is an estimate: it assumes the oldest stock is sold first.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

const CATEGORIES = ["Rent", "Electricity", "Water", "Wages", "Transport", "Packaging", "Repairs", "Other"];
const RANGES = [
  { id: "today", label: "Today", days: 0 },
  { id: "7", label: "Last 7 days", days: 6 },
  { id: "30", label: "Last 30 days", days: 29 },
  { id: "all", label: "All", days: null },
];

export function Expenses({ onClose }) {
  const { expenses = [], addExpense, removeExpense, settings, showToast } = usePos();
  const cur = settings.currency;
  const [form, setForm] = useState({ date: dayString(), category: "Other", amount: "", note: "" });
  const [range, setRange] = useState("30");

  const submit = () => {
    const row = addExpense({ ...form, amount: toCents(form.amount), date: dateToIso(form.date) });
    if (!row) return showToast("Enter an amount greater than 0", "error");
    setForm({ ...form, amount: "", note: "" });
    showToast(`Expense added · ${money(row.amount, cur)}`);
  };

  const list = useMemo(() => {
    const r = RANGES.find((x) => x.id === range);
    let from = null;
    if (r.days !== null) {
      from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - r.days);
    }
    return expenses
      .filter((e) => !from || new Date(e.date) >= from)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [expenses, range]);

  const total = list.reduce((s, e) => s + e.amount, 0);
  const byCategory = useMemo(() => {
    const m = new Map();
    list.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  return (
    <Shell title="Expenses" onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-pos-border bg-pos-tile p-3">
        <div className="w-40">
          <label className={label}>Date</label>
          <input type="date" value={form.date} max={dayString()} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
        </div>
        <div className="w-40">
          <label className={label}>Category</label>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className={label}>Amount ({cur})</label>
          <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={label}>Note (optional)</label>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} className={input} />
        </div>
        <button type="button" onClick={submit} className={`${primaryBtn} flex items-center gap-1.5`}>
          <Plus size={13} /> Add expense
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${range === r.id ? "bg-pos-blue text-white" : "bg-pos-tile text-muted-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-bold text-foreground">{money(total, cur)}</span>
        </p>
      </div>

      {byCategory.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {byCategory.map(([c, v]) => (
            <span key={c} className="rounded border border-pos-border bg-pos-tile px-2.5 py-1 text-[11px] text-foreground">
              {c}: <span className="font-semibold">{money(v, cur)}</span>
            </span>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">No expenses in this period.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-pos-border">
              <th className="py-2">Date</th>
              <th>Category</th>
              <th>Note</th>
              <th className="text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-b border-pos-border text-foreground">
                <td className="py-1.5">{shortDate(e.date)}</td>
                <td>{e.category}</td>
                <td className="text-muted-foreground">{e.note}</td>
                <td className="text-right">{money(e.amount, cur)}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete this ${money(e.amount, cur)} ${e.category} expense?`)) removeExpense(e.id);
                    }}
                    className="rounded p-1 text-pos-red hover:bg-pos-hover"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Record shop running costs here (rent, electricity, wages…). They are used to work out the real profit. Deleted expenses are recorded in the audit log.
      </p>
    </Shell>
  );
}
