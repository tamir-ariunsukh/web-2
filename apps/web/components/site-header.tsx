import Link from 'next/link';

import { logoutAction } from '../lib/auth';

import type { SessionUser } from '../lib/auth';

export interface SiteHeaderProps {
  readonly user: SessionUser | null;
}

/** Top navigation. Shows the session state so the account affordance is obvious. */
export function SiteHeader({ user }: SiteHeaderProps): React.JSX.Element {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="bg-brand-600 flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white"
          >
            AB
          </span>
          Airline Booking
        </Link>

        <nav aria-label="Main">
          <ul className="flex items-center gap-1 text-sm sm:gap-2">
            <li>
              <NavLink href="/">Search</NavLink>
            </li>
            <li>
              <NavLink href="/my-bookings">My bookings</NavLink>
            </li>

            {user && (user.role === 'ADMIN' || user.role === 'AGENT') ? (
              <li>
                <NavLink href="/admin">Admin</NavLink>
              </li>
            ) : null}

            {user ? (
              <>
                <li className="hidden sm:block">
                  <Link
                    href="/account"
                    className="flex items-center gap-2 rounded-full px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200 flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
                    >
                      {user.firstName.slice(0, 1)}
                      {user.lastName.slice(0, 1)}
                    </span>
                    {user.firstName}
                  </Link>
                </li>
                <li>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="hover:bg-slate-50 inline-flex h-9 items-center rounded-full px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                    >
                      Sign out
                    </button>
                  </form>
                </li>
              </>
            ) : (
              <>
                <li>
                  <Link
                    href="/login"
                    className="hover:bg-slate-50 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-slate-700 transition dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    href="/register"
                    className="bg-brand-600 hover:bg-brand-700 inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-white transition"
                  >
                    Register
                  </Link>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-full px-3 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </Link>
  );
}
