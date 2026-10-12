import { TicketPanel } from '../../../components/ticket-panel';
import { getStaff, isAdmin, listTickets } from '../../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tickets',
  robots: { index: false },
};

const STATUSES = ['PENDING', 'ISSUED', 'VOIDED', 'REFUNDED'] as const;

interface TicketsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminTicketsPage({
  searchParams,
}: TicketsPageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const first = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const [staff, tickets] = await Promise.all([
    getStaff(),
    listTickets({ status: first('status'), search: first('search') }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <form method="get" className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Search</span>
          <input
            type="search"
            name="search"
            defaultValue={first('search') ?? ''}
            placeholder="ticket number or PNR"
            className="focus:ring-brand-500 dark:bg-slate-900 w-52 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Status</span>
          <select
            name="status"
            defaultValue={first('status') ?? ''}
            className="focus:ring-brand-500 dark:bg-slate-900 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          >
            <option value="">Any</option>
            {STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
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

      <TicketPanel tickets={tickets} canVoid={isAdmin(staff)} />
    </div>
  );
}
