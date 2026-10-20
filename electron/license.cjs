const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// 3-day free trial + lifetime activation code.
//
// Kept in the MAIN process on purpose (not the renderer): the renderer's JS
// runs in a window a determined user could inspect/patch with devtools, but
// this file only ever gets touched by rebuilding + repackaging the app. All
// trial state lives here; the UI only ever asks "am I expired?" / "activate
// with this code" over IPC and never sees or sets the underlying dates.
// ---------------------------------------------------------------------------

const TRIAL_DAYS = 3;
const ACTIVATION_CODE = "J8K2-M9F4-X3L7-R5W1"; // deliberately separate from SUPER_ADMIN_PASSCODE
const SIGNING_KEY = "jnex-pos::trial-anchor::v1";

function sign(json) {
  return crypto.createHmac("sha256", SIGNING_KEY).update(json).digest("hex");
}

// Light obfuscation + a signature so the marker file isn't a plain-text date
// someone can hand-edit in Notepad to "reset" the trial. Not meant to be
// unbreakable — just to raise the bar past a trivial edit.
function encode(record) {
  const json = JSON.stringify(record);
  const body = Buffer.from(json, "utf8").toString("base64");
  return Buffer.from(JSON.stringify({ b: body, s: sign(json) }), "utf8").toString("base64");
}

function decode(raw) {
  try {
    const { b, s } = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    const json = Buffer.from(b, "base64").toString("utf8");
    if (sign(json) !== s) return null; // signature mismatch → tampered, ignore it
    const record = JSON.parse(json);
    if (typeof record.installedAt !== "number" || typeof record.lastSeenAt !== "number")
      return null;
    return record;
  } catch {
    return null;
  }
}

// Two independent locations so deleting/clearing app data from inside the
// app (or wiping just the normal userData folder) can't reset the trial —
// both would have to be found and removed by hand.
function markerPaths() {
  return [
    path.join(app.getPath("userData"), "sys.dat"),
    path.join(app.getPath("documents"), "JnexPOS", ".cache", "sys.dat"),
  ];
}

function readMarker(p) {
  try {
    return decode(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeMarker(p, record) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, encode(record), "utf8");
    fs.renameSync(tmp, p);
  } catch {
    /* best-effort — if one location is unwritable the other still protects the trial */
  }
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function computeAndPersist() {
  const paths = markerPaths();
  const records = paths.map(readMarker).filter(Boolean);
  const now = nowSec();

  let installedAt;
  let lastSeenAt;
  let activated;

  if (records.length === 0) {
    // No valid marker anywhere → first launch ever seen (or every marker
    // was removed/corrupted). Anchor the trial starting now.
    installedAt = now;
    lastSeenAt = now;
    activated = false;
  } else {
    // Earliest installedAt across whatever markers survived wins, so
    // removing just one of the two files doesn't restart the clock.
    installedAt = Math.min(...records.map((r) => r.installedAt));
    // Latest lastSeenAt we've ever recorded wins too — this is the
    // anti-clock-rollback guard below.
    lastSeenAt = Math.max(...records.map((r) => r.lastSeenAt), installedAt);
    activated = records.some((r) => r.activated === true);
  }

  // If the system clock now reads earlier than the latest time we've
  // already observed, someone (or something) turned it back. Don't let
  // that rewind the trial — treat "now" as the latest time we've seen.
  const effectiveNow = Math.max(now, lastSeenAt);

  const record = { installedAt, lastSeenAt: effectiveNow, activated };
  paths.forEach((p) => writeMarker(p, record));

  const elapsedDays = (effectiveNow - installedAt) / 86400;
  const expired = !activated && elapsedDays >= TRIAL_DAYS;

  return {
    activated,
    expired,
    daysRemaining: activated ? null : Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays)),
  };
}

function getLicenseState() {
  return computeAndPersist();
}

function activate(code) {
  if (String(code || "").trim() !== ACTIVATION_CODE) return { ok: false };
  const paths = markerPaths();
  const existing = paths.map(readMarker).filter(Boolean);
  const now = nowSec();
  const installedAt = existing.length ? Math.min(...existing.map((r) => r.installedAt)) : now;
  const record = { installedAt, lastSeenAt: now, activated: true };
  paths.forEach((p) => writeMarker(p, record));
  return { ok: true };
}

module.exports = { getLicenseState, activate };
