'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setUserRoleAction, unlockUserAction } from '../lib/admin-actions';

import type { AdminUser } from '../lib/admin';

const ROLES = ['CUSTOMER', 'AGENT', 'ADMIN'] as const;

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  AGENT: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  CUSTOMER: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export interface UserTableProps {
  readonly users: readonly AdminUser[];
  readonly currentUserId: string;
}

/** User table with inline role change and unlock. Both go through the API. */
export function UserTable({ users, currentUserId }: UserTableProps): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>): void {
    setError(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      });
    });
  }

  if (users.length === 0) {
    return (
      <p className="rounded-card border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        No users match.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div className="rounded-card shadow-card overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Bookings</th>
              <th className="px-5 py-3 font-medium">Last login</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const locked = user.lockedUntil !== null && new Date(user.lockedUntil) > new Date();

              return (
                <tr
                  key={user.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {user.firstName} {user.lastName}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {user.email}
                      </span>
                    </div>
                  </td>

                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          ROLE_TONE[user.role] ?? ROLE_TONE.CUSTOMER
                        }`}
                      >
                        {user.role}
                      </span>
                      <select
                        aria-label={`Change role for ${user.email}`}
                        value={user.role}
                        disabled={pending || isSelf}
                        title={isSelf ? 'You cannot change your own role' : undefined}
                        onChange={(event) => {
                          const role = event.target.value;
                          run(() => setUserRoleAction(user.id, role));
                        }}
                        className="focus:ring-brand-500 dark:bg-slate-900 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:ring-2 focus:outline-none disabled:opacity-40 dark:border-slate-700 dark:text-slate-100"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  <td className="px-5 py-3 tabular-nums">{user.bookingCount}</td>

                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'never'}
                  </td>

                  <td className="px-5 py-3">
                    {locked ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => unlockUserAction(user.id))}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-200"
                      >
                        Unlock
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
