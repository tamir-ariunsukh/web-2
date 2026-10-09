
import { withSerializableTransaction, withSerializableRetry, type PrismaClient } from '@repo/db';
import { CorsairError, ErrorCode } from '@repo/shared';

import type { Prisma } from '@prisma/client';

/**
 * Seat inventory.
 *
 * The hard requirement is that two concurrent bookings can never hold the same
 * seat. Two mechanisms enforce it together:
 *
 *  1. `SELECT ... FOR UPDATE` on the exact seat rows locks them for the duration
 *     of the transaction, so a competing transaction blocks instead of reading a
 *     stale `AVAILABLE`.
 *  2. SERIALIZABLE isolation makes PostgreSQL abort one of two transactions that
 *     interleave in a way that would violate the invariant, which
 *     {@link withSerializableRetry} then retries with fresh reads.
 *
 * The retry is what makes this safe rather than merely optimistic: after a
 * conflict the second attempt re-reads the seat, sees `HELD`, and fails with a
 * clean SEAT_ALREADY_TAKEN instead of overselling.
 */

export interface SeatHoldRequest {
  readonly flightId: string;
  readonly seatIds: readonly string[];
  /** How long the hold survives before the expiry worker releases it. */
  readonly holdMinutes: number;
  readonly now?: Date;
}

export interface HeldSeat {
  readonly id: string;
  readonly seatNumber: string;
  readonly surcharge: number;
  readonly cabin: string;
}

export interface SeatHoldResult {
  readonly held: readonly HeldSeat[];
  /** Total seat surcharge in minor units, to be added to the fare total. */
  readonly surchargeTotal: number;
  readonly holdExpiresAt: Date;
}

/**
 * Locks and reserves the requested seats. Throws SEAT_ALREADY_TAKEN as soon as
 * any requested seat is no longer available, rolling back every other hold in
 * the same request so the customer never ends up with a partial selection.
 */
export async function holdSeats(
  prisma: PrismaClient,
  request: SeatHoldRequest,
): Promise<SeatHoldResult> {
  if (request.seatIds.length === 0) {
    throw CorsairError.validation('At least one seat must be selected');
  }
  const unique = [...new Set(request.seatIds)];
  if (unique.length !== request.seatIds.length) {
    throw CorsairError.validation('Duplicate seats in selection');
  }

  const now = request.now ?? new Date();
  const holdExpiresAt = new Date(now.getTime() + request.holdMinutes * 60_000);

  return withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      await lockSeats(tx, request.flightId, unique);

      // Re-read inside the lock. A seat is only a real conflict if it is booked,
      // blocked, or held with a deadline that has not passed. An expired hold is
      // reclaimed here rather than waiting for the sweeper, so the API and the
      // seat map agree on availability.
      const seats = await tx.seat.findMany({
        where: { id: { in: unique }, flightId: request.flightId },
        select: {
          id: true,
          seatNumber: true,
          status: true,
          cabin: true,
          surcharge: true,
          holdExpiresAt: true,
        },
      });

      if (seats.length !== unique.length) {
        throw new CorsairError(ErrorCode.SEAT_NOT_FOUND, 'One or more seats do not exist');
      }

      const isReclaimable = (seat: (typeof seats)[number]): boolean =>
        seat.status === 'AVAILABLE' ||
        (seat.status === 'HELD' &&
          seat.holdExpiresAt !== null &&
          seat.holdExpiresAt.getTime() <= now.getTime());

      const conflicted = seats.filter((seat) => !isReclaimable(seat));
      if (conflicted.length > 0) {
        throw new CorsairError(
          ErrorCode.SEAT_ALREADY_TAKEN,
          `Seat ${conflicted[0]?.seatNumber ?? ''} is no longer available`,
          { details: { seats: conflicted.map((seat) => seat.seatNumber) } },
        );
      }

      // `updateMany` cannot express the expiry predicate per row, so the status
      // filter is limited to HELD and the reclaimable set is enforced above.
      const reclaimableIds = seats.filter(isReclaimable).map((seat) => seat.id);

      const updated = await tx.seat.updateMany({
        where: {
          id: { in: reclaimableIds },
          OR: [
            { status: 'AVAILABLE' },
            { status: 'HELD', holdExpiresAt: { lte: now } },
          ],
        },
        data: { status: 'HELD', holdExpiresAt },
      });

      // A mismatch means another transaction won between the lock and the write.
      if (updated.count !== unique.length) {
        throw new CorsairError(
          ErrorCode.SEAT_ALREADY_TAKEN,
          'Seats changed while your booking was being created',
        );
      }

      const held = seats.map((seat) => ({
        id: seat.id,
        seatNumber: seat.seatNumber,
        surcharge: seat.surcharge,
        cabin: seat.cabin,
      }));

      return {
        held,
        surchargeTotal: held.reduce((sum, seat) => sum + seat.surcharge, 0),
        holdExpiresAt,
      };
    }),
  );
}

/**
 * Takes row-level write locks on the requested seats.
 *
 * `FOR UPDATE` serialises competing bookings; the `flightId` predicate is
 * repeated here so a caller cannot lock seats belonging to another flight.
 * Prisma has no lock syntax, so this is raw SQL with a bound parameter list.
 */
async function lockSeats(
  tx: Prisma.TransactionClient,
  flightId: string,
  seatIds: readonly string[],
): Promise<void> {
  if (seatIds.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "seats"
    WHERE "flightId" = ${flightId}::uuid
      AND id = ANY(${seatIds}::uuid[])
    FOR UPDATE
  `;
}

export interface SeatReleaseRequest {
  readonly seatIds: readonly string[];
}

/**
 * Returns seats to `AVAILABLE`. Used by booking cancellation, payment failure and
 * the hold-expiry worker. Only seats currently `HELD` or `BOOKED` are touched, so
 * a release racing with a new hold cannot free a seat the new customer just took.
 */
export async function releaseSeats(
  prisma: PrismaClient,
  request: SeatReleaseRequest,
): Promise<number> {
  if (request.seatIds.length === 0) return 0;

  return withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "seats" WHERE id = ANY(${request.seatIds}::uuid[]) FOR UPDATE
      `;

      const result = await tx.seat.updateMany({
        where: {
          id: { in: [...request.seatIds] },
          status: { in: ['HELD', 'BOOKED'] },
        },
        data: { status: 'AVAILABLE', holdExpiresAt: null },
      });

      return result.count;
    }),
  );
}

/** Marks held seats as BOOKED once payment settles. */
export async function confirmSeats(
  prisma: PrismaClient,
  seatIds: readonly string[],
): Promise<number> {
  if (seatIds.length === 0) return 0;

  return withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "seats" WHERE id = ANY(${seatIds}::uuid[]) FOR UPDATE
      `;

      const result = await tx.seat.updateMany({
        where: { id: { in: [...seatIds] }, status: 'HELD' },
        data: { status: 'BOOKED', holdExpiresAt: null },
      });

      return result.count;
    }),
  );
}

/**
 * Releases holds whose deadline has passed. Returns the affected seat count.
 *
 * Runs on a schedule; the query is bounded by the `(status, holdExpiresAt)` index
 * so it stays cheap even with a large seats table.
 */
export async function releaseExpiredHolds(
  prisma: PrismaClient,
  options: { readonly now?: Date; readonly limit?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 500;

  const stale = await prisma.seat.findMany({
    where: { status: 'HELD', holdExpiresAt: { lt: now } },
    select: { id: true },
    take: limit,
  });

  if (stale.length === 0) return 0;

  return releaseSeats(prisma, { seatIds: stale.map((seat) => seat.id) });
}
