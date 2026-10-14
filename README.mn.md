# Нислэгийн Захиалгын Платформ

Нислэг хайх, суудал сонгох, төлбөр төлөх, тасалбар авах. Энгийн Node.js апп:
нэг процесс дээр backend API болон vanilla JavaScript frontend-ийг зэрэг үйлчилнэ.

Framework байхгүй, runtime dependency байхгүй. HTTP нь `node:http`, өгөгдлийн сан
нь Node-ийн built-in `node:sqlite`, хөтчийн клиент нь ES module — build алхам
огт байхгүй.

## Шаардлага

- **Node.js >= 22.5** (`node:sqlite` болон `--env-file-if-exists` шаардлагатай)
- Өөр юу ч хэрэггүй. PostgreSQL server, Redis, bundler суулгах шаардлагагүй.

## Асаах

```bash
npm install          # runtime dependency байхгүй тул бараг no-op
npm run setup        # schema үүсгэж, каталогийг seed хийнэ
npm start            # эсвэл: npm run dev
```

Дараа нь <http://localhost:3000> хаягийг нээнэ.

`npm run dev` нь файл өөрчлөгдөх бүрд серверийг дахин асаана. `npm start` дахин
асаахгүй.

| Сервис | URL |
| --- | --- |
| Вэб | <http://localhost:3000> |
| Админ | <http://localhost:3000/admin> |
| API | <http://localhost:3000/api> |
| Health | <http://localhost:3000/health/ready> |

### Демо бүртгэлүүд

`npm run db:seed` нь `.env` дахь `SEED_PASSWORD`-оос гурван бүртгэл үүсгэнэ:

| Имэйл | Эрх |
| --- | --- |
| `admin@airline.local` | ADMIN |
| `agent@airline.local` | AGENT |
| `customer@airline.local` | CUSTOMER |

Seed нь давтан ажиллуулж болно, мөн одоо байгаа бүртгэлийн нууц үгийг хэзээ ч
дарж бичихгүй.

## Бүтэц

```
server/
  index.js            HTTP server, route хүснэгт, graceful shutdown
  env.js              орчны хувьсагчийг унших (хөгжүүлэлтийн default-той)
  logger.js           бүтэцтэй JSON лог
  db/
    schema.sql        бүх schema, сервер асах үед хэрэгжинэ
    connection.js     SQLite холболт болон IMMEDIATE гүйлгээний helper
    migrate.js        schema хэрэгжүүлэх (`--reset` нь файлыг эхлээд устгана)
    seed.js           каталог болон демо хэрэглэгчийг seed хийх
    seed-data.js      нисэх буудал, агаарын компани, layout, чиглэл, тариф, taxonomy
  lib/                error, enum, money, id, crypto, validation, суудлын геометр
  services/           auth, catalogue, search, seat inventory, booking, payment, admin
  http/               router, статик файл, request context
  routes/             auth, flights, bookings, admin

public/               клиент: index.html, styles.css, js/
test/                 end-to-end API тестүүд (node:test)
```

## Мэдэх үнэ цэнтэй дизайны шийдвэрүүд

**Суудлын түгжээний баталгаа.** Өмнөх Postgres хувилбар нь `SERIALIZABLE`
гүйлгээ болон `SELECT ... FOR UPDATE`-д тулгуурладаг байсан. SQLite нь нэг
бичигчтэй тул суудал өөрчлөх бүр `BEGIN IMMEDIATE` дотор ажиллана: суудлыг
уншихаас өмнө бичих түгжээ авдаг тул хоёр дахь захиалга суудлыг `AVAILABLE` гэж
харж, дараа нь эзэмших боломжгүй. Нэг суудалд 12 захиалга зэрэг илгээж, яг нэг нь
л ялдаг гэдгийг тестээр баталгаажуулсан.

**Захиалгын state machine бол цорын ганц эрх мэдэл.** `server/lib/state-machine.js`
хууль ёсны шилжилт бүрийг тодорхойлж, `transitionBooking` нь `bookings.status`-ын
цорын ганц бичигч юм. Хууль бус шилжилт `INVALID_STATE_TRANSITION` болж илэрч,
зөвшөөрөгдсөн шилжилт бүр `booking_events`-д бүртгэгдэнэ.

**Мөнгө нь бүхэл minor unit.** Хэзээ ч float биш. `server/lib/money.js` тэг болон
гурван аравтын мөнгөн тэмдэгтийг зохицуулж, хөнгөлөлтийг minor unit алдалгүй,
шинээр зохиож гаргалгүйгээр хуваарилна.

**Idempotency-г өгөгдлийн сан хэрэгжүүлнэ.** `bookings.idempotency_key` болон
`payments.idempotency_key` нь unique, тиймээс дахин илгээсэн checkout хоёр дахь
захиалга эсвэл хоёр дахь төлбөр үүсгэж чадахгүй.

**Session нь httpOnly cookie-д амьдарна.** Access token скриптээс харагдахгүй.
15 минут хүчинтэй бөгөөд API client нь refresh cookie-гоор шинэчилж, хүсэлтийг
дахин илгээдэг тул хугацаа дууссан token хэрэглэгчид мэдэгдэхгүй. Refresh token
нь hash хэлбэрээр хадгалагдаж, ашиглах бүрд эргэлддэг; аль хэдийн эргэлдсэн
token дахин ирвэл тухайн бүртгэлийн бүх session хүчингүй болно.

**Эрхийн шалгалт service давхаргад.** `requireRole`-ийг route биш service функц
дууддаг тул шалгалт мартагдсанаар админ үйлдэл нээлттэй болох боломжгүй.

**Паспортын дугаар өгөгдлийн санд шифрлэгдэнэ** (AES-256-GCM). Зөвхөн сүүлийн
4 орон нээлттэй үлдэх тул ажилтан баримтыг таньж болно, шифрийг задлах шаардлагагүй.

## Командууд

```bash
npm start           # сервер асаах
npm run dev         # файл хяналттайгаар асаах
npm run db:migrate  # schema.sql хэрэгжүүлэх
npm run db:reset    # өгөгдлийн сангийн файлыг устгаад schema-г дахин үүсгэх
npm run db:seed     # каталог болон демо хэрэглэгчийг seed хийх
npm run setup       # db:migrate дараа нь db:seed
npm test            # end-to-end API тестүүд
```

## Тохиргоо

`.env.example`-ийг `.env` болгон хуулна. Бүх утга хөгжүүлэлтийн default-тай тул
шинэ clone `.env`гүйгээр ажиллана. Production-д дараах утгууд заавал шаардлагатай
бөгөөд сервер тэдгээргүйгээр асахгүй:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — дор хаяж 32 тэмдэгт
- `PII_ENCRYPTION_KEY` — 64 hex тэмдэгт (32 byte)

## API

Бүх endpoint нь `/api` дор JSON-оор ажиллана. Алдаа нь
`{ "error": { "code": "<DOMAIN_REASON>", "message": "..." } }` хэлбэртэй.
Клиент нь `code`-оор салбарлана, мессежээр хэзээ ч биш.

Дэлгэрэнгүй хүснэгтийг [README.md](./README.md#api) дотор үзнэ үү.

## Тест

```bash
npm test
```

Тухайн тестүүд нь түр зуурын SQLite файл дээр жинхэнэ сервер асааж, HTTP-ээр
дамжуулан шалгана. Хамрах хүрээ: бүрэн захиалгын урсгал, татгалзсан төлбөр,
idempotent checkout, hold хугацаа дуусаж суудал чөлөөлөгдөх, суудлын тооны
шалгалт, guest болон бүртгэлтэй захиалгын эрх, эрхийн хязгаарлалт, taxonomy
бичилт, мөн `public/` гадна файл уншиж чадахгүй байх.
