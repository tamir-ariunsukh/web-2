# Airline Booking Platform

Flight search, seat selection, booking, payment and ticketing. Turborepo monorepo:
Next.js 15 web app, Express + GraphQL API, BullMQ worker, PostgreSQL via Prisma.

## Architecture

```
apps/
  web/        Next.js 15 (App Router) + Tailwind v4 — customer-facing portal
  api/        Express 5 + Apollo Server 4 — GraphQL API and REST webhooks
  worker/     BullMQ — hold expiry sweeps and ticket issuance

packages/
  db/         Prisma schema, client singleton, serializable-retry helpers
  shared/     Domain types, Zod schemas, money and PNR utilities, state machine
  ui/         Tailwind v4 design tokens and React components
  providers/  Flight supplier adapters (mock, Duffel, Amadeus)
  config/     Shared tsconfig, ESLint, Tailwind and Prettier presets
```

### Design decisions worth knowing

**Seat inventory is protected twice.** `holdSeats` takes `SELECT ... FOR UPDATE`
row locks and runs under SERIALIZABLE isolation. A competing transaction either
blocks on the lock or is aborted by PostgreSQL; `withSerializableRetry` retries
it with fresh reads, which is why the loser returns `SEAT_ALREADY_TAKEN` rather
than overselling. Verified: 12 concurrent requests for one seat produce exactly
one winner.

**The booking state machine is the only authority.** `packages/shared/src/state-machine.ts`
defines every legal transition, and `transitionBooking` is the only writer of
`bookings.status`. Illegal transitions surface as `INVALID_STATE_TRANSITION`,
and every accepted transition appends to `booking_events`.

**Money is integer minor units.** Never a float. `packages/shared/src/money.ts`
handles zero- and three-decimal currencies and distributes discounts without
losing or inventing minor units.

**Idempotency is enforced by the database.** `Booking.idempotencyKey` and
`Payment.idempotencyKey` are unique, so a retried request cannot create a second
booking or a second charge.

**Provider failures degrade instead of failing.** `ProviderRegistry` falls back
to the local catalogue when a live supplier is unreachable, and reports
`degraded: true` in the response metadata.

## Prerequisites

- Node.js >= 24
- pnpm 11
- Docker Desktop (PostgreSQL, Redis, MinIO)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Configure the environment
cp .env.example .env
# Generate real secrets before deploying anywhere:
#   openssl rand -base64 48   -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   openssl rand -hex 32      -> PII_ENCRYPTION_KEY

# 3. Start infrastructure
pnpm docker:up

# 4. Apply migrations and seed the catalogue
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db exec prisma migrate deploy
# Set SEED_PASSWORD_HASH to also create the demo admin/agent/customer accounts
# (hash of your chosen password; the app never ships a default credential).
SEED_PASSWORD_HASH="$argon2id$v=19$m=65536,t=3,p=4$..." pnpm --filter @repo/db db:seed

# 5. Run everything
pnpm dev
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| Admin | http://localhost:3000/admin |
| GraphQL | http://localhost:4000/graphql |
| Health (live) | http://localhost:4000/health/live |
| Health (ready) | http://localhost:4000/health/ready |
| MinIO console | http://localhost:9001 |

### Roles

`/admin` is limited to `ADMIN` and `AGENT`. The role is enforced twice: the page
layout redirects, and every admin query/mutation re-checks it in the service
layer. `/admin/users` and the destructive taxonomy actions are `ADMIN` only.

An `ADMIN` cannot change their own role, and every staff action is written to
`audit_logs`.

> PostgreSQL is published on host port **5433** by default, not 5432, so it does
> not collide with a locally installed server. If 5433 is also taken, set
> `POSTGRES_PORT` in `.env` and update `DATABASE_URL` to match.

## Useful commands

```bash
pnpm build              # Build every workspace package
pnpm dev                # Run all apps in watch mode
pnpm lint               # ESLint across the monorepo
pnpm typecheck          # tsc --noEmit across the monorepo
pnpm test               # Vitest
pnpm format             # Prettier

pnpm --filter @repo/db db:migrate         # Create a migration in development
pnpm --filter @repo/db db:studio          # Browse the database
pnpm --filter @repo/db db:reset           # Drop, migrate and reseed
```

## Environment

All variables are documented in [.env.example](./.env.example). `apps/api/src/env.ts`
validates them at boot with Zod, so a misconfigured deployment fails immediately
rather than at the first request that touches a missing value. Production builds
additionally reject development placeholder secrets.

The API and worker load the repository-root `.env` at startup through Node's
native `--env-file-if-exists` flag (see their `dev`/`start` scripts), so `pnpm dev`
works without exporting anything by hand. Turborepo itself does not load `.env`
files into task runtimes, and it filters process environment variables in its
default strict mode, which is why the flag lives on the scripts rather than in
`turbo.json`.

Notable variables:

| Variable | Purpose |
|---|---|
| `FLIGHT_PROVIDER` | `mock`, `duffel` or `amadeus` |
| `PROVIDER_FALLBACK_TO_MOCK` | Fall back to the local catalogue when a live supplier fails |
| `BOOKING_HOLD_MINUTES` | How long a seat hold survives before the expiry sweep releases it |
| `PAYMENT_PROVIDER` | `mock`; gates the `simulatePayment` mutation |
| `PII_ENCRYPTION_KEY` | 32-byte hex key for encrypting passport data |
| `GRAPHQL_MAX_DEPTH` | Query depth ceiling, to blunt abusive queries |

## GraphQL

The schema lives in [apps/api/src/graphql/typeDefs.graphql](./apps/api/src/graphql/typeDefs.graphql)
and is the single source of truth for the API surface.

Errors always carry a stable `extensions.code` from
[packages/shared/src/error-codes.ts](./packages/shared/src/error-codes.ts). Clients
branch on the code, never on the message. In production, unrecognised errors are
redacted and stack traces are omitted.

### Booking flow

```graphql
# 1. Search
query { searchFlights(input: { origin: "ULN", destination: "SEL",
        departDate: "2026-10-12", passengers: { adults: 1 }, cabin: ECONOMY }) {
  flights { id flightNumber lowestFare { id total currency } } } }

# 2. Hold the seats with a booking
mutation { createBooking(input: {
    segments: [{ flightId: "...", fareId: "..." }]
    contactEmail: "you@example.com", contactPhone: "+97699112233"
    # Optional here; also editable later via updateBookingContact
    emergencyContactName: "Dulmaa Bat", emergencyContactPhone: "+97688001122"
    homeAddress: "12 Sukhbaatar Ave, Ulaanbaatar"
    passengers: [{ type: ADULT, firstName: "Bat", lastName: "Erdene",
                   dateOfBirth: "1990-05-14" }]
    idempotencyKey: "any-stable-client-key"
  }) { pnr status expiresAt } }

# 2b. Amend contact details on an existing booking (owner, or staff)
mutation { updateBookingContact(input: {
    pnr: "ABC123", contactPhone: "+97699112233"
    emergencyContactName: "Dulmaa Bat", emergencyContactPhone: "+97688001122"
    homeAddress: "12 Sukhbaatar Ave, Ulaanbaatar"
  }) { pnr contactPhone emergencyContactPhone homeAddress } }

# 3. Choose seats (one selection per seated passenger, per segment)
mutation { selectSeats(pnr: "ABC123", selections: [
    { passengerIndex: 0, segmentId: "...", seatId: "..." } ]) { pnr } }

# 4. Move to payment, then settle
mutation { confirmBooking(pnr: "ABC123") { status } }
mutation { createPaymentIntent(pnr: "ABC123") { paymentId amount status } }
mutation { simulatePayment(paymentId: "...", outcome: SUCCESS) { status cardSummary } }
```

`simulatePayment` stands in for the gateway callback. It accepts `SUCCESS`,
`DECLINE`, `INSUFFICIENT_FUNDS` and `TIMEOUT`, and is only enabled while
`PAYMENT_PROVIDER=mock`.

## Security

| Risk | Mitigation |
|---|---|
| SQL injection | Prisma parameterised queries; raw SQL confined to bound-parameter seat locks |
| Password compromise | argon2id, memory-hard parameters, rehash-on-login when parameters strengthen |
| Token theft | Refresh-token rotation with reuse detection; the whole family is revoked on replay |
| Credential stuffing | Per-account lockout after 5 failures, plus generic error messages to prevent enumeration |
| Seat overselling | `SELECT FOR UPDATE` + SERIALIZABLE + bounded retry |
| Double charge | Unique idempotency keys on bookings and payments |
| PII exposure | Passport data encrypted at rest; contact details and home address never written to logs or audit rows - only the field names that changed; log redaction for credentials and tokens |
| GraphQL abuse | Depth limit, request body cap, persisted-query ready |
| Stack disclosure | Stack traces omitted from error responses in production |

## Testing

```bash
pnpm test                          # All unit tests
pnpm --filter @repo/shared test    # Domain logic: money, PNR, schemas, state machine
```

Coverage thresholds on `@repo/shared` gate the booking flow: lines 85%, branches
80%. `pnpm turbo run test` runs the full suite; CI additionally applies migrations
against a live PostgreSQL service and runs the suite there.

## Deployment notes

- **Migrations** run with `prisma migrate deploy`, not `migrate dev`. The initial
  migration must be applied before the API starts.
- **Secrets** belong in a secret manager, never in `.env` in the image.
- **Scaling the API** is stateless; seat locking is entirely in PostgreSQL, so no
  sticky sessions are required.
- **Scaling the worker** is safe: the expiry sweep is idempotent and keyed by job
  id, so a duplicate run releases nothing that is already available.
