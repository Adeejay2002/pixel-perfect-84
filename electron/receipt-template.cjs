// Builds a standalone HTML receipt from a sale payload, independent of the
// React UI. This lets us print reliably from the Electron main process
// (no need to wait for a modal to render, works for reprints too).
// Layout mirrors src/components/pos/Receipt.jsx's ReceiptBody.

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function money(cents, currency) {
  const v = (Number(cents) || 0) / 100;
  return `${currency || "Rs"} ${v.toFixed(2)}`;
}

// quantities may be decimal kg: 3 decimals max, no float noise (0.1+0.2 -> 0.3)
const fmtQty = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);

function buildReceiptHtml(sale, paperWidthMM = 80) {
  const isVoucher = sale.kind === "voucher";
  const c = sale.currency || "Rs";
  const shop = sale.shop || {};
  const items = sale.items || [];

  // Sales receipt: item name, quantity and line total only (no unit price).
  // Buying voucher: also shows the cost rate paid per kg.
  const itemRows = items
    .map((i) => {
      const lineTotal = ((i.lineTotal || 0) / 100).toFixed(2);
      const left = isVoucher
        ? `${fmtQty(i.qty)} kg x ${((i.unitPrice || 0) / 100).toFixed(2)}`
        : `Qty: ${fmtQty(i.qty)}`;
      return `
        <p class="name">${esc(i.name)}</p>
        <div class="row"><span>${left}</span><span>${lineTotal}</span></div>`;
    })
    .join("");

  const cashBlock =
    sale.method === "Cash" && sale.tendered > 0
      ? `
        <div class="row"><span>Cash</span><span>${money(sale.tendered, c)}</span></div>
        <div class="row"><span>Change</span><span>${money(Math.max(0, sale.tendered - sale.total), c)}</span></div>`
      : "";

  const productDiscountBlock =
    sale.productDiscount > 0
      ? `<div class="row"><span>Product discounts</span><span>-${money(sale.productDiscount, c)}</span></div>`
      : "";

  const billDiscountBlock =
    sale.billDiscount > 0
      ? `<div class="row"><span>Bill discount (${sale.billDiscountPercent}%)</span><span>-${money(sale.billDiscount, c)}</span></div>`
      : "";

  // Roughly matches the on-screen 300px-wide preview, scaled to the roll width.
  const widthMM = paperWidthMM || 80;

  // Only trust it if it really is an embedded image data URL (base64 has no
  // quote/angle-bracket characters, but this guards against a corrupted or
  // tampered settings file putting something else in this field).
  const logoBlock =
    typeof shop.logo === "string" && shop.logo.startsWith("data:image/")
      ? `<img class="logo" src="${shop.logo}" alt="" />`
      : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${widthMM}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 3mm 3mm 6mm;
    width: ${widthMM}mm;
    font-family: "Courier New", Courier, monospace;
    font-size: ${widthMM <= 58 ? "10px" : "11px"};
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .logo { display: block; max-width: 55%; max-height: 22mm; margin: 0 auto 2mm; object-fit: contain; }
  .shop-name { font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 0; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .name { margin: 4px 0 0; }
  .total-row { display: flex; justify-content: space-between; border-top: 1px solid #000;
    margin-top: 4px; padding-top: 4px; font-size: 13px; font-weight: 700; }
  .footer { text-align: center; font-size: 8px; color: #555; margin-top: 4px; }
  p { margin: 0; }
</style>
</head>
<body>
  <div class="center">
    ${logoBlock}
    <p class="shop-name">${esc(shop.name || "Shop")}</p>
    ${shop.address ? `<p>${esc(shop.address)}</p>` : ""}
    ${shop.phone ? `<p>Tel: ${esc(shop.phone)}</p>` : ""}
  </div>
  ${isVoucher ? `<p class="center" style="font-weight:700;margin-top:2px">BUYING VOUCHER</p>` : ""}
  <div class="hr"></div>
  <div class="row"><span>${isVoucher ? "Voucher" : "Bill"} #${esc(sale.saleNo)}</span><span>${esc(new Date(sale.date).toLocaleString())}</span></div>
  ${
    isVoucher
      ? `<p>Collector / Supplier: ${esc(sale.supplierName)}</p>${sale.cashierName ? `<p>Received by: ${esc(sale.cashierName)}</p>` : ""}`
      : `<p>Payment: ${esc(sale.method)}</p>
  ${sale.cashierName ? `<p>Served by: ${esc(sale.cashierName)}</p>` : ""}
  ${sale.comment ? `<p>Note: ${esc(sale.comment)}</p>` : ""}
  ${sale.refunded ? `<p style="font-weight:700">** REFUNDED **</p>` : ""}`
  }
  <div class="hr"></div>
  ${itemRows}
  <div class="hr"></div>
  ${
    isVoucher
      ? `<div class="total-row"><span>TOTAL PAID</span><span>${money(sale.total, c)}</span></div>
  <div class="row" style="margin-top:14px"><span>Seller sign: ______</span><span>Cashier: ______</span></div>`
      : `<div class="row"><span>Subtotal</span><span>${money(sale.subtotal, c)}</span></div>
  ${productDiscountBlock}
  ${billDiscountBlock}
  <div class="row"><span>Tax</span><span>${money(sale.tax, c)}</span></div>
  <div class="total-row"><span>TOTAL</span><span>${money(sale.total, c)}</span></div>
  ${cashBlock}`
  }
  <div class="hr"></div>
  <p class="center">${isVoucher ? "Thank you!" : "Thank you for your purchase!"}</p>
  <p class="footer">Powered by Jnex Software Solution</p>
</body>
</html>`;
}

module.exports = { buildReceiptHtml };
