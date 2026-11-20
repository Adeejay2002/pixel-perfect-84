// Jnex POS licence / activation lock (runs in the Electron main process).
//
// - Trial: locks 3 days after the first run.
// - Then each activation code unlocks for 30 days. Codes are used strictly in
//   order (CODES[0] = first unlock, CODES[1] = month 1, ...). After the last one
//   the list starts again from the first code (endless loop).
// - Only SHA-256 hashes of the codes are stored here, never the codes.
// - State is HMAC-signed and kept in 3 places (userData, ProgramData/home,
//   Windows registry). Deleting one copy does nothing: the most advanced valid
//   copy wins and the others are re-created. Wiping everything while pos.db
//   still exists counts as an expired trial, not a fresh one.
// - Clock rollback is detected (last-seen time only moves forward).
const { app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const DAY = 86400000;
const TRIAL_MS = 3 * DAY;
const PERIOD_MS = 30 * DAY;
const SAVE_EVERY_MS = 60 * 1000;
const SALT = "jnex-lic-v1:";
const HMAC_KEY = "jnx|pos|9f2c41e7a85b3d60|lic1";
const REG_KEY = "HKCU\\Software\\Jnex\\POS";

const CODE_HASHES = [
  "3305fcf6fb8fac302b3d15ad4e6d110335a13638f7df324bba98b013d9006c2d",
  "dfca74e26e50996719a0536dd56a8b1ee70968201ca6f44d74957d4f577bb78d",
  "a1d1bef04b715389732248a99f45375d4016fe303fcd58eef6963a912b97d4a6",
  "bb604db6624e266ace68fd484a709c2c1342f99eaeef50cde40393a290cd1a5c",
  "a138d1aa4fbdab2ec5b50956ad6b5706dfc04fbfe2e5c69bf4bb4b72cdca9e17",
  "33e6cd2d0f3518ae2383d524e11733b00ff69c0449be8f00b2a1f5f07abd4602",
  "df47e8f84b2a387a5f038aed11bfbb4fe1cafd82fe33b9c02423efd6fbba6349",
  "c54d17b7ea6be63adec3ad814de3e82671fbd2191db6def7ee3c9e6d9643e8bf",
  "baf34afde6a8ba7be275d1707b5fb9cfd4a910a71fb59df351cc8baa38eafcdf",
  "085538c3831b68efa4780139ebf797b55ba76c6d6a3d3d8f10cad9193cdd91f9",
  "56153945afdbf2970a1cf95b43227ea3a8253b8a59d629172a659bac7e3a9d1d",
  "210b49b8b4548381999a481a32e560c254f64458d9095f538ce9a92747abc71e",
  "98c2cb94b0320501fc8b41e8717190ff97ad73f0260ec4ecb0c8b56422984ab6",
  "5042ae5839700ce90ab30896abee00ec4daa407ff402f782547d32cb737fefa1",
  "7c858762ef69c11eb661d64349cb56d25f16c4dc6bd436d3abacfcb04a31c71c"
];

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const normalize = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Temporary 1-hour access code (hash only). Usable once per calendar day.
const TEMP_HASH = "1902d0abd2735aab678b2b4540c2075a4e8023342798b9d512cbc8ea042b48f0";
const TEMP_MS = 60 * 60 * 1000;
const sign = (o) => {
  let base = `${o.installedAt}|${o.lastSeen}|${o.step}|${o.validUntil}`;
  if (o.tempUntil || o.tempDay) base += `|${o.tempUntil || 0}|${o.tempDay || 0}`; // old states stay valid
  return crypto.createHmac("sha256", HMAC_KEY).update(base).digest("hex");
};
const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

let state = null;
let lastSaved = 0;
let lastVerified = 0;
let failCount = 0;
let blockedUntil = 0;

function locations() {
  const list = [path.join(app.getPath("userData"), "license.dat")];
  const base = process.env.ProgramData || path.join(os.homedir(), ".config");
  list.push(path.join(base, "JnexPOS", "sys.dat"));
  return list;
}

function parse(raw) {
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    for (const k of ["installedAt", "lastSeen", "step", "validUntil"]) if (!Number.isFinite(o[k])) return null;
    for (const k of ["tempUntil", "tempDay"]) if (o[k] !== undefined && !Number.isFinite(o[k])) return null;
    if (o.sig !== sign(o)) return null;
    return o;
  } catch {
    return null;
  }
}

function readAll() {
  const found = [];
  for (const p of locations()) {
    try {
      const o = parse(fs.readFileSync(p, "utf8"));
      if (o) found.push(o);
    } catch { /* missing */ }
  }
  if (process.platform === "win32") {
    try {
      const out = execFileSync("reg", ["query", REG_KEY, "/v", "d"], { encoding: "utf8", windowsHide: true, timeout: 4000 });
      const m = out.match(/REG_SZ\s+(\S+)/);
      if (m) {
        const o = parse(Buffer.from(m[1], "base64").toString("utf8"));
        if (o) found.push(o);
      }
    } catch { /* missing */ }
  }
  return found;
}

function writeAll(o) {
  const raw = JSON.stringify(o);
  for (const p of locations()) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, raw);
    } catch { /* ignore */ }
  }
  if (process.platform === "win32") {
    try {
      execFileSync("reg", ["add", REG_KEY, "/v", "d", "/t", "REG_SZ", "/d", Buffer.from(raw).toString("base64"), "/f"], {
        windowsHide: true, timeout: 4000, stdio: "ignore",
      });
    } catch { /* ignore */ }
  }
  lastSaved = Date.now();
}

function seal(o) {
  const out = { installedAt: o.installedAt, lastSeen: o.lastSeen, step: o.step, validUntil: o.validUntil };
  if (o.tempUntil || o.tempDay) { out.tempUntil = o.tempUntil || 0; out.tempDay = o.tempDay || 0; }
  out.sig = sign(out);
  return out;
}

function best(list) {
  return list.reduce((a, b) =>
    !a ? b : b.step > a.step || (b.step === a.step && b.lastSeen > a.lastSeen) ? b : a, null);
}

function init() {
  const found = readAll();
  let s = best(found);
  const now = Date.now();
  if (!s) {
    // No valid licence data anywhere. If the shop database already exists this
    // is not a first install (files were deleted/edited): trial is used up.
    let installedAt = now;
    try {
      const st = fs.statSync(path.join(app.getPath("userData"), "pos.db"));
      if (now - st.birthtimeMs > 10 * 60 * 1000) installedAt = Math.min(st.birthtimeMs, now - TRIAL_MS - 1);
    } catch { /* fresh install */ }
    s = seal({ installedAt, lastSeen: now, step: 0, validUntil: installedAt + TRIAL_MS });
  }
  state = s;
  tick(true);
}

function effectiveNow() {
  return Math.max(Date.now(), state ? state.lastSeen : 0);
}

function tick(force) {
  if (!state) return;
  const now = effectiveNow();
  const moved = now > state.lastSeen;
  if (moved) state = seal({ ...state, lastSeen: now });
  let missing = false;
  if (force || Date.now() - lastVerified > SAVE_EVERY_MS) {
    lastVerified = Date.now();
    missing = readAll().length < 3 - (process.platform === "win32" ? 0 : 1);
  }
  if (force || missing || (moved && Date.now() - lastSaved > SAVE_EVERY_MS)) writeAll(state);
}

function getStatus() {
  if (!state) init();
  tick(false);
  const now = effectiveNow();
  const mainLeft = Math.max(0, state.validUntil - now);
  const tempLeft = Math.max(0, (state.tempUntil || 0) - now);
  const remainingMs = Math.max(mainLeft, tempLeft);
  return {
    temp: mainLeft === 0 && tempLeft > 0,
    locked: remainingMs === 0,
    remainingMs,
    validUntil: state.validUntil,
    trial: state.step === 0,
    exhausted: false, // codes loop, never run out
    blockedSeconds: Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)),
  };
}

function isLocked() {
  try { return getStatus().locked; } catch { return true; }
}

function activate(code) {
  if (!state) init();
  if (Date.now() < blockedUntil) return { ok: false, reason: "blocked", status: getStatus() };
  const status = getStatus();
  if (sha(SALT + normalize(code)) === TEMP_HASH) {
    const now0 = effectiveNow();
    if (!status.locked) return { ok: false, reason: "not_needed", status };
    if (state.tempDay === dayKey(now0)) return { ok: false, reason: "used_today", status };
    state = seal({ ...state, lastSeen: now0, tempUntil: now0 + TEMP_MS, tempDay: dayKey(now0) });
    writeAll(state);
    return { ok: true, temp: true, status: getStatus() };
  }
  const expected = CODE_HASHES[state.step % CODE_HASHES.length]; // loops: after the last monthly code the cycle restarts from the activation code
  const given = sha(SALT + normalize(code));
  if (!expected || given !== expected) {
    failCount += 1;
    if (failCount >= 5) { blockedUntil = Date.now() + 60 * 1000; failCount = 0; }
    return { ok: false, reason: "invalid", status: getStatus() };
  }
  failCount = 0;
  const now = effectiveNow();
  state = seal({ ...state, step: state.step + 1, lastSeen: now, validUntil: now + PERIOD_MS, tempUntil: 0 });
  writeAll(state);
  return { ok: true, status: getStatus() };
}

module.exports = { init, getStatus, activate, isLocked };
