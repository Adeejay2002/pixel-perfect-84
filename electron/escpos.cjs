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

function buildTextJob(sale, paperWidthMm, { feedLines = 4, cut = true } = {}) {
  const cols = paperWidthMm === 58 ? 32 : 48;
  const money = (c) => ((Number(c) || 0) / 100).toFixed(2);
  const cur = ascii(sale.currency || "Rs");
  const shop = sale.shop || {};
  const out = [];
  const raw = (...b) => out.push(Buffer.from(b));
  const text = (t) => out.push(Buffer.from(t + "\n", "latin1"));
  const sep = () => text("-".repeat(cols));
  const align = (n) => raw(0x1b, 0x61, n); // 0 left, 1 centre
  const bold = (on) => raw(0x1b, 0x45, on ? 1 : 0);

  raw(0x1b, 0x40); // initialise
  raw(0x1b, 0x74, 0); // code page 0 (PC437), ASCII only is sent
  align(1);
  bold(true);
  for (const l of wrap(String(shop.name || "Shop").toUpperCase(), cols)) text(l);
  bold(false);
  if (shop.address) for (const l of wrap(shop.address, cols)) text(l);
  if (shop.phone) text("Tel: " + ascii(shop.phone));
  align(0);
  sep();
  text(lr("Bill #" + ascii(sale.saleNo), new Date(sale.date).toLocaleString("en-GB"), cols));
  text("Payment: " + ascii(sale.method));
  if (sale.cashierName) text("Served by: " + ascii(sale.cashierName));
  if (sale.comment) for (const l of wrap("Note: " + sale.comment, cols)) text(l);
  if (sale.refunded) text("** REFUNDED **");
  sep();
  for (const i of sale.items || []) {
    for (const l of wrap(i.name, cols)) text(l);
    const was = i.unitPrice !== i.price ? ` (was ${money(i.price)})` : "";
    text(lr(`${i.qty} x ${money(i.unitPrice)}${was}`, money(i.lineTotal), cols));
  }
  sep();
  text(lr("Subtotal", `${cur} ${money(sale.subtotal)}`, cols));
  if (sale.productDiscount > 0) text(lr("Product discounts", `-${cur} ${money(sale.productDiscount)}`, cols));
  if (sale.billDiscount > 0) text(lr(`Bill discount (${sale.billDiscountPercent}%)`, `-${cur} ${money(sale.billDiscount)}`, cols));
  text(lr("Tax", `${cur} ${money(sale.tax)}`, cols));
  bold(true);
  text(lr("TOTAL", `${cur} ${money(sale.total)}`, cols));
  bold(false);
  if (sale.method === "Cash" && sale.tendered > 0) {
    text(lr("Cash", `${cur} ${money(sale.tendered)}`, cols));
    text(lr("Change", `${cur} ${money(Math.max(0, sale.tendered - sale.total))}`, cols));
  }
  sep();
  align(1);
  text("Thank you for your purchase!");
  align(0);
  raw(0x1b, 0x64, feedLines);
  if (cut) raw(0x1d, 0x56, 0x01);
  return Buffer.concat(out);
}

module.exports = { dotsForPaper, printableMm, bgraToMono, trimBottom, buildRasterJob, buildTextJob };
