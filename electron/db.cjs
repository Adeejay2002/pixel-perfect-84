"use strict";
// ---------------------------------------------------------------------------
// SQLite storage for Jnex POS (runs in the Electron main process only).
//
// Layout (schema v1):
//   records(collection, id, ord, data, updated_at)  one row per product / sale /
//                                                   customer / ... (JSON in `data`)
//   state(key, value, updated_at)                   single values: settings,
//                                                   nextSaleNo, open shift, ...
//   changes(seq, collection, record_id, op, at, synced)
//                                                   change log; the future cloud
//                                                   sync reads rows with synced=0
//   meta(key, value)                                bookkeeping (legacy import flag)
//
// The renderer still works with one big state object. Saves arrive as
// DELTAS (only the rows that changed), so a sale touches a few rows instead
// of rewriting the whole database.
//
// Schema upgrades: add a function to MIGRATIONS. It runs once per database
// (tracked by PRAGMA user_version), inside a transaction, after an automatic
// copy of the database is placed in the backups folder.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");

// Collections kept in the app's state (loaded at start, saved as deltas).
const COLLECTIONS = [
  "categories", "products", "customers", "sales", "heldSales", "shifts",
  "suppliers", "purchases", "batches", "expenses",
];
// Append-only history, written by the app but never loaded into its state.
// Rows here are never deleted by the app (auditLog is also protected by triggers).
const LEDGER_COLLECTIONS = ["stockMovements", "priceHistory", "auditLog"];

const MIGRATIONS = [
  // v1 — initial schema
  (db) => {
    db.exec(`
      CREATE TABLE records (
        collection TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        ord        INTEGER NOT NULL,
        data       TEXT    NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX idx_records_order ON records (collection, ord);

      CREATE TABLE state (
        key        TEXT PRIMARY KEY,
        value      TEXT    NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE changes (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT    NOT NULL,
        record_id  TEXT    NOT NULL,
        op         TEXT    NOT NULL,
        at         INTEGER NOT NULL,
        synced     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_changes_unsynced ON changes (synced, seq);

      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },
  // v2 — the audit log can be added to but never edited or deleted
  (db) => {
    db.exec(`
      CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON records
      WHEN OLD.collection = 'auditLog'
      BEGIN SELECT RAISE(ABORT, 'auditLog is append-only'); END;

      CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON records
      WHEN OLD.collection = 'auditLog'
      BEGIN SELECT RAISE(ABORT, 'auditLog is append-only'); END;
    `);
  },
  // v3 — add the next schema change here, e.g.:
  // (db) => { db.exec("ALTER TABLE ..."); },
];

function openDatabase(file) {
  let firstError;
  try {
    const Database = require("better-sqlite3");
    return new Database(file);
  } catch (err) {
    firstError = err;
  }
  try {
    // newer Node/Electron builds ship SQLite built in
    const { DatabaseSync } = require("node:sqlite");
    return new DatabaseSync(file);
  } catch {
    throw new Error(`No SQLite driver available (${firstError && firstError.message})`);
  }
}

function inTransaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
}

function userVersion(db) {
  return db.prepare("PRAGMA user_version").get().user_version;
}

function runMigrations(db, file, backupDir) {
  const current = userVersion(db);
  if (current >= MIGRATIONS.length) return;

  // Existing database that is about to change shape: keep a copy first.
  if (current > 0 && backupDir) {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(file, path.join(backupDir, `pre-migration-v${current}-${Date.now()}.db`));
    } catch (err) {
      console.error("Pre-migration backup failed:", err);
    }
  }

  for (let v = current; v < MIGRATIONS.length; v++) {
    inTransaction(db, () => {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function createStore(file, backupDir) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = openDatabase(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL"); // shops get power cuts: favour durability
  runMigrations(db, file, backupDir);

  const q = {
    upsertRecord: db.prepare(
      `INSERT INTO records (collection, id, ord, data, updated_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(ord), -1) + 1 FROM records WHERE collection = ?), ?, ?)
       ON CONFLICT (collection, id) DO UPDATE
         SET data = excluded.data, updated_at = excluded.updated_at
         WHERE records.data <> excluded.data`,
    ),
    deleteRecord: db.prepare("DELETE FROM records WHERE collection = ? AND id = ?"),
    listIds: db.prepare("SELECT id FROM records WHERE collection = ?"),
    listRecords: db.prepare("SELECT data FROM records WHERE collection = ? ORDER BY ord"),
    upsertState: db.prepare(
      `INSERT INTO state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
       WHERE state.value <> excluded.value`,
    ),
    deleteState: db.prepare("DELETE FROM state WHERE key = ?"),
    listState: db.prepare("SELECT key, value FROM state"),
    logChange: db.prepare("INSERT INTO changes (collection, record_id, op, at) VALUES (?, ?, ?, ?)"),
    getMeta: db.prepare("SELECT value FROM meta WHERE key = ?"),
    setMeta: db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    ),
    countRecords: db.prepare("SELECT COUNT(*) AS n FROM records"),
    countState: db.prepare("SELECT COUNT(*) AS n FROM state"),
  };

  function putRecord(collection, id, record, now) {
    const res = q.upsertRecord.run(collection, id, collection, JSON.stringify(record), now);
    if (res.changes > 0) q.logChange.run(collection, id, "upsert", now);
  }
  function removeRecord(collection, id, now) {
    const res = q.deleteRecord.run(collection, id);
    if (res.changes > 0) q.logChange.run(collection, id, "delete", now);
  }
  function putState(key, value, now) {
    q.upsertState.run(key, JSON.stringify(value === undefined ? null : value), now);
  }

  function isEmpty() {
    return q.countRecords.get().n === 0 && q.countState.get().n === 0;
  }

  // Whole state object, same shape the renderer has always used.
  // Returns null for a brand-new (empty) database.
  function loadState() {
    if (isEmpty()) return null;
    const state = {};
    for (const c of COLLECTIONS) {
      state[c] = q.listRecords.all(c).map((r) => JSON.parse(r.data));
    }
    for (const row of q.listState.all()) {
      state[row.key] = JSON.parse(row.value);
    }
    return state;
  }

  // Only what changed: { upserts: {coll: [rec]}, deletes: {coll: [id]}, scalars: {key: value} }
  function applyDelta(delta) {
    const now = Date.now();
    inTransaction(db, () => {
      for (const [collection, records] of Object.entries(delta.upserts || {})) {
        for (const rec of records) {
          if (!rec || rec.id === undefined || rec.id === null) {
            throw new Error(`Record without id in "${collection}"`);
          }
          putRecord(collection, String(rec.id), rec, now);
        }
      }
      for (const [collection, ids] of Object.entries(delta.deletes || {})) {
        if (LEDGER_COLLECTIONS.includes(collection)) continue; // history is never deleted
        for (const id of ids) removeRecord(collection, String(id), now);
      }
      for (const [key, value] of Object.entries(delta.scalars || {})) {
        putState(key, value, now);
      }
    });
    return true;
  }

  // Replace everything with `state` (first save, restore, import, system reset).
  function replaceAll(state) {
    const now = Date.now();
    inTransaction(db, () => {
      for (const c of COLLECTIONS) {
        const list = Array.isArray(state[c]) ? state[c] : [];
        const keep = new Set();
        list.forEach((rec, i) => {
          const id = String(rec && rec.id !== undefined && rec.id !== null ? rec.id : `${c}#${i}`);
          keep.add(id);
          putRecord(c, id, rec, now);
        });
        for (const row of q.listIds.all(c)) {
          if (!keep.has(row.id)) removeRecord(c, row.id, now);
        }
      }
      const scalarKeys = Object.keys(state).filter((k) => !COLLECTIONS.includes(k));
      for (const key of scalarKeys) putState(key, state[key], now);
      for (const row of q.listState.all()) {
        if (!scalarKeys.includes(row.key)) q.deleteState.run(row.key);
      }
    });
    return true;
  }

  // One-time import of the old pos-data.json. The JSON file is kept (renamed)
  // as a safety copy; it is never deleted.
  function importLegacyJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) return { imported: false };
    if (q.getMeta.get("legacy_import")) return { imported: false };
    if (!isEmpty()) return { imported: false };
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch (err) {
      console.error("Legacy pos-data.json unreadable, not imported:", err);
      return { imported: false, error: String(err) };
    }
    replaceAll(parsed);
    q.setMeta.run("legacy_import", new Date().toISOString());
    try {
      fs.renameSync(jsonPath, `${jsonPath}.imported-${Date.now()}`);
    } catch (err) {
      console.error("Could not rename legacy file:", err);
    }
    return { imported: true };
  }

  // Consistent snapshot of the live database (safe while the app is running).
  function backupTo(target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.unlinkSync(target);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  }

  function close() {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
    db.close();
  }

  return { loadState, applyDelta, replaceAll, importLegacyJson, backupTo, close, isEmpty, _db: db };
}

module.exports = { createStore, openDatabase, COLLECTIONS, LEDGER_COLLECTIONS, MIGRATIONS };
