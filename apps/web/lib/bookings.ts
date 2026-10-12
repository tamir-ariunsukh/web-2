import 'server-only';

import { getSession } from './auth';
import { GraphQLClientError, graphqlRequest } from './graphql-client';

/**
 * Bookings for the signed-in traveller.
 *
 * Read straight from Postgres through the API, so what the customer sees is the
 * same row the rest of the system works with. Booking PII (passport numbers) is
 * encrypted at rest by the API and never returned here.
 */

export interface BookingSummary {
  readonly pnr: string;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly homeAddress: string | null;
  readonly price: { readonly total: number; readonly currency: string };
  readonly segments: readonly {
    readonly id: string;
    readonly flight: {
      readonly id: string;
      readonly flightNumber: string;
      readonly departureAt: string;
      readonly arrivalAt: string;
      readonly durationMinutes: number;
      readonly airline: { iataCode: string; name: string };
      readonly origin: { iataCode: string; city: string; timezone: string };
      readonly destination: { iataCode: string; city: string; timezone: string };
    };
    readonly assignedSeats: readonly { readonly id: string; readonly seatNumber: string }[];
  }[];
  readonly passengers: readonly {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
  }[];
  readonly tickets: readonly { readonly ticketNumber: string; readonly status: string }[];
}

const MY_BOOKINGS = /* GraphQL */ `
  query MyBookings {
    myBookings {
      pnr
      status
      createdAt
      expiresAt
      contactEmail
      contactPhone
      emergencyContactName
      emergencyContactPhone
      homeAddress
      price {
        total
        currency
      }
      segments {
        id
        assignedSeats {
          id
          seatNumber
        }
        flight {
          id
          flightNumber
          departureAt
          arrivalAt
          durationMinutes
          airline {
            iataCode
            name
          }
          origin {
            iataCode
            city
            timezone
          }
          destination {
            iataCode
            city
            timezone
          }
        }
      }
      passengers {
        id
        firstName
        lastName
      }
      tickets {
        ticketNumber
        status
      }
    }
  }
`;

const BOOKING_QUERY = /* GraphQL */ `
  query Booking($pnr: String!) {
    booking(pnr: $pnr) {
      pnr
      status
      createdAt
      expiresAt
      contactEmail
      contactPhone
      emergencyContactName
      emergencyContactPhone
      homeAddress
      price {
        total
        currency
      }
      segments {
        id
        assignedSeats {
          id
          seatNumber
        }
        flight {
          id
          flightNumber
          departureAt
          arrivalAt
          durationMinutes
          airline {
            iataCode
            name
          }
          origin {
            iataCode
            city
            timezone
          }
          destination {
            iataCode
            city
            timezone
          }
        }
      }
      passengers {
        id
        firstName
        lastName
      }
      tickets {
        ticketNumber
        status
      }
    }
  }
`;

/** True when the signed-in traveller owns the booking, per the API's own check. */
export async function listMyBookings(): Promise<readonly BookingSummary[]> {
  if (!(await getSession())) return [];

  try {
    const data = await graphqlRequest<{ myBookings: BookingSummary[] }, Record<string, never>>(
      MY_BOOKINGS,
      {},
      { tags: ['bookings'] },
    );
    return data.myBookings;
  } catch (error) {
    // A revoked session means no bookings; anything else is a real failure and
    // must not look like an empty list.
    if (error instanceof GraphQLClientError && error.code === 'UNAUTHENTICATED') return [];
    console.error('[bookings] myBookings failed', error);
    throw error;
  }
}

export async function getBooking(pnr: string): Promise<BookingSummary | null> {
  if (!(await getSession())) return null;

  try {
    const data = await graphqlRequest<{ booking: BookingSummary | null }, { pnr: string }>(
      BOOKING_QUERY,
      { pnr },
      { tags: ['bookings'] },
    );
    return data.booking;
  } catch (error) {
    if (error instanceof GraphQLClientError && error.code === 'FORBIDDEN') return null;
    console.error('[bookings] booking query failed', error);
    throw error;
  }
}
