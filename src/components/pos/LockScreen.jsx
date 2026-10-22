import ThemeToggle from "./ThemeToggle";
import { useEffect, useMemo, useState } from "react";
import { Delete } from "lucide-react";
import { usePos } from "../../lib/pos/store";
import {
  MAX_ATTEMPTS, LOCKOUT_SECONDS, hashCode, APP_NAME, BRAND_FOOTER,
} from "../../lib/pos/config";


export default function LockScreen() {
  const { settings, login } = usePos();
  const [entry, setEntry] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [shake, setShake] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const locked = lockUntil > now;
  const remaining = Math.max(0, Math.ceil((lockUntil - now) / 1000));

  const submit = () => {
    if (locked) return;
    const h = hashCode(entry);
    if (h === settings.ownerPasscodeHash) return login("owner", "Owner");
    const match = (settings.cashiers || []).find((c) => c.passcodeHash === h);
    if (match) return login("cashier", match.name);
    const next = attempts + 1;
    setAttempts(next);
    setEntry("");
    setShake(true);
    setTimeout(() => setShake(false), 500);
    if (next >= MAX_ATTEMPTS) {
      setLockUntil(Date.now() + LOCKOUT_SECONDS * 1000);
      setAttempts(0);
    }
    return undefined;
  };


  useEffect(() => {
    const onKey = (e) => {
      // Any single printable character can be typed on a physical keyboard;
      // the on-screen pad below offers digits, which is all the PINs need.
      if (e.key.length === 1) setEntry((v) => (v.length < 24 ? v + e.key : v));
      else if (e.key === "Backspace") setEntry((v) => v.slice(0, -1));
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keys = useMemo(() => ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "enter"], []);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-pos-bg">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className={`w-[360px] rounded-xl border border-pos-border bg-pos-panel p-7 shadow-2xl ${shake ? "animate-pos-shake" : ""}`}>
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/logo.png" alt="Jnex" className="h-14 w-14 object-contain" />
          <h1 className="text-lg font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">{settings.shopName} · enter passcode to unlock</p>
        </div>

        <div className="mb-5 flex h-12 items-center justify-center gap-2 rounded-md border border-pos-border bg-pos-tile">
          {entry.length === 0 ? (
            <span className="text-xs text-muted-foreground">••••</span>
          ) : (
            entry.split("").map((_, i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-foreground" />)
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              disabled={locked}
              onClick={() => {
                if (k === "clear") setEntry("");
                else if (k === "enter") submit();
                else setEntry((v) => v + k);
              }}
              className={`h-14 rounded-md text-base font-semibold transition-colors disabled:opacity-40 ${
                k === "enter"
                  ? "bg-pos-green text-black hover:brightness-110"
                  : k === "clear"
                    ? "bg-pos-red text-white hover:brightness-110"
                    : "bg-pos-tile text-foreground hover:bg-pos-hover"
              }`}
            >
              {k === "clear" ? <Delete className="mx-auto" size={18} /> : k === "enter" ? "Enter" : k}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2 text-center text-xs">
          {locked && <p className="text-pos-red">Too many attempts. Locked for {remaining}s</p>}
          {!locked && attempts > 0 && (
            <p className="text-pos-red">Wrong passcode · {MAX_ATTEMPTS - attempts} attempts left</p>
          )}
          <p className="text-[11px] text-muted-foreground/70">{BRAND_FOOTER}</p>
        </div>

      </div>
    </div>
  );
}
