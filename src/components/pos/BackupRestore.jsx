import { useCallback, useEffect, useState } from "react";
import { X, DatabaseBackup, FolderOpen, AlertTriangle } from "lucide-react";
import { usePos } from "../../lib/pos/store";
import { hashCode } from "../../lib/pos/config";
import { useDialog } from "./Dialog";

// Owner-only: pick one of the automatic backups and bring the shop's data back to that point.
// The data as it is right now is saved first, so a restore can itself be undone.

const sizeLabel = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
};

export default function BackupRestore({ open, onClose }) {
  const { products, sales, customers, settings, session, role, showToast } = usePos();
  const dialog = useDialog();
  const api = typeof window !== "undefined" ? window.posBackups : null;
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      setItems(await api.list());
    } catch {
      setItems([]);
    }
  }, [api]);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setInfo(null);
      refresh();
    }
  }, [open, refresh]);

  const choose = async (name) => {
    setSelected(name);
    setInfo(null);
    try {
      setInfo(await api.inspect(name));
    } catch (e) {
      setInfo({ ok: false, error: "Could not read this backup" });
    }
  };

  const backupNow = async () => {
    setBusy(true);
    const res = await api.create().catch(() => ({ ok: false, error: "failed" }));
    setBusy(false);
    if (res.ok) {
      showToast("Backup created");
      refresh();
    } else {
      showToast(`Backup failed${res.error ? `: ${res.error}` : ""}`, "error");
    }
  };

  const restore = async () => {
    if (!selected || !info?.ok) return;
    const pin = await dialog.prompt({
      title: "Restore this backup?",
      message:
        `All data will go back to ${when(info.entry.mtime)}.\n` +
        "Everything as it is now is saved first, so you can undo this.\n\n" +
        "Enter the owner passcode to continue.",
      inputType: "password",
      placeholder: "Owner passcode",
      confirmLabel: "Restore",
    });
    if (pin === null) return;
    if (hashCode(pin) !== settings.ownerPasscodeHash) {
      showToast("Wrong passcode", "error");
      return;
    }
    setBusy(true);
    const res = await api.restore(selected, { name: session?.name || "Owner", role }).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
    setBusy(false);
    if (res.ok) showToast("Backup restored. The app is reloading…");
    else showToast(res.error || "Restore failed", "error");
  };

  if (!open) return null;

  const fewer = info?.ok ? sales.length - info.summary.sales : 0;

  return (
    <div className="pos-no-print fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-pos-border bg-pos-panel">
        <div className="flex items-center justify-between border-b border-pos-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DatabaseBackup size={16} /> Restore from backup
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {!api ? (
          <p className="p-8 text-center text-xs text-muted-foreground">Backups can only be restored in the desktop app.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-pos-border px-4 py-2.5">
              <p className="mr-auto text-[11px] text-muted-foreground">A backup is made automatically every day. The last 14 are kept.</p>
              <button type="button" disabled={busy} onClick={backupNow} className="h-8 rounded bg-pos-tile px-3 text-xs font-semibold text-foreground hover:bg-pos-hover disabled:opacity-40">
                Back up now
              </button>
              <button type="button" onClick={() => api.openFolder()} className="flex h-8 items-center gap-1.5 rounded bg-pos-tile px-3 text-xs font-semibold text-foreground hover:bg-pos-hover">
                <FolderOpen size={13} /> Open folder
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <div className="w-1/2 overflow-auto border-r border-pos-border">
                {items === null ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">No backups yet. The first one is made when you save something tomorrow, or use “Back up now”.</p>
                ) : (
                  items.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => choose(b.name)}
                      className={`block w-full border-b border-pos-border px-4 py-2.5 text-left hover:bg-pos-hover ${selected === b.name ? "bg-pos-tile" : ""}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{b.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {when(b.mtime)} · {sizeLabel(b.size)}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div className="flex w-1/2 flex-col overflow-auto p-4">
                {!selected ? (
                  <p className="m-auto text-center text-xs text-muted-foreground">Pick a backup on the left to see what is inside it.</p>
                ) : !info ? (
                  <p className="m-auto text-xs text-muted-foreground">Checking the backup…</p>
                ) : !info.ok ? (
                  <div className="flex items-start gap-2 rounded-md border border-pos-red bg-pos-red/10 p-3 text-xs text-pos-red">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {info.error}
                  </div>
                ) : (
                  <>
                    <table className="mb-3 w-full text-left text-xs">
                      <thead className="text-muted-foreground">
                        <tr className="border-b border-pos-border">
                          <th className="py-2" />
                          <th className="text-right">This backup</th>
                          <th className="text-right">Now</th>
                        </tr>
                      </thead>
                      <tbody className="text-foreground">
                        {[
                          ["Products", info.summary.products, products.length],
                          ["Sales", info.summary.sales, sales.length],
                          ["Customers", info.summary.customers, customers.length],
                        ].map(([label, a, b]) => (
                          <tr key={label} className="border-b border-pos-border">
                            <td className="py-1.5">{label}</td>
                            <td className="text-right font-semibold">{a}</td>
                            <td className="text-right text-muted-foreground">{b}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="py-1.5">Last sale</td>
                          <td className="text-right font-semibold">{info.summary.lastSaleAt ? when(info.summary.lastSaleAt) : "—"}</td>
                          <td className="text-right text-muted-foreground">{sales.length ? when(sales[sales.length - 1].date) : "—"}</td>
                        </tr>
                      </tbody>
                    </table>
                    {fewer > 0 && (
                      <div className="mb-3 flex items-start gap-2 rounded-md border border-pos-amber bg-pos-amber/10 p-3 text-xs text-foreground">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-pos-amber" />
                        {fewer} sale(s) made after this backup will no longer be in the data. They stay in the safety copy that is saved first.
                      </div>
                    )}
                    <p className="mb-3 text-[11px] text-muted-foreground">
                      The audit log is never rewound: entries made after this backup stay, and the restore is recorded in it.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={restore}
                      className="mt-auto h-10 rounded-md bg-pos-red text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {busy ? "Please wait…" : "Restore this backup"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
