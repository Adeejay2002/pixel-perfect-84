"use strict";
// ---------------------------------------------------------------------------
// Backup list / preview / restore for the automatic SQLite backups.
//
// Backup files live in <userData>/backups:
//   pos-YYYY-MM-DD.db          daily backup (made on the first save of each day)
//   manual-<time>.db           "Back up now" button
//   pre-update-<time>.db       taken just before an app update is installed
//   pre-migration-v<n>-*.db    taken just before a database upgrade
//   pre-restore-<time>.db      taken just before a restore (so a restore can be undone)
//
// Restoring replaces the whole database file, then keeps the audit log: audit
// entries written after the backup was taken are copied into the restored
// database, so history is never rewound, and the restore itself is recorded.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const os = require("os");

const KINDS = [
  { kind: "daily", re: /^pos-\d{4}-\d{2}-\d{2}\.db$/, label: "Daily backup" },
  { kind: "manual", re: /^manual-.*\.db$/, label: "Manual backup" },
  { kind: "pre-update", re: /^pre-update-.*\.db$/, label: "Before an app update" },
  { kind: "pre-migration", re: /^pre-migration-v\d+-.*\.db$/, label: "Before a database upgrade" },
  { kind: "pre-restore", re: /^pre-restore-.*\.db$/, label: "Before a restore" },
];
const KEEP = { manual: 10, "pre-restore": 5 };

function kindOf(name) {
  return KINDS.find((k) => k.re.test(name)) || null;
}

// Newest first. Only files this app creates are listed, so a name from the
// screen can never point anywhere else.
function listBackups(backupDir) {
  let names = [];
  try {
    names = fs.readdirSync(backupDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const k = kindOf(name);
    if (!k) continue;
    try {
      const st = fs.statSync(path.join(backupDir, name));
      if (!st.isFile()) continue;
      out.push({ name, kind: k.kind, label: k.label, size: st.size, mtime: st.mtime.toISOString() });
    } catch {
      /* file vanished */
    }
  }
  return out.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

function pruneKind(backupDir, kind) {
  const keep = KEEP[kind];
  if (!keep) return;
  const files = listBackups(backupDir).filter((b) => b.kind === kind);
  for (const f of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(backupDir, f.name));
    } catch {
      /* ignore */
    }
  }
}

function createManualBackup(store, backupDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `manual-${stamp}.db`;
  store.backupTo(path.join(backupDir, name));
  pruneKind(backupDir, "manual");
  return name;
}

function findEntry(backupDir, name) {
  return listBackups(backupDir).find((b) => b.name === name) || null;
}

// Looks inside a backup without touching it (works on a temporary copy).
function inspectBackup({ backupDir, name, openDatabase, maxVersion }) {
  const entry = findEntry(backupDir, name);
  if (!entry) return { ok: false, error: "Backup not found" };
  const tmp = path.join(os.tmpdir(), `jnex-inspect-${process.pid}-${Date.now()}.db`);
  let db = null;
  try {
    fs.copyFileSync(path.join(backupDir, name), tmp);
    db = openDatabase(tmp);
    const check = db.prepare("PRAGMA quick_check").all();
    const first = check[0] && Object.values(check[0])[0];
    if (first !== "ok") return { ok: false, error: "This backup file is damaged" };
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (!version) return { ok: false, error: "This file is not a Jnex POS backup" };
    if (version > maxVersion) return { ok: false, error: "This backup was made by a newer version of the app. Update the app first." };
    const counts = {};
    for (const row of db.prepare("SELECT collection, COUNT(*) AS n FROM records GROUP BY collection").all()) counts[row.collection] = row.n;
    let lastSaleAt = null;
    const last = db.prepare("SELECT data FROM records WHERE collection = 'sales' ORDER BY ord DESC LIMIT 1").get();
    if (last) {
      try {
        lastSaleAt = JSON.parse(last.data).date || null;
      } catch {
        /* ignore */
      }
    }
    return {
      ok: true,
      entry,
      summary: {
        products: counts.products || 0,
        sales: counts.sales || 0,
        customers: counts.customers || 0,
        lastSaleAt,
      },
    };
  } catch (err) {
    return { ok: false, error: "Could not read this backup: " + String((err && err.message) || err) };
  } finally {
    try {
      if (db) db.close();
    } catch {
      /* ignore */
    }
    for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  }
}

function removeWalFiles(dbFile) {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbFile + suffix);
    } catch {
      /* not there */
    }
  }
}

// Replaces the live database with a backup. `store` is the open database; it is
// closed here, and the new open store is returned. If anything goes wrong the
// previous data is put back.
function restoreBackup({ store, dbFile, backupDir, name, createStore, openDatabase, maxVersion, actor }) {
  const info = inspectBackup({ backupDir, name, openDatabase, maxVersion });
  if (!info.ok) return { ok: false, error: info.error, store };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyName = `pre-restore-${stamp}.db`;
  const safetyPath = path.join(backupDir, safetyName);
  try {
    store.backupTo(safetyPath); // everything as it is right now
  } catch (err) {
    return { ok: false, error: "Could not save a safety copy first: " + String((err && err.message) || err), store };
  }

  store.close();
  let next = null;
  try {
    removeWalFiles(dbFile);
    fs.copyFileSync(path.join(backupDir, name), `${dbFile}.restoring`);
    fs.renameSync(`${dbFile}.restoring`, dbFile);
    next = createStore(dbFile, backupDir);

    // keep the audit log continuous: bring over every entry made after the backup
    try {
      next._db.exec(`ATTACH DATABASE '${safetyPath.replace(/'/g, "''")}' AS prev`);
      next._db.exec(
        `INSERT OR IGNORE INTO records (collection, id, ord, data, updated_at)
         SELECT collection, id, ord, data, updated_at FROM prev.records WHERE collection = 'auditLog'`,
      );
      next._db.exec("DETACH DATABASE prev");
    } catch (err) {
      console.error("Audit log carry-over failed:", err);
      try {
        next._db.exec("DETACH DATABASE prev");
      } catch {
        /* not attached */
      }
    }

    next.applyDelta({
      upserts: {
        auditLog: [
          {
            id: `al-restore-${stamp}`,
            at: new Date().toISOString(),
            action: "system.restore",
            actorName: (actor && actor.name) || null,
            actorRole: (actor && actor.role) || null,
            details: { from: name, safetyCopy: safetyName, ...info.summary },
          },
        ],
      },
      deletes: {},
      scalars: {},
    });
    pruneKind(backupDir, "pre-restore");
    return { ok: true, store: next, safetyCopy: safetyName, summary: info.summary };
  } catch (err) {
    // put the previous data back
    try {
      if (next) next.close();
    } catch {
      /* ignore */
    }
    try {
      removeWalFiles(dbFile);
      fs.copyFileSync(safetyPath, dbFile);
      const back = createStore(dbFile, backupDir);
      return { ok: false, error: "Restore failed, nothing was changed: " + String((err && err.message) || err), store: back };
    } catch (err2) {
      return { ok: false, error: "Restore failed and the database could not be reopened: " + String((err2 && err2.message) || err2), store: null };
    }
  }
}

module.exports = { listBackups, inspectBackup, restoreBackup, createManualBackup, kindOf, KINDS };
