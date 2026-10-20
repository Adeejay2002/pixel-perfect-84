import { useEffect } from "react";
import { X, Printer } from "lucide-react";
import { usePos, money } from "../../lib/pos/store";
import { BRAND_FOOTER } from "../../lib/pos/config";

export function ReceiptBody({ sale }) {
  const c = sale.currency || "Rs";
  const shop = sale.shop || {};
  return (
    <div id="pos-receipt" className="mx-auto w-[300px] bg-white p-4 font-mono text-[11px] leading-tight text-black">
      <div className="text-center">
        {shop.logo && (
          <img src={shop.logo} alt="" className="mx-auto mb-1 max-h-12 max-w-[140px] object-contain" />
        )}
        <p className="text-sm font-bold uppercase">{shop.name || "Shop"}</p>
        {shop.address && <p>{shop.address}</p>}
        {shop.phone && <p>Tel: {shop.phone}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>Bill #{sale.saleNo}</span>
        <span>{new Date(sale.date).toLocaleString()}</span>
      </div>
      <p>Payment: {sale.method}</p>
      {sale.cashierName && <p>Served by: {sale.cashierName}</p>}

      {sale.refunded && <p className="font-bold">** REFUNDED **</p>}
      <div className="my-2 border-t border-dashed border-black" />
      {(sale.items || []).map((i, idx) => (
        <div key={idx} className="mb-1">
          <p>{i.name}</p>
          <div className="flex justify-between">
            <span>
              {i.qty} x {(i.unitPrice / 100).toFixed(2)}
              {i.unitPrice !== i.price ? ` (was ${(i.price / 100).toFixed(2)})` : ""}
            </span>
            <span>{(i.lineTotal / 100).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal, c)}</span></div>
      {sale.productDiscount > 0 && (
        <div className="flex justify-between"><span>Product discounts</span><span>-{money(sale.productDiscount, c)}</span></div>
      )}
      {sale.billDiscount > 0 && (
        <div className="flex justify-between">
          <span>Bill discount ({sale.billDiscountPercent}%)</span><span>-{money(sale.billDiscount, c)}</span>
        </div>
      )}
      <div className="flex justify-between"><span>Tax</span><span>{money(sale.tax, c)}</span></div>
      <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold">
        <span>TOTAL</span><span>{money(sale.total, c)}</span>
      </div>
      {sale.method === "Cash" && sale.tendered > 0 && (
        <>
          <div className="flex justify-between"><span>Cash</span><span>{money(sale.tendered, c)}</span></div>
          <div className="flex justify-between"><span>Change</span><span>{money(Math.max(0, sale.tendered - sale.total), c)}</span></div>
        </>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">Thank you for your purchase!</p>
      <p className="mt-1 text-center text-[8px] font-normal text-gray-500">{BRAND_FOOTER}</p>
    </div>
  );
}

export default function ReceiptModal({ sale, onClose }) {
  const { canSeeCost } = usePos();

  useEffect(() => {
    if (!sale) return undefined;
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sale]);

  if (!sale) return null;
  return (
    <div className="pos-no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Receipt · Bill #{sale.saleNo}</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-pos-bg p-4">
          <ReceiptBody sale={sale} />
          {canSeeCost && (
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
            onClick={() => window.print()}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-pos-green text-xs font-semibold text-black"
          >
            <Printer size={14} /> Print receipt
          </button>
        </div>
      </div>
    </div>
  );
}
