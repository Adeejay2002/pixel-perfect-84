import { useState } from "react";
import { X, AlertTriangle, PackagePlus, Truck } from "lucide-react";
import { usePos } from "../../lib/pos/store";

// Opened by the toolbar bell: what is running low, and what is expired or about to expire.
// Everyone can look (stock is visible to cashiers); only the owner gets the buttons
// that open Goods Received / Suppliers.
export default function AlertsPanel({ open, onClose, onOpenModule }) {
  const { stockAlerts, suppliers = [], isOwner } = usePos();
  const [tab, setTab] = useState("low");
  if (!open) return null;

  const { lowItems, expiredRows, soonRows, counts } = stockAlerts;
  const expiryRows = [...expiredRows, ...soonRows];
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";

  const tabBtn = (id, label, n, urgent) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold ${
        tab === id ? "border-b-2 border-pos-blue text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${n === 0 ? "bg-pos-tile text-muted-foreground" : urgent ? "bg-pos-red text-white" : "bg-pos-amber text-black"}`}>
        {n}
      </span>
    </button>
  );

  return (
    <div className="pos-no-print fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Stock alerts</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex border-b border-pos-border px-2">
          {tabBtn("low", "Low stock", lowItems.length, counts.out > 0)}
          {tabBtn("expiry", "Expiry", expiryRows.length, counts.expired > 0)}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === "low" &&
            (lowItems.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Nothing is running low.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-pos-border">
                    <th className="py-2">Product</th>
                    <th>Status</th>
                    <th className="text-right">In stock</th>
                    <th className="text-right">Reorder level</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {lowItems.map((i) => (
                    <tr key={i.product.id} className="border-b border-pos-border text-foreground">
                      <td className="py-1.5">{i.product.name}</td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${i.out ? "bg-pos-red text-white" : "bg-pos-amber/20 text-pos-amber"}`}>
                          {i.out ? "Out of stock" : "Low"}
                        </span>
                      </td>
                      <td className="text-right font-semibold">{i.stock}</td>
                      <td className="text-right text-muted-foreground">{i.hasLevel ? i.level : `${i.level} (default)`}</td>
                      <td className="text-muted-foreground">{supplierName(i.product.supplierId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {tab === "expiry" &&
            (expiryRows.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">No expired or soon-to-expire stock.</p>
            ) : (
              <>
                {expiredRows.length > 0 && (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-pos-red bg-pos-red/10 px-3 py-2 text-xs text-pos-red">
                    <AlertTriangle size={14} /> {expiredRows.reduce((s, r) => s + r.est, 0)} unit(s) have expired. Take them off the shelf.
                  </div>
                )}
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-pos-border">
                      <th className="py-2">Product</th>
                      <th>Expiry</th>
                      <th>Status</th>
                      <th className="text-right">Est. units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiryRows.map((r) => (
                      <tr key={r.id} className="border-b border-pos-border text-foreground">
                        <td className="py-1.5">{r.name}</td>
                        <td>{r.expiry}</td>
                        <td>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${r.days < 0 ? "bg-pos-red/20 text-pos-red" : "bg-pos-amber/20 text-pos-amber"}`}>
                            {r.days < 0 ? `Expired ${-r.days} day(s) ago` : r.days === 0 ? "Expires today" : `${r.days} day(s) left`}
                          </span>
                        </td>
                        <td className="text-right">{r.est}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-muted-foreground">Units are an estimate: the oldest stock is assumed to be sold first.</p>
              </>
            ))}
        </div>

        {isOwner && (
          <div className="flex gap-2 border-t border-pos-border p-3">
            <button
              type="button"
              onClick={() => onOpenModule("purchases")}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded bg-pos-blue text-xs font-semibold text-white"
            >
              <PackagePlus size={14} /> Receive goods
            </button>
            <button
              type="button"
              onClick={() => onOpenModule("suppliers")}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
            >
              <Truck size={14} /> Suppliers &amp; reorder levels
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
