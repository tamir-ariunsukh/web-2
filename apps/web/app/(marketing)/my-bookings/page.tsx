import Link from 'next/link';

import { BookingList } from '../../../components/booking-list';
import { getSession } from '../../../lib/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My bookings',
  robots: { index: false },
};

export default async function MyBookingsPage(): Promise<React.JSX.Element> {
  const user = await getSession();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {user
            ? `Signed in as ${user.email}`
            : 'Sign in to see the bookings linked to your account.'}
        </p>
      </header>

      {user ? (
        <BookingList />
      ) : (
        <div className="rounded-card shadow-card border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Sign in required</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Bookings are stored against your account.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium ring-1 ring-slate-300 transition dark:ring-slate-700"
            >
              Create an account
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
