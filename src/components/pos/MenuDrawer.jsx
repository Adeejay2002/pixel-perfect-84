import { Boxes, HandCoins, BarChart3, Settings as Cog, Terminal, LogOut, X, ReceiptText } from "lucide-react";
import { usePos } from "../../lib/pos/store";
import { ROLE_LABEL } from "../../lib/pos/config";

export default function MenuDrawer({ open, onClose, onSelect }) {
  const { session, logout, role, isOwner } = usePos();
  if (!open) return null;

  const items = [{ id: "history", label: "Bill History", icon: ReceiptText }];
  if (isOwner) {
    items.unshift(
      { id: "inventory", label: "Inventory", icon: Boxes },
      { id: "debt", label: "Debt Management", icon: HandCoins },
      { id: "reports", label: "Sales Reports", icon: BarChart3 },
      { id: "settings", label: "Settings", icon: Cog },
    );
  }
  if (role === "super") items.push({ id: "developer", label: "Developer Panel", icon: Terminal });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="flex h-full w-72 flex-col border-l border-pos-border bg-pos-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">
            Menu · {ROLE_LABEL[session?.role] || "Guest"}
          </span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 p-2">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => { onSelect(i.id); onClose(); }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-foreground hover:bg-pos-hover"
            >
              <i.icon size={16} className="text-muted-foreground" /> {i.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="m-3 flex items-center justify-center gap-2 rounded-md bg-pos-red py-2.5 text-xs font-semibold text-white"
        >
          <LogOut size={14} /> Lock / Logout
        </button>
      </div>
    </div>
  );
}
