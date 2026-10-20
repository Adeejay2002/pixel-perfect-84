import { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 3-day free trial + lifetime activation code.
//
// The real, tamper-resistant trial clock lives in the Electron main process
// (electron/license.cjs) — this module just asks it "am I expired?" over
// IPC. The localStorage fallback below only runs when there's no Electron
// bridge at all (e.g. previewing the app in a plain browser); it exists so
// the trial still behaves sensibly there, not as the production safeguard.
// ---------------------------------------------------------------------------

const TRIAL_DAYS = 3;
const ACTIVATION_CODE = "J8K2-M9F4-X3L7-R5W1";
const FALLBACK_KEY = "jnex_pos_license_v1";

function fallbackGet() {
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(FALLBACK_KEY) || "null");
  } catch {
    saved = null;
  }
  const now = Date.now();
  const installedAt = saved?.installedAt || now;
  // never let a rolled-back clock push lastSeenAt backwards
  const lastSeenAt = Math.max(saved?.lastSeenAt || 0, installedAt, now);
  const activated = !!saved?.activated;
  window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({ installedAt, lastSeenAt, activated }));

  const elapsedDays = (lastSeenAt - installedAt) / 86400000;
  const expired = !activated && elapsedDays >= TRIAL_DAYS;
  return { activated, expired, daysRemaining: activated ? null : Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays)) };
}

function fallbackActivate(code) {
  if (String(code || "").trim() !== ACTIVATION_CODE) return { ok: false };
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(FALLBACK_KEY) || "null");
  } catch {
    saved = null;
  }
  const installedAt = saved?.installedAt || Date.now();
  window.localStorage.setItem(
    FALLBACK_KEY,
    JSON.stringify({ installedAt, lastSeenAt: Date.now(), activated: true }),
  );
  return { ok: true };
}

async function getLicenseState() {
  if (typeof window === "undefined") return { activated: false, expired: false, daysRemaining: TRIAL_DAYS };
  if (window.posLicense?.isElectron) {
    try {
      return await window.posLicense.get();
    } catch {
      return { activated: false, expired: false, daysRemaining: TRIAL_DAYS };
    }
  }
  return fallbackGet();
}

async function activateLicense(code) {
  if (typeof window === "undefined") return { ok: false };
  if (window.posLicense?.isElectron) {
    try {
      return await window.posLicense.activate(code);
    } catch {
      return { ok: false };
    }
  }
  return fallbackActivate(code);
}

// Re-checked periodically while the app stays open, so someone turning the
// clock forward then back mid-session still gets caught on the next check.
const RECHECK_MS = 5 * 60 * 1000;

export function useLicense() {
  const [state, setState] = useState(null); // null = still loading

  const refresh = useCallback(() => {
    getLicenseState().then(setState);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, RECHECK_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const activate = useCallback(
    async (code) => {
      const res = await activateLicense(code);
      if (res.ok) refresh();
      return res;
    },
    [refresh],
  );

  return {
    loading: state === null,
    activated: state?.activated ?? false,
    expired: state?.expired ?? false,
    daysRemaining: state?.daysRemaining ?? null,
    activate,
  };
}
