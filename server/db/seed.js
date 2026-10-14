/**
 * Seeds the catalogue.
 *
 * Idempotent: every insert is keyed on a natural identifier, so re-running
 * updates rather than duplicating. Flights are the exception — they are generated
 * for a 30-day window from today, so a re-run on a later day adds the new days
 * and skips the departures that already exist.
 */

import { closeDatabase, getDatabase, inTransaction } from './connection.js';
import { hashPassword } from '../lib/crypto.js';
import { newId } from '../lib/ids.js';
import { seatCountFor } from '../lib/seat-map.js';
import {
  AIRLINES,
  AIRPORTS,
  DEMO_USERS,
  DEPARTURE_HOURS,
  FARE_CLASSES,
  PROMO_CODES,
  ROUTES,
  SEED_DAYS,
  SEAT_LAYOUTS,
  TAXONOMY,
} from './seed-data.js';

const DEFAULT_PROMO_DAYS = 365;

function seedAirports(db) {
  const insert = db.prepare(
    `INSERT INTO airports (id, iata_code, icao_code, name, city, country, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(iata_code) DO UPDATE SET
       icao_code = excluded.icao_code, name = excluded.name, city = excluded.city,
       country = excluded.country, timezone = excluded.timezone`,
  );

  for (const [iata, icao, name, city, country, timezone] of AIRPORTS) {
    insert.run(newId(), iata, icao, name, city, country, timezone);
  }
  return db.prepare('SELECT COUNT(*) AS count FROM airports').get().count;
}

function seedAirlines(db) {
  const insert = db.prepare(
    `INSERT INTO airlines (id, iata_code, icao_code, numeric_code, name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(iata_code) DO UPDATE SET
       icao_code = excluded.icao_code, numeric_code = excluded.numeric_code, name = excluded.name`,
  );
  for (const [iata, icao, numeric, name] of AIRLINES) {
    insert.run(newId(), iata, icao, numeric, name);
  }
  return db.prepare('SELECT COUNT(*) AS count FROM airlines').get().count;
}

/** Expands each `rows` entry over the cabin's full row range. */
function expandLayoutRows(cabin) {
  const rows = [];
  for (let row = cabin.firstRow; row <= cabin.lastRow; row += 1) {
    const explicit = cabin.rows.find((entry) => entry.row === row);
    rows.push(
      explicit ?? {
        row,
        isExitRow: false,
        isBulkhead: false,
        hasBassinet: false,
        missingColumns: [],
        blockedColumns: [],
        surchargeColumns: [],
        surcharge: 0,
      },
    );
  }
  return rows;
}

function fullLayout(layout) {
  return {
    ...layout,
    cabins: layout.cabins.map((cabin) => ({ ...cabin, rows: expandLayoutRows(cabin) })),
  };
}

function seedLayoutsAndAircraft(db, airlineIds) {
  const insertLayout = db.prepare(
    `INSERT INTO seat_layouts (id, airline_id, code, aircraft_model, configuration, cabins)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(airline_id, code) DO UPDATE SET
       aircraft_model = excluded.aircraft_model, configuration = excluded.configuration,
       cabins = excluded.cabins`,
  );

  // Layouts are owned by the flag carrier but the aircraft roster is shared, so
  // every airline can schedule any route.
  const owner = airlineIds.get('OM');
  const layoutIds = new Map();

  for (const layout of SEAT_LAYOUTS) {
    const expanded = fullLayout(layout);
    const existing = db
      .prepare('SELECT id FROM seat_layouts WHERE airline_id = ? AND code = ?')
      .get(owner, layout.code);

    const id = existing?.id ?? newId();
    insertLayout.run(
      id,
      owner,
      layout.code,
      layout.aircraftModel,
      layout.configuration,
      JSON.stringify(expanded.cabins),
    );
    layoutIds.set(layout.code, id);
  }

  let aircraftCount = 0;
  const fleet = [
    { code: 'narrow-3-3-180', prefix: 'JU-N', count: 12 },
    { code: 'wide-2-2-2-3-3-3-300', prefix: 'JU-W', count: 6 },
  ];

  for (const entry of fleet) {
    const layout = SEAT_LAYOUTS.find((candidate) => candidate.code === entry.code);
    for (let index = 1; index <= entry.count; index += 1) {
      const registration = `${entry.prefix}${String(index).padStart(3, '0')}`;
      db.prepare(
        `INSERT INTO aircraft (id, registration, model, manufacturer, seat_layout_id)
         VALUES (?, ?, ?, 'Boeing', ?)
         ON CONFLICT(registration) DO UPDATE SET
           model = excluded.model, seat_layout_id = excluded.seat_layout_id`,
      ).run(newId(), registration, layout.aircraftModel, layoutIds.get(entry.code));
      aircraftCount += 1;
    }
  }

  return { layoutIds, aircraftCount };
}

function seedFareClasses(db, airlineIds) {
  const insert = db.prepare(
    `INSERT INTO fare_classes (
       id, code, cabin, name, airline_id, baggage_allowance, cabin_baggage,
       is_changeable, is_refundable, change_fee, cancel_fee, cancel_penalty_pct, tier
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(airline_id, code) DO UPDATE SET
       cabin = excluded.cabin, name = excluded.name, tier = excluded.tier,
       baggage_allowance = excluded.baggage_allowance, cabin_baggage = excluded.cabin_baggage,
       is_changeable = excluded.is_changeable, is_refundable = excluded.is_refundable,
       change_fee = excluded.change_fee, cancel_fee = excluded.cancel_fee`,
  );

  for (const airlineId of airlineIds.values()) {
    for (const fare of FARE_CLASSES) {
      insert.run(
        newId(),
        fare.code,
        fare.cabin,
        fare.name,
        airlineId,
        fare.baggage,
        fare.cabinBag,
        fare.changeable ? 1 : 0,
        fare.refundable ? 1 : 0,
        fare.changeFee,
        fare.cancelFee,
        fare.cancelPenaltyPct,
        fare.tier,
      );
    }
  }
  return db.prepare('SELECT COUNT(*) AS count FROM fare_classes').get().count;
}

function seedPromos(db) {
  const insert = db.prepare(
    `INSERT INTO promo_codes (
       id, code, description, discount_type, discount_value, max_discount_amount,
       min_spend, max_redemptions_per_user, valid_from, valid_until, is_active
     ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 1)
     ON CONFLICT(code) DO UPDATE SET
       description = excluded.description, discount_type = excluded.discount_type,
       discount_value = excluded.discount_value, max_discount_amount = excluded.max_discount_amount`,
  );

  const now = new Date();
  const until = new Date(now.getTime() + DEFAULT_PROMO_DAYS * 86_400_000).toISOString();
  for (const promo of PROMO_CODES) {
    insert.run(
      newId(),
      promo.code,
      promo.description,
      promo.discountType,
      promo.discountValue,
      promo.maxDiscountAmount,
      now.toISOString(),
      until,
    );
  }
  return db.prepare('SELECT COUNT(*) AS count FROM promo_codes').get().count;
}

function seedTaxonomy(db) {
  for (const category of TAXONOMY) {
    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category.slug);
    const categoryId = existing?.id ?? newId();

    if (existing) {
      db.prepare('UPDATE categories SET name = ?, description = ?, sort_order = ? WHERE id = ?').run(
        category.name,
        category.description,
        category.sortOrder,
        categoryId,
      );
    } else {
      db.prepare(
        'INSERT INTO categories (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      ).run(categoryId, category.slug, category.name, category.description, category.sortOrder);
    }

    for (const product of category.products) {
      db.prepare(
        `INSERT INTO products (id, sku, name, price, currency, kind, category_id)
         VALUES (?, ?, ?, ?, 'USD', ?, ?)
         ON CONFLICT(sku) DO UPDATE SET
           name = excluded.name, price = excluded.price, kind = excluded.kind,
           category_id = excluded.category_id`,
      ).run(newId(), product.sku, product.name, product.price, product.kind, categoryId);
    }
  }
  return db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
}

/**
 * Generates the flight schedule.
 *
 * Flights whose arrival is already in the past are skipped, so the catalogue
 * always contains only bookable departures.
 */
function seedFlights(db, airlineIds, layoutIds) {
  const flightInsert = db.prepare(
    `INSERT INTO flights (
       id, flight_number, airline_id, aircraft_id, origin_id, destination_id,
       departure_at, arrival_at, duration_minutes, status, provider, seat_layout_id, seats_available
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', 'MOCK', ?, ?)`,
  );
  const fareInsert = db.prepare(
    `INSERT INTO fares (id, flight_id, fare_class_id, base_price, taxes, fees, currency, seats_available)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', ?)`,
  );
  const seatInsert = db.prepare(
    `INSERT INTO seats (
       id, flight_id, seat_number, row, column_letter, cabin, position, status,
       surcharge, is_exit_row, is_bulkhead, has_bassinet
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const airports = new Map(
    db.prepare('SELECT id, iata_code FROM airports').all().map((row) => [row.iata_code, row.id]),
  );
  const aircraft = db.prepare('SELECT id, seat_layout_id FROM aircraft ORDER BY registration').all();
  const fareClasses = db
    .prepare('SELECT id, airline_id, code FROM fare_classes')
    .all()
    .map((row) => ({ ...row, multiplier: FARE_CLASSES.find((f) => f.code === row.code).multiplier }));
  const airlineRows = db.prepare('SELECT id, iata_code FROM airlines').all();
  const airlineByIata = new Map(airlineRows.map((row) => [row.iata_code, row.id]));
  const airlineById = new Map(airlineRows.map((row) => [row.id, row.iata_code]));

  const layoutsByCode = new Map(
    SEAT_LAYOUTS.map((layout) => [layout.code, fullLayout(layout)]),
  );
  const layoutCodeById = new Map(
    [...layoutIds.entries()].map(([code, id]) => [id, code]),
  );

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let flightsCreated = 0;
  let aircraftCursor = 0;

  ROUTES.forEach(([origin, destination, airlineIata, durationMinutes, basePrice, wideBody], routeIndex) => {
    const airlineId = airlineByIata.get(airlineIata) ?? airlineIds.get(airlineIata);
    if (!airlineId) return;

    const originId = airports.get(origin);
    const destinationId = airports.get(destination);
    if (!originId || !destinationId) return;

    const layoutCode = wideBody ? 'wide-2-2-2-3-3-3-300' : 'narrow-3-3-180';
    const layout = layoutsByCode.get(layoutCode);
    const layoutId = layoutIds.get(layoutCode);
    const seatCount = seatCountFor(layout);
    const flightNumber = `${airlineIata}${String(100 + routeIndex).padStart(3, '0')}`;

    const routeFareClasses = fareClasses.filter((fare) => fare.airline_id === airlineId);

    for (let day = 0; day < SEED_DAYS; day += 1) {
      for (const hour of DEPARTURE_HOURS) {
        // A deterministic per-route/minute offset keeps the schedule varied
        // without making it random between runs.
        const minute = (durationMinutes + hour * 7) % 60;
        const departure = new Date(todayStart.getTime() + day * 86_400_000);
        departure.setUTCHours(hour, minute, 0, 0);

        const arrival = new Date(departure.getTime() + durationMinutes * 60_000);
        if (arrival.getTime() < Date.now()) continue;

        const duplicate = db
          .prepare(
            'SELECT id FROM flights WHERE airline_id = ? AND flight_number = ? AND departure_at = ?',
          )
          .get(airlineId, flightNumber, departure.toISOString());
        if (duplicate) continue;

        const plane = aircraft[aircraftCursor % aircraft.length];
        aircraftCursor += 1;

        const flightId = newId();
        flightInsert.run(
          flightId,
          flightNumber,
          airlineId,
          plane?.id ?? null,
          originId,
          destinationId,
          departure.toISOString(),
          arrival.toISOString(),
          durationMinutes,
          layoutId,
          seatCount,
        );

        // A mild two-week cycle keeps prices from being flat across the month.
        const seasonality = 1 + (day % 14) * 0.015;
        const perFareSeats = Math.max(1, Math.round(seatCount / 12));

        for (const fare of routeFareClasses) {
          const base = Math.round(basePrice * fare.multiplier * seasonality);
          fareInsert.run(
            newId(),
            flightId,
            fare.id,
            base,
            Math.round(base * 0.11),
            2_500,
            perFareSeats,
          );
        }

        for (const cabin of layout.cabins) {
          const columnCount = cabin.columns.length;
          for (const row of cabin.rows) {
            for (let index = 0; index < columnCount; index += 1) {
              const column = cabin.columns[index];
              if (row.missingColumns.includes(column)) continue;

              const isBlocked = row.blockedColumns.includes(column);
              const hasSurcharge = row.surchargeColumns.includes(column);
              const isAisle =
                cabin.aisleAfter.includes(index) || cabin.aisleAfter.includes(index + 1);
              const position = isAisle
                ? 'AISLE'
                : index === 0 || index === columnCount - 1
                  ? 'WINDOW'
                  : 'MIDDLE';

              const surcharge = hasSurcharge
                ? row.surcharge
                : cabin.cabin === 'BUSINESS'
                  ? Math.round(basePrice * 0.05)
                  : 0;

              seatInsert.run(
                newId(),
                flightId,
                `${row.row}${column}`,
                row.row,
                column,
                cabin.cabin,
                position,
                isBlocked ? 'BLOCKED' : 'AVAILABLE',
                surcharge,
                row.isExitRow ? 1 : 0,
                row.isBulkhead ? 1 : 0,
                row.hasBassinet && ['A', 'F', 'K'].includes(column) ? 1 : 0,
              );
            }
          }
        }

        flightsCreated += 1;
      }
    }

    void airlineById;
  });

  return flightsCreated;
}

function seedDemoUsers(db, password) {
  if (!password) {
    return { created: 0, skipped: true };
  }

  return hashPassword(password).then((hash) => {
    for (const user of DEMO_USERS) {
      const existing = db
        .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
        .get(user.email);

      if (existing) {
        // The password is not overwritten: a re-seed must not silently reset a
        // password someone may have changed.
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(user.role, existing.id);
        continue;
      }

      db.prepare(
        `INSERT INTO users (id, email, password_hash, role, first_name, last_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newId(), user.email, hash, user.role, user.firstName, user.lastName);
    }
    return { created: DEMO_USERS.length, skipped: false };
  });
}

export async function seed({ password = process.env.SEED_PASSWORD, verbose = true } = {}) {
  const db = getDatabase();

  const summary = inTransaction((tx) => {
    const airports = seedAirports(tx);
    const airlines = seedAirlines(tx);
    const airlineIds = new Map(
      tx.prepare('SELECT id, iata_code FROM airlines').all().map((row) => [row.iata_code, row.id]),
    );
    const { layoutIds, aircraftCount } = seedLayoutsAndAircraft(tx, airlineIds);
    const fareClasses = seedFareClasses(tx, airlineIds);
    const flights = seedFlights(tx, airlineIds, layoutIds);
    const promoCount = seedPromos(tx);
    const products = seedTaxonomy(tx);

    return { airports, airlines, layoutIds, aircraftCount, fareClasses, flights, promoCount, products };
  });

  const users = await seedDemoUsers(db, password);

  if (verbose) {
    console.log('Seed complete:');
    console.log(`  airports        ${summary.airports}`);
    console.log(`  airlines        ${summary.airlines}`);
    console.log(`  aircraft        ${summary.aircraftCount}`);
    console.log(`  fare classes    ${summary.fareClasses}`);
    console.log(`  flights created ${summary.flights}`);
    console.log(`  promo codes     ${summary.promoCount}`);
    console.log(`  products        ${summary.products}`);
    console.log(
      users.skipped
        ? '  demo users      skipped (set SEED_PASSWORD to create admin/agent/customer)'
        : `  demo users      ${users.created}`,
    );
  }

  return summary;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed.js');
if (invokedDirectly) {
  seed()
    .then(() => closeDatabase())
    .catch((error) => {
      console.error('Seed failed:', error);
      closeDatabase();
      process.exit(1);
    });
}

export { expandLayoutRows, fullLayout };
