'use client';

import { Button, Card, CardBody, Field, Input, SeatMap as SeatMapView } from '@repo/ui';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { checkoutAction } from '../lib/booking-actions';
import {
  formatDateInZone,
  formatDuration,
  formatTimeInZone,
  todayIso,
} from '../lib/search-params';

import type { FlightDetail } from '../lib/flights';
import type { SeatMap, SeatView } from '@repo/shared';

export interface BookingWizardProps {
  readonly flight: FlightDetail;
  readonly fare: {
    readonly id: string;
    readonly total: number;
    readonly currency: string;
    readonly name: string;
  };
  /** Seat map for this flight, resolved on the server. */
  readonly seatMap: SeatMap | null;
  /** False when nobody is signed in, which blocks checkout. */
  readonly signedIn: boolean;
}

interface PassengerDraft {
  type: 'ADULT' | 'CHILD' | 'INFANT';
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  passportNumber: string;
  passportExpiry: string;
  passportIssuingCountry: string;
}

const STEPS = ['Passengers', 'Seats', 'Payment'] as const;
type Step = (typeof STEPS)[number];

const EMPTY_PASSENGER: PassengerDraft = {
  type: 'ADULT',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  passportNumber: '',
  passportExpiry: '',
  passportIssuingCountry: '',
};

/** Amounts are stored in minor units, so they are divided before formatting. */
function money(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(minorUnits / 100);
}

export function BookingWizard({
  flight,
  fare,
  seatMap,
  signedIn,
}: BookingWizardProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('Passengers');
  const [passengers, setPassengers] = useState<PassengerDraft[]>([{ ...EMPTY_PASSENGER }]);
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [selectedSeats, setSelectedSeats] = useState<readonly SeatView[]>([]);
  const [card, setCard] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmedPnr, setConfirmedPnr] = useState<string | null>(null);
  const [paying, startPaying] = useTransition();

  const seatTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const grandTotal = fare.total * passengers.length + seatTotal;

  function addPassenger(): void {
    setPassengers((current) => [...current, { ...EMPTY_PASSENGER }]);
  }

  function removePassenger(index: number): void {
    setPassengers((current) => current.filter((_, at) => at !== index));
    setSelectedSeats((current) => current.slice(0, Math.max(0, passengers.length - 1)));
  }

  function updatePassenger(index: number, patch: Partial<PassengerDraft>): void {
    setPassengers((current) =>
      current.map((passenger, at) => (at === index ? { ...passenger, ...patch } : passenger)),
    );
  }

  function validatePassengers(): boolean {
    const next: Record<string, string> = {};

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail.trim())) {
      next.contactEmail = 'Enter a valid email address';
    }
    if (contactPhone.trim().length < 6) {
      next.contactPhone = 'Enter a contact phone number';
    }
    // An emergency contact is only useful as a pair, so require both or neither.
    const hasEmergencyName = emergencyContactName.trim().length > 0;
    const hasEmergencyPhone = emergencyContactPhone.trim().length > 0;
    if (hasEmergencyName !== hasEmergencyPhone) {
      next.emergencyContactPhone = 'Provide both an emergency contact name and phone';
    }

    passengers.forEach((passenger, index) => {
      if (passenger.firstName.trim().length === 0) next[`p${index}firstName`] = 'Required';
      if (passenger.lastName.trim().length === 0) next[`p${index}lastName`] = 'Required';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.dateOfBirth)) {
        next[`p${index}dateOfBirth`] = 'Use YYYY-MM-DD';
      } else if (passenger.dateOfBirth > todayIso()) {
        next[`p${index}dateOfBirth`] = 'Date of birth cannot be in the future';
      }
      if (passenger.passportNumber.trim().length < 5) {
        next[`p${index}passportNumber`] = 'Enter a passport number';
      }
      // The API requires passport number, expiry and issuing country together.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.passportExpiry)) {
        next[`p${index}passportExpiry`] = 'Use YYYY-MM-DD';
      } else if (passenger.passportExpiry <= todayIso()) {
        next[`p${index}passportExpiry`] = 'Passport must not be expired';
      }
      if (!/^[A-Za-z]{3}$/.test(passenger.passportIssuingCountry.trim())) {
        next[`p${index}passportIssuingCountry`] = 'Use a 3-letter country code';
      }
    });

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function toggleSeat(seat: SeatView): void {
    setSelectedSeats((current) => {
      if (current.some((entry) => entry.id === seat.id)) {
        return current.filter((entry) => entry.id !== seat.id);
      }
      if (current.length >= passengers.length) {
        // One seat per passenger: replace the oldest rather than exceed the party.
        return [...current.slice(current.length - passengers.length + 1), seat];
      }
      return [...current, seat];
    });
  }

  function pay(): void {
    const digits = card.replace(/\D/g, '');
    if (digits.length < 12) {
      setErrors({ card: 'Enter a card number with at least 12 digits' });
      return;
    }
    setErrors({});

    startPaying(() => {
      void checkoutAction({
        flightId: flight.id,
        fareId: fare.id,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        ...(emergencyContactName.trim()
          ? { emergencyContactName: emergencyContactName.trim() }
          : {}),
        ...(emergencyContactPhone.trim()
          ? { emergencyContactPhone: emergencyContactPhone.trim() }
          : {}),
        ...(homeAddress.trim() ? { homeAddress: homeAddress.trim() } : {}),
        passengers: passengers.map((passenger) => ({
          type: passenger.type,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          dateOfBirth: passenger.dateOfBirth,
          passportNumber: passenger.passportNumber,
          passportExpiry: passenger.passportExpiry,
          passportIssuingCountry: passenger.passportIssuingCountry.toUpperCase(),
        })),
        seatIds: selectedSeats.map((seat, index) => ({ seatId: seat.id, passengerIndex: index })),
      }).then((result) => {
        if (result.error) {
          setErrors({ card: result.error });
          return;
        }
        if (result.pnr) setConfirmedPnr(result.pnr);
      });
    });
  }

  if (confirmedPnr) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
        <Card>
          <CardBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Booking confirmed</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Reference{' '}
                <span className="font-mono text-base font-semibold tracking-wider">
                  {confirmedPnr}
                </span>
              </p>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Summary label="Route">
                {flight.origin.iataCode} to {flight.destination.iataCode}
              </Summary>
              <Summary label="Departure">
                {formatDateInZone(flight.departureAt, flight.origin.timezone)} ·{' '}
                {formatTimeInZone(flight.departureAt, flight.origin.timezone)}
              </Summary>
              <Summary label="Passengers">
                {passengers.map((passenger, index) => (
                  <span key={index} className="block">
                    {passenger.firstName} {passenger.lastName}
                  </span>
                ))}
              </Summary>
              <Summary label="Seats">
                {selectedSeats.length > 0
                  ? selectedSeats.map((seat) => seat.seatNumber).join(', ')
                  : 'Not selected'}
              </Summary>
              <Summary label="Fare">{fare.name}</Summary>
              <Summary label="Total">
                <span className="font-semibold">{money(grandTotal, fare.currency)}</span>
              </Summary>
            </dl>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/my-bookings/${confirmedPnr}`}
                className="bg-brand-600 hover:bg-brand-700 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition"
              >
                View booking
              </Link>
              <Link
                href="/"
                className="hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium ring-1 ring-slate-300 transition dark:ring-slate-700"
              >
                Book another flight
              </Link>
            </div>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <nav aria-label="Booking steps">
        <ol className="flex items-center gap-2 text-sm">
          {STEPS.map((entry, index) => (
            <li key={entry} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                  /
                </span>
              ) : null}
              <span
                aria-current={entry === step ? 'step' : undefined}
                className={
                  entry === step
                    ? 'text-brand-700 dark:text-brand-300 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }
              >
                {entry}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          {step === 'Passengers' ? (
            <>
              <Card>
                <CardBody className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold">Contact details</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email" htmlFor="contact-email" error={errors.contactEmail}>
                      <Input
                        id="contact-email"
                        type="email"
                        value={contactEmail}
                        onChange={(event) => setContactEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </Field>
                    <Field label="Phone" htmlFor="contact-phone" error={errors.contactPhone}>
                      <Input
                        id="contact-phone"
                        type="tel"
                        value={contactPhone}
                        onChange={(event) => setContactPhone(event.target.value)}
                        placeholder="+976 9900 1122"
                      />
                    </Field>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">Emergency contact</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Optional. Someone we can call if we cannot reach you on the day of travel.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Name"
                      htmlFor="emergency-name"
                      error={errors.emergencyContactName}
                    >
                      <Input
                        id="emergency-name"
                        value={emergencyContactName}
                        onChange={(event) => setEmergencyContactName(event.target.value)}
                        placeholder="Dulmaa Bat"
                      />
                    </Field>
                    <Field
                      label="Phone"
                      htmlFor="emergency-phone"
                      error={errors.emergencyContactPhone}
                    >
                      <Input
                        id="emergency-phone"
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(event) => setEmergencyContactPhone(event.target.value)}
                        placeholder="+976 8800 1122"
                      />
                    </Field>
                  </div>
                  <Field label="Home address" htmlFor="home-address" error={errors.homeAddress}>
                    <Input
                      id="home-address"
                      value={homeAddress}
                      onChange={(event) => setHomeAddress(event.target.value)}
                      placeholder="Street, city, postal code"
                    />
                  </Field>
                </CardBody>
              </Card>

              {passengers.map((passenger, index) => (
                <Card key={index}>
                  <CardBody className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">Passenger {index + 1}</h2>
                      {passengers.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removePassenger(index)}
                          className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="First name"
                        htmlFor={`p${index}-firstName`}
                        error={errors[`p${index}firstName`]}
                      >
                        <Input
                          id={`p${index}-firstName`}
                          value={passenger.firstName}
                          onChange={(event) =>
                            updatePassenger(index, { firstName: event.target.value })
                          }
                          placeholder="Bat"
                        />
                      </Field>
                      <Field
                        label="Last name"
                        htmlFor={`p${index}-lastName`}
                        error={errors[`p${index}lastName`]}
                      >
                        <Input
                          id={`p${index}-lastName`}
                          value={passenger.lastName}
                          onChange={(event) =>
                            updatePassenger(index, { lastName: event.target.value })
                          }
                          placeholder="Erdene"
                        />
                      </Field>
                      <Field
                        label="Date of birth"
                        htmlFor={`p${index}-dob`}
                        error={errors[`p${index}dateOfBirth`]}
                      >
                        <Input
                          id={`p${index}-dob`}
                          type="date"
                          value={passenger.dateOfBirth}
                          onChange={(event) =>
                            updatePassenger(index, { dateOfBirth: event.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="Passport number"
                        htmlFor={`p${index}-passport`}
                        error={errors[`p${index}passportNumber`]}
                      >
                        <Input
                          id={`p${index}-passport`}
                          value={passenger.passportNumber}
                          onChange={(event) =>
                            updatePassenger(index, { passportNumber: event.target.value })
                          }
                          placeholder="E1234567"
                        />
                      </Field>
                      <Field
                        label="Passport expiry"
                        htmlFor={`p${index}-passport-expiry`}
                        error={errors[`p${index}passportExpiry`]}
                      >
                        <Input
                          id={`p${index}-passport-expiry`}
                          type="date"
                          value={passenger.passportExpiry}
                          onChange={(event) =>
                            updatePassenger(index, { passportExpiry: event.target.value })
                          }
                        />
                      </Field>
                      <Field
                        label="Issuing country"
                        htmlFor={`p${index}-passport-issuing`}
                        hint="3-letter code, e.g. MNG"
                        error={errors[`p${index}passportIssuingCountry`]}
                      >
                        <Input
                          id={`p${index}-passport-issuing`}
                          value={passenger.passportIssuingCountry}
                          onChange={(event) =>
                            updatePassenger(index, {
                              passportIssuingCountry: event.target.value,
                            })
                          }
                          placeholder="MNG"
                        />
                      </Field>
                    </div>
                  </CardBody>
                </Card>
              ))}

              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={addPassenger}>
                  Add passenger
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (validatePassengers()) setStep('Seats');
                  }}
                >
                  Continue to seats
                </Button>
              </div>
            </>
          ) : null}

          {step === 'Seats' ? (
            <Card>
              <CardBody className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">Choose your seats</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedSeats.length} of {passengers.length} selected
                    {selectedSeats.length > 0
                      ? ` · ${selectedSeats.map((seat) => seat.seatNumber).join(', ')}`
                      : ''}
                  </p>
                </div>

                {seatMap ? (
                  <SeatMapView
                    seatMap={seatMap}
                    selectedSeatIds={selectedSeats.map((seat) => seat.id)}
                    onToggleSeat={toggleSeat}
                    maxSelectable={passengers.length}
                  />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No seat map is available for this flight.
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep('Passengers')}>
                    Back
                  </Button>
                  <Button type="button" onClick={() => setStep('Payment')}>
                    Continue to payment
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {step === 'Payment' ? (
            <Card>
              <CardBody className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Payment</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Mock gateway. No card is charged, but the booking is written to the database.
                </p>

                {!signedIn ? (
                  <p
                    role="status"
                    className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <Link href="/login" className="font-medium underline">
                      Sign in
                    </Link>{' '}
                    or{' '}
                    <Link href="/register" className="font-medium underline">
                      create an account
                    </Link>{' '}
                    to complete this booking.
                  </p>
                ) : null}

                <Field label="Card number" htmlFor="card-number" error={errors.card}>
                  <Input
                    id="card-number"
                    inputMode="numeric"
                    value={card}
                    onChange={(event) => setCard(event.target.value)}
                    placeholder="4242 4242 4242 4242"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Expiry" htmlFor="card-expiry">
                    <Input id="card-expiry" placeholder="12 / 30" />
                  </Field>
                  <Field label="CVC" htmlFor="card-cvc">
                    <Input id="card-cvc" placeholder="123" />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep('Seats')}>
                    Back
                  </Button>
                  <Button
                    type="button"
                    loading={paying}
                    disabled={!signedIn}
                    onClick={pay}
                  >
                    Pay {money(grandTotal, fare.currency)}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-base font-semibold">Trip summary</h2>

            <div className="flex flex-col gap-1">
              <span className="text-lg font-semibold tabular-nums">
                {formatTimeInZone(flight.departureAt, flight.origin.timezone)} →{' '}
                {formatTimeInZone(flight.arrivalAt, flight.destination.timezone)}
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {flight.origin.iataCode} to {flight.destination.iataCode} ·{' '}
                {formatDuration(flight.durationMinutes)}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {flight.airline.name} · {flight.flightNumber}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {formatDateInZone(flight.departureAt, flight.origin.timezone)}
              </span>
            </div>

            <dl className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
              <Row label={`Fare × ${passengers.length}`}>
                {money(fare.total * passengers.length, fare.currency)}
              </Row>
              <Row label={`Seats × ${selectedSeats.length}`}>{money(seatTotal, fare.currency)}</Row>
              <Row label="Total" strong>
                {money(grandTotal, fare.currency)}
              </Row>
            </dl>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}

function Summary({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function Row({
  label,
  children,
  strong = false,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly strong?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? 'font-semibold' : 'text-slate-600 dark:text-slate-400'}>{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{children}</dd>
    </div>
  );
}
