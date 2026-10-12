'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { issueTicketAction, voidTicketAction } from '../lib/admin-actions';

import type { AdminTicket } from '../lib/admin';

const STATUS_TONE: Record<string, string> = {
  ISSUED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  PENDING: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  VOIDED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  REFUNDED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export interface TicketPanelProps {
  readonly tickets: readonly AdminTicket[];
  readonly canVoid: boolean;
}

/** Ticket register plus the manual issue form used to recover a failed job. */
export function TicketPanel({ tickets, canVoid }: TicketPanelProps): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pnr, setPnr] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [passengerId, setPassengerId] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  function run(action: () => Promise<{ error?: string; ok?: boolean }>, success: string): void {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        setNotice(success);
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {notice}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () =>
              issueTicketAction({
                bookingPnr: pnr.trim().toUpperCase(),
                segmentId: segmentId.trim(),
                passengerId: passengerId.trim(),
                ticketNumber: ticketNumber.trim(),
              }),
            `Ticket ${ticketNumber} issued for ${pnr.toUpperCase()}`,
          );
          setTicketNumber('');
        }}
        className="rounded-card shadow-card flex flex-col gap-4 border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Issue a ticket</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            For a booking whose ticketing job failed. Passengers must exist on the booking.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Booking PNR">
            <input
              required
              value={pnr}
              onChange={(event) => setPnr(event.target.value)}
              placeholder="2JQRZ2"
              maxLength={6}
              className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wider uppercase focus:ring-2 focus:outline-none dark:border-slate-700"
            />
          </Field>

          <Field label="Ticket number" hint="13 digits">
            <input
              required
              value={ticketNumber}
              onChange={(event) => setTicketNumber(event.target.value.replace(/\D/g, ''))}
              placeholder="1761234567890"
              maxLength={13}
              inputMode="numeric"
              className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
            />
          </Field>

          <Field label="Segment ID" hint="UUID from the booking">
            <input
              required
              value={segmentId}
              onChange={(event) => setSegmentId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:ring-2 focus:outline-none dark:border-slate-700"
            />
          </Field>

          <Field label="Passenger ID" hint="UUID from the booking">
            <input
              required
              value={passengerId}
              onChange={(event) => setPassengerId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:ring-2 focus:outline-none dark:border-slate-700"
            />
          </Field>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="bg-brand-600 hover:bg-brand-700 self-start inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition disabled:opacity-50"
        >
          {pending ? 'Issuing…' : 'Issue ticket'}
        </button>
      </form>

      <div className="rounded-card shadow-card overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
              <th className="px-5 py-3 font-medium">Ticket</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Passenger</th>
              <th className="px-5 py-3 font-medium">PNR</th>
              <th className="px-5 py-3 font-medium">Issued</th>
              {canVoid ? <th className="px-5 py-3 font-medium" /> : null}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td
                  colSpan={canVoid ? 6 : 5}
                  className="px-5 py-6 text-center text-sm text-slate-600 dark:text-slate-400"
                >
                  No tickets yet. They are created when a payment settles, or issue one above.
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                >
                  <td className="px-5 py-3 font-mono tabular-nums">{ticket.ticketNumber}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        STATUS_TONE[ticket.status] ?? STATUS_TONE.PENDING
                      }`}
                    >
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">{ticket.passengerName}</td>
                  <td className="px-5 py-3 font-mono tracking-wider">{ticket.bookingPnr}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {ticket.issuedAt ? new Date(ticket.issuedAt).toLocaleString() : '—'}
                  </td>
                  {canVoid ? (
                    <td className="px-5 py-3 text-right">
                      {ticket.status !== 'VOIDED' ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => voidTicketAction(ticket.id), `Ticket ${ticket.ticketNumber} voided`)
                          }
                          className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950 dark:text-red-300"
                        >
                          Void
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}
