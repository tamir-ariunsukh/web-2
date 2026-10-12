'use server';

import { revalidatePath } from 'next/cache';

import { GraphQLClientError, graphqlRequest } from './graphql-client';

/**
 * Booking mutations.
 *
 * Bookings live in Postgres, so every step is a real API call and the resulting
 * row is what the traveller sees afterwards. Seat holds expire server-side, which
 * is why the wizard has to finish in one session.
 */

const CREATE_BOOKING = /* GraphQL */ `
  mutation CreateBooking($input: CreateBookingInput!) {
    createBooking(input: $input) {
      pnr
      status
      expiresAt
      price {
        total
        currency
      }
      segments {
        id
      }
      passengers {
        id
      }
    }
  }
`;

const CONFIRM_BOOKING = /* GraphQL */ `
  mutation ConfirmBooking($pnr: String!) {
    confirmBooking(pnr: $pnr) {
      pnr
      status
    }
  }
`;

const CREATE_PAYMENT_INTENT = /* GraphQL */ `
  mutation CreatePaymentIntent($pnr: String!) {
    createPaymentIntent(pnr: $pnr) {
      paymentId
      amount
      currency
      status
      clientSecret
    }
  }
`;

const SIMULATE_PAYMENT = /* GraphQL */ `
  mutation SimulatePayment($paymentId: ID!, $outcome: MockPaymentOutcome!) {
    simulatePayment(paymentId: $paymentId, outcome: $outcome) {
      id
      status
    }
  }
`;

const SELECT_SEATS = /* GraphQL */ `
  mutation SelectSeats($pnr: String!, $selections: [SeatSelectionInput!]!) {
    selectSeats(pnr: $pnr, selections: $selections) {
      pnr
      status
    }
  }
`;

const CANCEL_BOOKING = /* GraphQL */ `
  mutation CancelBooking($pnr: String!, $reason: String) {
    cancelBooking(pnr: $pnr, reason: $reason) {
      pnr
      status
    }
  }
`;

const UPDATE_BOOKING_CONTACT = /* GraphQL */ `
  mutation UpdateBookingContact($input: UpdateBookingContactInput!) {
    updateBookingContact(input: $input) {
      pnr
      contactEmail
      contactPhone
      emergencyContactName
      emergencyContactPhone
      homeAddress
    }
  }
`;

export interface BookingResult {
  readonly pnr: string;
  readonly status: string;
}

export interface CreateBookingInput {
  readonly flightId: string;
  readonly fareId: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly emergencyContactName?: string;
  readonly emergencyContactPhone?: string;
  readonly homeAddress?: string;
  readonly passengers: readonly {
    type: 'ADULT' | 'CHILD' | 'INFANT';
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    passportNumber: string;
    passportExpiry: string;
    passportIssuingCountry: string;
  }[];
}

interface BookingFormState {
  readonly error?: string;
  readonly pnr?: string;
}

function deny(error: unknown): BookingFormState {
  if (error instanceof GraphQLClientError) {
    if (error.code === 'UNAUTHENTICATED') {
      return { error: 'Please sign in to complete this booking.' };
    }
    return { error: error.message };
  }
  // A non-GraphQL failure is a bug in this layer, so keep the detail in the log.
  console.error('[booking] checkout failed', error);
  return { error: 'Could not complete the booking. Please try again.' };
}

/**
 * Runs the full checkout: create the hold, assign seats, then take payment.
 *
 * The steps are ordered because the API enforces a state machine — payment is
 * only allowed once the booking is PENDING_PAYMENT, which `confirmBooking`
 * produces.
 */
export async function checkoutAction(
  input: CreateBookingInput & {
    readonly seatIds: readonly { seatId: string; passengerIndex: number }[];
  },
): Promise<BookingFormState> {
  try {
    const created = await graphqlRequest<
      {
        createBooking: {
          pnr: string;
          segments: { id: string }[];
          passengers: { id: string }[];
        };
      },
      Record<string, unknown>
    >(CREATE_BOOKING, {
      input: {
        segments: [{ flightId: input.flightId, fareId: input.fareId }],
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        ...(input.emergencyContactName
          ? { emergencyContactName: input.emergencyContactName }
          : {}),
        ...(input.emergencyContactPhone
          ? { emergencyContactPhone: input.emergencyContactPhone }
          : {}),
        ...(input.homeAddress ? { homeAddress: input.homeAddress } : {}),
        passengers: input.passengers.map((passenger) => ({
          type: passenger.type,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          dateOfBirth: passenger.dateOfBirth,
          passportNumber: passenger.passportNumber,
          passportExpiry: passenger.passportExpiry,
          passportIssuingCountry: passenger.passportIssuingCountry,
        })),
      },
    });

    const pnr = created.createBooking.pnr;
    const segmentId = created.createBooking.segments[0]?.id;

    if (input.seatIds.length > 0 && segmentId) {
      await graphqlRequest<unknown, Record<string, unknown>>(SELECT_SEATS, {
        pnr,
        selections: input.seatIds.map((seat) => ({
          passengerIndex: seat.passengerIndex,
          segmentId,
          seatId: seat.seatId,
        })),
      });
    }

    await graphqlRequest<unknown, { pnr: string }>(CONFIRM_BOOKING, { pnr });

    const intent = await graphqlRequest<
      { createPaymentIntent: { paymentId: string } },
      { pnr: string }
    >(CREATE_PAYMENT_INTENT, { pnr });

    await graphqlRequest<unknown, { paymentId: string; outcome: string }>(SIMULATE_PAYMENT, {
      paymentId: intent.createPaymentIntent.paymentId,
      outcome: 'SUCCESS',
    });

    revalidatePath('/my-bookings');
    return { pnr };
  } catch (error) {
    return deny(error);
  }
}

export async function cancelBookingAction(pnr: string): Promise<BookingFormState> {
  try {
    await graphqlRequest<unknown, { pnr: string; reason: string }>(CANCEL_BOOKING, {
      pnr,
      reason: 'Cancelled by customer',
    });
    revalidatePath('/my-bookings');
    revalidatePath(`/my-bookings/${pnr}`);
    return { pnr };
  } catch (error) {
    return deny(error);
  }
}

export interface ContactFormState {
  readonly error?: string;
  readonly saved?: boolean;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

/**
 * Saves the traveller's reachable contact details onto an existing booking.
 *
 * The API owns validation and ownership; anything it rejects is surfaced verbatim
 * rather than being re-implemented here.
 */
export async function updateBookingContactAction(
  pnr: string,
  formData: FormData,
): Promise<ContactFormState> {
  const text = (name: string): string | undefined => {
    const value = formData.get(name);
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const input: Record<string, string> = { pnr };
  for (const field of [
    'contactPhone',
    'contactEmail',
    'emergencyContactName',
    'emergencyContactPhone',
    'homeAddress',
  ]) {
    const value = text(field);
    if (value !== undefined) input[field] = value;
  }

  if (input.contactPhone === undefined) {
    return { fieldErrors: { contactPhone: 'A contact phone number is required' } };
  }

  try {
    await graphqlRequest<unknown, { input: Record<string, string> }>(UPDATE_BOOKING_CONTACT, {
      input,
    });
    revalidatePath(`/my-bookings/${pnr}`);
    return { saved: true };
  } catch (error) {
    if (error instanceof GraphQLClientError) {
      return { error: error.message };
    }
    console.error('[booking] contact update failed', error);
    return { error: 'Could not save your details. Please try again.' };
  }
}
