import { useEffect, useRef, useState } from "react";
import { X, Delete } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

function Btn({ children, tone = "neutral", onClick, className = "" }) {
  const tones = {
    neutral: "bg-pos-tile text-foreground hover:bg-pos-hover",
    green: "bg-pos-green text-black hover:brightness-110",
    amber: "bg-pos-amber text-black hover:brightness-110",
    red: "bg-pos-red text-white hover:brightness-110",
  };
  return (
    <button type="button" onClick={onClick} className={`h-11 rounded-md text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

export default function PaymentModal({ open, onClose }) {
  const {
    lines, totals, settings, completeSale, newSale, voidOrder, holdSale, showToast,
    billDiscountAvailable, billDiscountOn, toggleBillDiscount, customerId, customers,
  } = usePos();
  const [method, setMethod] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const c = settings.currency;
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open || method !== "Cash") return undefined;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setTendered((v) => v + e.key);
      } else if (e.key === "." || e.key === ",") {
        e.preventDefault();
        setTendered((v) => (v.includes(".") ? v : (v || "0") + "."));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setTendered((v) => v.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        confirmRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, method]);

  if (!open) return null;
  const tenderedCents = Math.round((parseFloat(tendered || "0") || 0) * 100);
  const change = tenderedCents - totals.total;

  const selectedCustomer = customers?.find((c) => c.id === customerId);
  const isWalkIn = !selectedCustomer || selectedCustomer.name === "Walk-in";

  const confirm = () => {
    if (!lines.length) {
      showToast("Ticket is empty", "error");
      return;
    }
    if (method === "Cash" && tenderedCents < totals.total) {
      showToast("Insufficient cash tendered", "error");
      return;
    }
    if (method === "Account" && isWalkIn) {
      showToast("Pick a real customer (not Walk-in) to sell on account", "error");
      return;
    }
    completeSale(method, tenderedCents);
    setTendered("");
    onClose();
  };
  confirmRef.current = confirm;

  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex w-[38%] flex-col border-r border-pos-border">
          <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Bill preview</span>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {lines.filter((l) => l.status !== "void").map((l) => {
              const unit = l.unitPrice ?? l.price;
              return (
                <div key={l.id} className="flex items-center justify-between border-b border-pos-border px-4 py-2 text-xs">
                  <span className="truncate text-foreground">
                    {l.qty} × {l.name}
                    {unit !== l.price && (
                      <span className="ml-1 text-[10px] text-pos-amber">-{l.discountPercent}%</span>
                    )}
                  </span>
                  <span className="ml-2 shrink-0 text-muted-foreground">
                    {unit !== l.price && <span className="mr-1 line-through">{money(l.price * l.qty, c)}</span>}
                    {money(unit * l.qty, c)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-pos-border px-4 py-3 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(totals.subtotal, c)}</span></div>
            {totals.productDiscount > 0 && (
              <div className="mt-1 flex justify-between text-pos-amber"><span>Product discounts</span><span>-{money(totals.productDiscount, c)}</span></div>
            )}
            {totals.billDiscount > 0 && (
              <div className="mt-1 flex justify-between text-pos-amber">
                <span>Bill discount ({totals.billDiscountPercent}%)</span><span>-{money(totals.billDiscount, c)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-muted-foreground"><span>Tax</span><span>{money(totals.tax, c)}</span></div>
            <div className="mt-2 flex items-baseline justify-between border-t border-pos-border pt-2">
              <span className="font-semibold text-foreground">Total</span>
              <span className="text-2xl font-bold text-pos-green">{money(totals.total, c)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-2">
            <Btn onClick={() => showToast("Search", "info")}>F3 Search</Btn>
            <Btn onClick={() => showToast("Quantity", "info")}>F4 Quantity</Btn>
            <Btn onClick={() => { newSale(); onClose(); }}>F8 New sale</Btn>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {["Cash", "Credit Card", "Debit Card", "Check", "Account"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                disabled={m === "Account" && isWalkIn}
                className={`h-20 rounded-md text-sm font-semibold transition-colors disabled:opacity-30 ${
                  method === m ? "bg-pos-blue text-white" : "bg-pos-tile text-foreground hover:bg-pos-hover"
                }`}
              >
                {m === "Cash" ? "F12 Cash" : m === "Account" ? "Account (on credit)" : m}
              </button>
            ))}
          </div>
          {method === "Account" && !isWalkIn && (
            <p className="text-[11px] text-pos-amber">
              {selectedCustomer.name}'s account balance will increase by {money(totals.total, c)}.
            </p>
          )}

          {method === "Cash" && (
            <div className="rounded-md border border-pos-border bg-pos-tile p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Tendered</p>
                  <p className="text-xl font-bold text-foreground">{c} {tendered || "0.00"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-muted-foreground">Change due</p>
                  <p className={`text-xl font-bold ${change < 0 ? "text-pos-red" : "text-pos-green"}`}>
                    {money(Math.max(0, change), c)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {pad.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setTendered((v) => (k === "del" ? v.slice(0, -1) : k === "." && v.includes(".") ? v : v + k))
                    }
                    className="h-11 rounded bg-pos-panel text-sm font-semibold text-foreground hover:bg-pos-hover"
                  >
                    {k === "del" ? <Delete className="mx-auto" size={15} /> : k}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Btn
              tone={billDiscountOn ? "amber" : "neutral"}
              onClick={() => (billDiscountAvailable ? toggleBillDiscount() : showToast("Bill discount is disabled by the owner", "error"))}
            >
              F2 Discount {billDiscountAvailable ? `${settings.billDiscountPercent}%` : "(off)"}
            </Btn>
            <Btn onClick={() => showToast("Comment added", "info")}>Comment</Btn>
            <Btn onClick={() => showToast("Cash drawer opened")}>Cash drawer</Btn>
          </div>

          <div className="mt-auto grid grid-cols-6 gap-2">
            <Btn onClick={() => { holdSale(); onClose(); }}>F9 Save</Btn>
            <Btn tone="green" onClick={confirm} className="col-span-2">F10 Payment</Btn>
            <Btn onClick={() => showToast("Transfer", "info")}>F7 Transfer</Btn>
            <Btn onClick={() => showToast("Locked")}>Lock</Btn>
            <Btn tone="red" onClick={() => {
              if (!lines.length) return;
              const ok = window.confirm("Void this order? This cannot be undone.");
              if (!ok) return;
              const reason = window.prompt("Reason for voiding (optional):", "") || "";
              voidOrder(reason);
              onClose();
            }}>Void</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
