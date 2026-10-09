'use client';

import { cabinClassSchema, passengerCountSchema } from '@repo/shared';
import { Button, Field, Input } from '@repo/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';


export interface SearchFormProps {
  readonly defaultOrigin?: string;
  readonly defaultDestination?: string;
  readonly defaultDepartDate?: string;
}

interface FormErrors {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  passengers?: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Flight search form.
 *
 * Validation mirrors the API's Zod schema so a rejected search is caught before a
 * network round trip, while the server stays the authority.
 */
export function SearchForm({
  defaultOrigin = '',
  defaultDestination = '',
  defaultDepartDate = todayIso(),
}: SearchFormProps): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tripType, setTripType] = useState<'oneway' | 'roundtrip'>('roundtrip');
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState(defaultDestination);
  const [departDate, setDepartDate] = useState(defaultDepartDate);
  const [returnDate, setReturnDate] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabin, setCabin] = useState('ECONOMY');
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): boolean {
    const next: FormErrors = {};

    const count = passengerCountSchema.safeParse({ adults, children, infants });
    if (!count.success) {
      next.passengers = count.error.issues[0]?.message ?? 'Invalid passenger count';
    }

    if (!/^[A-Za-z]{3}$/.test(origin.trim())) {
      next.origin = 'Enter a 3-letter IATA code';
    }
    if (!/^[A-Za-z]{3}$/.test(destination.trim())) {
      next.destination = 'Enter a 3-letter IATA code';
    }
    if (origin.trim().toUpperCase() === destination.trim().toUpperCase()) {
      next.destination = 'Destination must differ from origin';
    }
    if (!departDate) {
      next.departDate = 'Choose a departure date';
    }
    if (tripType === 'roundtrip' && returnDate && returnDate < departDate) {
      next.returnDate = 'Return date cannot precede departure';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!validate()) return;

    const params = new URLSearchParams({
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      departDate,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin,
    });

    if (tripType === 'roundtrip' && returnDate) {
      params.set('returnDate', returnDate);
    }

    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex gap-2" role="radiogroup" aria-label="Trip type">
        {(['roundtrip', 'oneway'] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={tripType === type}
            onClick={() => {
              setTripType(type);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tripType === type
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {type === 'roundtrip' ? 'Round trip' : 'One way'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="origin" required {...(errors.origin ? { error: errors.origin } : {})}>
          <Input
            id="origin"
            name="origin"
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value.toUpperCase().slice(0, 3));
            }}
            placeholder="ULN"
            autoComplete="off"
            maxLength={3}
            required
            {...(errors.origin ? { invalid: true } : {})}
          />
        </Field>

        <Field
          label="To"
          htmlFor="destination"
          required
          {...(errors.destination ? { error: errors.destination } : {})}
        >
          <Input
            id="destination"
            name="destination"
            value={destination}
            onChange={(event) => {
              setDestination(event.target.value.toUpperCase().slice(0, 3));
            }}
            placeholder="SEL"
            autoComplete="off"
            maxLength={3}
            required
            {...(errors.destination ? { invalid: true } : {})}
          />
        </Field>

        <Field
          label="Departure"
          htmlFor="departDate"
          required
          {...(errors.departDate ? { error: errors.departDate } : {})}
        >
          <Input
            id="departDate"
            name="departDate"
            type="date"
            value={departDate}
            min={todayIso()}
            onChange={(event) => {
              setDepartDate(event.target.value);
            }}
            required
            {...(errors.departDate ? { invalid: true } : {})}
          />
        </Field>

        <Field
          label="Return"
          htmlFor="returnDate"
          {...(errors.returnDate ? { error: errors.returnDate } : {})}
        >
          <Input
            id="returnDate"
            name="returnDate"
            type="date"
            value={returnDate}
            min={departDate}
            disabled={tripType === 'oneway'}
            onChange={(event) => {
              setReturnDate(event.target.value);
            }}
            {...(errors.returnDate ? { invalid: true } : {})}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Adults" htmlFor="adults">
          <Input
            id="adults"
            type="number"
            inputMode="numeric"
            min={1}
            max={9}
            value={adults}
            onChange={(event) => {
              setAdults(Number(event.target.value));
            }}
          />
        </Field>

        <Field label="Children" htmlFor="children">
          <Input
            id="children"
            type="number"
            inputMode="numeric"
            min={0}
            max={8}
            value={children}
            onChange={(event) => {
              setChildren(Number(event.target.value));
            }}
          />
        </Field>

        <Field label="Infants" htmlFor="infants">
          <Input
            id="infants"
            type="number"
            inputMode="numeric"
            min={0}
            max={4}
            value={infants}
            onChange={(event) => {
              setInfants(Number(event.target.value));
            }}
          />
        </Field>

        <Field label="Cabin" htmlFor="cabin">
          <select
            id="cabin"
            name="cabin"
            value={cabin}
            onChange={(event) => {
              setCabin(event.target.value);
            }}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {cabinClassSchema.options.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {errors.passengers ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {errors.passengers}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={isPending} className="self-start">
        Search flights
      </Button>
    </form>
  );
}
