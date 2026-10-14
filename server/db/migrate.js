/**
 * Creates the SQLite schema.
 *
 * `--reset` deletes the existing database file first, which is the closest
 * equivalent of `prisma migrate reset`: the seed is idempotent, so recreating the
 * file and re-seeding is the normal way to get back to a known state.
 */

import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { databasePath, getDatabase, closeDatabase } from './connection.js';

const here = dirname(fileURLToPath(import.meta.url));

export function migrate({ reset = false, verbose = true } = {}) {
  const file = databasePath();

  if (reset) {
    closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${file}${suffix}`, { force: true });
    }
    if (verbose) console.log(`Removed ${file}`);
  }

  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  const db = getDatabase();
  db.exec(sql);

  if (verbose) console.log(`Schema applied to ${file}`);
  return file;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('migrate.js');
if (invokedDirectly) {
  const reset = process.argv.includes('--reset');
  migrate({ reset });
  closeDatabase();
}
