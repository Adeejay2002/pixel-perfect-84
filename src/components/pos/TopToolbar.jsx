import {
  Search, User, ArrowLeftRight, Percent, MessageSquare, FilePlus2, Undo2,
  UserCircle2, Wallet, Save, CreditCard, Banknote, Menu, ListChecks,
} from "lucide-react";
import { usePos } from "../../lib/pos/store";
import { ROLE_LABEL } from "../../lib/pos/config";
import ThemeToggle from "./ThemeToggle";

function TBtn({ icon: Icon, label, onClick, tone = "neutral", badge, onBadgeClick }) {
  const tones = {
    neutral: "text-foreground hover:bg-pos-hover",
    green: "bg-pos-green text-black hover:brightness-110",
    active: "bg-pos-amber text-black hover:brightness-110",
    red: "text-pos-red hover:bg-pos-hover",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-14 min-w-[74px] flex-col items-center justify-center gap-1 rounded-md px-3 text-[11px] font-medium transition-colors ${tones[tone]}`}
    >
      <Icon size={18} />
      <span className="whitespace-nowrap">{label}</span>
      {badge > 0 && (
        <span
          role={onBadgeClick ? "button" : undefined}
          onClick={onBadgeClick ? (e) => { e.stopPropagation(); onBadgeClick(); } : undefined}
          className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pos-red px-1 text-[9px] font-bold text-white"
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function TopToolbar({ onPayment, onMenu, onFocusSearch, onHistory, onHeld }) {
  const {
    session, logout, heldSales, holdSale, newSale, showToast,
    billDiscountAvailable, billDiscountOn, toggleBillDiscount, settings,
  } = usePos();
  const who = ROLE_LABEL[session?.role] || "User";

  return (
    <header className="flex h-16 w-full shrink-0 items-center gap-0.5 border-b border-pos-border bg-pos-panel px-2">
      <TBtn icon={Search} label="Search" onClick={onFocusSearch} />
      <TBtn icon={User} label="Customer" onClick={() => showToast("Customer selector is in the ticket panel", "info")} />
      <TBtn icon={ArrowLeftRight} label="Transfer" onClick={() => showToast("Transfer not available in demo", "info")} />
      {billDiscountAvailable && (
        <TBtn
          icon={Percent}
          label={`Discount ${settings.billDiscountPercent}%`}
          tone={billDiscountOn ? "active" : "neutral"}
          onClick={toggleBillDiscount}
        />
      )}
      <TBtn icon={MessageSquare} label="Comment" onClick={() => showToast("Comment added to sale", "info")} />
      <TBtn icon={FilePlus2} label="New sale" onClick={newSale} />
      <TBtn icon={Undo2} label="Bill history" onClick={onHistory} />
      <TBtn icon={UserCircle2} label={who} onClick={logout} />
      <TBtn icon={Wallet} label="Cash drawer" onClick={() => showToast("Cash drawer opened")} />

      <div className="ml-auto flex items-center gap-0.5">
        <TBtn icon={Save} label="F9 Save sale" onClick={holdSale} badge={heldSales.length} onBadgeClick={onHeld} />
        <TBtn icon={ListChecks} label={`Held (${heldSales.length})`} onClick={onHeld} />
        <TBtn icon={CreditCard} label="F10 Payment" onClick={onPayment} tone="green" />
        <TBtn icon={Banknote} label="F12 Cash" onClick={onPayment} />
        <ThemeToggle className="ml-1" />
        <button
          type="button"
          onClick={onMenu}
          className="ml-1 flex h-14 w-12 items-center justify-center rounded-md text-foreground hover:bg-pos-hover"
        >
          <Menu size={20} />
        </button>
      </div>
    </header>
  );
}
