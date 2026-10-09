/**
 * Flight supplier abstraction.
 *
 * Every flight source — the seeded local catalogue, Duffel, Amadeus — implements
 * this interface, so the booking and search layers never branch on provider.
 * Adding a supplier means adding one adapter and one registry entry.
 */

export interface ProviderPassengerCount {
  readonly adults: number;
  readonly children: number;
  readonly infants: number;
}

export interface ProviderSearchParams {
  readonly origin: string;
  readonly destination: string;
  /** ISO date, `YYYY-MM-DD`. */
  readonly departDate: string;
  readonly returnDate?: string;
  readonly passengers: ProviderPassengerCount;
  readonly cabin: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  readonly limit: number;
}

export interface ProviderFare {
  readonly providerRef: string;
  readonly cabin: string;
  readonly fareBasisCode: string;
  readonly basePrice: number;
  readonly taxes: number;
  readonly fees: number;
  readonly currency: string;
  readonly seatsAvailable: number;
  readonly baggageAllowance: string;
  readonly isRefundable: boolean;
  readonly isChangeable: boolean;
}

export interface ProviderSegment {
  readonly providerRef: string;
  readonly airlineIata: string;
  readonly flightNumber: string;
  readonly originIata: string;
  readonly destinationIata: string;
  /** ISO-8601 UTC. */
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly durationMinutes: number;
  readonly aircraftModel?: string;
}

export interface ProviderItinerary {
  readonly providerId: string;
  readonly segments: readonly ProviderSegment[];
  readonly fares: readonly ProviderFare[];
}

export interface ProviderHoldResult {
  readonly holdRef: string;
  readonly expiresAt: string;
}

export interface ProviderPassenger {
  readonly type: 'ADULT' | 'CHILD' | 'INFANT';
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly passportNumber?: string;
  readonly passportExpiry?: string;
  readonly passportIssuingCountry?: string;
  readonly nationality?: string;
}

export interface ProviderTicket {
  readonly passengerIndex: number;
  readonly segmentRef: string;
  readonly ticketNumber: string;
  readonly providerRef: string;
}

export interface ProviderIssueResult {
  readonly tickets: readonly ProviderTicket[];
}

export interface FlightProvider {
  /** Registry key: `mock`, `duffel`, `amadeus`. */
  readonly name: string;

  /** Cheap liveness probe used to trip the circuit breaker. */
  healthCheck(): Promise<boolean>;

  search(params: ProviderSearchParams): Promise<readonly ProviderItinerary[]>;

  /** Reserves inventory with the supplier before payment is attempted. */
  hold(itinerary: ProviderItinerary, seatNumbers: readonly string[]): Promise<ProviderHoldResult>;

  /** Issues tickets after payment settles. */
  issue(
    itinerary: ProviderItinerary,
    passengers: readonly ProviderPassenger[],
  ): Promise<ProviderIssueResult>;

  /** Voids a ticket after cancellation; a no-op when the fare is non-refundable. */
  void(ticketNumber: string): Promise<void>;

  /** Releases a hold without issuing, used when payment fails. */
  releaseHold(holdRef: string): Promise<void>;
}

/** Raised by a provider when the supplier rejects or is unreachable. */
export class ProviderError extends Error {
  public readonly provider: string;
  public readonly retryable: boolean;

  public constructor(
    provider: string,
    message: string,
    options: { readonly retryable?: boolean; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.retryable = options.retryable ?? false;
  }
}
