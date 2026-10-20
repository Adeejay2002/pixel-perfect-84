import { Lock, Minus, Plus, Trash2, Percent, User } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

export default function TicketPanel() {
  const {
    saleNo,
    lines,
    totals,
    settings,
    customers,
    customerId,
    setCustomerId,
    setLineStatus,
    setLineQty,
    voidOrder,
    showToast,
    billDiscountAvailable,
    billDiscountOn,
    toggleBillDiscount,
    selectedLine,
    setSelectedLineId,
  } = usePos();
  const c = settings.currency;
  return (
    <aside className="flex w-[35%] min-w-[340px] flex-col border-l border-pos-border bg-pos-panel">
      <div className="flex items-center justify-between border-b border-pos-border px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">Sale #{saleNo}</span>
        <span className="text-[11px] text-muted-foreground">{new Date().toLocaleDateString()}</span>
      </div>

      <div className="flex items-center gap-2 border-b border-pos-border px-3 py-2">
        <User size={15} className="shrink-0 text-muted-foreground" />
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded border border-pos-border bg-pos-tile px-2 text-xs text-foreground outline-none"
        >
          {customers.map((cu) => (
            <option key={cu.id} value={cu.id}>
              {cu.name}
              {cu.debt > 0 ? ` · owes ${money(cu.debt, c)}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto">
        {lines.length === 0 && (
          <p className="p-6 text-center text-xs text-muted-foreground">No items in this ticket</p>
        )}
        {lines.map((l) => {
          const unit = l.unitPrice ?? l.price;
          const discounted = unit !== l.price;
          return (
            <div
              key={l.id}
              onClick={() => {
                if (l.status === "void") return;
                setSelectedLineId(l.id);
                setLineQty(l.id, l.qty + 1);
              }}
              className={`flex cursor-pointer items-start gap-2 border-b border-pos-border px-3 py-2 ${
                l.status === "void" ? "opacity-60" : ""
              } ${selectedLine?.id === l.id ? "bg-pos-hover" : ""}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLineStatus(l.id, l.status === "confirmed" ? "new" : "confirmed");
                }}
                className="mt-0.5 shrink-0"
              >
                {l.status === "confirmed" ? (
                  <Lock size={14} className="text-pos-green" />
                ) : l.status === "void" ? (
                  <Minus size={14} className="text-pos-red" />
                ) : (
                  <Plus size={14} className="text-muted-foreground" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-semibold ${
                    l.status === "void" ? "text-pos-red line-through" : "text-foreground"
                  }`}
                >
                  {l.name}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  #{saleNo} ·{" "}
                  {new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {discounted && <span className="mr-1 line-through">{money(l.price, c)}</span>}
                  <span className={discounted ? "text-pos-green" : ""}>{money(unit, c)}</span>
                  {discounted && (
                    <span className="ml-1 text-pos-amber">-{l.discountPercent}%</span>
                  )}{" "}
                  · {money(unit * l.qty, c)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLineId(l.id);
                    setLineQty(l.id, l.qty - 1);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-pos-tile text-muted-foreground hover:bg-pos-hover"
                >
                  <Minus size={12} />
                </button>
                <button
                  type="button"
                  title="Tap to type quantity"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (l.status === "void") return;
                    setSelectedLineId(l.id);
                    setQtyEditId(l.id);
                  }}
                  className="h-6 min-w-8 rounded bg-pos-tile px-1 text-center text-sm font-bold text-foreground hover:bg-pos-hover"
                >
                  {l.qty}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedLineId(l.id);
                    setLineQty(l.id, l.qty + 1);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-pos-tile text-muted-foreground hover:bg-pos-hover"
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLineStatus(l.id, l.status === "void" ? "new" : "void");
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded bg-pos-tile text-pos-red hover:bg-pos-hover"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-pos-border px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{money(totals.subtotal, c)}</span>
        </div>
        {totals.productDiscount > 0 && (
          <div className="mt-1 flex justify-between text-pos-amber">
            <span>Product discounts</span>
            <span>-{money(totals.productDiscount, c)}</span>
          </div>
        )}
        {totals.billDiscount > 0 && (
          <div className="mt-1 flex justify-between text-pos-amber">
            <span>Bill discount ({totals.billDiscountPercent}%)</span>
            <span>-{money(totals.billDiscount, c)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-muted-foreground">
          <span>Tax ({Math.round(settings.taxRate * 100)}%)</span>
          <span>{money(totals.tax, c)}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-pos-border pt-2">
          <span className="text-base font-semibold text-foreground">Total</span>
          <span className="text-2xl font-bold text-pos-green">{money(totals.total, c)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-pos-border p-3">
        <button
          type="button"
          onClick={() => {
            if (!lines.length) return;
            const ok = window.confirm("Void this order? This cannot be undone.");
            if (!ok) return;
            const reason = window.prompt("Reason for voiding (optional):", "") || "";
            voidOrder(reason);
          }}
          className="h-10 rounded-md bg-pos-red text-xs font-semibold text-white hover:brightness-110"
        >
          Void order
        </button>
        <button
          type="button"
          disabled={!billDiscountAvailable}
          onClick={toggleBillDiscount}
          className={`flex h-10 items-center justify-center gap-1 rounded-md text-xs font-semibold disabled:opacity-40 ${
            billDiscountOn
              ? "bg-pos-amber text-black"
              : "bg-pos-tile text-foreground hover:bg-pos-hover"
          }`}
        >
          <Percent size={13} /> {billDiscountOn ? "Remove" : "Discount"}
        </button>
        <button
          type="button"
          onClick={() => showToast("Ticket locked")}
          className="flex h-10 items-center justify-center gap-1 rounded-md bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
        >
          <Lock size={13} /> Lock
        </button>
      </div>
    </aside>
  );
}
