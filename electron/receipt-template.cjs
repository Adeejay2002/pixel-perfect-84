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

function buildReceiptHtml(sale, paperWidthMM = 80) {
  const c = sale.currency || "Rs";
  const shop = sale.shop || {};
  const items = sale.items || [];

  const itemRows = items
    .map((i) => {
      const unit = ((i.unitPrice || 0) / 100).toFixed(2);
      const was = i.unitPrice !== i.price ? ` (was ${((i.price || 0) / 100).toFixed(2)})` : "";
      const lineTotal = ((i.lineTotal || 0) / 100).toFixed(2);
      return `
        <p class="name">${esc(i.name)}</p>
        <div class="row"><span>${i.qty} x ${unit}${was}</span><span>${lineTotal}</span></div>`;
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
  <div class="hr"></div>
  <div class="row"><span>Bill #${esc(sale.saleNo)}</span><span>${esc(new Date(sale.date).toLocaleString())}</span></div>
  <p>Payment: ${esc(sale.method)}</p>
  ${sale.cashierName ? `<p>Served by: ${esc(sale.cashierName)}</p>` : ""}
  ${sale.comment ? `<p>Note: ${esc(sale.comment)}</p>` : ""}
  ${sale.refunded ? `<p style="font-weight:700">** REFUNDED **</p>` : ""}
  <div class="hr"></div>
  ${itemRows}
  <div class="hr"></div>
  <div class="row"><span>Subtotal</span><span>${money(sale.subtotal, c)}</span></div>
  ${productDiscountBlock}
  ${billDiscountBlock}
  <div class="row"><span>Tax</span><span>${money(sale.tax, c)}</span></div>
  <div class="total-row"><span>TOTAL</span><span>${money(sale.total, c)}</span></div>
  ${cashBlock}
  <div class="hr"></div>
  <p class="center">Thank you for your purchase!</p>
  <p class="footer">Printed ${esc(new Date().toLocaleString())}</p>
</body>
</html>`;
}

module.exports = { buildReceiptHtml };
