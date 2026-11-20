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

// ---- minimalist receipt helpers (customer bills and supplier vouchers) ----
const fmtMoney = (cents) =>
  ((Number(cents) || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty2 = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toFixed(2);
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "";
  return `${t.getFullYear()}/${pad2(t.getMonth() + 1)}/${pad2(t.getDate())}`;
};
// name line: customer (sell) or supplier (buy); hidden for walk-in / nobody
const partyName = (sale) => {
  const n = String((sale.kind === "voucher" ? sale.supplierName : sale.customerName) || "").trim();
  return /^walk-?\s?in/i.test(n) ? "" : n;
};

function buildReceiptHtml(sale, paperWidthMM = 80) {
  sale = sale || {};
  const isVoucher = sale.kind === "voucher";
  const c = sale.currency || "Rs";
  const shop = sale.shop || {};
  const items = sale.items || [];
  const widthMM = paperWidthMM || 80;
  const party = partyName(sale);

  const itemRows = items
    .map(
      (i) => `
      <tr>
        <td class="item">${esc(i.name)}</td>
        <td class="num n">${fmtQty2(i.qty)}</td>
        <td class="num n">${fmtMoney(i.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const discount = (Number(sale.productDiscount) || 0) + (Number(sale.billDiscount) || 0);
  const extraRows = [];
  if (!isVoucher && discount > 0) extraRows.push(["Discount", `-${fmtMoney(discount)}`]);
  if (!isVoucher && Number(sale.tax) > 0) extraRows.push(["Tax", fmtMoney(sale.tax)]);
  const extra = extraRows.map(([l, v]) => `<div class="row"><span>${l}</span><span class="n">${v}</span></div>`).join("");

  // cash / change only when the customer actually got change back
  const change = !isVoucher && sale.method === "Cash" ? Math.max(0, (Number(sale.tendered) || 0) - (Number(sale.total) || 0)) : 0;
  const changeBlock =
    change > 0
      ? `<div class="row small"><span>Cash</span><span class="n">${fmtMoney(sale.tendered)}</span></div>
         <div class="row small"><span>Change</span><span class="n">${fmtMoney(change)}</span></div>`
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
    font-family: Georgia, "Times New Roman", "Iskoola Pota", "Noto Sans Sinhala", serif;
    font-size: ${widthMM <= 58 ? "12px" : "14px"};
    font-weight: 700;
    line-height: 1.4;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  p { margin: 0; }
  .head p { margin: 0 0 5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; border-top: 1px solid #000; }
  th { text-align: left; padding: 3px 2px; border-bottom: 1px solid #000; font-weight: 700; }
  th.num, td.num { text-align: right; white-space: nowrap; }
  td { padding: 4px 2px; border-bottom: 1px solid #000; vertical-align: middle; }
  td.item { word-break: break-word; overflow-wrap: anywhere; width: 46%; }
  .row { display: flex; justify-content: space-between; padding: 2px 2px 0; }
  .small { font-size: 90%; }
  /* numbers use the same monospace font as the previous bill layout */
  .n { font-family: "Courier New", Courier, monospace; font-weight: 700; }
  .total { display: flex; justify-content: space-between; padding: 4px 2px 2px; font-size: 115%; }
  .foot { margin-top: 6px; }
  .foot p { margin: 0 0 4px; }
  .powered { font-size: 8px; font-weight: 400; color: #555; margin-top: 4px; }
</style>
</head>
<body>
  <div class="center head">
    <p>RECEIPT INV-<span class="n">${esc(sale.saleNo)}</span></p>
    ${party ? `<p>${esc(party)}</p>` : ""}
    <p class="n">${fmtDate(sale.date)}</p>
    ${sale.refunded ? `<p>** REFUNDED **</p>` : ""}
  </div>
  <table>
    <thead><tr><th>Item</th><th class="num">QTY</th><th class="num">${esc(c)}</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  ${extra}
  <div class="total"><span>TOTAL</span><span class="n">${fmtMoney(sale.total)}</span></div>
  ${changeBlock}
  <div class="center foot">
    <p>Thanks for your support! ${esc(shop.name || "")}</p>
    ${shop.phone ? `<p class="n">${esc(shop.phone)}</p>` : ""}
    <p class="powered">Powered by Jnex Software Solution</p>
  </div>
</body>
</html>`;
}

module.exports = { buildReceiptHtml };
