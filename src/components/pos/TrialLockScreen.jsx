import { useState } from "react";
import { Download, Phone, Lock } from "lucide-react";
import { STORAGE_KEY, APP_NAME, BRAND_FOOTER } from "../../lib/pos/config";

const SUPPORT_PHONE = "0764026876";

async function loadRawData() {
  if (typeof window === "undefined") return null;
  if (window.posData?.isElectron) {
    try {
      return await window.posData.load();
    } catch {
      return null;
    }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function TrialLockScreen({ onActivate }) {
  const [exporting, setExporting] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await loadRawData();
      const payload = {
        products: data?.products || [],
        sales: data?.sales || [],
        customers: data?.customers || [],
        exportedAt: new Date().toISOString(),
      };
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jnex-pos-data-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleActivate = async () => {
    const trimmed = code.trim();
    if (!trimmed || checking) return;
    setChecking(true);
    setError("");
    const res = await onActivate(trimmed);
    setChecking(false);
    if (!res?.ok) {
      setError("Invalid activation code");
      setCode("");
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-pos-bg px-4">
      <div className="w-[400px] rounded-xl border border-pos-border bg-pos-panel p-7 text-center shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/logo.png" alt="Jnex" className="h-14 w-14 object-contain" />
          <h1 className="text-lg font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">Your free trial has ended</p>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-md bg-pos-green py-3 text-sm font-semibold text-black transition-colors hover:brightness-110 disabled:opacity-50"
        >
          <Download size={18} />
          {exporting ? "Preparing export…" : "Export My Data"}
        </button>

        <div className="mb-5 rounded-md border border-pos-border bg-pos-tile p-4">
          <div className="flex items-center justify-center gap-2 text-base font-semibold text-foreground">
            <Phone size={16} />
            <a href={`tel:${SUPPORT_PHONE}`} className="hover:underline">
              {SUPPORT_PHONE}
            </a>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">වැඩිදුර තොරතුරු සඳහා අමතන්න</p>
          <p className="text-[11px] text-muted-foreground/70">(Call for further inquiries)</p>
        </div>

        {!showActivate ? (
          <button
            type="button"
            onClick={() => setShowActivate(true)}
            className="text-[11px] text-muted-foreground/60 underline underline-offset-2 hover:text-muted-foreground"
          >
            Have an activation code?
          </button>
        ) : (
          <div className="space-y-2 text-left">
            <div className="flex items-center gap-2 rounded-md border border-pos-border bg-pos-tile px-3">
              <Lock size={14} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleActivate();
                }}
                placeholder="Activation code"
                className="w-full bg-transparent py-2 text-sm text-foreground outline-none"
              />
            </div>
            {error && <p className="text-center text-xs text-pos-red">{error}</p>}
            <button
              type="button"
              onClick={handleActivate}
              disabled={checking || !code.trim()}
              className="w-full rounded-md bg-pos-tile py-2 text-sm font-semibold text-foreground hover:bg-pos-hover disabled:opacity-50"
            >
              {checking ? "Checking…" : "Unlock"}
            </button>
          </div>
        )}

        <p className="mt-5 text-[11px] text-muted-foreground/70">{BRAND_FOOTER}</p>
      </div>
    </div>
  );
}
