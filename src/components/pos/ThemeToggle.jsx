import { Moon, Sun } from "lucide-react";
import { usePos } from "../../lib/pos/store";

// Small light / dark switch. Available to every role (cashier and owner) and
// on the lock screen. The choice is saved with the shop settings, so the
// shop's screen keeps its theme after a restart.
export default function ThemeToggle({ className = "" }) {
  const { settings, setTheme } = usePos();
  const light = settings?.theme === "light";
  const label = light ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button
      type="button"
      onClick={() => setTheme(light ? "dark" : "light")}
      title={label}
      aria-label={label}
      className={`pos-no-print flex h-9 w-9 items-center justify-center rounded-full border border-pos-border bg-pos-tile text-foreground transition-colors hover:bg-pos-hover ${className}`}
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
