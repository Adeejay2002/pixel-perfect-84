import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// In-app replacements for window.confirm / window.prompt.
// Electron does not support prompt() at all, and confirm() can leave text
// inputs unresponsive afterwards, so every question is asked with this instead.
//
//   const dialog = useDialog();
//   if (await dialog.confirm({ title: "Delete?", message: "…", danger: true })) { … }
//   const reason = await dialog.prompt({ title: "Reason", placeholder: "optional" });  // string | null

const DialogContext = createContext(null);

const FALLBACK = {
  confirm: async ({ message, title }) => (typeof window !== "undefined" ? window.confirm(message || title) : false),
  prompt: async ({ message, title, defaultValue }) => (typeof window !== "undefined" ? window.prompt(message || title, defaultValue || "") : null),
};

export function useDialog() {
  return useContext(DialogContext) || FALLBACK;
}

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [value, setValue] = useState("");
  const resolveRef = useRef(null);
  const dlgRef = useRef(null);
  dlgRef.current = dlg;

  const settle = useCallback((result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDlg(null);
    if (resolve) resolve(result);
  }, []);

  const open = useCallback(
    (cfg) =>
      new Promise((resolve) => {
        // a new question replaces an unanswered one (counts as "cancel")
        if (resolveRef.current) resolveRef.current(cfg.kind === "confirm" ? false : null);
        resolveRef.current = resolve;
        setValue(cfg.defaultValue || "");
        setDlg(cfg);
      }),
    [],
  );

  const api = useMemo(
    () => ({
      confirm: (opts = {}) => open({ kind: "confirm", ...opts }),
      prompt: (opts = {}) => open({ kind: "prompt", ...opts }),
    }),
    [open],
  );

  const cancel = useCallback(() => settle(dlgRef.current?.kind === "confirm" ? false : null), [settle]);
  const accept = useCallback(() => {
    const d = dlgRef.current;
    if (!d) return;
    settle(d.kind === "confirm" ? true : value);
  }, [settle, value]);

  useEffect(() => {
    if (!dlg) return undefined;
    // capture phase + stopPropagation so the POS shortcuts (F-keys, Esc, digits
    // on the payment pad) do not react to keys typed into the dialog
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === "Enter" && !(dlg.multiline && !e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        accept();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dlg, cancel, accept]);

  const inputCls = "w-full rounded border border-pos-border bg-pos-tile px-3 py-2 text-sm text-foreground outline-none";

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dlg && (
        <div data-pos-dialog className="pos-no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
          <div className="w-full max-w-sm rounded-lg border border-pos-border bg-pos-panel p-5 shadow-2xl">
            {dlg.title && <p className="mb-1 text-sm font-semibold text-foreground">{dlg.title}</p>}
            {dlg.message && <p className="mb-3 whitespace-pre-line text-xs text-muted-foreground">{dlg.message}</p>}
            {dlg.kind === "prompt" &&
              (dlg.multiline ? (
                <textarea
                  autoFocus
                  rows={3}
                  value={value}
                  maxLength={dlg.maxLength || 200}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={dlg.placeholder}
                  className={`${inputCls} mb-4 resize-none`}
                />
              ) : (
                <input
                  autoFocus
                  type={dlg.inputType || "text"}
                  inputMode={dlg.inputMode}
                  value={value}
                  maxLength={dlg.maxLength || 200}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={dlg.placeholder}
                  className={`${inputCls} mb-4`}
                />
              ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={cancel} className="h-9 rounded bg-pos-tile text-xs font-semibold text-foreground hover:bg-pos-hover">
                {dlg.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                autoFocus={dlg.kind === "confirm"}
                onClick={accept}
                className={`h-9 rounded text-xs font-semibold ${dlg.danger ? "bg-pos-red text-white" : "bg-pos-blue text-white"} hover:brightness-110`}
              >
                {dlg.confirmLabel || "OK"}
              </button>
            </div>
            {dlg.multiline && <p className="mt-2 text-[10px] text-muted-foreground">Ctrl+Enter to save</p>}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
