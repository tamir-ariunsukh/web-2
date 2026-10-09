import { randomUUID } from 'node:crypto';


import { withSerializableRetry, withSerializableTransaction } from '@repo/db';
import {
  BookingStatus,
  CorsairError,
  ErrorCode,
  computeTotal,
  generatePnr,
  guardBookingTransition,
  releasesSeats,
  requiresRefund,
  requiresTicketVoid,
  type CreateBookingInput,
  type SeatSelectionInput,
} from '@repo/shared';

import { isPrivileged } from '../context.js';
import { holdSeats } from '../seats/seat-inventory.js';

import type { GraphQLContext } from '../context.js';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Booking orchestration.
 *
 * Every state change goes through {@link transitionBooking} so the state machine
 * in @repo/shared stays the only authority on what is legal, and so each change
 * is recorded in `booking_events`.
 */

const PNR_ATTEMPTS = 5;
const DEFAULT_HOLD_MINUTES = 15;

/**
 * Creates a booking in HELD.
 *
 * Fare prices are snapshotted inside the transaction so a concurrent price change
 * cannot leave the booking total inconsistent with its stored segments.
 */
export async function createBooking(
  context: GraphQLContext,
  input: CreateBookingInput,
): Promise<string> {
  const { prisma, logger, user } = context;

  if (input.idempotencyKey) {
    const existing = await prisma.booking.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { pnr: true },
    });
    if (existing) {
      logger.info(
        { pnr: existing.pnr, idempotencyKey: input.idempotencyKey },
        'returning existing booking for idempotent create',
      );
      return existing.pnr;
    }
  }

  const pnr = await withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      const reference = await allocatePnr(tx);
      const priced = await priceItinerary(tx, input.segments);

      const total = computeTotal({
        baseFare: priced.baseFare,
        taxes: priced.taxes,
        fees: priced.fees,
        discount: priced.discount,
      });

      await tx.booking.create({
        data: {
          pnr: reference,
          id: randomUUID(),
          status: BookingStatus.HELD,
          userId: user?.id ?? null,
          baseFare: total.baseFare,
          taxes: total.taxes,
          fees: total.fees,
          discount: total.discount,
          total: total.total,
          currency: priced.currency,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          expiresAt: new Date(Date.now() + DEFAULT_HOLD_MINUTES * 60_000),
          idempotencyKey: input.idempotencyKey ?? null,
          source: user ? 'web' : 'guest',
        },
      });

      await tx.bookingSegment.createMany({
        data: priced.segments.map((segment, sequence) => ({
          bookingPnr: reference,
          flightId: segment.flightId,
          fareId: segment.fareId,
          sequence,
          baseFare: segment.baseFare,
          taxes: segment.taxes,
          fees: segment.fees,
        })),
      });

      await tx.passenger.createMany({
        data: input.passengers.map((passenger, sequence) => ({
          bookingPnr: reference,
          sequence,
          type: passenger.type,
          gender: passenger.gender,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          middleName: passenger.middleName ?? null,
          dateOfBirth: new Date(passenger.dateOfBirth),
          nationality: passenger.nationality ?? null,
          passportLast4: passenger.passportNumber ? passenger.passportNumber.slice(-4) : null,
        })),
      });

      await tx.bookingEvent.create({
        data: {
          bookingPnr: reference,
          fromStatus: null,
          toStatus: BookingStatus.HELD,
          actorType: user ? 'customer' : 'guest',
          actorId: user?.id ?? null,
          message: 'Booking created',
        },
      });

      logger.info(
        { pnr: reference, total: total.total, currency: priced.currency },
        'booking created',
      );

      return reference;
    }),
  );

  return pnr;
}

/** Retries PNR allocation on the rare unique collision instead of failing the request. */
async function allocatePnr(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < PNR_ATTEMPTS; attempt += 1) {
    const candidate = generatePnr();
    const clash = await tx.booking.findUnique({
      where: { pnr: candidate },
      select: { pnr: true },
    });
    if (!clash) return candidate;
  }
  throw CorsairError.internal('Unable to allocate a unique booking reference');
}

interface PricedSegment {
  readonly flightId: string;
  readonly fareId: string;
  readonly baseFare: number;
  readonly taxes: number;
  readonly fees: number;
  readonly currency: string;
}

interface PricedItinerary {
  readonly segments: PricedSegment[];
  readonly baseFare: number;
  readonly taxes: number;
  readonly fees: number;
  readonly discount: number;
  readonly currency: string;
}

async function priceItinerary(
  tx: Prisma.TransactionClient,
  requested: readonly { flightId: string; fareId: string }[],
): Promise<PricedItinerary> {
  const fares = await tx.fare.findMany({
    where: { id: { in: requested.map((segment) => segment.fareId) } },
    select: {
      id: true,
      flightId: true,
      basePrice: true,
      taxes: true,
      fees: true,
      currency: true,
      seatsAvailable: true,
    },
  });

  const byId = new Map(fares.map((fare) => [fare.id, fare]));
  const segments: PricedSegment[] = [];

  for (const request of requested) {
    const fare = byId.get(request.fareId);
    if (fare?.flightId !== request.flightId) {
      throw new CorsairError(ErrorCode.FARE_NO_LONGER_AVAILABLE, 'Fare is not available');
    }
    if (fare.seatsAvailable <= 0) {
      throw new CorsairError(
        ErrorCode.FARE_NO_LONGER_AVAILABLE,
        'Fare is sold out for this flight',
      );
    }
    segments.push({
      flightId: fare.flightId,
      fareId: fare.id,
      baseFare: fare.basePrice,
      taxes: fare.taxes,
      fees: fare.fees,
      currency: fare.currency,
    });
  }

  const currency = segments[0]?.currency ?? 'USD';
  if (segments.some((segment) => segment.currency !== currency)) {
    throw CorsairError.validation('All segments in a booking must use the same currency');
  }

  return {
    segments,
    baseFare: segments.reduce((sum, segment) => sum + segment.baseFare, 0),
    taxes: segments.reduce((sum, segment) => sum + segment.taxes, 0),
    fees: segments.reduce((sum, segment) => sum + segment.fees, 0),
    discount: 0,
    currency,
  };
}

/** A held booking that is still mutable. */
export interface EditableBooking {
  readonly pnr: string;
  readonly status: BookingStatus;
  readonly expiresAt: Date | null;
}

async function requireBookingEditable(
  prisma: PrismaClient,
  pnr: string,
): Promise<EditableBooking> {
  const booking = await prisma.booking.findUnique({
    where: { pnr },
    select: { pnr: true, status: true, expiresAt: true },
  });

  if (!booking) {
    throw new CorsairError(ErrorCode.BOOKING_NOT_FOUND, `Booking ${pnr} was not found`);
  }
  if (booking.status !== BookingStatus.HELD) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Booking ${pnr} is ${booking.status} and cannot be modified`,
    );
  }
  if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
    throw new CorsairError(ErrorCode.BOOKING_EXPIRED, `Booking ${pnr} has expired`);
  }

  return {
    pnr: booking.pnr,
    status: booking.status as BookingStatus,
    expiresAt: booking.expiresAt,
  };
}

export interface SeatSelectionResult {
  readonly selected: number;
  readonly surchargeTotal: number;
}

/**
 * Applies seat selections to a held booking.
 *
 * Selections are grouped by segment because {@link holdSeats} reserves seats on a
 * single flight per call. Seats are held before the assignment rows are written,
 * so a conflict fails the whole request without leaving a partial selection.
 */
export async function selectSeats(
  context: GraphQLContext,
  pnr: string,
  selections: readonly SeatSelectionInput[],
): Promise<SeatSelectionResult> {
  const { prisma, user, logger } = context;

  await requireBookingEditable(prisma, pnr);

  const passengers = await prisma.passenger.findMany({
    where: { bookingPnr: pnr },
    select: { id: true, sequence: true, type: true },
  });

  const seatedPassengers = passengers.filter((passenger) => passenger.type !== 'INFANT');
  if (selections.length !== seatedPassengers.length) {
    throw new CorsairError(
      ErrorCode.SEAT_COUNT_MISMATCH,
      `Expected ${seatedPassengers.length} seat selections, received ${selections.length}`,
    );
  }

  const segments = await prisma.bookingSegment.findMany({
    where: { bookingPnr: pnr },
    select: { id: true, flightId: true },
  });
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const bySequence = new Map(passengers.map((passenger) => [passenger.sequence, passenger]));

  const groupedBySegment = new Map<string, SeatSelectionInput[]>();
  for (const selection of selections) {
    if (!segmentById.has(selection.segmentId)) {
      throw new CorsairError(
        ErrorCode.SEAT_NOT_FOUND,
        `Segment ${selection.segmentId} does not belong to booking ${pnr}`,
      );
    }
    const bucket = groupedBySegment.get(selection.segmentId);
    if (bucket) {
      bucket.push(selection);
    } else {
      groupedBySegment.set(selection.segmentId, [selection]);
    }
  }

  let surchargeTotal = 0;

  for (const [segmentId, group] of groupedBySegment) {
    const segment = segmentById.get(segmentId);
    if (!segment) continue;

    const hold = await holdSeats(prisma, {
      flightId: segment.flightId,
      seatIds: group.map((selection) => selection.seatId),
      holdMinutes: DEFAULT_HOLD_MINUTES,
    });

    surchargeTotal += hold.surchargeTotal;
  }

  await withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      await tx.bookingSeat.deleteMany({ where: { bookingPnr: pnr } });

      await tx.bookingSeat.createMany({
        data: selections.map((selection) => {
          const passenger = bySequence.get(selection.passengerIndex);
          if (!passenger) {
            throw CorsairError.validation(`No passenger at index ${selection.passengerIndex}`);
          }
          return {
            bookingPnr: pnr,
            segmentId: selection.segmentId,
            passengerId: passenger.id,
            seatId: selection.seatId,
          };
        }),
      });
    }),
  );

  logger.info(
    { pnr, seats: selections.length, surchargeTotal, actor: user?.id ?? 'guest' },
    'seats selected',
  );

  return { selected: selections.length, surchargeTotal };
}

export interface TransitionOptions {
  readonly actorType: 'system' | 'customer' | 'admin' | 'payment-webhook';
  readonly actorId?: string | undefined;
  readonly privileged?: boolean;
  readonly message?: string | undefined;
  readonly metadata?: Prisma.InputJsonValue | undefined;
}

/**
 * Moves a booking to a new status, enforcing the shared state machine and
 * applying the side effects the transition implies: seat release, seat
 * confirmation and ticket voiding.
 */
export async function transitionBooking(
  prisma: PrismaClient,
  pnr: string,
  next: BookingStatus,
  options: TransitionOptions,
): Promise<void> {
  await withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { pnr },
        select: { pnr: true, status: true },
      });

      if (!booking) {
        throw new CorsairError(ErrorCode.BOOKING_NOT_FOUND, `Booking ${pnr} was not found`);
      }

      const previous = booking.status;
      const guard = guardBookingTransition(previous, next, {
        privileged: options.privileged ?? false,
      });

      if (!guard.ok) {
        throw new CorsairError(
          guard.code ?? ErrorCode.INVALID_STATE_TRANSITION,
          guard.message ?? 'Invalid booking transition',
        );
      }

      const assigned = await tx.bookingSeat.findMany({
        where: { bookingPnr: pnr },
        select: { seatId: true },
      });
      const seatIds = assigned.map((row) => row.seatId);

      await tx.booking.update({
        where: { pnr },
        data: {
          status: next,
          ...(next === BookingStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
          ...(next === BookingStatus.TICKETED ? { ticketedAt: new Date() } : {}),
          ...(next === BookingStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
          ...(next === BookingStatus.HELD
            ? { expiresAt: new Date(Date.now() + DEFAULT_HOLD_MINUTES * 60_000) }
            : {}),
          ...(releasesSeats(next) ? { expiresAt: null } : {}),
        },
      });

      await tx.bookingEvent.create({
        data: {
          bookingPnr: pnr,
          fromStatus: previous,
          toStatus: next,
          actorType: options.actorType,
          actorId: options.actorId ?? null,
          message: options.message ?? null,
          ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
        },
      });

      if (seatIds.length === 0) return;

      if (releasesSeats(next)) {
        await tx.seat.updateMany({
          where: { id: { in: seatIds }, status: { in: ['HELD', 'BOOKED'] } },
          data: { status: 'AVAILABLE', holdExpiresAt: null },
        });
      } else if (next === BookingStatus.CONFIRMED) {
        await tx.seat.updateMany({
          where: { id: { in: seatIds }, status: 'HELD' },
          data: { status: 'BOOKED', holdExpiresAt: null },
        });
      }

      if (requiresTicketVoid(next) && requiresRefund(previous)) {
        await tx.ticket.updateMany({
          where: { bookingPnr: pnr, status: { in: ['ISSUED', 'PENDING'] } },
          data: { status: 'VOIDED', voidedAt: new Date() },
        });
      }
    }),
  );
}

/** Convenience wrapper used by the cancellation resolver. */
export async function cancelBooking(
  context: GraphQLContext,
  pnr: string,
  reason: string | undefined,
): Promise<void> {
  await transitionBooking(context.prisma, pnr, BookingStatus.CANCELLED, {
    actorType: context.user ? 'customer' : 'system',
    actorId: context.user?.id,
    privileged: isPrivileged(context),
    message: reason,
  });
}
