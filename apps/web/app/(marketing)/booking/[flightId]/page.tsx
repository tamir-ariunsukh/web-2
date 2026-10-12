import Link from 'next/link';

import { BookingWizard } from '../../../../components/booking-wizard';
import { getSession } from '../../../../lib/auth';
import { getFlightDetail } from '../../../../lib/flights';
import { getSeatMap } from '../../../../lib/seat-map-source';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Complete your booking',
  robots: { index: false },
};

interface BookingPageProps {
  readonly params: Promise<{ flightId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BookingPage({
  params,
  searchParams,
}: BookingPageProps): Promise<React.JSX.Element> {
  const { flightId } = await params;
  const raw = await searchParams;

  const fareIdParam = raw.fareId;
  const fareId = Array.isArray(fareIdParam) ? fareIdParam[0] : fareIdParam;

  const flight = await getFlightDetail(flightId);
  const [user, seatMap] = await Promise.all([getSession(), getSeatMap(flightId)]);

  if (!flight) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Flight not found</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This flight is no longer in the demo catalogue.
        </p>
        <Link
          href="/"
          className="text-brand-600 mt-4 inline-block text-sm font-medium hover:underline"
        >
          Back to search
        </Link>
      </main>
    );
  }

  const fare = flight.fares.find((entry) => entry.id === fareId) ?? flight.fares[0];

  if (!fare) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">No fare available</h1>
        <Link
          href="/"
          className="text-brand-600 mt-4 inline-block text-sm font-medium hover:underline"
        >
          Back to search
        </Link>
      </main>
    );
  }

  return (
    <BookingWizard
      flight={flight}
      fare={{ id: fare.id, total: fare.total, currency: fare.currency, name: fare.fareClass.name }}
      seatMap={seatMap}
      signedIn={user !== null}
    />
  );
}
