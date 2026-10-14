import { getDatabase } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import {
  extractFlightId,
  findAirportById,
  findAirlineById,
  listFaresByFlight,
  searchCatalogue,
} from './catalogue.js';

/**
 * Flight search.
 *
 * The provider catalogues itineraries, then the local `flights` table supplies
 * the authoritative departure time and fares for keyset pagination. Cursors
 * encode `departureAt|id` so a page boundary survives new flights being added.
 */

export function encodeCursor(departureAt, id) {
  return Buffer.from(`${departureAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const separator = decoded.lastIndexOf('|');
    if (separator < 0) return undefined;

    const departureAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (Number.isNaN(departureAt.getTime()) || id === '') return undefined;
    return { departureAt, id };
  } catch {
    return undefined;
  }
}

function sortItineraries(itineraries, sort) {
  const priceOf = (itinerary) =>
    Math.min(...itinerary.fares.map((fare) => fare.basePrice + fare.taxes + fare.fees));

  const comparators = {
    PRICE_ASC: (a, b) => priceOf(a) - priceOf(b),
    PRICE_DESC: (a, b) => priceOf(b) - priceOf(a),
    DURATION_ASC: (a, b) => a.flight.durationMinutes - b.flight.durationMinutes,
    DEPARTURE_ASC: (a, b) => a.flight.departureAt.localeCompare(b.flight.departureAt),
    ARRIVAL_ASC: (a, b) => a.flight.arrivalAt.localeCompare(b.flight.arrivalAt),
    /** Best balances price and duration, which is what most travellers want. */
    BEST: (a, b) =>
      priceOf(a) + a.flight.durationMinutes * 100 - (priceOf(b) + b.flight.durationMinutes * 100),
  };

  const comparator = comparators[sort] ?? comparators.BEST;
  return itineraries.slice().sort(comparator);
}

/** Applies the sidebar filters. Time-of-day comparisons use airport-local hours. */
function applyFilters(itineraries, filters = {}) {
  return itineraries.filter((itinerary) => {
    const { flight, fares } = itinerary;
    const cheapest = Math.min(...fares.map((fare) => fare.basePrice + fare.taxes + fare.fees));

    if (filters.maxStops !== undefined && filters.maxStops < 0) return false;
    if (filters.airlines?.length && !filters.airlines.includes(flight.airlineIataCode)) return false;
    if (filters.maxPrice !== undefined && cheapest > filters.maxPrice) return false;
    if (filters.minPrice !== undefined && cheapest < filters.minPrice) return false;
    if (
      filters.maxDurationMinutes !== undefined &&
      flight.durationMinutes > filters.maxDurationMinutes
    ) {
      return false;
    }
    if (filters.refundableOnly && !fares.some((fare) => fare.fareClass.isRefundable)) return false;

    const origin = findAirportById(flight.originId);
    const destination = findAirportById(flight.destinationId);

    const departureTime = timeInZone(flight.departureAt, origin?.timezone);
    const arrivalTime = timeInZone(flight.arrivalAt, destination?.timezone);

    if (filters.departAfter !== undefined && departureTime < filters.departAfter) return false;
    if (filters.departBefore !== undefined && departureTime >= filters.departBefore) return false;
    if (filters.arriveAfter !== undefined && arrivalTime < filters.arriveAfter) return false;
    if (filters.arriveBefore !== undefined && arrivalTime >= filters.arriveBefore) return false;

    return true;
  });
}

/** `HH:mm` in a named IANA zone, which is what a traveller reads on the card. */
export function timeInZone(iso, timezone) {
  if (!timezone) return String(iso).slice(11, 16);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(11, 16);
  }
}

/** Decorates a flight with airline, airports and fares for the client. */
export function decorateFlight(flight, cabin) {
  const airline = findAirlineById(flight.airlineId);
  const origin = findAirportById(flight.originId);
  const destination = findAirportById(flight.destinationId);
  const fares = listFaresByFlight(flight.id).filter(
    (fare) => cabin === undefined || fare.fareClass.cabin === cabin,
  );

  return {
    ...flight,
    airline: airline
      ? { iataCode: airline.iataCode, name: airline.name, logoUrl: airline.logoUrl }
      : { iataCode: '??', name: 'Unknown', logoUrl: null },
    origin,
    destination,
    stops: 0,
    fares,
    lowestFare: lowestFare(fares),
  };
}

export function lowestFare(fares) {
  if (!fares || fares.length === 0) return null;
  return fares.reduce((cheapest, fare) =>
    fare.basePrice + fare.taxes + fare.fees <
    cheapest.basePrice + cheapest.taxes + cheapest.fees
      ? fare
      : cheapest,
  );
}

/**
 * Runs a search and returns one page plus a cursor for the next.
 *
 * The catalogue provider decides which flights exist; the local table then orders
 * and pages them, so `nextCursor` is stable even if the provider returns results
 * in a different order on the next call.
 */
export function searchFlights(input) {
  const catalogue = searchCatalogue({
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    passengers: input.passengers,
    cabin: input.cabin,
    limit: input.limit,
  });

  if (catalogue.length === 0) {
    return { flights: [], totalCount: 0, nextCursor: null, priceFrom: null, currency: 'USD' };
  }

  // The airline IATA code is needed by the airline filter, so attach it here
  // rather than joining inside the filter for every candidate.
  for (const itinerary of catalogue) {
    const airline = findAirlineById(itinerary.flight.airlineId);
    itinerary.flight.airlineIataCode = airline?.iataCode ?? '';
  }

  const filtered = sortItineraries(applyFilters(catalogue, input.filters), input.sort);
  const page = filtered.slice(0, input.limit);
  const hasMore = filtered.length > input.limit;
  const last = page.at(-1);

  if (page.length === 0 && input.cursor) {
    throw new AppError(ErrorCode.NO_FLIGHTS_FOUND, 'No more flights match this search');
  }

  const cheapest = filtered.length
    ? Math.min(
        ...filtered.flatMap((itinerary) =>
          itinerary.fares.map((fare) => fare.basePrice + fare.taxes + fare.fees),
        ),
      )
    : null;

  return {
    flights: page.map((itinerary) => decorateFlight(itinerary.flight, input.cabin)),
    totalCount: page.length,
    nextCursor: hasMore && last ? encodeCursor(last.flight.departureAt, last.flight.id) : null,
    priceFrom: cheapest,
    currency: page[0]?.fares[0]?.currency ?? 'USD',
  };
}

/** Reads a booking-eligible flight with the fare the traveller selected. */
export function getFlightForBooking(flightId, fareId) {
  const row = getDatabase().prepare('SELECT * FROM flights WHERE id = ?').get(flightId);
  if (!row) throw AppError.notFound('Flight', flightId);

  const flight = { ...row };
  const decorated = decorateFlight(
    {
      id: flight.id,
      flightNumber: flight.flight_number,
      airlineId: flight.airline_id,
      aircraftId: flight.aircraft_id,
      originId: flight.origin_id,
      destinationId: flight.destination_id,
      departureAt: flight.departure_at,
      arrivalAt: flight.arrival_at,
      durationMinutes: flight.duration_minutes,
      status: flight.status,
      provider: flight.provider,
      providerRef: flight.provider_ref,
      seatLayoutId: flight.seat_layout_id,
      seatsAvailable: flight.seats_available,
    },
    undefined,
  );

  const fare = decorated.fares.find((entry) => entry.id === fareId);
  if (!fare) throw AppError.notFound('Fare', fareId);

  return { flight: decorated, fare };
}

export { extractFlightId };
