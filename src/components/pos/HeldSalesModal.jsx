import { X, Play, Trash2 } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

export default function HeldSalesModal({ open, onClose }) {
  const { heldSales, resumeHeld, discardHeld, settings } = usePos();
  if (!open) return null;
  const c = settings.currency;

  const heldTotal = (h) =>
    (h.lines || [])
      .filter((l) => l.status !== "void")
      .reduce((sum, l) => sum + (l.unitPrice ?? l.price) * l.qty, 0);

  return (
    <div className="pos-no-print fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Held sales ({heldSales.length})</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {heldSales.length === 0 && (
            <p className="p-8 text-center text-xs text-muted-foreground">No parked tickets</p>
          )}
          {heldSales.map((h) => (
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                resumeHeld(h.id);
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  resumeHeld(h.id);
                  onClose();
                }
              }}
              className="flex cursor-pointer items-center gap-3 border-b border-pos-border px-4 py-3 text-left hover:bg-pos-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Sale #{h.saleNo}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {new Date(h.at).toLocaleString()} · {h.cashierName || "—"} ·{" "}
                  {(h.lines || []).length} item{(h.lines || []).length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-pos-green">{money(heldTotal(h), c)}</span>
              <span className="flex shrink-0 items-center gap-1 rounded bg-pos-tile px-2 py-1 text-[11px] font-semibold text-foreground">
                <Play size={12} /> Resume
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  discardHeld(h.id);
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-pos-tile text-pos-red hover:bg-pos-hover"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
