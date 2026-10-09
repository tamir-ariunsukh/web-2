import { describe, expect, it } from 'vitest';

import { BookingStatus, PaymentStatus } from '../enums.js';
import {
  allowedBookingTransitions,
  assertBookingTransition,
  canTransitionBooking,
  guardBookingTransition,
  isBookingActionable,
  releasesSeats,
  requiresTicketVoid,
  canTransitionPayment,
} from '../state-machine.js';

describe('booking state machine', () => {
  it('allows the happy path from hold to ticketed', () => {
    expect(canTransitionBooking(BookingStatus.HELD, BookingStatus.PENDING_PAYMENT)).toBe(true);
    expect(
      canTransitionBooking(BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED),
    ).toBe(true);
    expect(canTransitionBooking(BookingStatus.CONFIRMED, BookingStatus.TICKETED)).toBe(true);
    expect(canTransitionBooking(BookingStatus.TICKETED, BookingStatus.CHECKED_IN)).toBe(true);
  });

  it('rejects skipping payment', () => {
    expect(canTransitionBooking(BookingStatus.HELD, BookingStatus.CONFIRMED)).toBe(false);
    expect(canTransitionBooking(BookingStatus.HELD, BookingStatus.TICKETED)).toBe(false);
  });

  it('treats checked-in and cancelled as terminal for customers', () => {
    expect(allowedBookingTransitions(BookingStatus.CHECKED_IN)).toHaveLength(0);
    expect(allowedBookingTransitions(BookingStatus.CANCELLED)).toHaveLength(0);
    expect(allowedBookingTransitions(BookingStatus.EXPIRED)).toHaveLength(0);
  });

  it('lets a privileged actor recover a failed payment', () => {
    expect(
      canTransitionBooking(BookingStatus.PAYMENT_FAILED, BookingStatus.CONFIRMED),
    ).toBe(false);
    expect(
      canTransitionBooking(BookingStatus.PAYMENT_FAILED, BookingStatus.CONFIRMED, {
        privileged: true,
      }),
    ).toBe(true);
  });

  it('lets a privileged actor reopen an expired hold', () => {
    expect(
      canTransitionBooking(BookingStatus.EXPIRED, BookingStatus.HELD, { privileged: true }),
    ).toBe(true);
  });

  it('still blocks privileged actors from reviving a cancellation', () => {
    expect(
      canTransitionBooking(BookingStatus.CANCELLED, BookingStatus.CONFIRMED, {
        privileged: true,
      }),
    ).toBe(false);
  });

  it('reports a domain code instead of throwing on an illegal move', () => {
    const result = guardBookingTransition(BookingStatus.HELD, BookingStatus.TICKETED);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects a no-op transition with a distinct message', () => {
    const result = guardBookingTransition(BookingStatus.HELD, BookingStatus.HELD);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('already in status HELD');
  });

  it('throws through the assertion helper', () => {
    expect(() =>
      assertBookingTransition(BookingStatus.CANCELLED, BookingStatus.CONFIRMED),
    ).toThrow(/Cannot transition booking/);
  });

  it('classifies actionable and seat-releasing states', () => {
    expect(isBookingActionable(BookingStatus.HELD)).toBe(true);
    expect(isBookingActionable(BookingStatus.TICKETED)).toBe(false);

    expect(releasesSeats(BookingStatus.EXPIRED)).toBe(true);
    expect(releasesSeats(BookingStatus.PAYMENT_FAILED)).toBe(true);
    expect(releasesSeats(BookingStatus.CONFIRMED)).toBe(false);

    expect(requiresTicketVoid(BookingStatus.TICKETED)).toBe(true);
    expect(requiresTicketVoid(BookingStatus.CONFIRMED)).toBe(false);
  });
});

describe('payment state machine', () => {
  it('allows success and failure from processing', () => {
    expect(canTransitionPayment(PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.PROCESSING, PaymentStatus.FAILED)).toBe(true);
  });

  it('allows a refund only after success', () => {
    expect(canTransitionPayment(PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED)).toBe(true);
    expect(canTransitionPayment(PaymentStatus.REQUIRES_ACTION, PaymentStatus.REFUNDED)).toBe(
      false,
    );
  });

  it('treats a refund as terminal', () => {
    expect(canTransitionPayment(PaymentStatus.REFUNDED, PaymentStatus.SUCCEEDED)).toBe(false);
  });
});
