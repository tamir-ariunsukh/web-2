'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

const OPTIONS = [
  { value: 'BEST', label: 'Best' },
  { value: 'PRICE_ASC', label: 'Cheapest' },
  { value: 'PRICE_DESC', label: 'Most expensive' },
  { value: 'DURATION_ASC', label: 'Shortest' },
  { value: 'DEPARTURE_ASC', label: 'Earliest departure' },
] as const;

/** Sort control. Keeps the choice in the URL so results stay shareable. */
export function FlightSort(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = params.get('sort') ?? 'BEST';

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-600 dark:text-slate-400">Sort by</span>
      <select
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.delete('cursor');
          if (event.target.value === 'BEST') next.delete('sort');
          else next.set('sort', event.target.value);
          startTransition(() => {
            router.push(`/search?${next.toString()}`, { scroll: false });
          });
        }}
        className="focus:ring-brand-500 dark:bg-slate-900 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:outline-none dark:border-slate-700 dark:text-slate-100"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
