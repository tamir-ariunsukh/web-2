import { randomUUID } from 'node:crypto';

import { withSerializableRetry, withSerializableTransaction } from '@repo/db';
import {
  BookingStatus,
  CorsairError,
  ErrorCode,
  PaymentStatus,
  canTransitionPayment,
  type MockPaymentOutcome,
} from '@repo/shared';

import { transitionBooking } from '../booking/booking-service.js';

import type { GraphQLContext } from '../context.js';

/**
 * Payment handling against a mock gateway.
 *
 * The state machine mirrors a real PSP: an intent is created in
 * REQUIRES_ACTION, the client confirms, and a webhook settles it. Because the
 * gateway is mocked, {@link simulatePayment} stands in for both the client
 * confirmation and the webhook, but the transitions and idempotency guarantees
 * are the ones a live integration would need.
 */

export interface PaymentIntentResult {
  readonly paymentId: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly clientSecret: string;
}

export async function createPaymentIntent(
  context: GraphQLContext,
  pnr: string,
): Promise<PaymentIntentResult> {
  const { prisma, env, logger } = context;

  const booking = await prisma.booking.findUnique({
    where: { pnr },
    select: {
      pnr: true,
      status: true,
      total: true,
      currency: true,
      expiresAt: true,
    },
  });

  if (!booking) {
    throw CorsairError.notFound('Booking', pnr);
  }
  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Booking ${pnr} is ${booking.status}; payment requires PENDING_PAYMENT`,
    );
  }
  if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
    throw new CorsairError(ErrorCode.BOOKING_EXPIRED, `Booking ${pnr} has expired`);
  }

  const settled = await prisma.payment.findFirst({
    where: { bookingPnr: pnr, status: { in: ['SUCCEEDED', 'PROCESSING'] } },
    select: { id: true, status: true },
  });
  if (settled) {
    throw new CorsairError(
      ErrorCode.PAYMENT_ALREADY_COMPLETED,
      `Booking ${pnr} already has a ${settled.status} payment`,
    );
  }

  // The idempotency key is derived from the booking, so a retried intent for the
  // same booking returns the original payment instead of creating a second one.
  const idempotencyKey = `booking:${pnr}:intent`;

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
    select: { id: true, amount: true, currency: true, status: true, providerRef: true },
  });

  if (existing) {
    return {
      paymentId: existing.id,
      amount: existing.amount,
      currency: existing.currency,
      status: existing.status,
      clientSecret: existing.providerRef ?? '',
    };
  }

  const clientSecret = `mock_secret_${randomUUID()}`;

  const payment = await prisma.payment.create({
    data: {
      bookingPnr: pnr,
      amount: booking.total,
      currency: booking.currency,
      status: PaymentStatus.REQUIRES_ACTION,
      method: 'CARD',
      provider: 'MOCK',
      providerRef: clientSecret,
      idempotencyKey,
    },
    select: { id: true, amount: true, currency: true, status: true },
  });

  logger.info(
    { pnr, paymentId: payment.id, amount: payment.amount, provider: env.PAYMENT_PROVIDER },
    'payment intent created',
  );

  return {
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    clientSecret,
  };
}

export interface PaymentResult {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly method: string;
  readonly cardSummary: string | null;
  readonly failureCode: string | null;
  readonly createdAt: Date;
}

/**
 * Settles a mock payment.
 *
 * A successful outcome confirms the booking and books its seats; a failure moves
 * the booking to PAYMENT_FAILED, which releases the seats so another customer can
 * buy them. Both paths are idempotent: replaying the same outcome on an already
 * settled payment returns the stored row untouched.
 */
export async function simulatePayment(
  context: GraphQLContext,
  paymentId: string,
  outcome: MockPaymentOutcome,
): Promise<PaymentResult> {
  const { prisma, env, logger } = context;

  if (env.PAYMENT_PROVIDER !== 'mock') {
    throw new CorsairError(
      ErrorCode.FORBIDDEN,
      'simulatePayment is only available with the mock payment provider',
    );
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      bookingPnr: true,
      amount: true,
      currency: true,
      status: true,
      method: true,
      cardSummary: true,
      failureCode: true,
      createdAt: true,
    },
  });

  if (!payment) {
    throw CorsairError.notFound('Payment', paymentId);
  }

  const current = payment.status;

  // Already settled: return as-is so a duplicate webhook is a no-op.
  if (current === PaymentStatus.SUCCEEDED || current === PaymentStatus.REFUNDED) {
    logger.info({ paymentId, status: current }, 'ignoring settlement on a settled payment');
    return toPaymentResult(payment);
  }

  const nextStatus =
    outcome === 'SUCCESS' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;

  if (!canTransitionPayment(current, nextStatus)) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Payment cannot move from ${current} to ${nextStatus}`,
    );
  }

  await withSerializableRetry(() =>
    withSerializableTransaction(prisma, async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: nextStatus,
          ...(nextStatus === PaymentStatus.SUCCEEDED
            ? {
                capturedAt: new Date(),
                authorizedAt: new Date(),
                cardSummary: 'visa ****4242',
                failureCode: null,
                failureMessage: null,
              }
            : {
                failureCode: failureCodeFor(outcome),
                failureMessage: failureMessageFor(outcome),
                cardSummary: 'visa ****4242',
              }),
        },
      });
    }),
  );

  if (nextStatus === PaymentStatus.SUCCEEDED) {
    await transitionBooking(prisma, payment.bookingPnr, BookingStatus.CONFIRMED, {
      actorType: 'payment-webhook',
      message: `Payment ${paymentId} captured`,
      metadata: { paymentId, outcome },
    });
  } else {
    await transitionBooking(prisma, payment.bookingPnr, BookingStatus.PAYMENT_FAILED, {
      actorType: 'payment-webhook',
      message: `${failureMessageFor(outcome)} (${paymentId})`,
      metadata: { paymentId, outcome },
    });
  }

  logger.info({ paymentId, pnr: payment.bookingPnr, outcome }, 'mock payment settled');

  // Re-read so the response reflects what was actually persisted, rather than
  // echoing the pre-transaction row.
  const settled = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      method: true,
      cardSummary: true,
      failureCode: true,
      createdAt: true,
    },
  });

  return toPaymentResult(settled);
}

function failureCodeFor(outcome: MockPaymentOutcome): string | null {
  switch (outcome) {
    case 'DECLINE':
      return 'card_declined';
    case 'INSUFFICIENT_FUNDS':
      return 'insufficient_funds';
    case 'TIMEOUT':
      return 'gateway_timeout';
    default:
      return null;
  }
}

function failureMessageFor(outcome: MockPaymentOutcome): string {
  switch (outcome) {
    case 'DECLINE':
      return 'The card was declined';
    case 'INSUFFICIENT_FUNDS':
      return 'The card has insufficient funds';
    case 'TIMEOUT':
      return 'The payment gateway did not respond in time';
    default:
      return 'Payment failed';
  }
}

function toPaymentResult(payment: {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  cardSummary: string | null;
  failureCode: string | null;
  createdAt: Date;
}): PaymentResult {
  return {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status as PaymentStatus,
    method: payment.method,
    cardSummary: payment.cardSummary,
    failureCode: payment.failureCode,
    createdAt: payment.createdAt,
  };
}

export interface RefundResult {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
  readonly reason: string | null;
  readonly requestedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * Records a refund against the booking's settled payment.
 *
 * The mock provider settles refunds immediately. A live integration would leave
 * the refund in PROCESSING and let the provider's webhook complete it, which is
 * why the status transition is expressed separately from the booking update.
 */
export async function requestRefund(
  context: GraphQLContext,
  pnr: string,
  reason: string | undefined,
  amount: number | undefined,
): Promise<RefundResult> {
  const { prisma, logger, user } = context;

  const booking = await prisma.booking.findUnique({
    where: { pnr },
    select: { pnr: true, status: true, total: true, currency: true },
  });

  if (!booking) {
    throw CorsairError.notFound('Booking', pnr);
  }

  const captured = await prisma.payment.findFirst({
    where: { bookingPnr: pnr, status: PaymentStatus.SUCCEEDED },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, currency: true },
  });

  if (!captured) {
    throw new CorsairError(
      ErrorCode.REFUND_NOT_ALLOWED,
      `Booking ${pnr} has no captured payment to refund`,
    );
  }

  const refundAmount = amount ?? captured.amount;
  if (refundAmount <= 0 || refundAmount > captured.amount) {
    throw new CorsairError(
      ErrorCode.REFUND_AMOUNT_EXCEEDS_PAYMENT,
      `Refund must be between 1 and ${captured.amount} minor units`,
    );
  }

  const alreadyRefunded = await prisma.refund.aggregate({
    where: { bookingPnr: pnr, status: { in: ['APPROVED', 'PROCESSING', 'COMPLETED'] } },
    _sum: { amount: true },
  });

  const refundedSoFar = alreadyRefunded._sum.amount ?? 0;
  if (refundedSoFar + refundAmount > captured.amount) {
    throw new CorsairError(
      ErrorCode.REFUND_AMOUNT_EXCEEDS_PAYMENT,
      `Only ${captured.amount - refundedSoFar} minor units remain refundable`,
    );
  }

  const refund = await prisma.refund.create({
    data: {
      paymentId: captured.id,
      bookingPnr: pnr,
      amount: refundAmount,
      currency: captured.currency,
      status: 'COMPLETED',
      reason: reason ?? null,
      providerRef: `mock_refund_${randomUUID()}`,
      requestedById: user?.id ?? null,
      approvedById: user?.id ?? null,
      approvedAt: new Date(),
      completedAt: new Date(),
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      reason: true,
      requestedAt: true,
      completedAt: true,
    },
  });

  await prisma.payment.update({
    where: { id: captured.id },
    data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
  });

  logger.info({ pnr, refundId: refund.id, amount: refundAmount }, 'refund completed');

  return refund;
}

export interface BoardingPassResult {
  readonly ticketNumber: string;
  readonly passengerName: string;
  readonly seatNumber: string | null;
  readonly gate: string;
  readonly boardingTime: Date;
  readonly qrPayload: string;
}

/**
 * Issues a boarding pass and moves the booking to CHECKED_IN.
 *
 * Check-in opens 48 hours before departure; the window is enforced here because
 * the booking state alone does not encode timing.
 */
export async function checkIn(
  context: GraphQLContext,
  pnr: string,
  passengerId: string,
): Promise<BoardingPassResult> {
  const { prisma, logger } = context;

  const booking = await prisma.booking.findUnique({
    where: { pnr },
    select: { pnr: true, status: true },
  });

  if (!booking) {
    throw CorsairError.notFound('Booking', pnr);
  }
  if (booking.status !== BookingStatus.TICKETED && booking.status !== BookingStatus.CHECKED_IN) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Booking ${pnr} is ${booking.status}; check-in requires TICKETED`,
    );
  }

  const ticket = await prisma.ticket.findFirst({
    where: { bookingPnr: pnr, passengerId, status: 'ISSUED' },
    select: {
      ticketNumber: true,
      segmentId: true,
      passenger: { select: { firstName: true, lastName: true } },
    },
  });

  if (!ticket) {
    throw new CorsairError(
      ErrorCode.TICKET_ISSUANCE_FAILED,
      'No issued ticket found for this passenger',
    );
  }

  const segment = await prisma.bookingSegment.findUnique({
    where: { id: ticket.segmentId },
    select: {
      flight: { select: { departureAt: true, flightNumber: true } },
    },
  });

  if (!segment) {
    throw new CorsairError(ErrorCode.NOT_FOUND, 'Segment for this ticket no longer exists');
  }

  const departure = segment.flight.departureAt;
  const hoursUntilDeparture = (departure.getTime() - Date.now()) / 3_600_000;

  if (hoursUntilDeparture > 48) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Check-in opens 48 hours before departure (in ${Math.floor(hoursUntilDeparture)} hours)`,
    );
  }
  if (hoursUntilDeparture < 0.5) {
    throw new CorsairError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'Check-in has closed for this flight',
    );
  }

  const assignment = await prisma.bookingSeat.findFirst({
    where: { bookingPnr: pnr, passengerId },
    select: { seat: { select: { seatNumber: true } } },
  });

  if (booking.status === BookingStatus.TICKETED) {
    await transitionBooking(prisma, pnr, BookingStatus.CHECKED_IN, {
      actorType: 'customer',
      message: `Passenger checked in: ${ticket.passenger.firstName} ${ticket.passenger.lastName}`,
    });
  }

  const boardingTime = new Date(departure.getTime() - 40 * 60_000);
  const gate = `G${(segment.flight.flightNumber.charCodeAt(0) % 20) + 1}`;

  logger.info({ pnr, passengerId, ticketNumber: ticket.ticketNumber }, 'passenger checked in');

  return {
    ticketNumber: ticket.ticketNumber,
    passengerName: `${ticket.passenger.firstName} ${ticket.passenger.lastName}`,
    seatNumber: assignment?.seat.seatNumber ?? null,
    gate,
    boardingTime,
    qrPayload: `M1${ticket.ticketNumber}${pnr}${assignment?.seat.seatNumber ?? ''}`,
  };
}
