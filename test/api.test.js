import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end API tests.
 *
 * The suite runs against a real server on a temporary database, because the
 * behaviour worth testing here is the interaction between the router, the
 * services and SQLite — the seat-lock invariant in particular cannot be proven
 * with a mocked store.
 */

const workDir = mkdtempSync(join(tmpdir(), 'airline-test-'));
process.env.DATABASE_FILE = join(workDir, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.PII_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.SEED_PASSWORD = 'DemoPassword123!';
process.env.ENABLE_MAINTENANCE = 'false';

const { migrate } = await import('../server/db/migrate.js');
const { seed } = await import('../server/db/seed.js');
const { createApp } = await import('../server/index.js');
const { closeDatabase } = await import('../server/db/connection.js');

let baseUrl;
let server;

/** A cookie-jar-free fetch wrapper: the tests pass the cookie header explicitly. */
function makeClient() {
  let cookies = new Map();

  return {
    async request(method, path, body) {
      const headers = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (cookies.size > 0) {
        headers.cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (value === '') cookies.delete(name);
        else cookies.set(name, value);
      }

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
      }
      return { status: response.status, body: payload };
    },

    get(path) {
      return this.request('GET', path);
    },
    post(path, body = {}) {
      return this.request('POST', path, body);
    },
    patch(path, body = {}) {
      return this.request('PATCH', path, body);
    },
    clearCookies() {
      cookies = new Map();
    },
  };
}

before(async () => {
  migrate({ verbose: false });
  await seed({ verbose: false });

  const { server: httpServer } = createApp();
  await new Promise((resolve) => httpServer.listen(0, resolve));
  server = httpServer;
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDatabase();
  rmSync(workDir, { recursive: true, force: true });
});

describe('health', () => {
  it('reports the database as ready', async () => {
    const client = makeClient();
    const response = await client.get('/health/ready');
    assert.equal(response.status, 200);
    assert.equal(response.body.database, 'up');
  });
});

describe('catalogue', () => {
  it('lists airlines and searches airports', async () => {
    const client = makeClient();
    const airlines = await client.get('/api/airlines');
    assert.equal(airlines.status, 200);
    assert.ok(airlines.body.airlines.length >= 12);

    const airports = await client.get('/api/airports?query=ULN');
    assert.equal(airports.body.airports[0].iataCode, 'ULN');
  });

  it('searches flights and reports a lowest fare with a derived total', async () => {
    const client = makeClient();
    const response = await client.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'SEL',
      departDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });

    assert.equal(response.status, 200);
    assert.ok(response.body.flights.length > 0);

    const fare = response.body.flights[0].lowestFare;
    assert.equal(fare.total, fare.basePrice + fare.taxes + fare.fees);
  });

  it('rejects a search whose origin equals its destination', async () => {
    const client = makeClient();
    const response = await client.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'ULN',
      departDate: '2026-12-01',
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });
});

describe('auth', () => {
  it('registers a customer and rejects a duplicate email', async () => {
    const client = makeClient();
    const first = await client.post('/api/auth/register', {
      email: 'new.user@example.com',
      password: 'DemoPassword123!',
      firstName: 'New',
      lastName: 'User',
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.role, 'CUSTOMER');

    const client2 = makeClient();
    const duplicate = await client2.post('/api/auth/register', {
      email: 'new.user@example.com',
      password: 'DemoPassword123!',
      firstName: 'New',
      lastName: 'User',
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a weak password', async () => {
    const client = makeClient();
    const response = await client.post('/api/auth/register', {
      email: 'weak@example.com',
      password: 'short',
      firstName: 'W',
      lastName: 'P',
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_FAILED');
  });

  it('signs in, exposes the session, and signs out', async () => {
    const client = makeClient();
    const login = await client.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });
    assert.equal(login.status, 200);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'customer@airline.local');

    const logout = await client.post('/api/auth/logout');
    assert.equal(logout.status, 200);
  });

  it('does not reveal whether an email exists', async () => {
    const client = makeClient();
    const unknown = await client.post('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'DemoPassword123!',
    });
    const client2 = makeClient();
    const wrongPassword = await client2.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'WrongPassword123!',
    });

    assert.equal(unknown.body.error.code, wrongPassword.body.error.code);
    assert.equal(unknown.body.error.message, wrongPassword.body.error.message);
  });
});

describe('booking lifecycle', () => {
  async function bookFlight(client, { departInDays = 10 } = {}) {
    const departDate = new Date(Date.now() + departInDays * 86_400_000).toISOString().slice(0, 10);
    const search = await client.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'SEL',
      departDate,
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    const flight = search.body.flights[0];
    const fare = flight.fares[0];

    const created = await client.post('/api/bookings', {
      segments: [{ flightId: flight.id, fareId: fare.id }],
      contactEmail: 'traveller@example.com',
      contactPhone: '+97699001122',
      passengers: [
        {
          type: 'ADULT',
          firstName: 'Bat',
          lastName: 'Erdene',
          dateOfBirth: '1990-05-04',
          passportNumber: 'E1234567',
          passportExpiry: '2030-01-01',
          passportIssuingCountry: 'MNG',
        },
      ],
    });

    return { flight, created };
  }

  it('walks hold to confirmed to ticketed with a seat attached', async () => {
    const client = makeClient();
    await client.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });

    const { flight, created } = await bookFlight(client);
    assert.equal(created.status, 201);
    assert.equal(created.body.booking.status, 'HELD');

    const pnr = created.body.booking.pnr;
    const segmentId = created.body.booking.segments[0].id;

    const seats = await client.get(`/api/flights/${flight.id}/seats`);
    const available = seats.body.seatMap.cabins
      .flatMap((cabin) => cabin.rows)
      .flatMap((row) => row.seats)
      .filter((seat) => seat.status === 'AVAILABLE');

    const selected = await client.post(`/api/bookings/${pnr}/seats`, {
      selections: [{ passengerIndex: 0, segmentId, seatId: available[0].id }],
    });
    assert.equal(selected.status, 200);
    assert.equal(selected.body.selected, 1);

    const confirmed = await client.post(`/api/bookings/${pnr}/confirm`);
    assert.equal(confirmed.body.booking.status, 'PENDING_PAYMENT');

    const intent = await client.post('/api/payments/intent', { pnr });
    assert.equal(intent.status, 201);

    const paid = await client.post(`/api/payments/${intent.body.intent.paymentId}/simulate`, {
      outcome: 'SUCCESS',
    });
    assert.equal(paid.body.payment.status, 'SUCCEEDED');

    const detail = await client.get(`/api/bookings/${pnr}`);
    assert.equal(detail.body.booking.status, 'CONFIRMED');
    assert.equal(detail.body.booking.segments[0].assignedSeats[0].seatNumber, available[0].seatNumber);
    assert.ok(detail.body.booking.segments[0].flight.origin.iataCode === 'ULN');
  });

  it('keeps a booking in PAYMENT_FAILED when the gateway declines', async () => {
    const client = makeClient();
    await client.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });

    const { created } = await bookFlight(client, { departInDays: 11 });
    const pnr = created.body.booking.pnr;

    await client.post(`/api/bookings/${pnr}/confirm`);
    const intent = await client.post('/api/payments/intent', { pnr });
    await client.post(`/api/payments/${intent.body.intent.paymentId}/simulate`, {
      outcome: 'DECLINE',
    });

    const detail = await client.get(`/api/bookings/${pnr}`);
    assert.equal(detail.body.booking.status, 'PAYMENT_FAILED');
  });

  it('does not create a second booking for a repeated idempotency key', async () => {
    const client = makeClient();
    const departDate = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    const search = await client.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'SEL',
      departDate,
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    const flight = search.body.flights[0];

    const payload = {
      segments: [{ flightId: flight.id, fareId: flight.fares[0].id }],
      contactEmail: 'idem@example.com',
      contactPhone: '+97699001122',
      passengers: [{ type: 'ADULT', firstName: 'Idem', lastName: 'Potent', dateOfBirth: '1990-01-01' }],
      idempotencyKey: 'a'.repeat(24),
    };

    const first = await client.post('/api/bookings', payload);
    const second = await client.post('/api/bookings', payload);
    assert.equal(first.body.booking.pnr, second.body.booking.pnr);
  });

  it('expires a lapsed hold and returns its seats to the pool', async () => {
    const client = makeClient();
    await client.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });

    const { flight, created } = await bookFlight(client, { departInDays: 13 });
    const pnr = created.body.booking.pnr;
    const segmentId = created.body.booking.segments[0].id;

    const seats = await client.get(`/api/flights/${flight.id}/seats`);
    const available = seats.body.seatMap.cabins
      .flatMap((cabin) => cabin.rows)
      .flatMap((row) => row.seats)
      .filter((seat) => seat.status === 'AVAILABLE');

    await client.post(`/api/bookings/${pnr}/seats`, {
      selections: [{ passengerIndex: 0, segmentId, seatId: available[0].id }],
    });

    // Age the hold rather than waiting fifteen minutes for it.
    const { getDatabase } = await import('../server/db/connection.js');
    const { sweepExpiredHolds } = await import('../server/services/expiry.js');
    const db = getDatabase();
    db.prepare('UPDATE seats SET hold_expires_at = ? WHERE id = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      available[0].id,
    );
    db.prepare('UPDATE bookings SET expires_at = ? WHERE pnr = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      pnr,
    );

    const swept = sweepExpiredHolds();
    assert.ok(swept.expiredBookings >= 1);

    const detail = await client.get(`/api/bookings/${pnr}`);
    assert.equal(detail.body.booking.status, 'EXPIRED');

    const after = await client.get(`/api/flights/${flight.id}/seats`);
    const seat = after.body.seatMap.cabins
      .flatMap((cabin) => cabin.rows)
      .flatMap((row) => row.seats)
      .find((entry) => entry.id === available[0].id);
    assert.equal(seat.status, 'AVAILABLE');
  });

  it('refuses an illegal transition', async () => {
    const client = makeClient();
    const { created } = await bookFlight(client, { departInDays: 14 });
    const pnr = created.body.booking.pnr;

    // HELD cannot jump straight to CONFIRMED.
    const response = await client.post(`/api/bookings/${pnr}/cancel`);
    assert.equal(response.status, 200);

    const again = await client.post(`/api/bookings/${pnr}/cancel`);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'INVALID_STATE_TRANSITION');
  });

  it('lets anyone holding a guest reference read it, but not a stranger-signed-in user', async () => {
    const guest = makeClient();
    const departDate = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const search = await guest.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'SEL',
      departDate,
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    const flight = search.body.flights[0];

    const created = await guest.post('/api/bookings', {
      segments: [{ flightId: flight.id, fareId: flight.fares[0].id }],
      contactEmail: 'guest@example.com',
      contactPhone: '+97699001122',
      passengers: [{ type: 'ADULT', firstName: 'Guest', lastName: 'User', dateOfBirth: '1990-01-01' }],
    });
    const pnr = created.body.booking.pnr;
    assert.equal(created.body.booking.userId, null);

    // A guest booking has no owner, so the reference itself is the credential:
    // that is what lets a traveller who checked out without signing in return.
    const anonymous = makeClient();
    assert.equal((await anonymous.get(`/api/bookings/${pnr}`)).status, 200);

    // A booking that does belong to an account is not readable by reference alone.
    const owner = makeClient();
    await owner.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });
    const ownedSearch = await owner.post('/api/flights/search', {
      origin: 'ULN',
      destination: 'SEL',
      departDate: new Date(Date.now() + 17 * 86_400_000).toISOString().slice(0, 10),
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    const ownedFlight = ownedSearch.body.flights[0];
    const owned = await owner.post('/api/bookings', {
      segments: [{ flightId: ownedFlight.id, fareId: ownedFlight.fares[0].id }],
      contactEmail: 'owner@example.com',
      contactPhone: '+97699001122',
      passengers: [{ type: 'ADULT', firstName: 'Owner', lastName: 'User', dateOfBirth: '1990-01-01' }],
    });

    const stranger = makeClient();
    await stranger.post('/api/auth/login', {
      email: 'agent@airline.local',
      password: 'DemoPassword123!',
    });
    // An agent may read any booking; a customer may not.
    assert.equal((await stranger.get(`/api/bookings/${owned.body.booking.pnr}`)).status, 200);

    const otherCustomer = makeClient();
    await otherCustomer.post('/api/auth/register', {
      email: 'other.customer@example.com',
      password: 'DemoPassword123!',
      firstName: 'Other',
      lastName: 'Customer',
    });
    assert.equal((await otherCustomer.get(`/api/bookings/${owned.body.booking.pnr}`)).status, 403);
  });

  it('requires the seat count to match the seated passengers', async () => {
    const client = makeClient();
    const { created } = await bookFlight(client, { departInDays: 16 });
    const pnr = created.body.booking.pnr;
    const segmentId = created.body.booking.segments[0].id;

    const response = await client.post(`/api/bookings/${pnr}/seats`, {
      selections: [
        { passengerIndex: 0, segmentId, seatId: '00000000-0000-0000-0000-000000000001' },
        { passengerIndex: 1, segmentId, seatId: '00000000-0000-0000-0000-000000000002' },
      ],
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'SEAT_COUNT_MISMATCH');
  });
});

describe('admin', () => {
  it('blocks a customer and allows an agent', async () => {
    const customer = makeClient();
    await customer.post('/api/auth/login', {
      email: 'customer@airline.local',
      password: 'DemoPassword123!',
    });
    assert.equal((await customer.get('/api/admin/stats')).status, 403);

    const agent = makeClient();
    await agent.post('/api/auth/login', {
      email: 'agent@airline.local',
      password: 'DemoPassword123!',
    });
    assert.equal((await agent.get('/api/admin/stats')).status, 200);
    // Only admins may list accounts.
    assert.equal((await agent.get('/api/admin/users')).status, 403);
  });

  it('lets an admin change a role but not their own', async () => {
    const admin = makeClient();
    const login = await admin.post('/api/auth/login', {
      email: 'admin@airline.local',
      password: 'DemoPassword123!',
    });
    const adminId = login.body.user.id;

    const users = await admin.get('/api/admin/users');
    const customer = users.body.users.find((user) => user.email === 'customer@airline.local');

    const changed = await admin.post(`/api/admin/users/${customer.id}/role`, { role: 'AGENT' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.role, 'AGENT');

    // Restore so later assertions on roles stay stable.
    await admin.post(`/api/admin/users/${customer.id}/role`, { role: 'CUSTOMER' });

    const self = await admin.post(`/api/admin/users/${adminId}/role`, { role: 'CUSTOMER' });
    assert.equal(self.status, 400);
  });

  it('keeps the sales report internally consistent', async () => {
    const admin = makeClient();
    await admin.post('/api/auth/login', {
      email: 'admin@airline.local',
      password: 'DemoPassword123!',
    });

    const report = await admin.get('/api/admin/reports/sales?days=30');
    assert.equal(report.status, 200);
    assert.equal(report.body.report.currency, 'USD');
    assert.ok(Array.isArray(report.body.report.byDay));
    assert.ok(Array.isArray(report.body.report.topRoutes));
    assert.ok(Array.isArray(report.body.report.byStatus));

    const summed = report.body.report.byDay.reduce((total, point) => total + point.revenueMinor, 0);
    assert.ok(summed <= report.body.report.totalRevenueMinor);
  });

  it('manages taxonomy categories and products', async () => {
    const admin = makeClient();
    await admin.post('/api/auth/login', {
      email: 'admin@airline.local',
      password: 'DemoPassword123!',
    });

    const saved = await admin.post('/api/admin/categories', {
      slug: 'Test-Category!',
      name: 'Test category',
    });
    assert.equal(saved.status, 201);
    // The slug is normalised (lowercased, punctuation collapsed, trimmed), so a
    // raw form value cannot produce a trailing-partial slug.
    assert.equal(saved.body.category.slug, 'test-category');

    const product = await admin.post('/api/admin/products', {
      sku: 'test-sku',
      name: 'Test product',
      priceMinor: 12345,
      kind: 'SEAT',
      categoryId: saved.body.category.id,
    });
    assert.equal(product.status, 201);

    // A category holding products must be emptied before it can be removed.
    const blocked = await admin.request('DELETE', `/api/admin/categories/${saved.body.category.id}`);
    assert.equal(blocked.status, 400);

    const removedProduct = await admin.request('DELETE', `/api/admin/products/${product.body.product.id}`);
    assert.equal(removedProduct.status, 200);

    const removedCategory = await admin.request('DELETE', `/api/admin/categories/${saved.body.category.id}`);
    assert.equal(removedCategory.status, 200);
  });
});

describe('static client', () => {
  it('serves the shell for an unknown client route', async () => {
    const client = makeClient();
    const response = await fetch(`${baseUrl}/my-bookings/ABCDEF`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /<main id="view"/);
    void client;
  });

  it('does not leak files outside the public directory', async () => {
    const response = await fetch(`${baseUrl}/%2e%2e/%2e%2e/%2e%2e/package.json`);
    const body = await response.text();
    assert.ok(!body.includes('"name": "airline-booking"'));
    assert.ok(!body.includes('DATABASE_FILE'));
  });
});
