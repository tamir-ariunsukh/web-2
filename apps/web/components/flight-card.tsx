import { Badge, Card, CardBody } from '@repo/ui';
import Link from 'next/link';


import {
  formatDateInZone,
  formatDuration,
  formatTimeInZone,
} from '../lib/search-params';

import type { FlightSearchResult } from '../lib/flights';

type Flight = FlightSearchResult['flights'][number];

export interface FlightCardProps {
  readonly flight: Flight;
  readonly passengerCount: number;
}

/** One search result. Times are rendered in the airport's timezone, not the server's. */
export function FlightCard({ flight, passengerCount }: FlightCardProps): React.JSX.Element {
  const fare = flight.lowestFare;
  const seatsShort = fare !== null && fare.seatsAvailable <= passengerCount + 2;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300"
          >
            {flight.airline.iataCode}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {formatTimeInZone(flight.departureAt, flight.origin.timezone)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {flight.origin.iataCode}
              </span>
              <span aria-hidden="true" className="text-slate-400">
                →
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatTimeInZone(flight.arrivalAt, flight.destination.timezone)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {flight.destination.iataCode}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>{flight.airline.name}</span>
              <span aria-hidden="true">·</span>
              <span>{flight.flightNumber}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDuration(flight.durationMinutes)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatDateInZone(flight.departureAt, flight.origin.timezone)}
              </span>
              <Badge tone="success">Direct</Badge>
              {flight.status !== 'SCHEDULED' ? (
                <Badge tone={flight.status === 'CANCELLED' ? 'danger' : 'warning'}>
                  {flight.status}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
          {fare ? (
            <div className="flex flex-col items-end">
              <span className="text-xl font-semibold tabular-nums">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: fare.currency,
                  maximumFractionDigits: 2,
                }).format(fare.total / 100)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                per passenger · {fare.fareClass.name}
              </span>
              {seatsShort ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Only {fare.seatsAvailable} seats left
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">Sold out</span>
          )}

          {fare ? (
            <Link
              href={`/booking/${flight.id}?fareId=${fare.id}`}
              className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition"
            >
              Select
            </Link>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
