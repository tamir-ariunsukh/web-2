'use client';

import { Button } from '@repo/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateBookingContactAction } from '../lib/booking-actions';

export interface BookingContact {
  readonly contactPhone: string;
  readonly contactEmail: string;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly homeAddress: string | null;
}

export interface ContactDetailsProps {
  readonly pnr: string;
  readonly contact: BookingContact;
  readonly readOnly: boolean;
}

/**
 * Collected so the airline can reach someone when the traveller cannot be
 * reached directly. Values are stored on the booking row through the API.
 */
export function ContactDetails({
  pnr,
  contact,
  readOnly,
}: ContactDetailsProps): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const hasEmergency = Boolean(contact.emergencyContactName && contact.emergencyContactPhone);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});
    setSaved(false);
    startTransition(() => {
      void updateBookingContactAction(pnr, formData).then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
          return;
        }
        setSaved(true);
        setEditing(false);
        router.refresh();
      });
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-3 text-sm">
          <Row label="Contact phone" value={contact.contactPhone} />
          <Row label="Email" value={contact.contactEmail} />
          <Row
            label="Emergency contact"
            value={
              hasEmergency
                ? `${contact.emergencyContactName} · ${contact.emergencyContactPhone}`
                : null
            }
          />
          <Row label="Home address" value={contact.homeAddress} />
        </dl>

        {saved ? (
          <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
            Contact details saved.
          </p>
        ) : null}

        {readOnly ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This booking can no longer be edited.
          </p>
        ) : (
          <div>
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {hasEmergency || contact.homeAddress ? 'Edit details' : 'Add details'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        An emergency contact and home address help us reach someone if we cannot contact you
        directly.
      </p>

      <Field
        label="Contact phone"
        name="contactPhone"
        defaultValue={contact.contactPhone}
        required
        error={fieldErrors.contactPhone}
      />
      <Field
        label="Email"
        name="contactEmail"
        type="email"
        defaultValue={contact.contactEmail}
        error={fieldErrors.contactEmail}
      />
      <Field
        label="Emergency contact name"
        name="emergencyContactName"
        defaultValue={contact.emergencyContactName ?? ''}
        error={fieldErrors.emergencyContactName}
      />
      <Field
        label="Emergency contact phone"
        name="emergencyContactPhone"
        defaultValue={contact.emergencyContactPhone ?? ''}
        error={fieldErrors.emergencyContactPhone}
      />
      <Field
        label="Home address"
        name="homeAddress"
        defaultValue={contact.homeAddress ?? ''}
        placeholder="Street, city, postal code"
        error={fieldErrors.homeAddress}
      />

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setEditing(false);
            setError(null);
            setFieldErrors({});
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase sm:w-48 sm:shrink-0 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={
          value
            ? 'text-slate-900 dark:text-slate-100'
            : 'text-slate-400 italic dark:text-slate-500'
        }
      >
        {value ?? 'Not provided'}
      </dd>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  placeholder,
  required,
  error,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue: string;
  readonly type?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly error?: string | undefined;
}): React.JSX.Element {
  const id = `contact-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-950"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
