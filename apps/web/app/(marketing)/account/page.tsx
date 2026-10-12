import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSession } from '../../../lib/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false },
};

function Row({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4 dark:border-slate-800">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase sm:w-40 sm:shrink-0 dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

export default async function AccountPage(): Promise<React.JSX.Element> {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  const initials = `${user.firstName.slice(0, 1)}${user.lastName.slice(0, 1)}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200 flex size-14 items-center justify-center rounded-full text-lg font-bold"
        >
          {initials}
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
        </div>
      </header>

      <section className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="py-2 text-base font-semibold">Profile</h2>
        <dl>
          <Row label="First name" value={user.firstName} />
          <Row label="Last name" value={user.lastName} />
          <Row label="Email" value={user.email} />
          <Row label="Phone" value={user.phone ?? 'Not provided'} />
          <Row label="Role" value={user.role} />
        </dl>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/my-bookings"
          className="rounded-card shadow-card hover:border-brand-400 border border-slate-200 bg-white px-6 py-5 transition dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500"
        >
          <h2 className="text-base font-semibold">My bookings</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            View, manage and cancel the trips on your account.
          </p>
        </Link>

        <Link
          href="/"
          className="rounded-card shadow-card hover:border-brand-400 border border-slate-200 bg-white px-6 py-5 transition dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-500"
        >
          <h2 className="text-base font-semibold">Book another flight</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Search routes, compare fares and pick your seat.
          </p>
        </Link>
      </section>
    </main>
  );
}
