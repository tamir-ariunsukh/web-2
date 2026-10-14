import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import {
  BookingStatus,
  MockPaymentOutcome,
  PaymentStatus,
  RefundStatus,
  TicketStatus,
} from '../lib/enums.js';
import { newId, generateTicketNumber } from '../lib/ids.js';
import { canTransitionPayment } from '../lib/state-machine.js';
import { findBookingByPnr, transitionBooking } from './booking.js';

/**
 * Payments, refunds, ticketing and check-in.
 *
 * The gateway is mocked but the state machine is not: a payment can only move
 * REQUIRES_ACTION -> SUCCEEDED/FAILED, and the booking transition that follows is
 * driven by that outcome rather than by the caller.
 */

const MOCK_CARD_SUMMARY = 'visa ****4242';

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    method: row.method,
    cardSummary: row.card_summary,
    failureCode: row.failure_code,
    createdAt: row.created_at,
  };
}

function failureCodeFor(outcome) {
  return { DECLINE: 'card_declined', INSUFFICIENT_FUNDS: 'insufficient_funds', TIMEOUT: 'gateway_timeout' }[
    outcome
  ] ?? null;
}

function failureMessageFor(outcome) {
  return (
    {
      DECLINE: 'The card was declined',
      INSUFFICIENT_FUNDS: 'The card has insufficient funds',
      TIMEOUT: 'The payment gateway did not respond in time',
    }[outcome] ?? 'Payment failed'
  );
}

/** Creates (or returns) the payment intent for a booking awaiting payment. */
export function createPaymentIntent(pnr) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw AppError.notFound('Booking', pnr);

  if (booking.status !== BookingStatus.PENDING_PAYMENT) {
    throw new AppError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'This booking is not awaiting payment',
    );
  }
  if (booking.expires_at && Date.parse(booking.expires_at) < Date.now()) {
    throw new AppError(ErrorCode.BOOKING_EXPIRED, 'This booking has expired');
  }

  const settled = getDatabase()
    .prepare(
      "SELECT id FROM payments WHERE booking_pnr = ? AND status IN ('SUCCEEDED', 'PROCESSING') LIMIT 1",
    )
    .get(pnr);
  if (settled) {
    throw new AppError(ErrorCode.PAYMENT_ALREADY_COMPLETED, 'This booking is already paid for');
  }

  // The key is derived from the booking, so a retried request reuses the same
  // intent instead of creating a second charge.
  const idempotencyKey = `booking:${pnr}:intent`;
  const existing = getDatabase()
    .prepare('SELECT * FROM payments WHERE idempotency_key = ?')
    .get(idempotencyKey);

  if (existing) {
    return {
      paymentId: existing.id,
      amount: existing.amount,
      currency: existing.currency,
      status: existing.status,
      clientSecret: existing.provider_ref ?? '',
    };
  }

  const clientSecret = `mock_secret_${newId()}`;
  const id = newId();

  getDatabase()
    .prepare(
      `INSERT INTO payments (id, booking_pnr, amount, currency, status, method, provider, provider_ref, idempotency_key)
       VALUES (?, ?, ?, ?, 'REQUIRES_ACTION', 'CARD', 'MOCK', ?, ?)`,
    )
    .run(id, pnr, booking.total, booking.currency, clientSecret, idempotencyKey);

  return {
    paymentId: id,
    amount: booking.total,
    currency: booking.currency,
    status: PaymentStatus.REQUIRES_ACTION,
    clientSecret,
  };
}

/**
 * Applies a mock gateway outcome.
 *
 * A payment that already settled returns its stored row unchanged, so a webhook
 * delivered twice is a no-op rather than a second booking transition.
 */
export function simulatePayment(paymentId, outcome, { env } = {}) {
  if (env.paymentProvider !== 'mock') {
    throw new AppError(ErrorCode.FORBIDDEN, 'Mock payments are disabled in this environment');
  }
  if (!Object.values(MockPaymentOutcome).includes(outcome)) {
    throw AppError.validation('Unknown mock outcome');
  }

  const payment = getDatabase().prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw AppError.notFound('Payment', paymentId);

  if (payment.status === PaymentStatus.SUCCEEDED || payment.status === PaymentStatus.REFUNDED) {
    return mapPayment(payment);
  }

  const nextStatus = outcome === MockPaymentOutcome.SUCCESS ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED;
  if (!canTransitionPayment(payment.status, nextStatus)) {
    throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, 'This payment can no longer change');
  }

  withWriteRetry(() =>
    inTransaction((db) => {
      const now = new Date().toISOString();
      if (nextStatus === PaymentStatus.SUCCEEDED) {
        db.prepare(
          `UPDATE payments SET status = ?, captured_at = ?, authorized_at = ?,
                  card_summary = ?, failure_code = NULL, failure_message = NULL
           WHERE id = ?`,
        ).run(nextStatus, now, now, MOCK_CARD_SUMMARY, paymentId);
      } else {
        db.prepare(
          `UPDATE payments SET status = ?, card_summary = ?, failure_code = ?, failure_message = ?
           WHERE id = ?`,
        ).run(
          nextStatus,
          MOCK_CARD_SUMMARY,
          failureCodeFor(outcome),
          failureMessageFor(outcome),
          paymentId,
        );
      }
    }),
  );

  const target =
    nextStatus === PaymentStatus.SUCCEEDED ? BookingStatus.CONFIRMED : BookingStatus.PAYMENT_FAILED;
  const message =
    nextStatus === PaymentStatus.SUCCEEDED
      ? `Payment ${paymentId} captured`
      : `${failureMessageFor(outcome)} (${paymentId})`;

  transitionBooking(payment.booking_pnr, target, {
    actorType: 'payment-webhook',
    message,
    metadata: { paymentId, outcome },
  });

  const updated = getDatabase().prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  return mapPayment(updated);
}

export function requestRefund(pnr, { reason, amount, user } = {}) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw AppError.notFound('Booking', pnr);

  const captured = getDatabase()
    .prepare(
      "SELECT * FROM payments WHERE booking_pnr = ? AND status = 'SUCCEEDED' ORDER BY created_at DESC LIMIT 1",
    )
    .get(pnr);
  if (!captured) {
    throw new AppError(ErrorCode.REFUND_NOT_ALLOWED, 'This booking has no settled payment to refund');
  }

  const refundAmount = amount ?? captured.amount;
  if (refundAmount <= 0 || refundAmount > captured.amount) {
    throw new AppError(
      ErrorCode.REFUND_AMOUNT_EXCEEDS_PAYMENT,
      'The refund amount exceeds the captured payment',
    );
  }

  const refunded = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM refunds
       WHERE booking_pnr = ? AND status IN ('APPROVED', 'PROCESSING', 'COMPLETED')`,
    )
    .get(pnr);

  if (refunded.total + refundAmount > captured.amount) {
    throw new AppError(
      ErrorCode.REFUND_AMOUNT_EXCEEDS_PAYMENT,
      'The refund amount exceeds the captured payment',
    );
  }

  const id = newId();
  const now = new Date().toISOString();

  withWriteRetry(() =>
    inTransaction((db) => {
      db.prepare(
        `INSERT INTO refunds (
           id, payment_id, booking_pnr, amount, currency, status, reason, provider_ref,
           requested_by_id, approved_by_id, approved_at, completed_at
         ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        captured.id,
        pnr,
        refundAmount,
        captured.currency,
        reason ?? null,
        `mock_refund_${newId()}`,
        user?.id ?? null,
        user?.id ?? null,
        now,
        now,
      );

      // A refunded payment is terminal, so there is no path back to SUCCEEDED.
      db.prepare("UPDATE payments SET status = 'REFUNDED', refunded_at = ? WHERE id = ?").run(
        now,
        captured.id,
      );
    }),
  );

  const refund = getDatabase().prepare('SELECT * FROM refunds WHERE id = ?').get(id);
  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason,
    requestedAt: refund.requested_at,
    completedAt: refund.completed_at,
  };
}

/**
 * Issues one ticket per passenger per segment.
 *
 * Idempotent by `(segment_id, passenger_id)`: re-running after a partial failure
 * fills in only the missing tickets.
 */
export function issueTickets(pnr, { env } = {}) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw AppError.notFound('Booking', pnr);

  const segments = getDatabase()
    .prepare('SELECT * FROM booking_segments WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(pnr);
  const passengers = getDatabase()
    .prepare('SELECT * FROM passengers WHERE booking_pnr = ? ORDER BY sequence ASC')
    .all(pnr);

  if (segments.length === 0 || passengers.length === 0) {
    throw new AppError(ErrorCode.TICKET_ISSUANCE_FAILED, 'This booking has no segments or passengers');
  }

  const inserted = [];

  withWriteRetry(() =>
    inTransaction((db) => {
      let serial = Date.now() % 1_000_000;

      for (const segment of segments) {
        const airline = db
          .prepare(
            `SELECT a.numeric_code FROM airlines a
             JOIN flights f ON f.airline_id = a.id WHERE f.id = ?`,
          )
          .get(segment.flight_id);
        const numericCode = airline?.numeric_code ?? '000';

        for (const passenger of passengers) {
          const existing = db
            .prepare('SELECT id FROM tickets WHERE segment_id = ? AND passenger_id = ?')
            .get(segment.id, passenger.id);
          if (existing) continue;

          serial += 1;
          const ticketNumber = generateTicketNumber(numericCode, serial);
          const id = newId();
          db.prepare(
            `INSERT INTO tickets (id, booking_pnr, segment_id, passenger_id, ticket_number, status, issued_at, qr_payload)
             VALUES (?, ?, ?, ?, ?, 'ISSUED', ?, ?)`,
          ).run(
            id,
            pnr,
            segment.id,
            passenger.id,
            ticketNumber,
            new Date().toISOString(),
            `M1${ticketNumber}${pnr}`,
          );
          inserted.push(ticketNumber);
        }
      }
    }),
  );

  void env;
  return inserted;
}

/**
 * Issues a boarding pass.
 *
 * Check-in is only open from 48 hours before departure until 30 minutes before,
 * which is what keeps a boarding pass from being generated weeks early.
 */
export function checkIn(pnr, passengerId) {
  const booking = findBookingByPnr(pnr);
  if (!booking) throw AppError.notFound('Booking', pnr);

  if (![BookingStatus.TICKETED, BookingStatus.CHECKED_IN].includes(booking.status)) {
    throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, 'This booking is not ticketed yet');
  }

  const ticket = getDatabase()
    .prepare("SELECT * FROM tickets WHERE booking_pnr = ? AND passenger_id = ? AND status = 'ISSUED'")
    .get(pnr, passengerId);
  if (!ticket) {
    throw new AppError(ErrorCode.TICKET_ISSUANCE_FAILED, 'No issued ticket for this passenger');
  }

  const segment = getDatabase()
    .prepare(
      `SELECT bs.id, f.departure_at, f.flight_number
       FROM booking_segments bs JOIN flights f ON f.id = bs.flight_id
       WHERE bs.id = ?`,
    )
    .get(ticket.segment_id);
  if (!segment) throw AppError.notFound('Flight', ticket.segment_id);

  const departure = new Date(segment.departure_at);
  const hoursUntilDeparture = (departure.getTime() - Date.now()) / 3_600_000;

  if (hoursUntilDeparture > 48) {
    throw new AppError(
      ErrorCode.INVALID_STATE_TRANSITION,
      `Check-in opens 48 hours before departure (in ${Math.floor(hoursUntilDeparture)} hours)`,
    );
  }
  if (hoursUntilDeparture < 0.5) {
    throw new AppError(ErrorCode.INVALID_STATE_TRANSITION, 'Check-in has closed for this flight');
  }

  const seat = getDatabase()
    .prepare(
      `SELECT s.seat_number FROM booking_seats bs JOIN seats s ON s.id = bs.seat_id
       WHERE bs.booking_pnr = ? AND bs.passenger_id = ? LIMIT 1`,
    )
    .get(pnr, passengerId);

  const passenger = getDatabase().prepare('SELECT * FROM passengers WHERE id = ?').get(passengerId);

  if (booking.status === BookingStatus.TICKETED) {
    transitionBooking(pnr, BookingStatus.CHECKED_IN, {
      actorType: 'customer',
      message: `Passenger checked in: ${passenger.first_name} ${passenger.last_name}`,
    });
  }

  const gate = `G${(segment.flight_number.charCodeAt(0) % 20) + 1}`;
  const boardingTime = new Date(departure.getTime() - 40 * 60_000);

  return {
    ticketNumber: ticket.ticket_number,
    passengerName: `${passenger.first_name} ${passenger.last_name}`,
    seatNumber: seat?.seat_number ?? null,
    gate,
    boardingTime: boardingTime.toISOString(),
    qrPayload: ticket.qr_payload ?? `M1${ticket.ticket_number}${pnr}${seat?.seat_number ?? ''}`,
  };
}

export { TicketStatus, RefundStatus };
