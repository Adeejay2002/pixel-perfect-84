import { useEffect, useRef, useState } from "react";
import { PosProvider, usePos } from "../../lib/pos/store";
import LockScreen from "./LockScreen";
import TopToolbar from "./TopToolbar";
import ProductWorkspace from "./ProductWorkspace";
import TicketPanel from "./TicketPanel";
import PaymentModal from "./PaymentModal";
import HeldSalesModal from "./HeldSalesModal";
import QuantityModal from "./QuantityModal";
import MenuDrawer from "./MenuDrawer";
import Modules from "./Modules";
import ReceiptModal from "./Receipt";
import UpdateBanner from "./UpdateBanner";

function Toast() {
  const { toast } = usePos();
  if (!toast) return null;
  const tone =
    toast.tone === "error" ? "bg-pos-red text-white" : toast.tone === "info" ? "bg-pos-tile text-foreground" : "bg-pos-green text-black";
  return (
    <div className={`pos-no-print fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-md px-5 py-2.5 text-sm font-semibold shadow-xl ${tone}`}>
      {toast.message}
    </div>
  );
}

function Workspace() {
  const { session, hydrated, holdSale, clearCart, receipt, setReceipt, toggleBillDiscount } = usePos();
  const [payment, setPayment] = useState(false);
  const [menu, setMenu] = useState(false);
  const [module, setModule] = useState(null);
  const [held, setHeld] = useState(false);
  const [quantity, setQuantity] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    // capture phase so the shortcuts fire even while the search input has focus
    const onKey = (e) => {
      switch (e.key) {
        case "F10":
        case "F12":
          e.preventDefault(); setPayment(true); break;
        case "F9":
          e.preventDefault(); holdSale(); break;
        case "F8":
          e.preventDefault(); clearCart(); break;
        case "F4":
          e.preventDefault(); setQuantity(true); break;
        case "F3":
          e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select?.(); break;
        case "F2":
          e.preventDefault(); toggleBillDiscount(); break;
        case "Escape":
          setPayment(false); setMenu(false); setModule(null); setReceipt(null);
          setHeld(false); setQuantity(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [holdSale, clearCart, toggleBillDiscount, setReceipt]);

  if (!hydrated) return <div className="h-screen w-screen bg-pos-bg" />;
  if (!session) return <><LockScreen /><Toast /></>;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-pos-bg">
      <div className="pos-no-print flex min-h-0 flex-1 flex-col">
        <TopToolbar
          onPayment={() => setPayment(true)}
          onMenu={() => setMenu(true)}
          onHistory={() => setModule("history")}
          onHeld={() => setHeld(true)}
          onFocusSearch={() => searchRef.current?.focus()}
        />
        <div className="flex min-h-0 flex-1">
          <ProductWorkspace searchRef={searchRef} />
          <TicketPanel />
        </div>
      </div>
      <PaymentModal open={payment} onClose={() => setPayment(false)} />
      <HeldSalesModal open={held} onClose={() => setHeld(false)} />
      <QuantityModal open={quantity} onClose={() => setQuantity(false)} />
      <MenuDrawer open={menu} onClose={() => setMenu(false)} onSelect={setModule} />
      <Modules active={module} onClose={() => setModule(null)} onOpenReceipt={setReceipt} />
      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
      <Toast />
    </div>
  );
}

export default function PosApp() {
  return (
    <PosProvider>
      <Workspace />
      <UpdateBanner />
    </PosProvider>
  );
}
