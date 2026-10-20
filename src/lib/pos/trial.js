// ---------------------------------------------------------------------------
// TRIAL / LICENSE GATE
// ---------------------------------------------------------------------------
// Free trial length for a fresh install. After this many days (from the
// first time the app was ever opened on this device) the app locks down to
// a data-export-only screen until an activation code is entered.
//
// This is a client-side check (there is no server backing this app), so it
// cannot be made 100% tamper-proof against a determined, technical user with
// dev tools. What it DOES defend against, without being complicated to
// maintain, is the two things an ordinary shop owner would actually try:
//   1. Clearing the app's normal data / reinstalling to "reset the clock".
//   2. Turning the system clock backwards to buy more days.
// It does this by keeping two independent copies of the trial start time
// (one in its own localStorage key, one mirrored inside the POS database
// blob/backup itself) and always trusting whichever copy is *more*
// restrictive, plus refusing to let the recorded "now" ever move backwards.
// ---------------------------------------------------------------------------

import { TRIAL_ACTIVATION_CODE } from "./config";

export const TRIAL_DAYS = 3;

const ANCHOR_KEY = "dvnt_lic_a1";
const SALT = "divnet-pos-trial-v1::do-not-share";
const DAY_MS = 24 * 60 * 60 * 1000;

function checksum(str) {
  let h = 5381;
  const s = String(str) + SALT;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

function sign(a) {
  return checksum(`${a.startedAt}:${a.lastSeen}:${a.licensed ? 1 : 0}`);
}

function readLocalAnchor() {
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (
      !obj ||
      typeof obj.startedAt !== "number" ||
      typeof obj.lastSeen !== "number" ||
      typeof obj.sig !== "string"
    ) {
      return null;
    }
    // Signature mismatch means the value was hand-edited in devtools rather
    // than written by this code — treat it as absent (falls back to the
    // most restrictive of the other sources, never resets the trial).
    if (sign(obj) !== obj.sig) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeLocalAnchor(a) {
  try {
    window.localStorage.setItem(ANCHOR_KEY, JSON.stringify({ ...a, sig: sign(a) }));
  } catch {
    /* best effort only */
  }
}

// `mirror` is the copy of the anchor kept inside the main POS database (see
// store.jsx `db.trial`), which also travels with exported/imported backups.
export function getTrialStatus(mirror) {
  const now = Date.now();
  const local = readLocalAnchor();

  let startedAt = now;
  let lastSeen = now;
  let licensed = false;
  let haveAnchor = false;

  if (local) {
    startedAt = local.startedAt;
    lastSeen = local.lastSeen;
    licensed = !!local.licensed;
    haveAnchor = true;
  }

  if (mirror && typeof mirror.startedAt === "number") {
    if (!haveAnchor) {
      startedAt = mirror.startedAt;
      lastSeen = mirror.lastSeen || now;
      licensed = !!mirror.licensed;
      haveAnchor = true;
    } else {
      // Whichever record has been running longer wins — clearing only one
      // of the two storage locations can't roll the clock back.
      startedAt = Math.min(startedAt, mirror.startedAt);
      lastSeen = Math.max(lastSeen, mirror.lastSeen || 0);
      licensed = licensed || !!mirror.licensed;
    }
  }

  // Clock-rollback guard: never let the effective "now" be earlier than the
  // latest timestamp we've already recorded seeing.
  const effectiveNow = Math.max(now, lastSeen);

  const anchor = { startedAt, lastSeen: effectiveNow, licensed };
  writeLocalAnchor(anchor);

  const daysElapsed = (effectiveNow - startedAt) / DAY_MS;
  const expired = !licensed && daysElapsed >= TRIAL_DAYS;
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));

  return { startedAt, lastSeen: effectiveNow, licensed, expired, daysLeft };
}

export function trialMirror(status) {
  return { startedAt: status.startedAt, lastSeen: status.lastSeen, licensed: status.licensed };
}

// Permanently unlocks the app on this device. Uses its own dedicated
// activation code (separate from the Super Admin / developer passcode), so
// it's safe to hand out to a paying customer without exposing the
// developer-only master passcode.
export function activateTrial(code) {
  if (code !== TRIAL_ACTIVATION_CODE) return false;
  const local = readLocalAnchor() || { startedAt: Date.now(), lastSeen: Date.now(), licensed: false };
  local.licensed = true;
  local.lastSeen = Date.now();
  writeLocalAnchor(local);
  return true;
}
