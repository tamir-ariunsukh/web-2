/**
 * Retry helper for SQLite write contention.
 *
 * `connection.js` owns the low-level retry loop; this module re-exports it under
 * the name the services use, so the intent ("retry a contended write") reads the
 * same everywhere.
 */

export { withWriteRetry, inTransaction, isBusyError } from './connection.js';
