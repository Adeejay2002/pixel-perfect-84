import { useState } from "react";
import { Lock, Minus, Plus, Trash2, Percent, User, Pencil } from "lucide-react";
import { usePos, money, fmtQty } from "../../lib/pos/store";
import { useTicketActions } from "./ticketActions";
import { useDialog } from "./Dialog";
import QuantityModal from "./QuantityModal";

export default function TicketPanel() {
  const {
    saleNo, lines, totals, settings, customers, customerId, setCustomerId,
    setLineStatus, setLineQty, updateLinePrice, showToast, lockScreen, comment,
    billDiscountAvailable, billDiscountOn, toggleBillDiscount,
  } = usePos();
  const c = settings.currency;
  const { editComment, voidWithReason } = useTicketActions();
  const dialog = useDialog();
  const [qtyLineId, setQtyLineId] = useState(null);

  // negotiated price for this bill only (the product's own price is not changed)
  const editPrice = async (l) => {
    const unitNow = l.unitPrice ?? l.price;
    const raw = await dialog.prompt({
      title: `Selling price · ${l.name}`,
      message: `Price per unit for this bill only (${c}).`,
      defaultValue: (unitNow / 100).toFixed(2),
      inputType: "number",
      inputMode: "decimal",
      confirmLabel: "Set price",
    });
    if (raw === null) return;
    const rupees = Number(raw);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      showToast("Enter a price greater than 0", "error");
      return;
    }
    updateLinePrice(l.id, Math.round(rupees * 100));
  };

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
      {comment && (
        <button
          type="button"
          onClick={editComment}
          title="Edit comment"
          className="w-full border-b border-pos-border bg-pos-tile px-3 py-1.5 text-left text-[11px] italic text-muted-foreground hover:bg-pos-hover"
        >
          “{comment}”
        </button>
      )}

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
              className={`flex items-start gap-2 border-b border-pos-border px-3 py-2 ${
                l.status === "void" ? "opacity-60" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setLineStatus(l.id, l.status === "confirmed" ? "new" : "confirmed")}
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
                  #{saleNo} · {new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {discounted && <span className="mr-1 line-through">{money(l.price, c)}</span>}
                  <button
                    type="button"
                    disabled={l.status === "void"}
                    onClick={() => editPrice(l)}
                    title="Change selling price for this bill"
                    className={`inline-flex items-center gap-0.5 rounded px-0.5 underline decoration-dotted hover:bg-pos-hover ${
                      discounted || l.priceOverridden ? "text-pos-green" : ""
                    }`}
                  >
                    {money(unit, c)}
                    <Pencil size={9} />
                  </button>
                  {discounted && <span className="ml-1 text-pos-amber">-{l.discountPercent}%</span>} ·{" "}
                  {money(Math.round(unit * l.qty), c)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLineQty(l.id, l.qty - 1)}
                  className="flex h-6 w-6 items-center justify-center rounded bg-pos-tile text-muted-foreground hover:bg-pos-hover"
                >
                  <Minus size={12} />
                </button>
                <button
                  type="button"
                  disabled={l.status === "void"}
                  onClick={() => setQtyLineId(l.id)}
                  title="Type quantity (kg / decimals)"
                  className="min-w-[2.25rem] rounded px-1 text-center text-sm font-bold text-foreground underline decoration-dotted hover:bg-pos-hover"
                >
                  {fmtQty(l.qty)}
                </button>
                <button
                  type="button"
                  onClick={() => setLineQty(l.id, l.qty + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded bg-pos-tile text-muted-foreground hover:bg-pos-hover"
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setLineStatus(l.id, l.status === "void" ? "new" : "void")}
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
          onClick={voidWithReason}
          className="h-10 rounded-md bg-pos-red text-xs font-semibold text-white hover:brightness-110"
        >
          Void order
        </button>
        <button
          type="button"
          disabled={!billDiscountAvailable}
          onClick={toggleBillDiscount}
          className={`flex h-10 items-center justify-center gap-1 rounded-md text-xs font-semibold disabled:opacity-40 ${
            billDiscountOn ? "bg-pos-amber text-black" : "bg-pos-tile text-foreground hover:bg-pos-hover"
          }`}
        >
          <Percent size={13} /> {billDiscountOn ? "Remove" : "Discount"}
        </button>
        <button
          type="button"
          onClick={lockScreen}
          className="flex h-10 items-center justify-center gap-1 rounded-md bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
        >
          <Lock size={13} /> Lock
        </button>
      </div>
      <QuantityModal open={!!qtyLineId} lineId={qtyLineId} onClose={() => setQtyLineId(null)} />
    </aside>
  );
}
