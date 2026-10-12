import Link from 'next/link';

import { listMyBookings } from '../lib/bookings';
import { formatDateInZone, formatTimeInZone } from '../lib/search-params';

import type { BookingSummary } from '../lib/bookings';

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  TICKETED: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  CHECKED_IN: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  HELD: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  EXPIRED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  PAYMENT_FAILED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

/** Bookings for the signed-in traveller, read from the database. */
export async function BookingList(): Promise<React.JSX.Element> {
  const bookings = await listMyBookings();

  if (bookings.length === 0) {
    return (
      <div className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">No bookings yet</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Bookings you make while signed in appear here.
        </p>
        <Link href="/" className="text-brand-600 mt-3 inline-block text-sm font-medium hover:underline">
          Search flights
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {bookings.map((booking) => (
        <li key={booking.pnr}>
          <BookingRow booking={booking} />
        </li>
      ))}
    </ul>
  );
}

function BookingRow({ booking }: { readonly booking: BookingSummary }): React.JSX.Element {
  const segment = booking.segments[0];
  const seats = booking.segments.flatMap((entry) =>
    entry.assignedSeats.map((seat) => seat.seatNumber),
  );

  return (
    <div className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold tracking-wider">{booking.pnr}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                STATUS_TONE[booking.status] ??
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {booking.status.replace(/_/g, ' ')}
            </span>
          </div>

          {segment ? (
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {segment.flight.origin.iataCode} → {segment.flight.destination.iataCode} ·{' '}
              {segment.flight.airline.name} {segment.flight.flightNumber}
            </span>
          ) : null}

          {segment ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateInZone(segment.flight.departureAt, segment.flight.origin.timezone)} ·{' '}
              {formatTimeInZone(segment.flight.departureAt, segment.flight.origin.timezone)} →{' '}
              {formatTimeInZone(segment.flight.arrivalAt, segment.flight.destination.timezone)}
            </span>
          ) : null}

          <span className="text-xs text-slate-500 dark:text-slate-400">
            {booking.passengers.length}{' '}
            {booking.passengers.length === 1 ? 'passenger' : 'passengers'}
            {seats.length > 0 ? ` · seats ${seats.join(', ')}` : ''}
          </span>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {money(booking.price.total, booking.price.currency)}
          </span>
          <Link
            href={`/my-bookings/${booking.pnr}`}
            className="text-brand-600 text-sm font-medium hover:underline"
          >
            View details
          </Link>
        </div>
      </div>
    </div>
  );
}
