import Link from 'next/link';

import { getBooking } from '../lib/bookings';
import { formatDateInZone, formatDuration, formatTimeInZone } from '../lib/search-params';

import { CancelBooking } from './cancel-booking';
import { ContactDetails } from './contact-details';

import type { BookingSummary } from '../lib/bookings';

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  TICKETED: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  CHECKED_IN: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  EXPIRED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  PAYMENT_FAILED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

export interface BookingDetailProps {
  readonly pnr: string;
}

/** One booking, read from the database. Ownership is enforced by the API. */
export async function BookingDetail({ pnr }: BookingDetailProps): Promise<React.JSX.Element> {
  const booking = await getBooking(pnr);

  if (!booking) {
    return (
      <div className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold">Booking not found</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          No booking with reference {pnr} is visible to this account.
        </p>
        <Link
          href="/my-bookings"
          className="text-brand-600 mt-3 inline-block text-sm font-medium hover:underline"
        >
          Back to my bookings
        </Link>
      </div>
    );
  }

  const cancellable = ['HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'TICKETED'].includes(booking.status);
  const editable = !['CANCELLED', 'EXPIRED'].includes(booking.status);

  return (
    <div className="flex flex-col gap-5">
      <Header booking={booking} />
      <Itinerary booking={booking} />
      <Passengers booking={booking} />
      <ContactSection booking={booking} editable={editable} />
      <Totals booking={booking} />

      <div className="flex flex-wrap gap-3">
        <Link
          href="/my-bookings"
          className="hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium ring-1 ring-slate-300 transition dark:ring-slate-700"
        >
          Back to my bookings
        </Link>
        {cancellable ? <CancelBooking pnr={booking.pnr} /> : null}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Header({ booking }: { readonly booking: BookingSummary }): React.JSX.Element {
  return (
    <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-2xl font-semibold tracking-wider">{booking.pnr}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Booked {new Date(booking.createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_TONE[booking.status] ??
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {booking.status.replace(/_/g, ' ')}
        </span>
      </div>
    </section>
  );
}

function Itinerary({ booking }: { readonly booking: BookingSummary }): React.JSX.Element {
  return (
    <Card title="Itinerary">
      <ul className="flex flex-col gap-4">
        {booking.segments.map((segment) => {
          const flight = segment.flight;
          return (
            <li key={segment.id} className="flex flex-col gap-1">
              <span className="text-lg font-semibold tabular-nums">
                {flight.origin.iataCode} → {flight.destination.iataCode}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {flight.airline.name} · {flight.flightNumber} ·{' '}
                {formatDuration(flight.durationMinutes)}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Departs {formatDateInZone(flight.departureAt, flight.origin.timezone)} at{' '}
                {formatTimeInZone(flight.departureAt, flight.origin.timezone)} (
                {flight.origin.timezone})
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Arrives {formatDateInZone(flight.arrivalAt, flight.destination.timezone)} at{' '}
                {formatTimeInZone(flight.arrivalAt, flight.destination.timezone)} (
                {flight.destination.timezone})
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Passengers({ booking }: { readonly booking: BookingSummary }): React.JSX.Element {
  const seats = booking.segments.flatMap((segment) =>
    segment.assignedSeats.map((seat) => seat.seatNumber),
  );

  return (
    <Card title="Passengers">
      <ul className="flex flex-col gap-2">
        {booking.passengers.map((passenger, index) => (
          <li key={passenger.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-900 dark:text-slate-100">
              {passenger.firstName} {passenger.lastName}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {seats[index] ? `Seat ${seats[index]}` : 'No seat selected'}
            </span>
          </li>
        ))}
      </ul>

      {booking.tickets.length > 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Tickets: {booking.tickets.map((ticket) => ticket.ticketNumber).join(', ')}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Tickets are issued once payment settles.
        </p>
      )}
    </Card>
  );
}

function ContactSection({
  booking,
  editable,
}: {
  readonly booking: BookingSummary;
  readonly editable: boolean;
}): React.JSX.Element {
  return (
    <Card title="Contact details">
      <ContactDetails
        pnr={booking.pnr}
        readOnly={!editable}
        contact={{
          contactPhone: booking.contactPhone,
          contactEmail: booking.contactEmail,
          emergencyContactName: booking.emergencyContactName,
          emergencyContactPhone: booking.emergencyContactPhone,
          homeAddress: booking.homeAddress,
        }}
      />
    </Card>
  );
}

function Totals({ booking }: { readonly booking: BookingSummary }): React.JSX.Element {
  return (
    <Card title="Payment">
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600 dark:text-slate-400">Total</dt>
          <dd className="font-semibold tabular-nums">
            {money(booking.price.total, booking.price.currency)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
