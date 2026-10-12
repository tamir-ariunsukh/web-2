import { UserTable } from '../../../components/user-table';
import { getStaff, listUsers } from '../../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false },
};

interface UsersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({
  searchParams,
}: UsersPageProps): Promise<React.JSX.Element> {
  const raw = await searchParams;
  const first = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = first('search');
  const role = first('role');
  const page = Number(first('page') ?? '1') || 1;

  const [staff, users] = await Promise.all([
    getStaff(),
    listUsers({ search, role, page }),
  ]);

  if (!staff) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Admin access required.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <form method="get" className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Search</span>
          <input
            type="search"
            name="search"
            defaultValue={search ?? ''}
            placeholder="email or name"
            className="focus:ring-brand-500 dark:bg-slate-900 w-56 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Role</span>
          <select
            name="role"
            defaultValue={role ?? ''}
            className="focus:ring-brand-500 dark:bg-slate-900 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
          >
            <option value="">Any</option>
            <option value="CUSTOMER">Customer</option>
            <option value="AGENT">Agent</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>

        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white transition"
        >
          Apply
        </button>
      </form>

      <UserTable users={users} currentUserId={staff.id} />
    </div>
  );
}
