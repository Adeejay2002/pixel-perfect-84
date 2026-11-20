"use strict";
// ESC/POS helpers: turns a rendered receipt (BGRA pixels) into a raster-image
// print job that Xprinter / most 58-80mm thermal printers understand directly.
// Sent through the Windows print queue as RAW (see drawer.cjs → sendRaw), so
// the Windows driver and Chromium's print path are not involved at all.

// Printable width in dots at 203 dpi.
function dotsForPaper(paperWidthMm) {
  return paperWidthMm === 58 ? 384 : 576;
}
// Printable width in mm (what the receipt HTML should be laid out at).
function printableMm(paperWidthMm) {
  return paperWidthMm === 58 ? 48 : 72;
}

// BGRA (Electron NativeImage.toBitmap on Windows) → 1 bit per pixel, 1 = black.
function bgraToMono(bgra, width, height, threshold = 170) {
  const bytesPerRow = Math.ceil(width / 8);
  const mono = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = bgra[i + 3] / 255;
      const lum = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
      const v = lum * a + 255 * (1 - a); // composite over white paper
      if (v < threshold) mono[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { mono, bytesPerRow };
}

// Drop blank rows at the bottom (keeps `keep` rows) so no paper is wasted.
function trimBottom(mono, bytesPerRow, height, keep = 8) {
  let last = -1;
  for (let y = height - 1; y >= 0 && last < 0; y--) {
    for (let b = 0; b < bytesPerRow; b++) {
      if (mono[y * bytesPerRow + b]) {
        last = y;
        break;
      }
    }
  }
  const h = last < 0 ? 0 : Math.min(height, last + 1 + keep);
  return { mono: mono.subarray(0, h * bytesPerRow), height: h };
}

// ESC @ , GS v 0 raster blocks, feed, partial cut.
function buildRasterJob(mono, bytesPerRow, height, { feedLines = 4, cut = true } = {}) {
  const parts = [Buffer.from([0x1b, 0x40])]; // initialise
  const CHUNK = 128; // rows per GS v 0 block: small blocks are friendlier to cheap printers
  for (let y = 0; y < height; y += CHUNK) {
    const rows = Math.min(CHUNK, height - y);
    parts.push(Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, rows & 0xff, rows >> 8]));
    parts.push(mono.subarray(y * bytesPerRow, (y + rows) * bytesPerRow));
  }
  parts.push(Buffer.from([0x1b, 0x64, feedLines])); // ESC d n: feed n lines
  if (cut) parts.push(Buffer.from([0x1d, 0x56, 0x01])); // GS V 1: partial cut
  return Buffer.concat(parts);
}

// ---- Plain-text receipt (alternative mode: no rendering, works everywhere) ----
// English/ASCII only: any other character (e.g. Sinhala) prints as "?".
function ascii(str) {
  return String(str ?? "").replace(/[^\x20-\x7e]/g, "?");
}
function wrap(text, width) {
  const out = [];
  let line = "";
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > width) {
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if ((line + " " + w).length <= width) line += " " + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
function lr(left, right, width) {
  left = ascii(left);
  right = ascii(right);
  const gap = Math.max(1, width - left.length - right.length);
  return (left + " ".repeat(gap) + right).slice(0, Math.max(width, left.length + 1 + right.length));
}

const fmtQty = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);

const commaMoney = (cents) =>
  ((Number(cents) || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty2 = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toFixed(2);
const ymd = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
};
const rpad = (t, w) => " ".repeat(Math.max(0, w - t.length)) + t;

// Same layout as the HTML receipt: header, Item | QTY | Rs table, TOTAL, thank-you footer.
// (Plain ESC/POS text can only print ASCII, so Sinhala item names need the Windows
// driver / HTML print mode.)
function buildTextJob(sale, paperWidthMm, { feedLines = 4, cut = true } = {}) {
  const isVoucher = sale.kind === "voucher";
  const cols = paperWidthMm === 58 ? 32 : 48;
  const wAmt = cols === 32 ? 10 : 12;
  const wQty = cols === 32 ? 7 : 9;
  const wItem = cols - wAmt - wQty - 2;
  const cur = ascii(sale.currency || "Rs");
  const shop = sale.shop || {};
  const out = [];
  const raw = (...b) => out.push(Buffer.from(b));
  const text = (t) => out.push(Buffer.from(t + "\n", "latin1"));
  const sep = () => text("-".repeat(cols));
  const align = (n) => raw(0x1b, 0x61, n); // 0 left, 1 centre
  const bold = (on) => raw(0x1b, 0x45, on ? 1 : 0);

  let party = String((isVoucher ? sale.supplierName : sale.customerName) || "").trim();
  if (/^walk-?\s?in/i.test(party)) party = "";

  raw(0x1b, 0x40); // initialise
  raw(0x1b, 0x74, 0); // code page 0 (PC437), ASCII only is sent
  align(1);
  bold(true);
  text("RECEIPT INV-" + ascii(sale.saleNo));
  if (party) for (const l of wrap(party, cols)) text(l);
  text(ymd(sale.date));
  if (sale.refunded) text("** REFUNDED **");
  bold(false);
  align(0);

  sep();
  text(ascii("Item").padEnd(wItem) + " " + rpad("QTY", wQty) + " " + rpad(cur, wAmt));
  sep();
  for (const i of sale.items || []) {
    const lines = wrap(i.name, wItem);
    lines.forEach((l, idx) => {
      if (idx === 0) text(l.padEnd(wItem) + " " + rpad(qty2(i.qty), wQty) + " " + rpad(commaMoney(i.lineTotal), wAmt));
      else text(l);
    });
    sep();
  }
  const discount = (Number(sale.productDiscount) || 0) + (Number(sale.billDiscount) || 0);
  if (!isVoucher && discount > 0) text(lr("Discount", "-" + commaMoney(discount), cols));
  if (!isVoucher && Number(sale.tax) > 0) text(lr("Tax", commaMoney(sale.tax), cols));
  bold(true);
  text(lr("TOTAL", commaMoney(sale.total), cols));
  bold(false);
  const change = !isVoucher && sale.method === "Cash" ? Math.max(0, (Number(sale.tendered) || 0) - (Number(sale.total) || 0)) : 0;
  if (change > 0) {
    text(lr("Cash", commaMoney(sale.tendered), cols));
    text(lr("Change", commaMoney(change), cols));
  }
  text("");
  align(1);
  bold(true);
  for (const l of wrap("Thanks for your support! " + (shop.name || ""), cols)) text(l);
  if (shop.phone) text(ascii(shop.phone));
  bold(false);
  text("Powered by Jnex Software Solution");
  align(0);
  raw(0x1b, 0x64, feedLines);
  if (cut) raw(0x1d, 0x56, 0x01);
  return Buffer.concat(out);
}

module.exports = { dotsForPaper, printableMm, bgraToMono, trimBottom, buildRasterJob, buildTextJob };
