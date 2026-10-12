import Link from 'next/link';

import { listBookings } from '../../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bookings',
  robots: { index: false },
};

const STATUSES = [
  'HELD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'TICKETED',
  'CHECKED_IN',
  'EXPIRED',
  'CANCELLED',
  'PAYMENT_FAILED',
] as const;

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  TICKETED: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  CHECKED_IN: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  HELD: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CANCELLED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  PAYMENT_FAILED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  EXPIRED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

interface BookingsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminBookingsPage({
  searchParams,
}: BookingsPageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const first = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = first('status');
  const search = first('search');
  const page = Number(first('page') ?? '1') || 1;

  const bookings = await listBookings({ status, search, page });

  return (
    <div className="flex flex-col gap-5">
      <form method="get" className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">PNR</span>
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="e.g. 2JQRZ2"
            className="focus:ring-brand-500 dark:bg-slate-900 w-40 rounded-full border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm tracking-wider text-slate-900 uppercase focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Status</span>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="focus:ring-brand-500 dark:bg-slate-900 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          >
            <option value="">Any</option>
            {STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white transition"
        >
          Apply
        </button>
      </form>

      {bookings.length === 0 ? (
        <p className="rounded-card border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No bookings match.
        </p>
      ) : (
        <div className="rounded-card shadow-card overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-3 font-medium">PNR</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Passengers</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr
                  key={booking.pnr}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/my-bookings/${booking.pnr}`}
                      className="font-mono font-semibold tracking-wider hover:underline"
                    >
                      {booking.pnr}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        STATUS_TONE[booking.status] ?? STATUS_TONE.EXPIRED
                      }`}
                    >
                      {booking.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{booking.passengerCount}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {money(booking.totalMinor, booking.currency)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {booking.contactEmail}
                      </span>
                      {booking.ownerEmail && booking.ownerEmail !== booking.contactEmail ? (
                        <span className="text-xs text-slate-400">
                          account: {booking.ownerEmail}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(booking.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
