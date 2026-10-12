import Link from 'next/link';

import { getSalesReport, getStats, getStaff, isAdmin } from '../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin dashboard',
  robots: { index: false },
};

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

export default async function AdminDashboardPage(): Promise<React.JSX.Element> {
  const [staff, stats, report] = await Promise.all([getStaff(), getStats(), getSalesReport(30)]);

  if (!stats) {
    return (
      <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Could not load statistics. Is the API running?
      </p>
    );
  }

  const tiles = [
    { label: 'Revenue (settled)', value: money(stats.revenueMinor, stats.currency) },
    { label: 'Bookings', value: String(stats.bookings) },
    { label: 'Confirmed', value: String(stats.confirmedBookings) },
    { label: 'Cancelled', value: String(stats.cancelledBookings) },
    { label: 'Tickets issued', value: String(stats.ticketsIssued) },
    { label: 'Pending refunds', value: String(stats.pendingRefunds) },
    { label: 'Users', value: String(stats.users) },
    { label: 'Flights today', value: String(stats.flightsToday) },
  ];

  const peak = Math.max(1, ...(report?.byDay.map((point) => point.revenueMinor) ?? [1]));

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-card shadow-card border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {tile.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </section>

      {report ? (
        <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Revenue, last 30 days</h2>
            <Link href="/admin/reports" className="text-brand-600 text-sm font-medium hover:underline">
              Full report
            </Link>
          </div>

          {report.byDay.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No settled payments in this period.
            </p>
          ) : (
            <ul className="mt-5 flex items-end gap-2 overflow-x-auto pb-2">
              {report.byDay.map((point) => (
                <li key={point.bucket} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                    {money(point.revenueMinor, report.currency)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="bg-brand-500 w-full rounded-t"
                    style={{ height: `${Math.max(6, Math.round((point.revenueMinor / peak) * 120))}px` }}
                  />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {point.bucket.slice(5)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isAdmin(staff) ? (
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { href: '/admin/users', title: 'Users', body: 'Search accounts, change roles, unlock logins.' },
            { href: '/admin/tickets', title: 'Tickets', body: 'Issue or void a ticket when ticketing failed.' },
            { href: '/admin/taxonomy', title: 'Taxonomy', body: 'Categories and the extras sold under them.' },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-card shadow-card hover:border-brand-300 border border-slate-200 bg-white px-5 py-4 transition dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
            >
              <h3 className="text-sm font-semibold">{card.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{card.body}</p>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
