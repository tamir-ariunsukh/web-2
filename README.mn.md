# Нислэгийн Захиалгын Платформ

Нислэг хайх, суудал сонгох, захиалга үүсгэх, төлбөр төлөх, тасалбар олгох. Turborepo monorepo:
Next.js 15 веб апп, Express + GraphQL API, BullMQ worker, Prisma-гаар дамжуулсан PostgreSQL.

## Архитектур

```
apps/
  web/        Next.js 15 (App Router) + Tailwind v4 — хэрэглэгчийн portal
  api/        Express 5 + Apollo Server 4 — GraphQL API болон REST webhook
  worker/     BullMQ — hold хугацаа дуусах sweep болон тасалбар олголт

packages/
  db/         Prisma schema, client singleton, serializable-retry туслахууд
  shared/     Домэйн төрлүүд, Zod schema, мөнгө болон PNR утилит, state machine
  ui/         Tailwind v4 дизайн токен болон React компонентууд
  providers/  Нислэгийн нийлүүлэгчийн адаптерууд (mock, Duffel, Amadeus)
  config/     Хуваалцсан tsconfig, ESLint, Tailwind болон Prettier preset-үүд
```

### Мэдэх үнэ цэнтэй дизайны шийдвэрүүд

**Суудлын нөөц хоёр давхаргаар хамгаалагдсан.** `holdSeats` нь
`SELECT ... FOR UPDATE` мөрийн түгжээ авч, SERIALIZABLE түвшинд ажиллана. Өрсөлдөгч
гүйлгээ нь түгжээнд хүлээгдэх эсвэл PostgreSQL-ээс цуцлагдана; `withSerializableRetry`
шинэ уншилтаар дахин оролдох бөгөөд иймд хожигдсон тал хэт зарахын оронд
`SEAT_ALREADY_TAKEN` буцаана. Баталгаажсан: нэг суудалд 12 зэрэгцээ хүсэлт
явуулахад яг нэг нь л ялна.

**Захиалгын state machine бол цорын ганц эрх мэдэл.** `packages/shared/src/state-machine.ts`
хууль ёсны шилжилт бүрийг тодорхойлж, `transitionBooking` нь `bookings.status`-ын
цорын ганц бичигч юм. Хууль бус шилжилт `INVALID_STATE_TRANSITION` болж илэрч,
зөвшөөрөгдсөн шилжилт бүр `booking_events`-д бүртгэгдэнэ.

**Мөнгө нь бүхэл minor unit.** Хэзээ ч float биш. `packages/shared/src/money.ts`
тэг болон гурван аравтын мөнгөн тэмдэгтийг зохицуулж, хөнгөлөлтийг minor unit
алдалгүй, шинээр зохиож гаргалгүйгээр хуваарилна.

**Idempotency-г өгөгдлийн сан хэрэгжүүлнэ.** `Booking.idempotencyKey` болон
`Payment.idempotencyKey` нь unique, тиймээс дахин илгээсэн хүсэлт хоёр дахь
захиалга эсвэл хоёр дахь төлбөр үүсгэж чадахгүй.

**Нийлүүлэгчийн алдаа нуршгүй, зөвхөн доройтоно.** `ProviderRegistry` нь амьд
нийлүүлэгч холбогдохгүй үед локал каталог руу шилжиж, хариуны metadata-д
`degraded: true` гэж мэдээлнэ.

## Урьдчилсан шаардлага

- Node.js >= 24
- pnpm 11
- Docker Desktop (PostgreSQL, Redis, MinIO)

## Эхлэх

> Зөвхөн аппыг ажиллуулахыг хүсэж байна уу? [RUN.md](./RUN.md)-ийн богино чеклистийг үзнэ үү.

```bash
# 1. Хамаарлуудыг суулгах
pnpm install

# 2. Орчныг тохируулах
cp .env.example .env
# Хаана ч deploy хийхийн өмнө бодит secret үүсгэнэ:
#   openssl rand -base64 48   -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   openssl rand -hex 32      -> PII_ENCRYPTION_KEY

# 3. Инфраструктурыг асаах
pnpm docker:up

# 4. Migration хийж, каталогийг seed хийх
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db exec prisma migrate deploy
# SEED_PASSWORD_HASH-ыг тохируулбал demo admin/agent/customer бүртгэлүүд ч үүснэ
# (өөрийн сонгосон нууц үгийн hash; апп default credential хэзээ ч илгээдэггүй).
SEED_PASSWORD_HASH="$argon2id$v=19$m=65536,t=3,p=4$..." pnpm --filter @repo/db db:seed

# 5. Бүгдийг ажиллуулах
pnpm dev
```

| Сервис         | URL                                |
| -------------- | ---------------------------------- |
| Web            | http://localhost:3000              |
| Admin          | http://localhost:3000/admin        |
| GraphQL        | http://localhost:4000/graphql      |
| Health (live)  | http://localhost:4000/health/live  |
| Health (ready) | http://localhost:4000/health/ready |
| MinIO console  | http://localhost:9001              |

### Эрхүүд

`/admin` нь зөвхөн `ADMIN` болон `AGENT`-д нээлттэй. Эрхийг хоёр газар шалгана:
хуудасны layout redirect хийнэ, мөн админ query/mutation бүр service давхаргад
дахин шалгана. `/admin/users` болон устгах төрлийн taxonomy үйлдлүүд зөвхөн
`ADMIN`-д хамаарна.

`ADMIN` өөрийн эрхийг өөрчилж чадахгүй бөгөөд ажилтны үйлдэл бүр `audit_logs`-д
бичигдэнэ.

> PostgreSQL нь default-аараа host порт **5433** дээр гардаг, 5432 биш — ингэснээр
> локалд суусан сервертэй мөргөлдөхгүй. Хэрэв 5433 ч ашиглагдаж байвал `.env`-д
> `POSTGRES_PORT`-ыг тохируулж, `DATABASE_URL`-ыг тааруулан шинэчилнэ.

## Хэрэгтэй командууд

```bash
pnpm build              # Workspace package бүрийг build хийх
pnpm dev                # Бүх аппыг watch горимд ажиллуулах
pnpm lint               # Monorepo даяар ESLint
pnpm typecheck          # Monorepo даяар tsc --noEmit
pnpm test               # Vitest
pnpm format             # Prettier

pnpm --filter @repo/db db:migrate         # Хөгжүүлэлтэд migration үүсгэх
pnpm --filter @repo/db db:studio          # Өгөгдлийн санг харах
pnpm --filter @repo/db db:reset           # Унагаж, migrate хийж, дахин seed хийх
```

## Орчин

Бүх хувьсагч [.env.example](./.env.example)-д баримтжсан. `apps/api/src/env.ts`
тэдгээрийг boot үед Zod-оор шалгадаг тул буруу тохиргоотой deployment нь
дутуу утгад хүрсэн эхний хүсэлт дээр биш, шууд унана. Production build нь
нэмж хөгжүүлэлтийн placeholder secret-үүдийг няцаана.

API болон worker нь эхлэхдээ repository-ийн root `.env`-г Node-ийн native
`--env-file-if-exists` флагаар ачаална (тэдгээрийн `dev`/`start` script-ийг үзнэ үү),
тиймээс `pnpm dev` гараар юу ч export хийлгүй ажиллана. Turborepo өөрөө `.env`
файлыг task-ийн runtime руу ачаалдаггүй бөгөөд default strict горимдоо процессын
орчны хувьсагчдыг шүүдэг — иймд флаг `turbo.json`-д биш, script-үүд дээр байрлаж байна.

Онцлох хувьсагчид:

| Хувьсагч                    | Зориулалт                                                      |
| --------------------------- | -------------------------------------------------------------- |
| `FLIGHT_PROVIDER`           | `mock`, `duffel` эсвэл `amadeus`                               |
| `PROVIDER_FALLBACK_TO_MOCK` | Амьд нийлүүлэгч унах үед локал каталог руу шилжих              |
| `BOOKING_HOLD_MINUTES`      | Expiry sweep суудлыг чөлөөлөхөөс өмнө hold хэр удаан үргэлжлэх |
| `PAYMENT_PROVIDER`          | `mock`; `simulatePayment` mutation-ыг зөвшөөрнө                |
| `PII_ENCRYPTION_KEY`        | Паспортын мэдээллийг шифрлэх 32-byte hex түлхүүр               |
| `GRAPHQL_MAX_DEPTH`         | Хүчирхийлэлт query-г сааруулах query-ийн гүний дээд хязгаар    |

## GraphQL

Schema нь [apps/api/src/graphql/typeDefs.graphql](./apps/api/src/graphql/typeDefs.graphql)-д
байрлах бөгөөд API-ийн гадаргуугийн цорын ганц үнэн эх сурвалж юм.

Алдаанууд үргэлж [packages/shared/src/error-codes.ts](./packages/shared/src/error-codes.ts)-ээс
тогтвортой `extensions.code` авч явна. Клиентүүд message дээр биш, code дээр
салбарлана. Production-д танигдаагүй алдаанууд нь нууцлагдаж, stack trace
хасагдана.

### Захиалгын урсгал

```graphql
# 1. Хайлт
query { searchFlights(input: { origin: "ULN", destination: "SEL",
        departDate: "2026-10-12", passengers: { adults: 1 }, cabin: ECONOMY }) {
  flights { id flightNumber lowestFare { id total currency } } } }

# 2. Захиалгаар суудлуудыг hold хийх
mutation { createBooking(input: {
    segments: [{ flightId: "...", fareId: "..." }]
    contactEmail: "you@example.com", contactPhone: "+97699112233"
    # Энд optional; мөн дараа нь updateBookingContact-аар засварлаж болно
    emergencyContactName: "Dulmaa Bat", emergencyContactPhone: "+97688001122"
    homeAddress: "12 Sukhbaatar Ave, Ulaanbaatar"
    passengers: [{ type: ADULT, firstName: "Bat", lastName: "Erdene",
                   dateOfBirth: "1990-05-14" }]
    idempotencyKey: "any-stable-client-key"
  }) { pnr status expiresAt } }

# 2b. Одоо байгаа захиалгын холбоо барих мэдээллийг засах (эзэн, эсвэл ажилтан)
mutation { updateBookingContact(input: {
    pnr: "ABC123", contactPhone: "+97699112233"
    emergencyContactName: "Dulmaa Bat", emergencyContactPhone: "+97688001122"
    homeAddress: "12 Sukhbaatar Ave, Ulaanbaatar"
  }) { pnr contactPhone emergencyContactPhone homeAddress } }

# 3. Суудал сонгох (суудалтай зорчигч тутамд, segment тутамд нэг сонголт)
mutation { selectSeats(pnr: "ABC123", selections: [
    { passengerIndex: 0, segmentId: "...", seatId: "..." } ]) { pnr } }

# 4. Төлбөр рүү шилжиж, дараа нь төлбөрөө гүйцэтгэх
mutation { confirmBooking(pnr: "ABC123") { status } }
mutation { createPaymentIntent(pnr: "ABC123") { paymentId amount status } }
mutation { simulatePayment(paymentId: "...", outcome: SUCCESS) { status cardSummary } }
```

`simulatePayment` нь gateway-ийн callback-ыг орлоно. `SUCCESS`, `DECLINE`,
`INSUFFICIENT_FUNDS` болон `TIMEOUT`-ыг хүлээн авч, зөвхөн
`PAYMENT_PROVIDER=mock` үед идэвхжинэ.

## Аюулгүй байдал

| Эрсдэл                  | Сөрөг арга хэмжээ                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection           | Prisma параметржүүлсэн query; raw SQL нь bound-parameter суудлын түгжээнд хязгаарлагдсан                                                                                                            |
| Нууц үгийн алдагдал     | argon2id, memory-hard параметрүүд, параметр хүчирхэгжих үед login дээр rehash                                                                                                                       |
| Токен хулгай            | Reuse detection-той refresh-token rotation; давтан ашиглахад бүх family цуцлагдана                                                                                                                  |
| Credential stuffing     | 5 удаа амжилтгүй болсны дараа бүртгэл тус бүрийн lockout, мөн enumeration-оос сэргийлэх ерөнхий алдааны мессеж                                                                                      |
| Суудал хэт зарах        | `SELECT FOR UPDATE` + SERIALIZABLE + хязгаарлагдмал retry                                                                                                                                           |
| Давхар төлбөр           | Захиалга болон төлбөрт unique idempotency key                                                                                                                                                       |
| PII илрэх               | Паспортын мэдээлэл at rest шифрлэгдсэн; холбоо барих мэдээлэл болон гэрийн хаяг лог эсвэл audit мөрөнд хэзээ ч бичигдэхгүй — зөвхөн өөрчлөгдсөн талбарын нэр; credential болон токены лог redaction |
| GraphQL хүчирхийлэл     | Гүний хязгаар, хүсэлтийн биеийн хязгаар, persisted-query-д бэлэн                                                                                                                                    |
| Stack мэдээлэл алдагдах | Production-д алдааны хариунаас stack trace хасагдсан                                                                                                                                                |

## Тест

```bash
pnpm test                          # Бүх unit тест
pnpm --filter @repo/shared test    # Домэйн логик: money, PNR, schema, state machine
```

`@repo/shared` дээрх coverage босго нь захиалгын урсгалыг хамгаална: мөр 85%,
салбар 80%. `pnpm turbo run test` бүрэн suite-ийг ажиллуулна; CI нь нэмж амьд
PostgreSQL service руу migration хийж, тэнд suite-ийг ажиллуулна.

## Deployment тэмдэглэл

- **Migration**-ууд `prisma migrate dev` биш, `prisma migrate deploy`-оор
  ажиллана. Анхны migration нь API эхлэхээс өмнө хэрэгжих ёстой.
- **Secret**-үүд нь secret manager-т хамаарах бөгөөд image доторх `.env`-д хэзээ ч
  байхгүй.
- **API-г scale хийх** нь stateless; суудлын түгжээ бүхэлдээ PostgreSQL дотор тул
  sticky session шаардлагагүй.
- **Worker-ийг scale хийх** нь аюулгүй: expiry sweep нь idempotent бөгөөд job id-гаар
  түлхүүрлэгдсэн тул давхар ажиллагаа аль хэдийн чөлөөтэй байгаа зүйлийг чөлөөлөхгүй.
