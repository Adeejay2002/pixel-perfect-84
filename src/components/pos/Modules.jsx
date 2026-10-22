import { useMemo, useState } from "react";
import { useRef } from "react";
import { X, AlertTriangle, Download, Upload, Trash2, Undo2, UserPlus, Plus, ImagePlus } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePos, money } from "../../lib/pos/store";
import { hashCode } from "../../lib/pos/config";
import { Suppliers, Purchases, Expenses } from "./StockModules";

// Triggers a browser download of `text` as a file — same pattern exportData()
// in store.jsx already uses for the JSON backup, just reused here for CSV.
function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Minimal CSV cell escaping: wrap in quotes and double up any embedded quotes
// whenever the value contains a comma, quote or newline.
function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\n");
}

// Downscales + re-encodes an uploaded logo image client-side before it's
// stored (as a data URL) in settings and, from there, in every future
// sale's snapshot and the printed receipt HTML. Keeps the persisted JSON
// file small and the printed logo crisp without needing a server upload.
function readImageAsDataUrl(file, maxDim = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Not a valid image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


// Small dependency-free CSV parser (handles quoted fields with embedded
// commas/newlines) used by the "Import products / customers" buttons.
// Returns an array of lowercase-keyed row objects, one per data row.
function parseCsvToObjects(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

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

function Inventory({ onClose }) {
  const { products, updateProduct, removeProduct, settings, bulkAddProducts, showToast } = usePos();
  const low = products.filter((p) => p.stock < 5);
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await readFileAsText(file);
      const rows = parseCsvToObjects(text);
      if (!rows.length) return showToast("That CSV file has no data rows", "error");
      const { added, skipped } = bulkAddProducts(rows);
      showToast(
        skipped
          ? `Imported ${added} product(s), skipped ${skipped} (duplicate barcode or missing name)`
          : `Imported ${added} product(s)`,
      );
    } catch {
      showToast("Couldn't read that CSV file", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Shell title="Inventory" onClose={onClose}>
      {low.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-pos-red bg-pos-red/10 px-3 py-2 text-xs text-pos-red">
          <AlertTriangle size={14} /> {low.length} item(s) below 5 units: {low.map((p) => p.name).join(", ")}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between rounded-md border border-pos-border bg-pos-tile px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Bulk-add products from a CSV file (columns: name, category, price, cost, stock, barcode, discountPercent).
        </p>
        <div>
          <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
          <button
            type="button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded bg-pos-blue px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Upload size={13} /> {importing ? "Importing…" : "Import products (CSV)"}
          </button>
        </div>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-pos-border">
            <th className="py-2">Product</th><th>Code</th><th>Category</th><th>Price</th><th>Cost</th>
            <th>Disc %</th><th>Stock</th><th />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-pos-border text-foreground">
              <td className="py-1.5">
                <input
                  value={p.name}
                  onChange={(e) => updateProduct(p.id, { name: e.target.value })}
                  className="w-full rounded bg-pos-tile px-2 py-1 outline-none"
                />
              </td>
              <td className="text-muted-foreground">{p.code}</td>
              <td className="text-muted-foreground">{p.category}</td>
              <td>
                <input
                  type="number"
                  value={p.price / 100}
                  onChange={(e) => updateProduct(p.id, { price: Math.round(Number(e.target.value) * 100) })}
                  className="w-20 rounded bg-pos-tile px-2 py-1 outline-none"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={p.cost / 100}
                  onChange={(e) => updateProduct(p.id, { cost: Math.round(Number(e.target.value) * 100) })}
                  className="w-20 rounded bg-pos-tile px-2 py-1 outline-none"
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={p.discountPercent || 0}
                  onChange={(e) =>
                    updateProduct(p.id, { discountPercent: Math.min(100, Math.max(0, Number(e.target.value))) })
                  }
                  className="w-16 rounded bg-pos-tile px-2 py-1 outline-none"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={p.stock}
                  onChange={(e) => updateProduct(p.id, { stock: Number(e.target.value) })}
                  className={`w-16 rounded px-2 py-1 outline-none ${p.stock < 5 ? "bg-pos-red/20 text-pos-red" : "bg-pos-tile"}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => removeProduct(p.id)}
                  className="rounded p-1 text-pos-red hover:bg-pos-hover"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Selling price shown to cashiers is the discounted price · cost price is owner-only ({settings.currency}).
      </p>
    </Shell>
  );
}

function Debt({ onClose }) {
  const { customers, settleDebt, addCustomer, settings, showToast, bulkAddCustomers } = usePos();
  const list = Array.isArray(customers) ? customers.filter((c) => c.name !== "Walk-in") : [];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await readFileAsText(file);
      const rows = parseCsvToObjects(text);
      if (!rows.length) return showToast("That CSV file has no data rows", "error");
      const { added, skipped } = bulkAddCustomers(rows);
      showToast(
        skipped
          ? `Imported ${added} customer(s), skipped ${skipped} (duplicate name or missing name)`
          : `Imported ${added} customer(s)`,
      );
    } catch {
      showToast("Couldn't read that CSV file", "error");
    } finally {
      setImporting(false);
    }
  };

  const submit = () => {
    const created = addCustomer(name, phone);
    if (!created) return showToast("Customer name is required", "error");
    setName("");
    setPhone("");
    showToast(`${created.name} added`);
  };

  return (
    <Shell title="Debt Management" onClose={onClose}>
      <div className="mb-3 flex items-center justify-between rounded-md border border-pos-border bg-pos-tile px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Bulk-add customers from a CSV file (columns: name, phone, debt).
        </p>
        <div>
          <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} className="hidden" />
          <button
            type="button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded bg-pos-blue px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Upload size={13} /> {importing ? "Importing…" : "Import customers (CSV)"}
          </button>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-pos-border bg-pos-tile p-3">
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-[11px] text-muted-foreground">Customer name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-[11px] text-muted-foreground">Phone (optional)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="h-9 rounded bg-pos-blue px-4 text-xs font-semibold text-white"
        >
          Add customer
        </button>
      </div>

      {list.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">No customers yet — add one above.</p>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-pos-border bg-pos-tile px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.phone || "No phone"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${c.debt > 0 ? "text-pos-red" : "text-pos-green"}`}>
                  {money(c.debt, settings.currency)}
                </span>
                <button
                  type="button"
                  disabled={c.debt === 0}
                  onClick={() => { settleDebt(c.id, c.debt); showToast(`${c.name} debt settled`); }}
                  className="h-8 rounded bg-pos-green px-3 text-xs font-semibold text-black disabled:opacity-40"
                >
                  Settle Debt
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        A customer's debt increases automatically when a sale is completed using the "Account" payment method at checkout.
      </p>
    </Shell>
  );
}

const RANGES = [
  { id: "day", label: "Day", ms: 24 * 3600 * 1000 },
  { id: "week", label: "Week", ms: 7 * 24 * 3600 * 1000 },
  { id: "month", label: "Month", ms: 30 * 24 * 3600 * 1000 },
];

function Reports({ onClose }) {
  const { sales, settings, showToast } = usePos();
  const [range, setRange] = useState("day");
  const c = settings.currency;

  const active = RANGES.find((r) => r.id === range);
  const inRange = useMemo(() => {
    const from = Date.now() - active.ms;
    return sales.filter((s) => !s.refunded && new Date(s.date).getTime() >= from);
  }, [sales, active]);

  const summary = useMemo(() => {
    const revenue = inRange.reduce((s, x) => s + (x.revenue ?? x.total ?? 0), 0);
    const cost = inRange.reduce((s, x) => s + (x.cost ?? 0), 0);
    const profit = inRange.reduce((s, x) => s + (x.profit ?? 0), 0);
    return { revenue, cost, profit };
  }, [inRange]);

  const perItem = useMemo(() => {
    const map = new Map();
    inRange.forEach((s) =>
      (s.items || []).forEach((i) => {
        const cur = map.get(i.productId) || { name: i.name, qty: 0, revenue: 0, cost: 0 };
        cur.qty += i.qty;
        cur.revenue += i.lineTotal;
        cur.cost += i.cost * i.qty;
        map.set(i.productId, cur);
      }),
    );
    return [...map.values()].map((r) => ({ ...r, profit: r.revenue - r.cost })).sort((a, b) => b.revenue - a.revenue);
  }, [inRange]);

  // Day-by-day revenue trend for the last 14 days — independent of the
  // Day/Week/Month toggle above, so it always shows how sales are trending
  // rather than just the currently selected window.
  const TREND_DAYS = 14;
  const dailyTrend = useMemo(() => {
    const byDay = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, {
        key,
        label: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        revenue: 0,
      });
    }
    sales.forEach((s) => {
      if (s.refunded) return;
      const key = new Date(s.date).toISOString().slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket.revenue += s.revenue ?? s.total ?? 0;
    });
    return [...byDay.values()];
  }, [sales]);

  const exportCsv = () => {
    if (inRange.length === 0) {
      showToast("Nothing to export in this range", "error");
      return;
    }
    const headers = ["Bill No", "Date", "Cashier", "Customer", "Revenue", "Cost", "Profit"];
    const rows = inRange.map((s) => [
      s.saleNo,
      new Date(s.date).toLocaleString(),
      s.cashierName || "",
      s.customerName || "",
      ((s.revenue ?? s.total ?? 0) / 100).toFixed(2),
      ((s.cost ?? 0) / 100).toFixed(2),
      ((s.profit ?? 0) / 100).toFixed(2),
    ]);
    const totalsRow = [
      "", "", "", "TOTAL",
      (summary.revenue / 100).toFixed(2),
      (summary.cost / 100).toFixed(2),
      (summary.profit / 100).toFixed(2),
    ];
    const csv = rowsToCsv(headers, [...rows, totalsRow]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`sales-report-${active.id}-${stamp}.csv`, csv);
    showToast("Report exported");
  };

  return (
    <Shell title="Sales Reports" onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={`h-9 rounded px-5 text-xs font-semibold ${
              range === r.id ? "bg-pos-blue text-white" : "bg-pos-tile text-foreground hover:bg-pos-hover"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="text-[11px] uppercase text-muted-foreground">Revenue</p>
          <p className="text-2xl font-bold text-pos-green">{money(summary.revenue, c)}</p>
        </div>
        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="text-[11px] uppercase text-muted-foreground">Cost</p>
          <p className="text-2xl font-bold text-pos-red">{money(summary.cost, c)}</p>
        </div>
        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="text-[11px] uppercase text-muted-foreground">Profit</p>
          <p className="text-2xl font-bold text-foreground">{money(summary.profit, c)}</p>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-pos-border bg-pos-tile p-4">
        <p className="mb-2 text-[11px] uppercase text-muted-foreground">
          Daily sales · last {TREND_DAYS} days
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={dailyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="dailyTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pos-green)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--pos-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--pos-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={{ stroke: "var(--pos-border)" }}
              tickLine={false}
              interval={Math.ceil(TREND_DAYS / 7) - 1}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v) => `${c}${Math.round(v / 100)}`}
            />
            <Tooltip
              formatter={(value) => [money(value, c), "Revenue"]}
              contentStyle={{
                background: "var(--pos-panel)",
                border: "1px solid var(--pos-border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--pos-green)"
              strokeWidth={2}
              fill="url(#dailyTrendFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mb-2 text-xs font-semibold text-foreground">
        Items sold · {active.label.toLowerCase()} ({inRange.length} bills)
      </p>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-pos-border">
            <th className="py-2">Item</th><th>Qty</th><th>Revenue</th><th>Cost</th><th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {perItem.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No sales in this range</td></tr>
          )}
          {perItem.map((r) => (
            <tr key={r.name} className="border-b border-pos-border text-foreground">
              <td className="py-1.5">{r.name}</td>
              <td>{r.qty}</td>
              <td>{money(r.revenue, c)}</td>
              <td className="text-muted-foreground">{money(r.cost, c)}</td>
              <td className="text-pos-green">{money(r.profit, c)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        onClick={exportCsv}
        className="mt-4 flex h-9 items-center gap-2 rounded bg-pos-tile px-4 text-xs font-semibold text-foreground hover:bg-pos-hover"
      >
        <Download size={14} /> Export CSV
      </button>
    </Shell>
  );
}

function History({ onClose, onOpenReceipt }) {
  const { sales, settings, canSeeCost, isOwner, refundSale, refundSaleItem, showToast } = usePos();
  const c = settings.currency;
  const list = [...sales].reverse();
  const [expanded, setExpanded] = useState(null);
  return (
    <Shell title="Bill History" onClose={onClose}>
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-pos-border">
            <th className="py-2">Bill</th><th>Date</th><th>Cashier</th><th>Method</th><th>Total</th>
            {canSeeCost && <th>Profit</th>}
            <th>Status</th><th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No bills yet</td></tr>
          )}
          {list.map((s) => (
            <>
              <tr
                key={s.id}
                onClick={() => onOpenReceipt(s)}
                className="cursor-pointer border-b border-pos-border text-foreground hover:bg-pos-hover"
              >
                <td className="py-2">#{s.saleNo ?? "—"}</td>
                <td className="text-muted-foreground">{new Date(s.date).toLocaleString()}</td>
                <td>{s.cashierName || "—"}</td>
                <td className="text-muted-foreground">{s.method || "—"}</td>

                <td className="font-semibold">{money(s.total || 0, c)}</td>
                {canSeeCost && <td className="text-pos-green">{money(s.profit || 0, c)}</td>}
                <td className={s.refunded ? "text-pos-red" : "text-muted-foreground"}>
                  {s.refunded ? "Refunded" : "Completed"}
                </td>
                <td className="whitespace-nowrap">
                  {isOwner && !s.refunded && (s.items || []).length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpanded(expanded === s.id ? null : s.id); }}
                        className="mr-1 rounded bg-pos-tile px-2 py-1 text-[11px] text-foreground hover:bg-pos-panel"
                      >
                        Items
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); refundSale(s.id); }}
                        className="inline-flex items-center gap-1 rounded bg-pos-tile px-2 py-1 text-[11px] text-pos-red hover:bg-pos-panel"
                      >
                        <Undo2 size={12} /> Refund all
                      </button>
                    </>
                  )}
                </td>
              </tr>
              {expanded === s.id && (s.items || []).length > 0 && (
                <tr key={`${s.id}-items`} className="border-b border-pos-border bg-pos-tile/40">
                  <td colSpan={canSeeCost ? 8 : 7} className="p-2">
                    <div className="space-y-1">
                      {s.items.map((it) => {
                        const remaining = it.qty - (it.refundedQty || 0);
                        return (
                          <div key={it.productId} className="flex items-center justify-between rounded bg-pos-panel px-2 py-1">
                            <span>
                              {it.name} — {remaining}/{it.qty} left{it.refundedQty ? ` (${it.refundedQty} refunded)` : ""}
                            </span>
                            <button
                              type="button"
                              disabled={remaining <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                const raw = window.prompt(`Refund how many "${it.name}"? (max ${remaining})`, "1");
                                if (raw === null) return;
                                const n = Math.min(remaining, Math.max(1, Number(raw) || 0));
                                if (n <= 0) return;
                                refundSaleItem(s.id, it.productId, n);
                                showToast(`Refunded ${n} × ${it.name}`);
                              }}
                              className="rounded bg-pos-red px-2 py-0.5 text-[11px] text-white disabled:opacity-30"
                            >
                              Refund
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">Tap any bill to reopen and reprint the receipt. Owners can tap "Items" to refund individual products from a bill.</p>
    </Shell>
  );
}

function Settings({ onClose }) {
  const {
    settings, updateSettings, setOwnerPasscode, showToast, products, addProduct,
    addCashier, removeCashier, categories, addCategory, renameCategory, removeCategory,
  } = usePos();
  const [newCategory, setNewCategory] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [ownerPc, setOwnerPc] = useState("");
  const [newCashierName, setNewCashierName] = useState("");
  const [newCashierPc, setNewCashierPc] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [disc, setDisc] = useState("");
  const [barcode, setBarcode] = useState("");
  const barcodeRef = useRef(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);

  const cashiers = settings.cashiers || [];

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Please choose an image file", "error");
    setLogoBusy(true);
    try {
      const dataUrl = await readImageAsDataUrl(file);
      updateSettings({ shopLogo: dataUrl });
      showToast("Shop logo updated");
    } catch {
      showToast("Couldn't read that image", "error");
    } finally {
      setLogoBusy(false);
    }
  };

  const savePc = (value, setter, label, reset) => {
    if (value.length < 4) return showToast("Use at least 4 digits", "error");
    setter(value);
    reset("");
    return showToast(`${label} passcode updated`);
  };

  const handleAddCashier = () => {
    const trimmed = newCashierName.trim();
    if (!trimmed) return showToast("Cashier name is required", "error");
    if (newCashierPc.length < 4) return showToast("Use at least 4 digits", "error");
    addCashier(trimmed, newCashierPc);
    setNewCashierName("");
    setNewCashierPc("");
    return showToast(`${trimmed} added`);
  };

  return (
    <Shell title="Settings" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">Shop details (printed on receipts)</p>
          <input
            value={settings.shopName}
            onChange={(e) => updateSettings({ shopName: e.target.value })}
            placeholder="Shop name"
            className="mb-2 h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
          <input
            value={settings.shopAddress}
            onChange={(e) => updateSettings({ shopAddress: e.target.value })}
            placeholder="Shop address"
            className="mb-2 h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
          <input
            value={settings.shopPhone}
            onChange={(e) => updateSettings({ shopPhone: e.target.value })}
            placeholder="Shop phone"
            className="mb-3 h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />

          <p className="mb-2 text-xs font-medium text-muted-foreground">Shop logo (printed at the top of receipts)</p>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-pos-border bg-pos-panel">
              {settings.shopLogo ? (
                <img src={settings.shopLogo} alt="Shop logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImagePlus size={18} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-1 gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => logoInputRef.current?.click()}
                className="h-9 flex-1 rounded bg-pos-blue px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                {logoBusy ? "Uploading…" : settings.shopLogo ? "Change logo" : "Upload logo"}
              </button>
              {settings.shopLogo && (
                <button
                  type="button"
                  onClick={() => { updateSettings({ shopLogo: "" }); showToast("Shop logo removed"); }}
                  className="flex h-9 items-center justify-center rounded bg-pos-tile px-3 text-pos-red hover:bg-pos-hover"
                  title="Remove logo"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">Owner passcode</p>
          {!settings.ownerPasscodeChanged && (
            <p className="mb-2 text-[11px] text-pos-amber">Owner passcode is still the default — change it.</p>
          )}
          <div className="flex gap-2">
            <input
              value={ownerPc}
              onChange={(e) => setOwnerPc(e.target.value.replace(/\D/g, ""))}
              placeholder="New owner passcode"
              className="h-9 flex-1 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => savePc(ownerPc, setOwnerPasscode, "Owner", setOwnerPc)}
              className="h-9 rounded bg-pos-green px-4 text-xs font-semibold text-black"
            >
              Save
            </button>
          </div>
        </div>

        <div className="rounded-md border border-pos-border bg-pos-tile p-4 md:col-span-2">
          <p className="mb-2 text-sm font-semibold text-foreground">Cashiers</p>
          <div className="mb-3 space-y-2">
            {cashiers.length === 0 && (
              <p className="text-[11px] text-pos-amber">No cashier accounts yet — add one so staff can log in.</p>
            )}
            {cashiers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded border border-pos-border bg-pos-panel px-3 py-2"
              >
                <span className="text-sm text-foreground">{c.name}</span>
                <button
                  type="button"
                  onClick={() => { removeCashier(c.id); showToast(`${c.name} removed`); }}
                  className="rounded p-1 text-pos-red hover:bg-pos-hover"
                  title="Delete cashier"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newCashierName}
              onChange={(e) => setNewCashierName(e.target.value)}
              placeholder="Cashier name"
              className="h-9 flex-1 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
            />
            <input
              value={newCashierPc}
              onChange={(e) => setNewCashierPc(e.target.value.replace(/\D/g, ""))}
              placeholder="Passcode"
              className="h-9 flex-1 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
            />
            <button
              type="button"
              onClick={handleAddCashier}
              className="flex h-9 items-center justify-center gap-1 rounded bg-pos-green px-4 text-xs font-semibold text-black"
            >
              <UserPlus size={14} /> Add cashier
            </button>
          </div>
        </div>


        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">Total-bill discount</p>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={!!settings.billDiscountEnabled}
              onChange={(e) => updateSettings({ billDiscountEnabled: e.target.checked })}
            />
            Allow cashiers to apply a whole-bill discount
          </label>
          <p className="mt-3 mb-1 text-[11px] text-muted-foreground">Discount percentage</p>
          <input
            type="number"
            min="0"
            max="100"
            value={settings.billDiscountPercent}
            onChange={(e) => updateSettings({ billDiscountPercent: Math.min(100, Math.max(0, Number(e.target.value))) })}
            className="h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
        </div>

        <div className="rounded-md border border-pos-border bg-pos-tile p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">Idle auto-lock</p>
          <input
            type="number"
            min="1"
            value={settings.idleMinutes}
            onChange={(e) => updateSettings({ idleMinutes: Number(e.target.value) })}
            className="h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Minutes of inactivity before re-lock.</p>
          <p className="mt-4 mb-2 text-sm font-semibold text-foreground">Tax rate</p>
          <input
            type="number"
            step="0.01"
            value={settings.taxRate}
            onChange={(e) => updateSettings({ taxRate: Number(e.target.value) })}
            className="h-9 w-full rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
          />
        </div>

        <div className="rounded-md border border-pos-border bg-pos-tile p-4 md:col-span-2">
          <p className="mb-2 text-sm font-semibold text-foreground">Categories</p>
          <div className="mb-3 space-y-2">
            {(categories || []).length === 0 && (
              <p className="text-[11px] text-muted-foreground">No categories yet — add one below.</p>
            )}
            {(categories || []).map((cat) => {
              const count = products.filter((p) => p.category === cat.name).length;
              return (
                <div key={cat.id} className="flex items-center gap-2 rounded border border-pos-border bg-pos-panel px-3 py-2">
                  <input
                    value={cat.name}
                    onChange={(e) => renameCategory(cat.id, e.target.value)}
                    className="h-8 flex-1 rounded bg-pos-tile px-2 text-sm text-foreground outline-none"
                  />
                  <span className="text-[11px] text-muted-foreground">{count} product(s)</span>
                  <button
                    type="button"
                    onClick={() => {
                      removeCategory(cat.id);
                      showToast(
                        count > 0
                          ? `${cat.name} deleted · ${count} product(s) moved to Uncategorized`
                          : `${cat.name} deleted`,
                      );
                    }}
                    className="rounded p-1 text-pos-red hover:bg-pos-hover"
                    title="Delete category"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name"
              className="h-9 flex-1 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!newCategory.trim()) return showToast("Category name is required", "error");
                addCategory(newCategory.trim());
                setNewCategory("");
                return showToast("Category added");
              }}
              className="flex h-9 items-center gap-1 rounded bg-pos-green px-4 text-xs font-semibold text-black"
            >
              <Plus size={14} /> Add category
            </button>
          </div>
        </div>

        <div className="rounded-md border border-pos-border bg-pos-tile p-4 md:col-span-2">
          <p className="mb-2 text-sm font-semibold text-foreground">Add product ({products.length} total)</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                document.getElementById("add-product-name")?.focus();
              }}
              placeholder="Scan or type barcode"
              className="h-9 w-40 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none"
            />
            <input id="add-product-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
              className="h-9 flex-1 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none" />
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price"
              className="h-9 w-28 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none" />
            <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost"
              className="h-9 w-28 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none" />
            <input value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="Disc %"
              className="h-9 w-24 rounded border border-pos-border bg-pos-panel px-3 text-sm text-foreground outline-none" />
            <select
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
              className="h-9 w-40 rounded border border-pos-border bg-pos-panel px-2 text-sm text-foreground outline-none"
            >
              <option value="">Uncategorized</option>
              {(categories || []).map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                if (!name || !price) return showToast("Name and price are required", "error");
                const trimmedBarcode = barcode.trim();
                if (trimmedBarcode && products.some((p) => p.barcode === trimmedBarcode)) {
                  return showToast("That barcode is already used by another product", "error");
                }
                addProduct({
                  name,
                  price: Math.round(Number(price) * 100),
                  cost: Math.round(Number(cost || 0) * 100),
                  discountPercent: Math.min(100, Math.max(0, Number(disc || 0))),
                  stock: 10,
                  category: productCategory || "Uncategorized",
                  code: String(Date.now()).slice(-4),
                  barcode: trimmedBarcode || String(Date.now()),
                });
                setName(""); setPrice(""); setCost(""); setDisc(""); setBarcode("");
                barcodeRef.current?.focus();
                showToast("Product added");
              }}
              className="h-9 rounded bg-pos-blue px-4 text-xs font-semibold text-white"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SystemPanel({ onClose }) {
  const { settings, rebootSystem, showToast, exportData, importData, validateBackup } = usePos();
  const [confirm, setConfirm] = useState(false);
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!validateBackup(parsed)) {
        showToast("That file is not a valid Jnex POS backup", "error");
        return;
      }
      setPending(parsed);
    } catch {
      showToast("Could not read that file — invalid JSON", "error");
    }
  };

  const closeConfirm = () => {
    setConfirm(false);
    setPin("");
  };
  // Erasing everything needs the owner passcode again, and a backup file is
  // downloaded first so a mistake can be undone with Import Data.
  const pinOk = hashCode(pin) === settings.ownerPasscodeHash;
  const doReboot = () => {
    if (!pinOk) return;
    exportData();
    rebootSystem();
    closeConfirm();
    showToast("System rebooted · all data erased (backup file downloaded first)");
    onClose();
  };

  return (
    <Shell title="System" onClose={onClose}>
      <div className="rounded-md border border-pos-border bg-pos-tile p-4">
        <p className="mb-2 text-sm font-semibold text-foreground">Backup &amp; restore</p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Export downloads every product, bill, customer, held sale and setting as a single JSON file.
          Import replaces all current data with a previously exported backup.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportData}
            className="flex h-9 items-center gap-2 rounded bg-pos-blue px-4 text-xs font-semibold text-white"
          >
            <Download size={14} /> Export Data
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-9 items-center gap-2 rounded bg-pos-panel px-4 text-xs font-semibold text-foreground hover:bg-pos-hover"
          >
            <Upload size={14} /> Import Data
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pos-border bg-pos-panel p-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Restore backup?</p>
            <p className="mb-4 text-xs text-muted-foreground">
              This will replace all current data with the imported backup. Continue?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="h-9 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { importData(pending); setPending(null); onClose(); }}
                className="h-9 rounded bg-pos-blue text-xs font-semibold text-white"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md border border-pos-red/60 bg-pos-red/10 p-4">
        <p className="mb-2 text-sm font-semibold text-pos-red">Reboot System</p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Erases all products, sales, customers and settings and returns the system to a blank slate.
        </p>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="h-9 rounded bg-pos-red px-4 text-xs font-semibold text-white"
        >
          Reboot System
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pos-border bg-pos-panel p-5">
            <p className="mb-2 text-sm font-semibold text-foreground">Reboot System?</p>
            <p className="mb-3 text-xs text-muted-foreground">
              This will permanently erase all products, sales, customers, and settings back to a blank slate.
              A backup file is downloaded first. Enter the owner passcode to continue.
            </p>
            <input
              type="password"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doReboot()}
              placeholder="Owner passcode"
              className="mb-4 h-9 w-full rounded border border-pos-border bg-pos-tile px-3 text-sm text-foreground outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="h-9 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!pinOk}
                onClick={doReboot}
                className="h-9 rounded bg-pos-red text-xs font-semibold text-white disabled:opacity-40"
              >
                Erase everything
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}


export default function Modules({ active, onClose, onOpenReceipt }) {
  const { isOwner } = usePos();
  if (!active) return null;
  if (active === "history") return <History onClose={onClose} onOpenReceipt={onOpenReceipt} />;
  if (!isOwner) return null;
  if (active === "inventory") return <Inventory onClose={onClose} />;
  if (active === "debt") return <Debt onClose={onClose} />;
  if (active === "purchases") return <Purchases onClose={onClose} />;
  if (active === "suppliers") return <Suppliers onClose={onClose} />;
  if (active === "expenses") return <Expenses onClose={onClose} />;
  if (active === "reports") return <Reports onClose={onClose} />;
  if (active === "settings") return <Settings onClose={onClose} />;
  if (active === "system") return <SystemPanel onClose={onClose} />;
  return null;
}
