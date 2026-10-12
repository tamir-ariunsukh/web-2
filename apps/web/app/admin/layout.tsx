import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getStaff, isAdmin } from '../../lib/admin';

/**
 * Admin shell.
 *
 * The role check lives here so every nested page inherits it, and the API checks
 * again on each request. A non-staff visitor is redirected rather than shown an
 * error, because the area does not exist for them.
 */
export default async function AdminLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const staff = await getStaff();
  if (!staff) redirect('/');

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-brand-600 dark:text-brand-400 text-xs font-semibold tracking-wide uppercase">
            Admin
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isAdmin(staff) ? 'Control panel' : 'Agent console'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Signed in as {staff.email} · {staff.role}
          </p>
        </div>
        <Link
          href="/"
          className="hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium ring-1 ring-slate-300 transition dark:ring-slate-700"
        >
          Back to site
        </Link>
      </header>

      <AdminNav showUsers={isAdmin(staff)} />

      {children}
    </div>
  );
}

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/taxonomy', label: 'Taxonomy' },
  { href: '/admin/reports', label: 'Reports' },
] as const;

function AdminNav({ showUsers }: { readonly showUsers: boolean }): React.JSX.Element {
  const links = showUsers
    ? [...LINKS.slice(0, 1), { href: '/admin/users', label: 'Users' }, ...LINKS.slice(1)]
    : LINKS;

  return (
    <nav aria-label="Admin sections" className="border-b border-slate-200 dark:border-slate-800">
      <ul className="flex flex-wrap gap-1 pb-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
