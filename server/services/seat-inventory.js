import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { buildSeatMap } from '../lib/seat-map.js';
import { findFlightById, mapSeat, readSeatsByIds, readSeatsForUpdate } from './catalogue.js';

/**
 * Seat inventory.
 *
 * Every mutation runs inside `BEGIN IMMEDIATE`, which is the SQLite equivalent of
 * the original Postgres `SERIALIZABLE` transaction plus `SELECT ... FOR UPDATE`:
 * the write lock is taken before the seats are read, so no other writer can move
 * a seat between the read and the update. Without it, two bookings could both
 * observe a seat as AVAILABLE and both claim it.
 */

const DEFAULT_HOLD_MINUTES = 15;

function holdExpiry(now, holdMinutes) {
  return new Date(now.getTime() + holdMinutes * 60_000).toISOString();
}

/**
 * Holds the requested seats for one booking.
 *
 * A seat is reclaimable when it is AVAILABLE, or HELD with a hold that has
 * already lapsed — the latter is what makes an abandoned checkout recoverable
 * without waiting for the worker sweep.
 */
export function holdSeats({ flightId, seatIds, holdMinutes = DEFAULT_HOLD_MINUTES, now = new Date() }) {
  if (seatIds.length === 0) {
    throw AppError.validation('At least one seat must be selected');
  }

  const unique = Array.from(new Set(seatIds));
  if (unique.length !== seatIds.length) {
    throw AppError.validation('Duplicate seats in selection');
  }

  const expiresAt = holdExpiry(now, holdMinutes);
  const nowIso = now.toISOString();

  return withWriteRetry(() =>
    inTransaction((db) => {
      const rows = readSeatsForUpdate(db, flightId, unique);
      if (rows.length !== unique.length) {
        throw new AppError(ErrorCode.SEAT_NOT_FOUND, 'One or more seats do not exist on this flight');
      }

      const isReclaimable = (seat) =>
        seat.status === 'AVAILABLE' ||
        (seat.status === 'HELD' && seat.hold_expires_at !== null && seat.hold_expires_at <= nowIso);

      const conflicted = rows.filter((seat) => !isReclaimable(seat));
      if (conflicted.length > 0) {
        const numbers = conflicted.map((seat) => seat.seat_number);
        throw new AppError(
          ErrorCode.SEAT_ALREADY_TAKEN,
          `Seat ${numbers[0]} is no longer available`,
          { details: { seats: numbers } },
        );
      }

      const placeholders = unique.map(() => '?').join(', ');
      const result = db
        .prepare(
          `UPDATE seats
           SET status = 'HELD', hold_expires_at = ?
           WHERE id IN (${placeholders})
             AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at <= ?))`,
        )
        .run(expiresAt, ...unique, nowIso);

      if (result.changes !== unique.length) {
        throw new AppError(
          ErrorCode.SEAT_ALREADY_TAKEN,
          'Seats changed while your booking was being created',
        );
      }

      const held = readSeatsByIds(db, unique).map(mapSeat);
      return {
        held,
        surchargeTotal: held.reduce((sum, seat) => sum + seat.surcharge, 0),
        holdExpiresAt: expiresAt,
      };
    }),
  );
}

/** Returns held or booked seats to the pool. Used on expiry and cancellation. */
export function releaseSeats({ seatIds }) {
  if (seatIds.length === 0) return 0;

  return withWriteRetry(() =>
    inTransaction((db) => {
      const placeholders = seatIds.map(() => '?').join(', ');
      const result = db
        .prepare(
          `UPDATE seats SET status = 'AVAILABLE', hold_expires_at = NULL
           WHERE id IN (${placeholders}) AND status IN ('HELD', 'BOOKED')`,
        )
        .run(...seatIds);
      return result.changes;
    }),
  );
}

/** Promotes a held seat to booked once payment settles. */
export function confirmSeats(seatIds) {
  if (seatIds.length === 0) return 0;

  return withWriteRetry(() =>
    inTransaction((db) => {
      const placeholders = seatIds.map(() => '?').join(', ');
      const result = db
        .prepare(
          `UPDATE seats SET status = 'BOOKED', hold_expires_at = NULL
           WHERE id IN (${placeholders}) AND status = 'HELD'`,
        )
        .run(...seatIds);
      return result.changes;
    }),
  );
}

/** Releases holds whose window lapsed, so an abandoned checkout frees the seat. */
export function releaseExpiredHolds({ now = new Date(), limit = 500 } = {}) {
  const stale = getDatabase()
    .prepare("SELECT id FROM seats WHERE status = 'HELD' AND hold_expires_at < ? LIMIT ?")
    .all(now.toISOString(), limit);

  if (stale.length === 0) return 0;
  return releaseSeats({ seatIds: stale.map((row) => row.id) });
}

/** Builds the nested map the seat picker renders. */
export function getSeatMap(flightId, cabin) {
  const flight = findFlightById(flightId);
  if (!flight) throw AppError.notFound('Flight', flightId);

  const sql = cabin
    ? 'SELECT * FROM seats WHERE flight_id = ? AND cabin = ? ORDER BY row ASC, column_letter ASC'
    : 'SELECT * FROM seats WHERE flight_id = ? ORDER BY row ASC, column_letter ASC';
  const statement = getDatabase().prepare(sql);
  const rows = cabin ? statement.all(flightId, cabin) : statement.all(flightId);

  const layout = flight.seatLayoutId
    ? getDatabase()
        .prepare('SELECT * FROM seat_layouts WHERE id = ?')
        .get(flight.seatLayoutId)
    : undefined;

  return buildSeatMap({
    layoutId: flight.seatLayoutId ?? flight.id,
    aircraftModel: layout?.aircraft_model ?? 'Unknown',
    configuration: layout?.configuration ?? undefined,
    seats: rows.map((row) => ({
      id: row.id,
      seatNumber: row.seat_number,
      row: row.row,
      column: row.column_letter,
      cabin: row.cabin,
      position: row.position,
      status: row.status,
      surcharge: row.surcharge,
      isExitRow: row.is_exit_row,
      isBulkhead: row.is_bulkhead,
      hasBassinet: row.has_bassinet,
      holdExpiresAt: row.hold_expires_at,
    })),
  });
}

export { DEFAULT_HOLD_MINUTES };
