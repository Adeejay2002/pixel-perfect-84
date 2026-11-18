import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { APP_NAME, BRAND_FOOTER } from "../../lib/pos/config";

// Wraps the whole POS. While the licence is expired, only the activation
// screen is rendered (the POS itself is not even mounted). Outside Electron
// (browser dev) window.posLicense is undefined and the gate lets everything through.

const formatCode = (raw) => {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return c.replace(/(.{4})(?=.)/g, "$1-");
};

function ActivationScreen({ status, onActivated }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || code.replace(/-/g, "").length < 16) return;
    setBusy(true);
    setError("");
    try {
      const res = await window.posLicense.activate(code);
      if (res.ok) onActivated(res.status);
      else if (res.reason === "blocked") setError("Too many wrong attempts. Wait a minute and try again.");
      else if (res.reason === "exhausted") setError("No more activation codes available. Please contact Jnex support.");
      else setError("Invalid activation key.");
    } catch {
      setError("Could not verify the key. Try again.");
    }
    setCode("");
    setBusy(false);
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-pos-bg">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-[400px] rounded-xl border border-pos-border bg-pos-panel p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/logo.png" alt="Jnex" className="h-14 w-14 object-contain" />
          <h1 className="text-lg font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">
            {status?.trial ? "Your 3-day trial has ended." : "Your licence period has ended."} Enter an activation key to continue.
          </p>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-md border border-pos-border bg-pos-tile px-3">
          <KeyRound size={16} className="text-muted-foreground" />
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-center font-mono text-base tracking-wider text-foreground outline-none"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy || code.replace(/-/g, "").length < 16}
          className="h-12 w-full rounded-md bg-pos-green text-base font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Checking…" : "Activate"}
        </button>

        <div className="mt-5 space-y-2 text-center text-xs">
          {error && <p className="text-pos-red">{error}</p>}
          <p className="text-[11px] text-muted-foreground/70">{BRAND_FOOTER}</p>
        </div>
      </div>
    </div>
  );
}

export default function LicenseGate({ children }) {
  const api = typeof window !== "undefined" ? window.posLicense : null;
  const [status, setStatus] = useState(null);

  const refresh = useCallback(() => {
    if (!api) return;
    api.status().then(setStatus).catch(() => {});
  }, [api]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!api) return children;
  if (!status) return <div className="h-screen w-screen bg-pos-bg" />;
  if (status.locked) return <ActivationScreen status={status} onActivated={setStatus} />;

  const daysLeft = Math.ceil(status.remainingMs / 86400000);
  return (
    <>
      {children}
      {daysLeft <= 2 && (
        <div className="pos-no-print pointer-events-none fixed bottom-2 left-2 z-[70] rounded bg-pos-tile/90 px-2 py-1 text-[11px] text-muted-foreground">
          {status.trial ? "Trial" : "Licence"} ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}
        </div>
      )}
    </>
  );
}
