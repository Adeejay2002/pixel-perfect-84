import { usePos } from "../../lib/pos/store";
import { useTicketActions } from "./ticketActions";

// [Customer (Sell)] | [Supplier (Buy)]
export default function ModeToggle({ className = "" }) {
  const { posMode } = usePos();
  const { requestPosMode } = useTicketActions();
  const base = "px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors";
  return (
    <div className={`flex shrink-0 overflow-hidden rounded-md border border-pos-border ${className}`}>
      <button
        type="button"
        onClick={() => requestPosMode("customer")}
        className={`${base} ${posMode === "customer" ? "bg-pos-green text-black" : "bg-pos-tile text-foreground hover:bg-pos-hover"}`}
      >
        Customer (Sell)
      </button>
      <button
        type="button"
        onClick={() => requestPosMode("supplier")}
        className={`${base} ${posMode === "supplier" ? "bg-pos-amber text-black" : "bg-pos-tile text-foreground hover:bg-pos-hover"}`}
      >
        Supplier (Buy)
      </button>
    </div>
  );
}
