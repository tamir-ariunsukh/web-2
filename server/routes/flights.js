import { getDatabase } from '../db/connection.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { assertValid, validateFlightSearch } from '../lib/validation.js';
import { listAirlines, searchAirports } from '../services/catalogue.js';
import { getSeatMap } from '../services/seat-inventory.js';
import { decorateFlight, getFlightForBooking, searchFlights } from '../services/search.js';
import { NEWS_ARTICLES } from '../db/seed-data.js';
import { readJsonBody, sendJson } from '../http/router.js';

/** Public catalogue routes: search, airlines, airports, seat maps and news. */

export function registerFlightRoutes(router) {
  router.post('/api/flights/search', async (req, res) => {
    const body = await readJsonBody(req);
    const parsed = assertValid(validateFlightSearch(body));
    sendJson(res, 200, searchFlights(parsed));
  });

  router.get('/api/flights/:id', (req, res, context) => {
    const detail = getFlightForBooking(context.params.id, undefined);
    void detail;
    sendJson(res, 200, { flight: detail.flight });
  });

  router.get('/api/flights/:id/seats', (req, res, context) => {
    sendJson(res, 200, { seatMap: getSeatMap(context.params.id, context.query.cabin) });
  });

  router.get('/api/airlines', (req, res) => {
    sendJson(res, 200, { airlines: listAirlines() });
  });

  router.get('/api/airports', (req, res, context) => {
    const query = context.query.query ?? '';
    sendJson(res, 200, { airports: searchAirports(query) });
  });

  router.get('/api/news', (req, res) => {
    sendJson(res, 200, {
      articles: NEWS_ARTICLES.map(({ slug, date, category, title, excerpt }) => ({
        slug,
        date,
        category,
        title,
        excerpt,
      })),
    });
  });

  router.get('/api/news/:slug', (req, res, context) => {
    const article = NEWS_ARTICLES.find((entry) => entry.slug === context.params.slug);
    if (!article) throw AppError.notFound('Article', context.params.slug);
    sendJson(res, 200, { article });
  });

  /**
   * Full flight detail for the booking page, including every fare class.
   *
   * `getFlightForBooking` requires a fare id, so this route uses the catalogue
   * read path instead and decorates with all fares.
   */
  router.get('/api/flights/:id/detail', (req, res, context) => {
    const row = getDatabase().prepare('SELECT * FROM flights WHERE id = ?').get(context.params.id);
    if (!row) throw AppError.notFound('Flight', context.params.id);

    const flight = decorateFlight(
      {
        id: row.id,
        flightNumber: row.flight_number,
        airlineId: row.airline_id,
        aircraftId: row.aircraft_id,
        originId: row.origin_id,
        destinationId: row.destination_id,
        departureAt: row.departure_at,
        arrivalAt: row.arrival_at,
        durationMinutes: row.duration_minutes,
        status: row.status,
        provider: row.provider,
        providerRef: row.provider_ref,
        seatLayoutId: row.seat_layout_id,
        seatsAvailable: row.seats_available,
      },
      undefined,
    );

    sendJson(res, 200, { flight });
  });

  void ErrorCode;
}
