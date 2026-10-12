'use client';

import { Button } from '@repo/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelBookingAction } from '../lib/booking-actions';

export interface CancelBookingProps {
  readonly pnr: string;
}

/** Cancels a booking through the API, then refreshes the server-rendered page. */
export function CancelBooking({ pnr }: CancelBookingProps): React.JSX.Element {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Cancel {pnr}? Seats are released and cannot be restored.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="danger"
          loading={pending}
          onClick={() => {
            setError(null);
            startTransition(() => {
              void cancelBookingAction(pnr).then((result) => {
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                setConfirming(false);
              });
            });
          }}
        >
          Yes, cancel it
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Keep booking
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
