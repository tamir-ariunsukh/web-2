import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { BookingStatus } from '../lib/enums.js';

/**
 * Background maintenance.
 *
 * The original build ran this on a BullMQ repeatable job backed by Redis. There
 * is nothing here that needs a queue: one sweep per minute inside a single
 * process, guarded so a slow sweep cannot overlap itself, is the same behaviour
 * with none of the infrastructure.
 */

const SWEEP_INTERVAL_MS = 60_000;
const MAX_BATCH = 1_000;

/**
 * Releases seats whose hold lapsed and expires the bookings that own them.
 *
 * Order matters: seats are released before the booking is marked EXPIRED. The
 * reverse would leave a booking in a state where its seats are still held but the
 * hold window has passed, which is exactly the orphaned-hold case the second pass
 * below cleans up.
 */
export function sweepExpiredHolds(now = new Date()) {
  const db = getDatabase();
  const nowIso = now.toISOString();

  const staleSeats = db
    .prepare("SELECT id, flight_id FROM seats WHERE status = 'HELD' AND hold_expires_at < ? LIMIT ?")
    .all(nowIso, MAX_BATCH);

  if (staleSeats.length === 0) return { releasedSeats: 0, expiredBookings: 0 };

  const seatIds = staleSeats.map((seat) => seat.id);
  const placeholders = seatIds.map(() => '?').join(', ');

  const candidatePnrs = db
    .prepare(`SELECT DISTINCT booking_pnr FROM booking_seats WHERE seat_id IN (${placeholders})`)
    .all(...seatIds)
    .map((row) => row.booking_pnr);

  let releasedSeats = 0;
  let expiredBookings = 0;

  if (candidatePnrs.length > 0) {
    const bookingPlaceholders = candidatePnrs.map(() => '?').join(', ');
    const releasable = db
      .prepare(
        `SELECT pnr, status FROM bookings
         WHERE pnr IN (${bookingPlaceholders})
           AND status IN ('HELD', 'PENDING_PAYMENT')
           AND (expires_at IS NULL OR expires_at < ?)`,
      )
      .all(...candidatePnrs, nowIso);

    for (const booking of releasable) {
      withWriteRetry(() =>
        inTransaction((tx) => {
          const owned = tx
            .prepare('SELECT seat_id FROM booking_seats WHERE booking_pnr = ?')
            .all(booking.pnr)
            .map((row) => row.seat_id);

          if (owned.length > 0) {
            const ownedPlaceholders = owned.map(() => '?').join(', ');
            const freed = tx
              .prepare(
                `UPDATE seats SET status = 'AVAILABLE', hold_expires_at = NULL
                 WHERE id IN (${ownedPlaceholders}) AND status = 'HELD'`,
              )
              .run(...owned);
            releasedSeats += freed.changes;
          }

          tx.prepare("UPDATE bookings SET status = 'EXPIRED', expires_at = NULL, updated_at = datetime('now') WHERE pnr = ?").run(
            booking.pnr,
          );
          tx.prepare(
            `INSERT INTO booking_events (booking_pnr, from_status, to_status, actor_type, message)
             VALUES (?, ?, 'EXPIRED', 'system', 'Hold expired before payment')`,
          ).run(booking.pnr, booking.status);

          expiredBookings += 1;
        }),
      );
    }
  }

  // Seats held by a booking that already reached a terminal state have no owner
  // left to release them, so they are swept here.
  const orphaned = db
    .prepare(
      `SELECT id FROM seats WHERE id IN (${placeholders}) AND status = 'HELD' AND hold_expires_at < ? LIMIT ?`,
    )
    .all(...seatIds, nowIso, MAX_BATCH);

  if (orphaned.length > 0) {
    const orphanPlaceholders = orphaned.map(() => '?').join(', ');
    const result = db
      .prepare(
        `UPDATE seats SET status = 'AVAILABLE', hold_expires_at = NULL
         WHERE id IN (${orphanPlaceholders}) AND status = 'HELD'`,
      )
      .run(...orphaned.map((seat) => seat.id));
    releasedSeats += result.changes;
  }

  return { releasedSeats, expiredBookings };
}

/**
 * Starts the sweep on a fixed interval.
 *
 * Returns a stop function for graceful shutdown. Overlapping runs are prevented
 * with a flag rather than a lock: if a sweep is still running when the next tick
 * fires, the tick is skipped.
 */
export function startMaintenance({ intervalMs = SWEEP_INTERVAL_MS, logger = console } = {}) {
  let running = false;

  const tick = () => {
    if (running) return;
    running = true;
    try {
      const result = sweepExpiredHolds();
      if (result.releasedSeats > 0 || result.expiredBookings > 0) {
        logger.info(
          `hold sweep: released ${result.releasedSeats} seat(s), expired ${result.expiredBookings} booking(s)`,
        );
      }
    } catch (error) {
      logger.error('hold sweep failed', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  // Run once at boot so a server restarted after downtime does not wait a full
  // interval before reclaiming lapsed holds.
  tick();

  return () => clearInterval(timer);
}

export { SWEEP_INTERVAL_MS, BookingStatus };
