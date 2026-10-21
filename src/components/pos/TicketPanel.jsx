import { useEffect, useRef, useState } from "react";
import { Lock, Minus, Plus, Trash2, Percent, User, Delete } from "lucide-react";
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
    qtyEditId,
    setQtyEditId,
  } = usePos();
  const c = settings.currency;
  // The line being edited on the numpad popup (opened by triple-clicking an item, or F4)
  const editLine = lines.find((l) => l.id === qtyEditId && l.status !== "void") || null;
  // what the numpad has typed so far for that line
  const typedRef = useRef({ id: null, text: "" });
  // The popup closes by itself after 3 seconds without a key press; every press
  // bumps `tick`, which restarts the timer (so multi-digit quantities still work).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!qtyEditId) return undefined;
    const t = setTimeout(() => setQtyEditId(null), 3000);
    return () => clearTimeout(t);
  }, [qtyEditId, tick, setQtyEditId]);
  useEffect(() => {
    typedRef.current = { id: null, text: "" };
  }, [qtyEditId]);

  // Digits go straight into the line's quantity (shown live in its qty box, no Apply
  // button). The first digit replaces the quantity; further digits append while the
  // quantity is still what was typed.
  const pressKey = (k) => {
    if (!editLine) return;
    setTick((n) => n + 1);
    const t = typedRef.current;
    const continuing =
      t.id === editLine.id && t.text !== "" && parseInt(t.text, 10) === editLine.qty;
    let text = continuing ? t.text : "";
    if (k === "inc" || k === "dec") {
      typedRef.current = { id: editLine.id, text: "" };
      setLineQty(editLine.id, Math.max(1, editLine.qty + (k === "inc" ? 1 : -1)));
      return;
    }
    if (k === "del") text = (continuing ? t.text : String(editLine.qty)).slice(0, -1);
    else if (k === "C") text = "";
    else text = (text + k).replace(/^0+/, "").slice(0, 4);
    typedRef.current = { id: editLine.id, text };
    setLineQty(editLine.id, text !== "" ? parseInt(text, 10) : 1);
  };
  const pressKeyRef = useRef(pressKey);
  pressKeyRef.current = pressKey;

  // physical keyboard / numpad also types into the open popup
  useEffect(() => {
    if (!qtyEditId) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // numpad keys by physical code, so they work with NumLock on or off
      const digit =
        /^(?:Numpad|Digit)([0-9])$/.exec(e.code)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
      const act = (fn) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };
      if (digit !== null) act(() => pressKeyRef.current(digit));
      else if (e.key === "Backspace") act(() => pressKeyRef.current("del"));
      else if (e.key === "Delete" || e.code === "NumpadDecimal")
        act(() => pressKeyRef.current("C"));
      else if (e.key === "+" || e.code === "NumpadAdd") act(() => pressKeyRef.current("inc"));
      else if (e.key === "-" || e.code === "NumpadSubtract") act(() => pressKeyRef.current("dec"));
      else if (e.key === "Enter") act(() => setQtyEditId(null));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qtyEditId, setQtyEditId]);

  return (
    <aside className="relative flex w-[35%] min-w-[340px] flex-col border-l border-pos-border bg-pos-panel">
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
              onClick={(e) => {
                if (l.status === "void") return;
                setSelectedLineId(l.id);
                // triple click opens the quantity numpad for this item
                if (e.detail >= 3) setQtyEditId(l.id);
                else if (qtyEditId && qtyEditId !== l.id) setQtyEditId(null);
              }}
              className={`flex cursor-pointer select-none items-start gap-2 border-b border-pos-border px-3 py-2 ${
                l.status === "void" ? "opacity-60" : ""
              } ${selectedLine?.id === l.id ? "bg-pos-hover" : ""} ${
                qtyEditId === l.id ? "ring-2 ring-inset ring-pos-blue" : ""
              }`}
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
                <span
                  className={`flex h-6 min-w-8 items-center justify-center rounded px-1 text-center text-sm font-bold ${
                    qtyEditId === l.id
                      ? "bg-pos-blue text-white ring-2 ring-pos-blue/50"
                      : "bg-pos-tile text-foreground"
                  }`}
                >
                  {l.qty}
                </span>
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
      {editLine && (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t-2 border-pos-blue bg-pos-panel p-3 shadow-2xl">
          {/* 3-second countdown bar, restarts on every key press */}
          <div key={tick} className="pos-qty-timer absolute inset-x-0 top-0 h-0.5 bg-pos-blue" />
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{editLine.name}</span>
            <span className="rounded bg-pos-tile px-3 py-1 font-mono text-xl font-bold text-pos-green">
              {editLine.qty}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "del"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pressKey(k)}
                className="h-12 rounded bg-pos-tile text-lg font-semibold text-foreground hover:bg-pos-hover"
              >
                {k === "del" ? <Delete className="mx-auto" size={18} /> : k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setQtyEditId(null)}
            className="mt-2 h-11 w-full rounded-md bg-pos-green text-sm font-semibold text-black hover:brightness-110"
          >
            Done
          </button>
        </div>
      )}
    </aside>
  );
}
