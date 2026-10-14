import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * SQLite connection.
 *
 * `node:sqlite` is built into Node 22.5+, so the platform needs no database
 * driver dependency. One synchronous connection is shared by the process: SQLite
 * is a single-writer store, and a synchronous handle makes the "one writer at a
 * time" guarantee explicit rather than implicit.
 */

const DEFAULT_DATABASE_FILE = './data/airline.db';

let connection;

export function databasePath() {
  const configured = process.env.DATABASE_FILE ?? DEFAULT_DATABASE_FILE;
  return resolve(process.cwd(), configured);
}

/** Opens (and caches) the database connection, creating the directory if needed. */
export function getDatabase() {
  if (connection) return connection;

  const file = databasePath();
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }

  connection = new DatabaseSync(file);
  connection.exec('PRAGMA foreign_keys = ON;');
  connection.exec('PRAGMA journal_mode = WAL;');
  connection.exec('PRAGMA busy_timeout = 5000;');
  return connection;
}

/** Closes the connection. Used by tests and graceful shutdown. */
export function closeDatabase() {
  if (!connection) return;
  connection.close();
  connection = undefined;
}

/**
 * Runs `fn` inside an IMMEDIATE transaction.
 *
 * `BEGIN IMMEDIATE` takes the write lock up front instead of on the first write,
 * which is what makes the seat-allocation invariant hold: two concurrent
 * bookings cannot both read a seat as AVAILABLE and then both write HELD, because
 * the second transaction blocks at BEGIN until the first commits.
 */
export function inTransaction(fn) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A rollback after a failed BEGIN has nothing to undo; the original error
      // is the one worth surfacing.
    }
    throw error;
  }
}

/** `true` when the error is SQLite's busy/locked code, which is worth retrying. */
export function isBusyError(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof error.code === 'string' &&
    (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED' ||
      error.message.includes('database is locked'))
  );
}

/**
 * Runs `fn`, retrying while SQLite reports contention.
 *
 * Synchronous by design: `node:sqlite` is synchronous, so an async wrapper would
 * only make every caller async without changing what happens on the wire. The
 * connection already sets `busy_timeout`, so a contended write waits before it
 * fails; this loop covers the remaining cases where the timeout expires.
 */
export function withWriteRetry(fn, options = {}) {
  const attempts = options.attempts ?? 5;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      if (!isBusyError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
