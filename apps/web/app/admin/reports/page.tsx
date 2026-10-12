import Link from 'next/link';

import { getSalesReport } from '../../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sales report',
  robots: { index: false },
};

function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorUnits / 100);
}

const RANGES = [7, 30, 90, 365] as const;

interface ReportsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminReportsPage({
  searchParams,
}: ReportsPageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const daysParam = Array.isArray(raw.days) ? raw.days[0] : raw.days;
  const days = RANGES.includes(Number(daysParam) as (typeof RANGES)[number])
    ? Number(daysParam)
    : 30;

  const report = await getSalesReport(days);

  if (!report) {
    return (
      <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Could not load the report. Is the API running?
      </p>
    );
  }

  const peak = Math.max(1, ...report.byDay.map((point) => point.revenueMinor));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600 dark:text-slate-400">Period</span>
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/reports?days=${range}`}
            className={
              range === days
                ? 'bg-brand-600 inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium text-white'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition dark:text-slate-400 dark:ring-slate-700'
            }
          >
            {range === 365 ? '1 year' : `${range} days`}
          </Link>
        ))}
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Revenue (settled)', value: money(report.totalRevenueMinor, report.currency) },
          { label: 'Paid bookings', value: String(report.totalBookings) },
          { label: 'Average order', value: money(report.averageOrderMinor, report.currency) },
        ].map((tile) => (
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

      <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">Revenue by day</h2>

        {report.byDay.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No settled payments in this period.
          </p>
        ) : (
          <ul className="mt-5 flex items-end gap-1 overflow-x-auto pb-2">
            {report.byDay.map((point) => (
              <li
                key={point.bucket}
                className="flex w-12 shrink-0 flex-col items-center gap-1.5"
                title={`${point.bucket}: ${money(point.revenueMinor, report.currency)} from ${point.bookings} booking(s)`}
              >
                <span
                  aria-hidden="true"
                  className="bg-brand-500 w-full rounded-t"
                  style={{ height: `${Math.max(6, Math.round((point.revenueMinor / peak) * 140))}px` }}
                />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {point.bucket.slice(5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Top routes</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 font-medium">Route</th>
                <th className="py-2 font-medium">Bookings</th>
                <th className="py-2 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {report.topRoutes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500 dark:text-slate-400">
                    No paid routes yet.
                  </td>
                </tr>
              ) : (
                report.topRoutes.map((route) => (
                  <tr
                    key={`${route.origin}-${route.destination}`}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="py-2 font-medium">
                      {route.origin} → {route.destination}
                    </td>
                    <td className="py-2 tabular-nums">{route.bookings}</td>
                    <td className="py-2 text-right tabular-nums">
                      {money(route.revenueMinor, report.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Bookings by status</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {report.byStatus.map((entry) => {
              const total = report.byStatus.reduce((sum, row) => sum + row.count, 0) || 1;
              const pct = Math.round((entry.count / total) * 100);
              return (
                <li key={entry.status} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-slate-600 dark:text-slate-400">
                    {entry.status.replace(/_/g, ' ')}
                  </span>
                  <span
                    aria-hidden="true"
                    className="bg-brand-500/25 h-2.5 flex-1 overflow-hidden rounded-full"
                  >
                    <span
                      className="bg-brand-600 block h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-14 text-right tabular-nums">
                    {entry.count} · {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
