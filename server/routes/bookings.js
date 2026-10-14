import { loadEnv } from '../env.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { assertValid, validateContactUpdate } from '../lib/validation.js';
import * as booking from '../services/booking.js';
import * as payment from '../services/payment.js';
import { readJsonBody, sendJson } from '../http/router.js';

/**
 * Booking, payment and ticketing routes.
 *
 * Ownership is checked here and again in the service that mutates the row, so a
 * route-level omission cannot expose another traveller's booking.
 */

/** A PNR is a bearer credential for guest bookings, so a signed-in caller must be the owner. */
function assertCanRead(user, row, { allowPrivileged = false } = {}) {
  if (allowPrivileged && booking.isPrivileged(user)) return;
  if (row.user_id === null) return;
  if (user?.id !== row.user_id) {
    throw new AppError(ErrorCode.FORBIDDEN, 'You do not have access to this booking');
  }
}

export function registerBookingRoutes(router) {
  router.post('/api/bookings', async (req, res, context) => {
    const body = await readJsonBody(req);
    const pnr = booking.createBooking(body, { user: context.user, env: loadEnv() });
    sendJson(res, 201, { booking: booking.getBookingDetail(pnr) });
  });

  router.get('/api/bookings', (req, res, context) => {
    if (!context.user) throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');
    const status = context.query.status;
    const bookings = booking
      .listBookingsForUser(context.user.id, status)
      .filter(Boolean);
    sendJson(res, 200, { bookings });
  });

  router.get('/api/bookings/:pnr', (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });
    sendJson(res, 200, { booking: booking.getBookingDetail(row.pnr) });
  });

  router.post('/api/bookings/:pnr/seats', async (req, res, context) => {
    const body = await readJsonBody(req);
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    const result = booking.selectSeats(row.pnr, body.selections ?? body, { env: loadEnv() });
    sendJson(res, 200, { ...result, booking: booking.getBookingDetail(row.pnr) });
  });

  router.post('/api/bookings/:pnr/confirm', (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    booking.transitionBooking(row.pnr, 'PENDING_PAYMENT', {
      actorType: context.user ? 'customer' : 'system',
      actorId: context.user?.id ?? null,
      privileged: booking.isPrivileged(context.user),
    });
    sendJson(res, 200, { booking: booking.getBookingDetail(row.pnr) });
  });

  router.post('/api/bookings/:pnr/cancel', async (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    const body = await readJsonBody(req);
    booking.cancelBooking(row.pnr, { user: context.user, reason: body.reason });
    sendJson(res, 200, { booking: booking.getBookingDetail(row.pnr) });
  });

  router.patch('/api/bookings/:pnr/contact', async (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    const body = await readJsonBody(req);
    const parsed = assertValid(validateContactUpdate(body));
    booking.updateBookingContact(row.pnr, parsed);
    sendJson(res, 200, { booking: booking.getBookingDetail(row.pnr) });
  });

  router.post('/api/bookings/:pnr/check-in', async (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    const body = await readJsonBody(req);
    sendJson(res, 200, { boardingPass: payment.checkIn(row.pnr, body.passengerId) });
  });

  router.get('/api/bookings/:pnr/events', (req, res, context) => {
    const row = booking.findBookingByPnr(context.params.pnr);
    if (!row) throw AppError.notFound('Booking', context.params.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    const events = booking
      .getBookingEvents(row.pnr)
      .map((event) => ({ ...event, id: String(event.id) }));
    sendJson(res, 200, { events });
  });

  router.post('/api/payments/intent', async (req, res) => {
    const body = await readJsonBody(req);
    sendJson(res, 201, { intent: payment.createPaymentIntent(body.pnr) });
  });

  router.post('/api/payments/:id/simulate', async (req, res, context) => {
    const body = await readJsonBody(req);
    const result = payment.simulatePayment(context.params.id, body.outcome, { env: loadEnv() });
    sendJson(res, 200, { payment: result });
  });

  router.post('/api/refunds', async (req, res, context) => {
    const body = await readJsonBody(req);
    const row = booking.findBookingByPnr(body.pnr);
    if (!row) throw AppError.notFound('Booking', body.pnr);
    assertCanRead(context.user, row, { allowPrivileged: true });

    if (!booking.isPrivileged(context.user)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only staff can issue a refund');
    }

    sendJson(res, 201, {
      refund: payment.requestRefund(body.pnr, {
        reason: body.reason,
        amount: body.amount,
        user: context.user,
      }),
    });
  });
}
