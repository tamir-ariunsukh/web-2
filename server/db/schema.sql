-- SQLite schema for the flight booking platform.
--
-- The Postgres/Prisma schema this replaces relied on SERIALIZABLE isolation and
-- `SELECT ... FOR UPDATE` to guarantee that two concurrent bookings cannot both
-- take the same seat. SQLite has a single writer, so the equivalent guarantee
-- comes from running every seat-mutating statement inside one `BEGIN IMMEDIATE`
-- transaction: the second writer blocks until the first commits and then sees
-- the committed seat statuses.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Reference data ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS airports (
  id         TEXT PRIMARY KEY,
  iata_code  TEXT NOT NULL UNIQUE,
  icao_code  TEXT UNIQUE,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL,
  country    TEXT NOT NULL,
  timezone   TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS airlines (
  id           TEXT PRIMARY KEY,
  iata_code    TEXT NOT NULL UNIQUE,
  icao_code    TEXT UNIQUE,
  numeric_code TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  logo_url     TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS seat_layouts (
  id             TEXT PRIMARY KEY,
  airline_id     TEXT NOT NULL REFERENCES airlines(id),
  code           TEXT NOT NULL,
  aircraft_model TEXT NOT NULL,
  configuration  TEXT NOT NULL,
  cabins         TEXT NOT NULL,
  is_active      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (airline_id, code)
);

CREATE TABLE IF NOT EXISTS aircraft (
  id             TEXT PRIMARY KEY,
  registration   TEXT NOT NULL UNIQUE,
  model          TEXT NOT NULL,
  manufacturer   TEXT NOT NULL,
  seat_layout_id TEXT REFERENCES seat_layouts(id),
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fare_classes (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL,
  cabin              TEXT NOT NULL,
  name               TEXT NOT NULL,
  airline_id         TEXT NOT NULL REFERENCES airlines(id),
  baggage_allowance  TEXT NOT NULL,
  cabin_baggage      TEXT NOT NULL,
  is_changeable      INTEGER NOT NULL DEFAULT 0,
  is_refundable      INTEGER NOT NULL DEFAULT 0,
  change_fee         INTEGER NOT NULL DEFAULT 0,
  cancel_fee         INTEGER NOT NULL DEFAULT 0,
  cancel_penalty_pct INTEGER NOT NULL DEFAULT 100,
  tier               INTEGER NOT NULL DEFAULT 3,
  UNIQUE (airline_id, code)
);

CREATE TABLE IF NOT EXISTS flights (
  id               TEXT PRIMARY KEY,
  flight_number    TEXT NOT NULL,
  airline_id       TEXT NOT NULL REFERENCES airlines(id),
  aircraft_id      TEXT REFERENCES aircraft(id),
  origin_id        TEXT NOT NULL REFERENCES airports(id),
  destination_id   TEXT NOT NULL REFERENCES airports(id),
  departure_at     TEXT NOT NULL,
  arrival_at       TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'SCHEDULED',
  provider         TEXT NOT NULL DEFAULT 'MOCK',
  provider_ref     TEXT,
  seat_layout_id   TEXT REFERENCES seat_layouts(id),
  seats_available  INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS flights_route_idx ON flights (origin_id, destination_id, departure_at);
CREATE INDEX IF NOT EXISTS flights_departure_status_idx ON flights (departure_at, status);
CREATE INDEX IF NOT EXISTS flights_number_idx ON flights (airline_id, flight_number, departure_at);

CREATE TABLE IF NOT EXISTS fares (
  id              TEXT PRIMARY KEY,
  flight_id       TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  fare_class_id   TEXT NOT NULL REFERENCES fare_classes(id),
  base_price      INTEGER NOT NULL,
  taxes           INTEGER NOT NULL,
  fees            INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  seats_available INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS fares_flight_idx ON fares (flight_id);

CREATE TABLE IF NOT EXISTS seats (
  id              TEXT PRIMARY KEY,
  flight_id       TEXT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  seat_number     TEXT NOT NULL,
  row             INTEGER NOT NULL,
  column_letter   TEXT NOT NULL,
  cabin           TEXT NOT NULL,
  position        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'AVAILABLE',
  surcharge       INTEGER NOT NULL DEFAULT 0,
  is_exit_row     INTEGER NOT NULL DEFAULT 0,
  is_bulkhead     INTEGER NOT NULL DEFAULT 0,
  has_bassinet    INTEGER NOT NULL DEFAULT 0,
  hold_expires_at TEXT,
  UNIQUE (flight_id, seat_number)
);

CREATE INDEX IF NOT EXISTS seats_flight_status_idx ON seats (flight_id, status);
CREATE INDEX IF NOT EXISTS seats_status_hold_idx ON seats (status, hold_expires_at);

-- ─── Accounts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone              TEXT UNIQUE,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'CUSTOMER',
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  last_login_at      TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at         TEXT
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role, deleted_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id, revoked_at);

-- ─── Bookings ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  pnr                     TEXT PRIMARY KEY,
  id                      TEXT NOT NULL UNIQUE,
  user_id                 TEXT REFERENCES users(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'HELD',
  base_fare               INTEGER NOT NULL,
  taxes                   INTEGER NOT NULL,
  fees                    INTEGER NOT NULL DEFAULT 0,
  discount                INTEGER NOT NULL DEFAULT 0,
  total                   INTEGER NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'USD',
  contact_email           TEXT NOT NULL COLLATE NOCASE,
  contact_phone           TEXT NOT NULL,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  home_address            TEXT,
  expires_at              TEXT,
  confirmed_at            TEXT,
  ticketed_at             TEXT,
  cancelled_at            TEXT,
  cancellation_reason     TEXT,
  idempotency_key         TEXT UNIQUE,
  source                  TEXT NOT NULL DEFAULT 'web',
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, status);
CREATE INDEX IF NOT EXISTS bookings_status_expires_idx ON bookings (status, expires_at);
CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at);

CREATE TABLE IF NOT EXISTS booking_segments (
  id           TEXT PRIMARY KEY,
  booking_pnr  TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  flight_id    TEXT NOT NULL REFERENCES flights(id),
  fare_id      TEXT NOT NULL REFERENCES fares(id),
  sequence     INTEGER NOT NULL,
  base_fare    INTEGER NOT NULL,
  taxes        INTEGER NOT NULL,
  fees         INTEGER NOT NULL DEFAULT 0,
  provider_ref TEXT,
  UNIQUE (booking_pnr, sequence)
);

CREATE INDEX IF NOT EXISTS booking_segments_flight_idx ON booking_segments (flight_id);

CREATE TABLE IF NOT EXISTS passengers (
  id                       TEXT PRIMARY KEY,
  booking_pnr              TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  sequence                 INTEGER NOT NULL,
  type                     TEXT NOT NULL,
  gender                   TEXT NOT NULL DEFAULT 'UNSPECIFIED',
  first_name               TEXT NOT NULL,
  middle_name              TEXT,
  last_name                TEXT NOT NULL,
  date_of_birth            TEXT NOT NULL,
  passport_number_enc      TEXT,
  passport_last4           TEXT,
  passport_expiry          TEXT,
  passport_issuing_country TEXT,
  nationality              TEXT,
  UNIQUE (booking_pnr, sequence)
);

CREATE TABLE IF NOT EXISTS booking_seats (
  id           TEXT PRIMARY KEY,
  booking_pnr  TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  segment_id   TEXT NOT NULL REFERENCES booking_segments(id) ON DELETE CASCADE,
  passenger_id TEXT NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  seat_id      TEXT NOT NULL REFERENCES seats(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (segment_id, passenger_id),
  UNIQUE (segment_id, seat_id)
);

CREATE INDEX IF NOT EXISTS booking_seats_booking_idx ON booking_seats (booking_pnr);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  booking_pnr     TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'REQUIRES_ACTION',
  method          TEXT NOT NULL DEFAULT 'CARD',
  provider        TEXT NOT NULL DEFAULT 'MOCK',
  provider_ref    TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  card_summary    TEXT,
  failure_code    TEXT,
  failure_message TEXT,
  authorized_at   TEXT,
  captured_at     TEXT,
  refunded_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS payments_booking_idx ON payments (booking_pnr, status);

CREATE TABLE IF NOT EXISTS refunds (
  id              TEXT PRIMARY KEY,
  payment_id      TEXT NOT NULL REFERENCES payments(id),
  booking_pnr     TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'REQUESTED',
  reason          TEXT,
  provider_ref    TEXT,
  requested_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at     TEXT,
  completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS refunds_booking_idx ON refunds (booking_pnr, status);

CREATE TABLE IF NOT EXISTS tickets (
  id            TEXT PRIMARY KEY,
  booking_pnr   TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  segment_id    TEXT NOT NULL REFERENCES booking_segments(id) ON DELETE CASCADE,
  passenger_id  TEXT NOT NULL REFERENCES passengers(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  issued_at     TEXT,
  voided_at     TEXT,
  refunded_at   TEXT,
  qr_payload    TEXT,
  provider_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (segment_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS tickets_booking_idx ON tickets (booking_pnr, status);

CREATE TABLE IF NOT EXISTS booking_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_pnr TEXT NOT NULL REFERENCES bookings(pnr) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  message     TEXT,
  metadata    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events (booking_pnr, created_at);

-- ─── Extras and audit ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  parent_id   TEXT REFERENCES categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  kind        TEXT NOT NULL DEFAULT 'OTHER',
  category_id TEXT NOT NULL REFERENCES categories(id),
  is_active   INTEGER NOT NULL DEFAULT 1,
  stock       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id, is_active);

CREATE TABLE IF NOT EXISTS promo_codes (
  id                        TEXT PRIMARY KEY,
  code                      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  description               TEXT,
  discount_type             TEXT NOT NULL,
  discount_value            INTEGER NOT NULL,
  applies_to_base_fare_only INTEGER NOT NULL DEFAULT 1,
  max_discount_amount       INTEGER,
  currency                  TEXT,
  min_spend                 INTEGER NOT NULL DEFAULT 0,
  max_redemptions           INTEGER,
  max_redemptions_per_user  INTEGER NOT NULL DEFAULT 1,
  redemption_count          INTEGER NOT NULL DEFAULT 0,
  valid_from                TEXT NOT NULL,
  valid_until               TEXT NOT NULL,
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS promo_codes_active_idx ON promo_codes (is_active, valid_until);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type  TEXT NOT NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  diff        TEXT,
  request_id  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity, entity_id, created_at);
