import { useEffect } from "react";
import { X, Printer } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";

// Minimalist thermal receipt, same layout as the printed one (customer bills and supplier vouchers):
// RECEIPT INV-n / party name / YYYY/MM/DD, Item | QTY | Rs table (no unit price), TOTAL, thank-you footer.
const fmt2 = (cents) =>
  ((Number(cents) || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
};

export function ReceiptBody({ sale }) {
  const isVoucher = sale.kind === "voucher";
  const c = sale.currency || "Rs";
  const shop = sale.shop || {};
  let party = String((isVoucher ? sale.supplierName : sale.customerName) || "").trim();
  if (/^walk-?\s?in/i.test(party)) party = "";
  const discount = (Number(sale.productDiscount) || 0) + (Number(sale.billDiscount) || 0);
  const tax = Number(sale.tax) || 0;
  const change = !isVoucher && sale.method === "Cash" ? Math.max(0, (Number(sale.tendered) || 0) - (Number(sale.total) || 0)) : 0;
  const rule = "border-b border-black";
  return (
    <div id="pos-receipt" className="mx-auto w-[300px] bg-white p-4 font-serif text-[13px] font-bold leading-snug text-black">
      <div className="space-y-1 text-center">
        <p>RECEIPT INV-{sale.saleNo}</p>
        {party && <p>{party}</p>}
        <p>{ymd(sale.date)}</p>
        {sale.refunded && <p>** REFUNDED **</p>}
      </div>
      <table className="mt-3 w-full border-t border-black">
        <thead>
          <tr className={rule}>
            <th className="py-1 text-left">Item</th>
            <th className="py-1 text-right">QTY</th>
            <th className="py-1 text-right">{c}</th>
          </tr>
        </thead>
        <tbody>
          {(sale.items || []).map((i, idx) => (
            <tr key={idx} className={rule}>
              <td className="w-[46%] break-words py-1 pr-1">{i.name}</td>
              <td className="whitespace-nowrap py-1 text-right">{(Math.round((Number(i.qty) || 0) * 1000) / 1000).toFixed(2)}</td>
              <td className="whitespace-nowrap py-1 pl-2 text-right">{fmt2(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!isVoucher && discount > 0 && (
        <div className="flex justify-between pt-1"><span>Discount</span><span>-{fmt2(discount)}</span></div>
      )}
      {!isVoucher && tax > 0 && (
        <div className="flex justify-between pt-1"><span>Tax</span><span>{fmt2(tax)}</span></div>
      )}
      <div className="flex justify-between py-1 text-[15px]"><span>TOTAL</span><span>{fmt2(sale.total)}</span></div>
      {change > 0 && (
        <>
          <div className="flex justify-between text-[12px]"><span>Cash</span><span>{fmt2(sale.tendered)}</span></div>
          <div className="flex justify-between text-[12px]"><span>Change</span><span>{fmt2(change)}</span></div>
        </>
      )}
      <div className="mt-2 space-y-1 text-center">
        <p>Thanks for your support! {shop.name}</p>
        {shop.phone && <p>{shop.phone}</p>}
        <p className="text-[8px] font-normal text-gray-500">Powered by Jnex Software Solution</p>
      </div>
    </div>
  );
}

export default function ReceiptModal({ sale, onClose }) {
  const { canSeeCost, showToast, customers } = usePos();
  const desktopPrint = typeof window !== "undefined" ? window.posHardware?.printReceipt : null;

  // Desktop app: use the same silent printer path as the automatic print after
  // payment (window.print() goes through Chromium's own print path, which gives
  // garbage on some thermal printers). Browser: normal window.print().
  // older bills only stored the customer id: look the name up so reprints show it too
  const shown =
    sale && sale.kind !== "voucher" && !sale.customerName && sale.customerId
      ? { ...sale, customerName: customers?.find((x) => x.id === sale.customerId)?.name || "" }
      : sale;

  const printNow = async () => {
    if (!desktopPrint) return window.print();
    try {
      const r = await desktopPrint(shown);
      if (r && !r.ok) showToast(`Print failed${r.error ? ` — ${r.error}` : ""}`, "error");
    } catch (err) {
      showToast(`Print failed — ${String((err && err.message) || err)}`, "error");
    }
    return undefined;
  };

  useEffect(() => {
    if (!sale) return undefined;
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Desktop app: the bill was already printed when payment was confirmed,
        // so Enter just closes this screen (use the button to reprint).
        if (desktopPrint) onClose();
        else window.print();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale]);

  if (!sale) return null;
  return (
    <div className="pos-no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{sale.kind === "voucher" ? "Buying voucher" : "Receipt · Bill"} #{sale.saleNo}</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-pos-bg p-4">
          <ReceiptBody sale={shown} />
          {canSeeCost && sale.kind !== "voucher" && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Cost {money(sale.cost || 0, sale.currency)} · Profit {money(sale.profit || 0, sale.currency)}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-pos-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover"
          >
            Close
          </button>
          <button
            type="button"
            onClick={printNow}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-pos-green text-xs font-semibold text-black"
          >
            <Printer size={14} /> {sale.kind === "voucher" ? "Print voucher" : "Print receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
