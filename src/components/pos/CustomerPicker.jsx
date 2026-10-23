import { useMemo, useState } from "react";
import { X, UserPlus, Search } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

// Opened by the toolbar "Customer" button: search, pick, or add a customer.
export default function CustomerPicker({ open, onClose }) {
  const { customers, customerId, setCustomerId, addCustomer, settings, showToast } = usePos();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const c = settings.currency;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((x) => x.name.toLowerCase().includes(s) || String(x.phone || "").includes(s));
  }, [customers, q]);

  if (!open) return null;

  const pick = (id) => {
    setCustomerId(id);
    setQ("");
    setAdding(false);
    onClose();
  };
  const create = () => {
    const row = addCustomer(form.name, form.phone);
    if (!row) return showToast("Customer name is required", "error");
    showToast(`${row.name} added`);
    setForm({ name: "", phone: "" });
    pick(row.id);
  };
  const field = "h-9 w-full rounded border border-pos-border bg-pos-tile px-3 text-sm text-foreground outline-none";

  return (
    <div className="pos-no-print fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Select customer</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="border-b border-pos-border p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className={`${field} pl-8`} />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {list.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No customer found.</p>
          ) : (
            list.map((cu) => (
              <button
                key={cu.id}
                type="button"
                onClick={() => pick(cu.id)}
                className={`flex w-full items-center justify-between border-b border-pos-border px-4 py-2.5 text-left text-sm hover:bg-pos-hover ${
                  cu.id === customerId ? "bg-pos-tile font-semibold" : ""
                }`}
              >
                <span className="text-foreground">
                  {cu.name}
                  {cu.phone ? <span className="ml-2 text-xs text-muted-foreground">{cu.phone}</span> : null}
                </span>
                {cu.debt > 0 && <span className="text-xs text-pos-amber">owes {money(cu.debt, c)}</span>}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-pos-border p-3">
          {adding ? (
            <div className="space-y-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" className={field} autoFocus />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Phone (optional)"
                className={field}
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAdding(false)} className="h-9 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover">
                  Cancel
                </button>
                <button type="button" onClick={create} className="h-9 rounded bg-pos-blue text-xs font-semibold text-white">
                  Add &amp; select
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-9 w-full items-center justify-center gap-2 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
            >
              <UserPlus size={14} /> New customer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
