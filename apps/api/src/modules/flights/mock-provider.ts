import { randomUUID } from 'node:crypto';

import { generateTicketNumber } from '@repo/shared';

import { ProviderError } from './provider.js';

import type {
  FlightProvider,
  ProviderFare,
  ProviderHoldResult,
  ProviderIssueResult,
  ProviderItinerary,
  ProviderPassenger,
  ProviderSearchParams,
  ProviderSegment,
  ProviderTicket,
} from './provider.js';
import type { PrismaClient } from '@repo/db';

/**
 * Provider backed by the local Postgres catalogue.
 *
 * This is the default in development and the fallback in production: when a live
 * supplier is unreachable, search falls back here so customers still see results
 * and can complete a booking end to end.
 */
export class MockProvider implements FlightProvider {
  public readonly name = 'mock';

  /** Holds are in-memory; the authoritative seat lock lives in the `seats` table. */
  private readonly holds = new Map<string, { itineraryId: string; expiresAt: Date }>();

  public constructor(private readonly prisma: PrismaClient) {}

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  public async search(params: ProviderSearchParams): Promise<readonly ProviderItinerary[]> {
    const origin = await this.prisma.airport.findUnique({
      where: { iataCode: params.origin },
      select: { id: true },
    });
    const destination = await this.prisma.airport.findUnique({
      where: { iataCode: params.destination },
      select: { id: true },
    });

    if (!origin || !destination) {
      throw new ProviderError(this.name, `Unknown route ${params.origin}-${params.destination}`);
    }

    // Departure window covers the whole local day in UTC plus a margin for
    // timezones that trail UTC by up to 14 hours.
    const dayStart = new Date(`${params.departDate}T00:00:00Z`);
    const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);

    const flights = await this.prisma.flight.findMany({
      where: {
        originId: origin.id,
        destinationId: destination.id,
        status: { in: ['SCHEDULED', 'DELAYED'] },
        departureAt: { gte: dayStart, lt: dayEnd },
        seatsAvailable: { gt: 0 },
      },
      include: {
        airline: { select: { iataCode: true } },
        aircraft: { select: { model: true } },
        origin: { select: { iataCode: true } },
        destination: { select: { iataCode: true } },
        fares: {
          where: {
            seatsAvailable: { gt: 0 },
            fareClass: { cabin: params.cabin },
          },
          include: {
            fareClass: {
              select: {
                code: true,
                cabin: true,
                baggageAllowance: true,
                isRefundable: true,
                isChangeable: true,
                tier: true,
              },
            },
          },
          orderBy: { basePrice: 'asc' },
        },
      },
      orderBy: { departureAt: 'asc' },
      take: params.limit * 3,
    });

    const seatDemand = params.passengers.adults + params.passengers.children;

    return flights
      .filter((flight) => flight.fares.some((fare) => fare.seatsAvailable >= seatDemand))
      .map<ProviderItinerary>((flight) => {
        const segment: ProviderSegment = {
          providerRef: flight.providerRef ?? flight.id,
          airlineIata: flight.airline.iataCode,
          flightNumber: flight.flightNumber,
          originIata: flight.origin.iataCode,
          destinationIata: flight.destination.iataCode,
          departureAt: flight.departureAt.toISOString(),
          arrivalAt: flight.arrivalAt.toISOString(),
          durationMinutes: flight.durationMinutes,
          ...(flight.aircraft?.model ? { aircraftModel: flight.aircraft.model } : {}),
        };

        const fares = flight.fares
          .filter((fare) => fare.seatsAvailable >= seatDemand)
          .map<ProviderFare>((fare) => ({
            providerRef: fare.providerRef ?? fare.id,
            cabin: fare.fareClass.cabin,
            fareBasisCode: fare.fareClass.code,
            basePrice: fare.basePrice,
            taxes: fare.taxes,
            fees: fare.fees,
            currency: fare.currency,
            seatsAvailable: fare.seatsAvailable,
            baggageAllowance: fare.fareClass.baggageAllowance,
            isRefundable: fare.fareClass.isRefundable,
            isChangeable: fare.fareClass.isChangeable,
          }));

        return {
          providerId: `${this.name}:${flight.id}`,
          segments: [segment],
          fares,
        };
      })
      .filter((itinerary) => itinerary.fares.length > 0)
      .slice(0, params.limit);
  }

  public hold(
    itinerary: ProviderItinerary,
    _seatNumbers: readonly string[],
  ): Promise<ProviderHoldResult> {
    const holdRef = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    this.holds.set(holdRef, { itineraryId: itinerary.providerId, expiresAt });
    return Promise.resolve({ holdRef, expiresAt: expiresAt.toISOString() });
  }

  public async issue(
    itinerary: ProviderItinerary,
    passengers: readonly ProviderPassenger[],
  ): Promise<ProviderIssueResult> {
    const tickets: ProviderTicket[] = [];
    // Serial is drawn from the provider's own range so local and live tickets
    // never collide; the last four digits keep it bounded.
    let serial = Date.now() % 1_000_000;

    for (const segment of itinerary.segments) {
      const airlineNumeric = (await this.numericCodeFor(segment.airlineIata)) ?? '000';

      for (const [passengerIndex] of passengers.entries()) {
        serial += 1;
        tickets.push({
          passengerIndex,
          segmentRef: segment.providerRef,
          ticketNumber: generateTicketNumber(airlineNumeric, serial),
          providerRef: `${this.name}:${randomUUID()}`,
        });
      }
    }

    return { tickets };
  }

  /** The local catalogue has no upstream to notify. */
  public void(_ticketNumber: string): Promise<void> {
    return Promise.resolve();
  }

  public releaseHold(holdRef: string): Promise<void> {
    this.holds.delete(holdRef);
    return Promise.resolve();
  }

  private async numericCodeFor(iata: string): Promise<string | undefined> {
    const airline = await this.prisma.airline.findUnique({
      where: { iataCode: iata },
      select: { numericCode: true },
    });
    return airline?.numericCode;
  }
}
