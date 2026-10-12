# Онгоцны тийз захиалгын систем — Хөгжүүлэлтийн төлөвлөгөө

## 1. Зорилго

Production түвшний онгоцны тийз захиалгын платформ. Нислэг хайх, суудал сонгох, захиалга үүсгэх, төлбөр баталгаажуулах, тасалбар олгох бүрэн урсгал.

**Хамрах хүрээ:**

- Нислэгийн хайлт (огноо, чиглэл, зорчигчийн тоо, нэг тал/хоёр тал)
- Multi-city / round-trip itinerary
- Суудлын зураг, суудал сонголт (seat map, hold)
- Зорчигчийн мэдээлэл, баримт бичиг
- Захиалгын удирдлага (hold → pending → confirmed → cancelled)
- Төлбөрийн state machine (mock gateway, webhook-д бэлэн)
- Тасалбар үүсгэлт (PDF, QR код)
- Нэвтрэлт, эрх, admin panel
- Provider abstraction: mock хуваарь **болон** гадны API (Amadeus/Duffel)

---

## 2. Технологийн стек

| Давхарга | Технологи | Тайлбар |
|---|---|---|
| Monorepo | **Turborepo** + pnpm workspaces | Build cache, task graph |
| Frontend | **Next.js 15** (App Router) + React 19 | SSR/RSC, route groups |
| Styling | **Tailwind CSS v4** | Design tokens, dark mode |
| Backend | **Express.js** + TypeScript | REST + GraphQL gateway |
| API | **GraphQL** (Apollo Server) | Query/Mutation, DataLoader |
| DB | **PostgreSQL 16** | Transaction, exclusion constraint |
| ORM | **Prisma** | Migrations, type-safe client |
| Auth | JWT (access + refresh) + argon2 | RBAC: customer / agent / admin |
| Validation | Zod | Хуваалцсан схем (client + server) |
| Test | Vitest + Playwright + Testcontainers | Unit, integration, E2E |
| CI/CD | GitHub Actions | Lint, test, build, migrate, deploy |
| Observability | Pino + OpenTelemetry | Structured logs, traces |
| Queue | BullMQ + Redis | Төлбөрийн timeout, имэйл, PDF |
| Cache | Redis | Seat map lock, хайлтын кэш |

---

## 3. Monorepo бүтэц

```
web 2/
├─ apps/
│  ├─ web/                     # Next.js — хэрэглэгчийн портал
│  │  ├─ app/
│  │  │  ├─ (marketing)/       # Нүүр, хайлт
│  │  │  ├─ (booking)/         # Суудал, зорчигч, төлбөр
│  │  │  ├─ (account)/         # Миний захиалга, профайл
│  │  │  └─ admin/             # Admin panel
│  │  └─ components/
│  ├─ api/                     # Express + GraphQL
│  │  ├─ src/
│  │  │  ├─ graphql/           # Schema, resolvers, loaders
│  │  │  ├─ rest/              # Webhook, health, file
│  │  │  ├─ modules/
│  │  │  │  ├─ flights/
│  │  │  │  ├─ booking/
│  │  │  │  ├─ payment/
│  │  │  │  ├─ auth/
│  │  │  │  └─ ticketing/
│  │  │  ├─ providers/         # Flight provider abstraction (mock, Duffel, Amadeus)
│  │  │  └─ jobs/              # BullMQ workers
│  │  └─ prisma/
│  │     ├─ schema.prisma
│  │     ├─ migrations/
│  │     └─ seed.ts
│  └─ worker/                  # Background jobs (hold expiry, ticketing)
├─ packages/
│  ├─ db/                      # Prisma client singleton, serializable retry
│  ├─ shared/                  # Zod schemas, types, constants, state machine, money, PNR
│  ├─ ui/                      # Tailwind v4 tokens + React components
│  └─ config/                  # ESLint, TS, Tailwind, Prettier presets
├─ docker-compose.yml          # postgres, redis
├─ turbo.json
├─ pnpm-workspace.yaml
└─ .github/workflows/
```

---

## 4. Өгөгдлийн загвар (Prisma)

### Үндсэн entity

```
User            — id, email, phone, passwordHash, role, profile
RefreshToken    — token hash, userId, expiresAt, revokedAt
Airport         — iata, name, city, country, timezone, lat/lng
Airline         — iata, name, logo, active
Aircraft        — model, registration, seatLayoutId
SeatLayout      — config (JSON cabin/row/column), rows, cols
Flight          — flightNo, airline, origin, dest, depAt, arrAt,
                  aircraft, status, provider, providerRef
FareClass       — cabin (ECONOMY/BUSINESS/FIRST), baggage,
                  changeable, refundable
Fare            — flightId, fareClassId, basePrice, taxes,
                  currency, seatsAvailable
Seat            — flightId, seatNo, cabin, class, status, price
Booking         — pnr (unique 6-char), userId, status, totalAmount,
                  currency, expiresAt, contactEmail, contactPhone,
                  emergencyContactName, emergencyContactPhone, homeAddress
BookingSegment  — bookingId, flightId, fareId, sequence
Passenger       — bookingId, type (ADT/CHD/INF), firstName, lastName,
                  dob, gender, passportNo, passportExpiry, nationality
BookingSeat     — passengerId, segmentId, seatId
Payment         — bookingId, amount, currency, status, method,
                  provider, providerRef, idempotencyKey, rawPayload
Ticket          — bookingId, passengerId, segmentId, ticketNo,
                  status, issuedAt, voidedAt, pdfUrl, qrPayload
AuditLog        — actorId, action, entity, entityId, diff, ip, ua
```

### Чухал constraints

- `Flight`: `@@index([originId, destId, depAt])` — хайлтын гол индекс
- `Seat`: `@@unique([flightId, seatNo])` — давхар суудал борлуулалтаас сэргийлнэ
- `Booking.pnr`: unique, IATA-д нийцсэн 6 тэмдэгт
- `Payment.idempotencyKey`: unique — давхар төлбөрөөс хамгаална
- Seat hold-д `seats.status` + `expiresAt`, Redis lock давхар хамгаалалт

### Transaction стратеги

Суудал захиалах нь **serializable isolation** шаардана:

```
BEGIN
  SELECT ... FROM "Seat" WHERE id IN (...) FOR UPDATE NOWAIT
  -- аль нэг нь held/booked бол → ROLLBACK, CONFLICT error
  UPDATE "Seat" SET status='HELD', holdExpiresAt=now()+15min
  INSERT "Booking" + segments + passengers + bookingSeats
COMMIT
```

Timeout job (BullMQ delayed) 15 минутын дараа hold-ыг суллуулна.

---

## 5. GraphQL API дизайн

### Query

```graphql
type Query {
  searchFlights(input: FlightSearchInput!): FlightSearchResult!
  flight(id: ID!): Flight
  seatMap(flightId: ID!, fareId: ID!): SeatMap!
  booking(pnr: String!): Booking          # эрх шалгана
  myBookings(status: BookingStatus): [Booking!]!
  airports(query: String!): [Airport!]!
}

input FlightSearchInput {
  origin: String!           # IATA
  destination: String!
  departDate: Date!
  returnDate: Date
  passengers: PassengerCount!   # adults, children, infants
  cabin: CabinClass = ECONOMY
  filters: FlightFilters        # price, stops, airlines, time
  sort: FlightSort = PRICE_ASC
  cursor: String
  limit: Int = 20
}
```

### Mutation

```graphql
type Mutation {
  # Auth
  register(input: RegisterInput!): AuthPayload!
  login(input: LoginInput!): AuthPayload!
  refreshToken(token: String!): AuthPayload!
  logout: Boolean!

  # Booking
  createBooking(input: CreateBookingInput!): Booking!   # → HELD
  updatePassengers(bookingId: ID!, passengers: [PassengerInput!]!): Booking!
  selectSeats(bookingId: ID!, seats: [SeatSelectionInput!]!): Booking!
  applyPromo(bookingId: ID!, code: String!): Booking!
  confirmBooking(bookingId: ID!): Booking!              # → PENDING_PAYMENT

  # Payment
  createPaymentIntent(bookingId: ID!): PaymentIntent!
  # Mock gateway — энэ mutation нь зөвхөн dev/staging
  simulatePayment(paymentId: ID!, outcome: MockOutcome!): Payment!

  # Post-booking
  cancelBooking(bookingId: ID!): Booking!
  requestRefund(bookingId: ID!, reason: String): Refund!
  checkIn(bookingId: ID!, passengerId: ID!): BoardingPass!
}
```

### Subscription (бодит цаг)

```graphql
type Subscription {
  seatStatusChanged(flightId: ID!): SeatUpdate!   # websocket
  bookingStatusChanged(bookingId: ID!): Booking!
}
```

### Стратегийн шийдвэр

- **DataLoader** — N+1 асуудлыг шийднэ (flight → airline, airport, fares)
- **Cursor pagination** — offset pagination нь том өгөгдөлд удаан
- **Persisted queries** — production-д query whitelist
- **Depth + complexity limit** — DoS хамгаалалт
- **Auth directive** — `@auth(role: ADMIN)` schema түвшинд

---

## 6. Provider abstraction

Нислэгийн эх сурвалжийг солиход хялбар байх ёстой:

```typescript
export interface FlightProvider {
  readonly name: string;
  search(params: ProviderSearchParams): Promise<ProviderFlight[]>;
  getFare(providerRef: string, fareRef: string): Promise<ProviderFare>;
  holdSeat?(providerRef: string, seatNos: string[]): Promise<HoldResult>;
  issueTicket(providerRef: string, pax: ProviderPassenger[]): Promise<TicketResult>;
  cancelTicket(ticketNo: string): Promise<void>;
}
```

Хэрэгжүүлэлт:

| Provider | Зориулалт |
|---|---|
| `MockProvider` | Seed DB-ээс унших — dev, test, demo |
| `DuffelProvider` | Duffel API — NDC контент |
| `AmadeusProvider` | Amadeus Self-Service API |

`ProviderRegistry` — `PROVIDER` env var-аар сонгоно. `CompositeProvider` — олон эх сурвалжийг зэрэг асууж, үр дүнг merge хийнэ.

**Fallback:** гадаад API унавал `MockProvider` руу шилжиж, `providerHealth` metric бүртгэнэ.

---

## 7. Захиалгын state machine

```
                createBooking
                      │
                      ▼
                  ┌───────┐  timeout(15m)  ┌───────────┐
                  │ HELD  │───────────────▶│ EXPIRED   │
                  └───┬───┘                └───────────┘
       confirmBooking  │
                      ▼
             ┌──────────────────┐  cancel   ┌───────────┐
             │ PENDING_PAYMENT  │──────────▶│ CANCELLED │
             └────────┬─────────┘           └───────────┘
        payment success│          payment fail
                      ▼                │
              ┌────────────┐           ▼
              │ CONFIRMED  │◀─── retry ─┐
              └──────┬─────┘            │
      issue tickets  │                  │
                     ▼                  │
              ┌────────────┐    ┌───────┴──────┐
              │ TICKETED   │    │ PAYMENT_FAIL │
              └──────┬─────┘    └──────────────┘
      check-in       │
                     ▼
              ┌────────────┐  cancel  ┌───────────┐
              │ CHECKED_IN │─────────▶│ CANCELLED │
              └────────────┘          └───────────┘
```

Дүрэм:

- Шилжилт бүр `AuditLog`-д бичигдэнэ
- Зөвшөөрөгдөөгүй шилжилт → `InvalidStateTransitionError`
- Төлбөр амжилттай + ticket issue амжилтгүй → **compensating transaction** (refund trigger)
- Webhook idempotent: `idempotencyKey` давхардвал хүлээж авч, дахин боловсруулахгүй

---

## 8. Аюулгүй байдал

| Эрсдэл | Хамгаалалт |
|---|---|
| SQL injection | Prisma parameterized query, raw SQL-д `$queryRaw` template |
| XSS | React auto-escape, CSP header, sanitize rich text |
| CSRF | SameSite=Strict cookie, double-submit token |
| Auth bypass | JWT RS256, refresh rotation, revoked token table |
| Brute force | Redis rate limit (IP + account), exponential backoff, lockout |
| Seat race condition | DB `FOR UPDATE`, serializable tx, Redis lock |
| Double payment | `idempotencyKey` unique constraint |
| PII leak | Passport дугаарыг AES-256-GCM шифрлэж хадгална, лог-д маск |
| GraphQL DoS | Query depth/complexity limit, timeout, persisted queries |
| SSRF (provider) | Outbound домэйн whitelist |
| Supply chain | `pnpm audit`, Dependabot, lockfile integrity |
| PCI | Картын дугаар хэзээ ч хадгалахгүй (mock gateway ч гэсэн) |
| Secrets | `.env` gitignore, Doppler/Vault, CI-д OIDC |

---

## 9. Хөгжүүлэлтийн үе шат

### Phase 0 — Суурь ✅ ДУУССАН

- [x] Turborepo + pnpm workspace scaffold
- [x] `docker-compose.yml` (postgres:16, redis:7, minio)
- [x] `packages/config` — ESLint 9 flat, TypeScript strict, Tailwind preset
- [x] Prisma init, `DATABASE_URL`, эхний migration
- [x] CI: lint + typecheck + build + test (GitHub Actions, postgres/redis service)
- [x] Husky + lint-staged + commitlint

**Баталгаажсан:** `pnpm turbo run lint typecheck build test` → 21/21 task ногоон.

### Phase 1 — Өгөгдлийн загвар ✅ ДУУССАН

- [x] Бүрэн `schema.prisma` (22 model, extensions: citext, pg_trgm, btree_gist)
- [x] Migration + seed — 20 airport, 12 airline, 48 fare class, 4308 flight, seat материаллаг
- [x] `packages/db` — client singleton, serializable transaction + retry helper
- [x] `packages/shared` — Zod схем, DTO, state machine, money, PNR utilities
- [x] `packages/ui` — Tailwind v4 design tokens + 7 компонент

**Баталгаажсан:** seed idempotent, дахин ажиллуахад давхардал үүсэхгүй. 52 unit тест ногоон.

### Phase 2 — Backend цөм ✅ ДУУССАН

- [x] Express 5 + Apollo Server 4 + context (env, auth, dataloader, logger, requestId)
- [x] GraphQL schema + resolvers (flights, seatMap, booking, auth, payment)
- [x] Auth модуль: register, login, refresh rotation + reuse detection, account lockout
- [x] DataLoader (airline, airport, fare, seat, segment, passenger, payment, ticket)
- [x] Error taxonomy, GraphQL error formatter, production-д stacktrace нуух
- [x] Pino structured logging + redaction

**Баталгаажсан:** бодит PostgreSQL дээр бүх query/mutation ажилласан.
### Phase 3 — Booking + Seat ✅ ДУУССАН

- [x] Seat map service — кабин бүлэглэлт, aisle inference, expired hold-ыг available гэж үзэх
- [x] Transactional seat hold (`FOR UPDATE` + SERIALIZABLE + bounded retry)
- [x] Booking state machine + transition guard (shared, нэг эх сурвалж)
- [x] BullMQ: hold expiry sweep (60s recurring), orphaned hold cleanup
- [x] Concurrency тест — 12 зэрэгцээ хүсэлт нэг суудалд

**Баталгаажсан:** 12 concurrent request → яг 1 winner, 11 `SEAT_ALREADY_TAKEN`. Hold expiry → seat `AVAILABLE`, booking `EXPIRED`, audit event бичигдсэн.

### Phase 4 — Төлбөр + Тасалбар ⚠️ ХЭСЭГЧЛЭН

- [x] Payment state machine, `PaymentIntent` flow
- [x] Mock gateway: `SUCCESS` / `DECLINE` / `INSUFFICIENT_FUNDS` / `TIMEOUT`
- [x] Idempotent settlement (webhook replay = no-op, давхар цэнэглэлтгүй)
- [x] Refund flow — partial refund, over-refund хамгаалалт, payment → REFUNDED
- [x] Check-in — boarding pass, 48h цонхны хамгаалалт, gate/QR үүсгэлт
- [ ] HMAC-signed webhook endpoint (одоо `simulatePayment` mutation-аар орлуулсан)
- [ ] PDF ticket (pdfkit) + QR render, S3/MinIO upload
- [ ] Имэйл (Resend/SES) — confirmation, ticket, cancellation

**Баталгаажсан:** createBooking → confirm → intent → settle → CONFIRMED, `cardSummary` хадгалагдсан. Decline → `PAYMENT_FAILED` + суудал суллагдсан.

### Phase 5 — Frontend ⚠️ ХЭСЭГЧЛЭН

- [x] Нүүр + хайлтын хэлбэр (Zod validation, trip type, passenger тоо)
- [x] Хайлтын үр дүн — server component, бодит API-аас татна, cursor pagination
- [x] Нислэгийн карт — airport-local цаг, duration, "seats left" анхааруулга
- [x] `SeatMap` компонент — interactive, keyboard accessible, live status
- [x] Tailwind v4 design tokens, dark mode, reduced-motion
- [x] Booking wizard (зорчигч → суудал → төлбөр) — `/booking/[flightId]`, API-аар дамжиж DB-д бичнэ
- [x] Миний захиалга — `myBookings` query, дэлгэрэнгүй + цуцлалт (`cancelBooking`)
- [x] Auth хуудсууд — `/register`, `/login`, httpOnly cookie session, header-т хэрэглэгч
- [x] Filter, sort UI — airline, үнэ, departure window, duration, refundable; 5 төрлийн эрэмбэ
- [x] API унасан үед JSON snapshot руу автоматаар шилжих (banner-тай)
- [ ] Filter-ийг API руу дамжуулах (`FlightFiltersInput` одоогоор хэрэгждэггүй, клиент дээр шүүнэ)
- [ ] Promo code, updatePassengers UI

**Гарах шалгуур:** Lighthouse ≥ 90, Playwright E2E booking flow ногоон.

### Phase 6 — Admin + Provider ⚠️ ХЭСЭГЧЛЭН

- [x] Provider abstraction — `FlightProvider` interface, `ProviderRegistry`, fallback
- [x] `MockProvider` — seeded catalog, health check, hold/issue/void
- [x] Provider error type + retryable classifier
- [x] Admin API — `adminStats`, `adminUsers`, `adminBookings`, `adminTickets`, `salesReport`
- [x] Admin UI — dashboard, хэрэглэгч, захиалга, тийз, ангилал, тайлан (`/admin/*`)
- [x] Role guard — `requireRole(ADMIN/AGENT)` service layer-т, UI-д redirect; `UNAUTHENTICATED`/`FORBIDDEN` код зөв буцна
- [x] Taxonomy — `Category` (self-referencing) + `Product` model, CRUD + seed
- [x] Ticket issue/void — payment webhook амжилтгүй үед гараар олгох
- [x] Audit log — role change, ticket, category/product үйлдэл бүрт бичнэ
- [ ] Duffel / Amadeus adapter
- [ ] Promo code engine (model + seed бэлэн)
- [ ] PDF ticket + QR, имэйл илгээлт

**Баталгаажсан:** mock provider-ээр хайлт/захиалга бүрэн ажилласан. Fallback логик бэлэн.

### Phase 7 — Production бэлтгэл ⛔ ХИЙГДЭЭГҮЙ

- [ ] Testcontainers integration suite
- [ ] Playwright E2E: booking, cancel, refund, check-in
- [ ] k6/Artillery load test (500 rps search, 50 rps booking)
- [ ] Security: OWASP ZAP scan, dependency audit
- [ ] Dockerfile multi-stage, image scan (Trivy)
- [ ] Migrate deploy strategy (expand → migrate → contract)
- [ ] Backup + PITR, restore drill
- [ ] Grafana dashboard, alert rules, runbook

---

## 10. Явц (2026-10-09)

| Phase | Төлөв | Хугацаа |
|---|---|---|
| 0 — Суурь | ✅ Дууссан | 1 долоо хоног |
| 1 — Өгөгдлийн загвар | ✅ Дууссан | 1 |
| 2 — Backend цөм | ✅ Дууссан | 2 |
| 3 — Booking + Seat | ✅ Дууссан | 2 |
| 4 — Төлбөр + Тасалбар | ⚠️ Хэсэгчлэн (PDF/имэйл дутуу) | 1.5 |
| 5 — Frontend | ⚠️ Хэсэгчлэн (wizard/auth дутуу) | 2.5 |
| 6 — Admin + Provider | ⚠️ Хэсэгчлэн (adapter/admin дутуу) | 1.5 |
| 7 — Production бэлтгэл | ⛔ Эхлээгүй | 1 |

### Баталгаажсан үр дүн

**Pipeline**

- `pnpm turbo run lint typecheck build test` → **21/21 task ногоон**, 0 lint error
- **52 unit тест** ногоон (`@repo/shared`: money, PNR, schemas, state machine)
- PostgreSQL 16 дээр migration + seed: 20 airport, 12 airline, 48 fare class, 4308 flight, ~76,000 seat

**E2E (21 шалгалт, бүгд ногоон)**

- Auth: register, weak password татгалзал, duplicate email татгалзал, refresh rotation, **reuse detection → бүх family хүчингүй**
- Booking: HELD үүсгэлт, idempotent create (ижил PNR), зорчигчийн тоо ↔ суудлын тоо таарах шалгалт
- Payment: REQUIRES_ACTION → SUCCEEDED, `cardSummary` хадгалагдсан, replay нь idempotent
- Cancellation: CONFIRMED → CANCELLED, **хоёр суудал чөлөөлөгдсөн**
- Refund: бүрэн дүн буцаагдсан, over-refund татгалзагдсан
- Audit: HELD → PENDING_PAYMENT → CONFIRMED → CANCELLED бүгд `booking_events`-д

**Concurrency (2 удаа батлагдсан)**

- 12 зэрэгцээ хүсэлт нэг суудалд → яг 1 winner, 11 `SEAT_ALREADY_TAKEN`
- 10 зэрэгцээ хүсэлт дахин → яг 1 winner
- **Давхар борлуулалт байхгүй**

**Hold expiry**

- 20 минутаар хөгшрүүлсэн hold → seat `AVAILABLE`, booking `EXPIRED`, `expiresAt` цэвэрлэгдсэн, event бичигдсэн

**Production hardening**

- Stacktrace error response-д гарахгүй
- Дотоод алдаа `Internal server error` болж нуугдсан, domain code хадгалагдсан
- Env validation нь boot үед дутуу/placeholder secret-ыг илрүүлнэ
- `GRAPHQL_INTROSPECTION=false` ажиллана

**Frontend**

- Нүүр хуудас + хайлтын хэлбэр (Zod validation) render болсон
- Хайлтын үр дүн бодит API-аас: `OM100`, үнэ, `Select` товч

### Зассан бодит алдаанууд

| Алдаа | Нөлөө | Засвар |
|---|---|---|
| Refresh token `jti` давхцал | Дараагийн refresh нь unique constraint унаж байсан | Token бүрд шинэ `jti`, `family` тусдаа claim |
| Seat map ↔ holdSeats зөрчил | UI нь суудлыг чөлөөтэй гэж харуулах ч захиалга авахгүй | `holdSeats` нь дууссан hold-ыг reclaim хийх болсон |
| `z.coerce.boolean()` | `"false"` string нь `true` болж байсан | `booleanFromString` parser |
| SDL дотор `/** */` | GraphQL schema parse унаж байсан | `#` коммент болгосон |

### Дараагийн алхам

1. Booking wizard хуудсууд (`/booking/[flightId]` → зорчигч → суудал → төлбөр → баталгаа)
2. Auth хуудсууд + httpOnly session cookie middleware
3. `simulatePayment`-ийг HMAC-signed webhook endpoint-оор солих
4. PDF ticket + QR render + S3/MinIO upload, имэйл илгээлт
5. Admin panel — flight CRUD, refund approve, audit log viewer
6. Duffel/Amadeus adapter
7. Playwright E2E + k6 load test

---

## 11. Эрсдэл ба бууруулалт

| Эрсдэл | Нөлөө | Бууруулалт |
|---|---|---|
| Seat race condition | Давхар борлуулалт | DB transaction тестийг эхнээс бичих |
| Provider API quota / үнэ | Хайлт унах | Mock provider fallback, кэш, circuit breaker |
| GraphQL over-fetch | Гүйцэтгэл | Persisted query, complexity limit |
| Timezone алдаа | Буруу цаг | Бүгдийг UTC хадгалж, зөвхөн UI-д хөрвүүлэх |
| Төлбөрийн race | Давхар цэнэглэлт | Idempotency key, DB constraint |
| Schema migration | Downtime | Expand-contract, backward-compatible |
| PII зөрчил | Хуулийн эрсдэл | Шифрлэлт, RBAC, audit log |

---

## 12. Дараагийн алхам

Эхлэх дараалал:

1. **Phase 0** — monorepo scaffold + docker-compose + CI
2. **Phase 1** — Prisma schema + seed
3. `pnpm turbo dev` — бүх app зэрэг асаана

Төлөвлөгөө бэлэн. Phase 0-ыг эхлүүлэх үү, эсвэл Prisma schema-г эхлээд бүрэн бичих үү?
