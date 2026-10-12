# Хэрхэн асаах

## Шаардлага

- Node.js >= 24, pnpm 11
- Docker Desktop

## Алхмууд

### 1. Docker Desktop асаана

Нэг л удаа, гараар. Start menu -> Docker Desktop -> ногоон болтол хүлээнэ.

### 2. Инфраструктур асаах

Repo root дээр:

```powershell
pnpm docker:up
```

Postgres (порт 5435) болон Redis (порт 6379) асна. Healthy болтол 10-20 секунд хүлээнэ.

### 3. Бүх app асаах

```powershell
pnpm dev
```

Энэ нь web, API, worker-ийг watch горимд зэрэг асаана.

### 4. Шалгах

| Хаяг                               | Юу харагдах ёстой                 |
| ---------------------------------- | --------------------------------- |
| http://localhost:3000              | Вэб сайт                          |
| http://localhost:4000/health/ready | `{"status":"ok","database":"up"}` |
| http://localhost:4000/graphql      | GraphQL endpoint                  |
| http://localhost:3000/admin        | Админ (`ADMIN`/`AGENT` эрхтэй)    |

## Зогсоох

```powershell
# app-уудыг зогсоох: Ctrl + C
pnpm docker:down    # инфраструктурыг зогсоох
```

## Ховор хэрэглэгдэх командууд

```powershell
pnpm install                                        # dependency дутуу бол
pnpm --filter @repo/db db:generate                  # Prisma client дахин үүсгэх
pnpm --filter @repo/db exec prisma migrate deploy   # шинэ migration байвал
pnpm --filter @repo/db db:studio                    # өгөгдлийн сан харах
```

## Алдаа гарвал

- **`Cannot connect to Docker daemon`** — Docker Desktop асаагаагүй байна.
- **Порт 3000/4000 ажиллахгүй** — хуучин node процесс үлдсэн. Бүгдийг хаагаад `pnpm dev` дахин ажиллуул.
- **`DATABASE_URL` дутаж байна** — `.env` файл root-д байгаа эсэхийг шалга. Байхгүй бол:

  ```powershell
  Copy-Item .env.example .env
  ```

- **MinIO container асахгүй** (`pull access denied`) — энэ хэвийн, app-д нөлөөлөхгүй. Зөвхөн файл upload хэрэгтэй бол шийдэх шаардлагатай.

## Тэмдэглэл

`pnpm dev` ажиллаж байгаа session хаагдахад зогсоно. Дараагийн удаа `pnpm docker:up` болон `pnpm dev`-ийг л давтана.

`.env` файлыг API болон worker нь Node-ийн `--env-file-if-exists` флагаар автоматаар ачаалдаг тул гараар export хийх шаардлагагүй.
