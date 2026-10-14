# Airline Booking

Search flights, pick a seat, pay, and get a ticket. A plain Node.js backend that
serves both the API and a vanilla-JavaScript frontend from one process.

No frameworks and no runtime dependencies: HTTP is `node:http`, the database is
SQLite through Node''s built-in `node:sqlite`, and the browser client is ES modules
with no build step.

## Requirements

- **Node.js >= 22.5** (for `node:sqlite` and `--env-file-if-exists`)
- Nothing else. There is no database server, no queue and no bundler to install.

## Running it

```bash
npm install          # a no-op today; there are no runtime dependencies
npm run setup        # create the SQLite schema and seed the catalogue
npm start            # or: npm run dev
```

Then open <http://localhost:3000>.

`npm run dev` restarts the server when a file changes. `npm start` does not.

| Service   | URL                                |
| --------- | ---------------------------------- |
| Web       | <http://localhost:3000>            |
| Admin     | <http://localhost:3000/admin>      |
| API       | <http://localhost:3000/api>        |
| Health    | <http://localhost:3000/health/ready> |

### Demo accounts

`npm run db:seed` creates three accounts from `SEED_PASSWORD` in `.env`:

| Email                    | Role     |
| ------------------------ | -------- |
| `admin@airline.local`    | ADMIN    |
| `agent@airline.local`    | AGENT    |
| `customer@airline.local` | CUSTOMER |

Seeding is idempotent, and an existing account''s password is never overwritten.

## Layout

```
server/
  index.js            HTTP server, route table, graceful shutdown
  env.js              environment parsing, with development defaults
  logger.js           structured JSON logging
  db/
    schema.sql        the whole schema, applied on boot
    connection.js     the SQLite handle and the IMMEDIATE-transaction helper
    migrate.js        applies the schema (`--reset` deletes the file first)
    seed.js           idempotent catalogue and demo-user seeding
    seed-data.js      airports, airlines, layouts, routes, fares, taxonomy
  lib/                errors, enums, money, ids, crypto, validation, seat geometry
  services/           auth, catalogue, search, seat inventory, booking, payment, admin
  http/               router, static files, request context
  routes/             auth, flights, bookings, admin

public/               the client: index.html, styles.css, js/
test/                 end-to-end API tests (node:test)
```

## Design decisions worth knowing

**The seat-lock invariant.** The original Postgres build relied on `SERIALIZABLE`
transactions and `SELECT ... FOR UPDATE`. SQLite has a single writer, so every
seat mutation runs inside `BEGIN IMMEDIATE`: the write lock is taken before the
seats are read, which means a second booking cannot observe a seat as `AVAILABLE`
and then claim it. There is a test that races twelve bookings at one seat and
asserts exactly one wins.

**The booking state machine is the only authority.** `server/lib/state-machine.js`
defines every legal transition, and `transitionBooking` is the single writer of
`bookings.status`. An illegal transition surfaces as `INVALID_STATE_TRANSITION`,
and every transition is recorded in `booking_events` with its actor.

**Money is always integer minor units.** Never a float. `server/lib/money.js`
handles zero- and three-decimal currencies and splits discounts without losing or
inventing a cent.

**Idempotency is enforced by the database.** `bookings.idempotency_key` and
`payments.idempotency_key` are unique, so a retried checkout cannot produce a
second booking or a second charge.

**Sessions live in httpOnly cookies.** The access token is never readable from
script. It lasts 15 minutes and the API client renews it from the refresh cookie
and replays the request, so a lapsed token is invisible to the user. Refresh
tokens are stored hashed and rotated on every use; presenting an already-rotated
token revokes every session for that account, which is what makes a leaked token
detectable.

**Role checks live in the service layer.** `requireRole` is called by the service
function, not the route, so a route cannot expose an admin operation by
forgetting a guard.

**Passport numbers are encrypted at rest** with AES-256-GCM. Only the last four
digits stay in the clear, so staff can confirm a document without decrypting it.

## Commands

```bash
npm start           # run the server
npm run dev         # run with file watching
npm run db:migrate  # apply schema.sql
npm run db:reset    # delete the database file and recreate the schema
npm run db:seed     # seed reference data and demo users
npm run setup       # db:migrate followed by db:seed
npm test            # end-to-end API tests
```

## Configuration

Copy `.env.example` to `.env`. Every value has a development default, so a fresh
clone runs without one. In production the following are required and the server
refuses to boot without them:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — at least 32 characters
- `PII_ENCRYPTION_KEY` — 64 hex characters (32 bytes)

## API

All endpoints are JSON, under `/api`. Errors are
`{ "error": { "code": "<DOMAIN_REASON>", "message": "..." } }` with a status from
`ERROR_HTTP_STATUS`; clients branch on `code`, never on the message.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | creates a customer |
| POST | `/api/auth/login` | sets the session cookies |
| POST | `/api/auth/refresh` | rotates the session |
| POST | `/api/auth/logout` | clears the cookies |
| GET | `/api/auth/me` | the signed-in user |
| POST | `/api/flights/search` | filters, sorting, keyset pagination |
| GET | `/api/flights/:id/detail` | one flight with every fare |
| GET | `/api/flights/:id/seats` | the seat map |
| GET | `/api/airlines`, `/api/airports` | catalogue reads |
| GET | `/api/news`, `/api/news/:slug` | articles |
| POST | `/api/bookings` | creates a HELD booking, returns the PNR |
| GET | `/api/bookings` | the caller''s bookings |
| GET | `/api/bookings/:pnr` | owner, staff, or anyone for a guest booking |
| POST | `/api/bookings/:pnr/seats` | attaches seats |
| POST | `/api/bookings/:pnr/confirm` | HELD to PENDING_PAYMENT |
| POST | `/api/bookings/:pnr/cancel` | releases seats |
| PATCH | `/api/bookings/:pnr/contact` | amends contact details |
| POST | `/api/bookings/:pnr/check-in` | issues a boarding pass |
| GET | `/api/bookings/:pnr/events` | the booking''s audit trail |
| POST | `/api/payments/intent` | creates the payment intent |
| POST | `/api/payments/:id/simulate` | mock gateway outcome |
| POST | `/api/refunds` | staff only |
| GET | `/api/admin/stats` | ADMIN or AGENT |
| GET | `/api/admin/users` | ADMIN only |
| POST | `/api/admin/users/:id/role` | ADMIN only |
| POST | `/api/admin/users/:id/unlock` | ADMIN only |
| GET | `/api/admin/bookings`, `/api/admin/tickets` | ADMIN or AGENT |
| POST | `/api/admin/tickets`, `/api/admin/tickets/:id/void` | ADMIN or AGENT |
| GET/POST/DELETE | `/api/admin/categories`, `/api/admin/products` | ADMIN writes |
| GET | `/api/admin/reports/sales?days=30` | ADMIN or AGENT |

## Testing

```bash
npm test
```

The suite starts a real server against a temporary SQLite file and drives it over
HTTP. Coverage includes the full hold-to-confirmed-to-ticketed journey, a
declined payment, idempotent checkout, hold expiry returning seats to the pool,
seat-count validation, ownership rules for guest and account bookings, role
enforcement, taxonomy writes, and that a path traversal cannot read a file outside
`public/`.
