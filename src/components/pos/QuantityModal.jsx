import { useEffect, useState } from "react";
import { X, Delete } from "lucide-react";
import { usePos } from "../../lib/pos/store";

export default function QuantityModal() {
  const { lines, setLineQty, showToast, qtyEditId, setQtyEditId } = usePos();
  const open = !!qtyEditId;
  const onClose = () => setQtyEditId(null);
  const [value, setValue] = useState("");
  const active = lines.find((l) => l.id === qtyEditId && l.status !== "void");

  useEffect(() => {
    setValue("");
  }, [qtyEditId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setValue((v) => (v + e.key).slice(0, 4));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setValue((v) => v.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  function apply() {
    if (!active) {
      showToast("No line selected", "error");
      onClose();
      return;
    }
    const qty = parseInt(value || "0", 10);
    if (!qty || qty < 1) {
      showToast("Enter a quantity of 1 or more", "error");
      return;
    }
    setLineQty(active.id, qty);
    onClose();
  }

  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "del"];

  return (
    <div className="pos-no-print fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xs overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <span className="truncate text-sm font-semibold text-foreground">
            Quantity · {active ? active.name : "no line"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <div className="mb-3 rounded-md border border-pos-border bg-pos-tile px-3 py-3 text-right">
            <p className="text-[10px] uppercase text-muted-foreground">New quantity</p>
            <p className="font-mono text-3xl font-bold text-foreground">{value || "0"}</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {pad.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setValue((v) => (k === "del" ? v.slice(0, -1) : (v + k).slice(0, 4)))
                }
                className="h-12 rounded bg-pos-tile text-sm font-semibold text-foreground hover:bg-pos-hover"
              >
                {k === "del" ? <Delete className="mx-auto" size={15} /> : k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={apply}
            className="mt-3 h-11 w-full rounded-md bg-pos-green text-sm font-semibold text-black hover:brightness-110"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
