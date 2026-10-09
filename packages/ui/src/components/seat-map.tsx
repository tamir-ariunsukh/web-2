'use client';

import { useMemo } from 'react';

import { cn } from '../lib/cn';

import type { SeatMap as SeatMapData, SeatView } from '@repo/shared';


export interface SeatMapProps {
  readonly seatMap: SeatMapData;
  readonly selectedSeatIds: readonly string[];
  readonly onToggleSeat?: (seat: SeatView) => void;
  /** Seats above this count are not selectable, e.g. more than the party size. */
  readonly maxSelectable?: number;
  readonly className?: string;
}

const SEAT_STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-seat-available text-emerald-900 hover:ring-2 hover:ring-brand-400',
  HELD: 'bg-seat-held text-amber-900 cursor-not-allowed',
  BOOKED: 'bg-seat-occupied text-slate-500 cursor-not-allowed',
  BLOCKED: 'bg-seat-blocked text-red-900 cursor-not-allowed',
};

const LEGEND: readonly { status: string; label: string }[] = [
  { status: 'AVAILABLE', label: 'Available' },
  { status: 'HELD', label: 'On hold' },
  { status: 'BOOKED', label: 'Taken' },
  { status: 'BLOCKED', label: 'Unavailable' },
];

/**
 * Interactive seat map.
 *
 * Selection is controlled by the parent so the wizard can enforce one seat per
 * passenger and validate the selection against the party size. Disabled seats keep
 * their slot in the grid, which preserves the aircraft's real geometry.
 */
export function SeatMap({
  seatMap,
  selectedSeatIds,
  onToggleSeat,
  maxSelectable,
  className,
}: SeatMapProps): React.JSX.Element {
  const selected = useMemo(() => new Set(selectedSeatIds), [selectedSeatIds]);
  const selectionFull = maxSelectable !== undefined && selectedSeatIds.length >= maxSelectable;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {seatMap.cabins.map((cabin) => (
        <section key={cabin.cabin} className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {cabin.label}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {cabin.columns.join(' ')}
            </span>
          </header>

          <div className="overflow-x-auto" role="group" aria-label={`${cabin.label} seat map`}>
            <div className="inline-flex flex-col gap-1.5">
              {cabin.rows.map((row) => (
                <div key={row.row} className="flex items-center gap-1.5">
                  <span className="w-7 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {row.row}
                  </span>

                  {row.seats.map((seat, index) => {
                    const isSelected = selected.has(seat.id);
                    const isDisabled =
                      seat.status !== 'AVAILABLE' || (!isSelected && selectionFull);

                    return (
                      <div key={seat.id} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Seat ${seat.seatNumber}, ${
                            isSelected ? 'selected' : seat.status.toLowerCase()
                          }${seat.isExitRow ? ', exit row' : ''}${
                            seat.hasBassinet ? ', bassinet position' : ''
                          }`}
                          aria-pressed={isSelected}
                          disabled={isDisabled}
                          onClick={() => {
                            onToggleSeat?.(seat);
                          }}
                          className={cn(
                            'size-8 rounded-md text-[10px] font-semibold transition',
                            isSelected
                              ? 'bg-seat-selected text-white ring-2 ring-brand-300'
                              : (SEAT_STATUS_STYLES[seat.status] ?? 'bg-slate-200'),
                            isDisabled && !isSelected && 'opacity-60',
                          )}
                        >
                          {seat.column}
                        </button>

                        {row.aislesAfter.includes(index + 1) ? (
                          <span aria-hidden="true" className="w-4" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <ul className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
        {LEGEND.map((entry) => (
          <li key={entry.status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('size-3.5 rounded', SEAT_STATUS_STYLES[entry.status])}
            />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
