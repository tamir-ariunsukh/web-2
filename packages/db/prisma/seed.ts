import { randomUUID } from 'node:crypto';

import { PrismaClient, type Prisma } from '@prisma/client';
import { seatNumbers, type SeatLayout } from '@repo/shared';

/**
 * Development seed.
 *
 * Idempotent: every write upserts on a natural key, so running it repeatedly
 * converges on the same catalogue instead of duplicating rows or failing.
 */

const prisma = new PrismaClient();

interface AirportSeed {
  readonly iata: string;
  readonly icao: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly timezone: string;
  readonly lat: number;
  readonly lng: number;
}

const AIRPORTS: readonly AirportSeed[] = [
  { iata: 'ULN', icao: 'ZMUB', name: 'Chinggis Khaan International', city: 'Ulaanbaatar', country: 'MN', timezone: 'Asia/Ulaanbaatar', lat: 47.8431, lng: 106.7666 },
  { iata: 'SEL', icao: 'RKSI', name: 'Incheon International', city: 'Seoul', country: 'KR', timezone: 'Asia/Seoul', lat: 37.4602, lng: 126.4407 },
  { iata: 'GMP', icao: 'RKSS', name: 'Gimpo International', city: 'Seoul', country: 'KR', timezone: 'Asia/Seoul', lat: 37.5583, lng: 126.7906 },
  { iata: 'PEK', icao: 'ZBAA', name: 'Beijing Capital International', city: 'Beijing', country: 'CN', timezone: 'Asia/Shanghai', lat: 40.0799, lng: 116.6031 },
  { iata: 'PVG', icao: 'ZSPD', name: 'Shanghai Pudong International', city: 'Shanghai', country: 'CN', timezone: 'Asia/Shanghai', lat: 31.1443, lng: 121.8083 },
  { iata: 'HKG', icao: 'VHHH', name: 'Hong Kong International', city: 'Hong Kong', country: 'HK', timezone: 'Asia/Hong_Kong', lat: 22.308, lng: 113.9185 },
  { iata: 'NRT', icao: 'RJAA', name: 'Narita International', city: 'Tokyo', country: 'JP', timezone: 'Asia/Tokyo', lat: 35.772, lng: 140.3929 },
  { iata: 'HND', icao: 'RJTT', name: 'Haneda', city: 'Tokyo', country: 'JP', timezone: 'Asia/Tokyo', lat: 35.5494, lng: 139.7798 },
  { iata: 'KIX', icao: 'RJBB', name: 'Kansai International', city: 'Osaka', country: 'JP', timezone: 'Asia/Tokyo', lat: 34.4273, lng: 135.244 },
  { iata: 'SIN', icao: 'WSSS', name: 'Changi', city: 'Singapore', country: 'SG', timezone: 'Asia/Singapore', lat: 1.3644, lng: 103.9915 },
  { iata: 'BKK', icao: 'VTBS', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', timezone: 'Asia/Bangkok', lat: 13.69, lng: 100.7501 },
  { iata: 'KUL', icao: 'WMKK', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', country: 'MY', timezone: 'Asia/Kuala_Lumpur', lat: 2.7456, lng: 101.7099 },
  { iata: 'DEL', icao: 'VIDP', name: 'Indira Gandhi International', city: 'Delhi', country: 'IN', timezone: 'Asia/Kolkata', lat: 28.5562, lng: 77.1 },
  { iata: 'DXB', icao: 'OMDB', name: 'Dubai International', city: 'Dubai', country: 'AE', timezone: 'Asia/Dubai', lat: 25.2532, lng: 55.3657 },
  { iata: 'IST', icao: 'LTFM', name: 'Istanbul Airport', city: 'Istanbul', country: 'TR', timezone: 'Europe/Istanbul', lat: 41.2753, lng: 28.7519 },
  { iata: 'FRA', icao: 'EDDF', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE', timezone: 'Europe/Berlin', lat: 50.0379, lng: 8.5622 },
  { iata: 'LHR', icao: 'EGLL', name: 'Heathrow', city: 'London', country: 'GB', timezone: 'Europe/London', lat: 51.47, lng: -0.4543 },
  { iata: 'CDG', icao: 'LFPG', name: 'Charles de Gaulle', city: 'Paris', country: 'FR', timezone: 'Europe/Paris', lat: 49.0097, lng: 2.5479 },
  { iata: 'JFK', icao: 'KJFK', name: 'John F. Kennedy International', city: 'New York', country: 'US', timezone: 'America/New_York', lat: 40.6413, lng: -73.7781 },
  { iata: 'LAX', icao: 'KLAX', name: 'Los Angeles International', city: 'Los Angeles', country: 'US', timezone: 'America/Los_Angeles', lat: 33.9416, lng: -118.4085 },
];

interface AirlineSeed {
  readonly iata: string;
  readonly icao: string;
  readonly numeric: string;
  readonly name: string;
}

const AIRLINES: readonly AirlineSeed[] = [
  { iata: 'OM', icao: 'MGL', numeric: '289', name: 'MIAT Mongolian Airlines' },
  { iata: 'KE', icao: 'KAL', numeric: '180', name: 'Korean Air' },
  { iata: 'OZ', icao: 'AAR', numeric: '988', name: 'Asiana Airlines' },
  { iata: 'JL', icao: 'JAL', numeric: '131', name: 'Japan Airlines' },
  { iata: 'NH', icao: 'ANA', numeric: '205', name: 'All Nippon Airways' },
  { iata: 'SQ', icao: 'SIA', numeric: '618', name: 'Singapore Airlines' },
  { iata: 'TG', icao: 'THA', numeric: '217', name: 'Thai Airways' },
  { iata: 'CA', icao: 'CCA', numeric: '999', name: 'Air China' },
  { iata: 'CX', icao: 'CPA', numeric: '160', name: 'Cathay Pacific' },
  { iata: 'EK', icao: 'UAE', numeric: '176', name: 'Emirates' },
  { iata: 'TK', icao: 'THY', numeric: '235', name: 'Turkish Airlines' },
  { iata: 'LH', icao: 'DLH', numeric: '220', name: 'Lufthansa' },
];

/** Narrow-body layout: 3-3 economy, no premium cabin. */
const NARROW_BODY_LAYOUT: SeatLayout = {
  id: 'narrow-3-3-180',
  aircraftModel: 'Boeing 737-800',
  configuration: '3-3',
  cabins: [
    {
      cabin: 'ECONOMY',
      label: 'Economy',
      firstRow: 1,
      lastRow: 30,
      columns: ['A', 'B', 'C', 'D', 'E', 'F'],
      aisleAfter: [3],
      rows: Array.from({ length: 30 }, (_, index) => {
        const row = index + 1;
        return {
          row,
          isExitRow: row === 12 || row === 13,
          isBulkhead: row === 1,
          hasBassinet: row === 1,
          missingColumns: [],
          blockedColumns: row === 1 ? ['A', 'F'] : [],
          surchargeColumns: row === 12 || row === 13 ? ['A', 'F'] : [],
          surcharge: row === 12 || row === 13 ? 2_500 : 0,
        };
      }),
    },
  ],
};

/** Wide-body layout: 2-2-2 business plus 3-3-3 economy. */
const WIDE_BODY_LAYOUT: SeatLayout = {
  id: 'wide-2-2-2-3-3-3-300',
  aircraftModel: 'Boeing 787-9',
  configuration: '2-2-2 / 3-3-3',
  cabins: [
    {
      cabin: 'BUSINESS',
      label: 'Business',
      firstRow: 1,
      lastRow: 8,
      columns: ['A', 'C', 'D', 'F', 'G', 'K'],
      aisleAfter: [2, 4],
      rows: Array.from({ length: 8 }, (_, index) => ({
        row: index + 1,
        isExitRow: false,
        isBulkhead: index === 0,
        hasBassinet: index === 0,
        missingColumns: [],
        blockedColumns: [],
        surchargeColumns: [],
        surcharge: 0,
      })),
    },
    {
      cabin: 'ECONOMY',
      label: 'Economy',
      firstRow: 10,
      lastRow: 42,
      columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K'],
      aisleAfter: [3, 6],
      rows: Array.from({ length: 33 }, (_, index) => {
        const row = index + 10;
        return {
          row,
          isExitRow: row === 22 || row === 23,
          isBulkhead: row === 10,
          hasBassinet: row === 10,
          missingColumns: [],
          blockedColumns: row === 10 ? ['A', 'K'] : [],
          surchargeColumns: row === 22 || row === 23 ? ['A', 'K'] : [],
          surcharge: row === 22 || row === 23 ? 3_500 : 0,
        };
      }),
    },
  ],
};

const LAYOUTS = [NARROW_BODY_LAYOUT, WIDE_BODY_LAYOUT] as const;

/** Fare classes sold on every flight, priced as a multiple of the base fare. */
const FARE_CLASSES = [
  { code: 'Y', cabin: 'ECONOMY', name: 'Full Flex', tier: 3, baggage: '2PC', cabinBag: '1PC', changeable: true, refundable: true, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 0, multiplier: 1.9 },
  { code: 'M', cabin: 'ECONOMY', name: 'Standard', tier: 3, baggage: '1PC', cabinBag: '1PC', changeable: true, refundable: false, changeFee: 8_000, cancelFee: 0, cancelPenaltyPct: 100, multiplier: 1.35 },
  { code: 'V', cabin: 'ECONOMY', name: 'Saver', tier: 3, baggage: '1PC', cabinBag: '1PC', changeable: false, refundable: false, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 100, multiplier: 1.0 },
  { code: 'C', cabin: 'BUSINESS', name: 'Business', tier: 1, baggage: '3PC', cabinBag: '2PC', changeable: true, refundable: true, changeFee: 0, cancelFee: 0, cancelPenaltyPct: 0, multiplier: 4.2 },
] as const;

const ROUTES: readonly { origin: string; destination: string; airline: string; durationMinutes: number; basePrice: number; wideBody: boolean }[] = [
  { origin: 'ULN', destination: 'SEL', airline: 'OM', durationMinutes: 195, basePrice: 42_000, wideBody: false },
  { origin: 'SEL', destination: 'ULN', airline: 'OM', durationMinutes: 210, basePrice: 44_000, wideBody: false },
  { origin: 'ULN', destination: 'PEK', airline: 'CA', durationMinutes: 130, basePrice: 31_000, wideBody: false },
  { origin: 'ULN', destination: 'HKG', airline: 'OM', durationMinutes: 260, basePrice: 58_000, wideBody: false },
  { origin: 'ULN', destination: 'NRT', airline: 'OM', durationMinutes: 250, basePrice: 61_000, wideBody: false },
  { origin: 'ULN', destination: 'SIN', airline: 'SQ', durationMinutes: 390, basePrice: 88_000, wideBody: true },
  { origin: 'ULN', destination: 'IST', airline: 'TK', durationMinutes: 480, basePrice: 96_000, wideBody: true },
  { origin: 'ULN', destination: 'FRA', airline: 'LH', durationMinutes: 540, basePrice: 124_000, wideBody: true },
  { origin: 'SEL', destination: 'NRT', airline: 'KE', durationMinutes: 140, basePrice: 27_000, wideBody: false },
  { origin: 'SEL', destination: 'BKK', airline: 'TG', durationMinutes: 345, basePrice: 52_000, wideBody: true },
  { origin: 'SEL', destination: 'SIN', airline: 'SQ', durationMinutes: 380, basePrice: 66_000, wideBody: true },
  { origin: 'SEL', destination: 'JFK', airline: 'KE', durationMinutes: 830, basePrice: 168_000, wideBody: true },
  { origin: 'NRT', destination: 'LAX', airline: 'NH', durationMinutes: 610, basePrice: 132_000, wideBody: true },
  { origin: 'NRT', destination: 'CDG', airline: 'JL', durationMinutes: 740, basePrice: 148_000, wideBody: true },
  { origin: 'SIN', destination: 'LHR', airline: 'SQ', durationMinutes: 830, basePrice: 172_000, wideBody: true },
  { origin: 'DXB', destination: 'LHR', airline: 'EK', durationMinutes: 445, basePrice: 108_000, wideBody: true },
  { origin: 'DXB', destination: 'JFK', airline: 'EK', durationMinutes: 830, basePrice: 186_000, wideBody: true },
  { origin: 'IST', destination: 'CDG', airline: 'TK', durationMinutes: 205, basePrice: 44_000, wideBody: false },
  { origin: 'FRA', destination: 'LHR', airline: 'LH', durationMinutes: 105, basePrice: 26_000, wideBody: false },
  { origin: 'FRA', destination: 'JFK', airline: 'LH', durationMinutes: 520, basePrice: 118_000, wideBody: true },
  { origin: 'CDG', destination: 'JFK', airline: 'LH', durationMinutes: 495, basePrice: 112_000, wideBody: true },
  { origin: 'BKK', destination: 'DEL', airline: 'TG', durationMinutes: 250, basePrice: 38_000, wideBody: false },
  { origin: 'KUL', destination: 'SIN', airline: 'SQ', durationMinutes: 65, basePrice: 14_000, wideBody: false },
  { origin: 'HND', destination: 'KIX', airline: 'JL', durationMinutes: 75, basePrice: 16_000, wideBody: false },
];

/** Departure banks in UTC, chosen so the seeded timetable spans a full day. */
const DEPARTURE_HOURS = [1, 4, 8, 12, 16, 20] as const;

/** Days of timetable to generate, starting today. */
const SEED_DAYS = 30;

async function seedAirports(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const airport of AIRPORTS) {
    const row = await prisma.airport.upsert({
      where: { iataCode: airport.iata },
      update: {
        name: airport.name,
        city: airport.city,
        country: airport.country,
        timezone: airport.timezone,
        latitude: airport.lat,
        longitude: airport.lng,
        isActive: true,
      },
      create: {
        iataCode: airport.iata,
        icaoCode: airport.icao,
        name: airport.name,
        city: airport.city,
        country: airport.country,
        timezone: airport.timezone,
        latitude: airport.lat,
        longitude: airport.lng,
      },
      select: { id: true },
    });
    ids.set(airport.iata, row.id);
  }

  return ids;
}

async function seedCities(airportIds: Map<string, string>): Promise<void> {
  const byCity = new Map<string, AirportSeed[]>();
  for (const airport of AIRPORTS) {
    const key = `${airport.city}|${airport.country}`;
    const bucket = byCity.get(key);
    if (bucket) {
      bucket.push(airport);
    } else {
      byCity.set(key, [airport]);
    }
  }

  for (const [key, airports] of byCity) {
    const first = airports[0];
    if (!first) continue;

    // City codes reuse the primary airport's IATA where one exists; multi-airport
    // cities get their own code so search-by-city can fan out.
    const code = airports.length === 1 ? first.iata : `${first.city.slice(0, 2).toUpperCase()}X`;

    const city = await prisma.city.upsert({
      where: { code },
      update: { name: first.city, country: first.country, timezone: first.timezone },
      create: { code, name: first.city, country: first.country, timezone: first.timezone },
      select: { id: true },
    });

    for (const airport of airports) {
      const airportId = airportIds.get(airport.iata);
      if (!airportId) continue;
      await prisma.cityAirport.upsert({
        where: { cityId_airportId: { cityId: city.id, airportId } },
        update: { isPrimary: airport.iata === first.iata },
        create: { cityId: city.id, airportId, isPrimary: airport.iata === first.iata },
      });
    }

    void key;
  }
}

async function seedAirlinesAndLayouts(): Promise<{
  airlineIds: Map<string, string>;
  layoutIds: Map<string, string>;
}> {
  const airlineIds = new Map<string, string>();

  for (const airline of AIRLINES) {
    const row = await prisma.airline.upsert({
      where: { iataCode: airline.iata },
      update: { name: airline.name, icaoCode: airline.icao, numericCode: airline.numeric },
      create: {
        iataCode: airline.iata,
        icaoCode: airline.icao,
        numericCode: airline.numeric,
        name: airline.name,
      },
      select: { id: true },
    });
    airlineIds.set(airline.iata, row.id);
  }

  const layoutIds = new Map<string, string>();

  for (const layout of LAYOUTS) {
    // Layouts belong to an airline; the national carrier owns the fleet catalogue.
    const ownerId = airlineIds.get('OM');
    if (!ownerId) throw new Error('Owner airline OM is missing');

    // Prisma's Json column takes a plain JSON value; the layout is serialised so
    // the stored shape exactly matches what the seat-map code reads back.
    const cabins = JSON.parse(JSON.stringify(layout.cabins)) as Prisma.InputJsonValue;

    const row = await prisma.seatLayout.upsert({
      where: { airlineId_code: { airlineId: ownerId, code: layout.id } },
      update: {
        aircraftModel: layout.aircraftModel,
        configuration: layout.configuration,
        cabins,
      },
      create: {
        airlineId: ownerId,
        code: layout.id,
        aircraftModel: layout.aircraftModel,
        configuration: layout.configuration,
        cabins,
      },
      select: { id: true },
    });
    layoutIds.set(layout.id, row.id);
  }

  return { airlineIds, layoutIds };
}

async function seedFareClasses(airlineIds: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const [iata, airlineId] of airlineIds) {
    for (const fareClass of FARE_CLASSES) {
      const row = await prisma.fareClass.upsert({
        where: { airlineId_code: { airlineId, code: fareClass.code } },
        update: {
          cabin: fareClass.cabin,
          name: fareClass.name,
          tier: fareClass.tier,
          baggageAllowance: fareClass.baggage,
          cabinBaggage: fareClass.cabinBag,
          isChangeable: fareClass.changeable,
          isRefundable: fareClass.refundable,
          changeFee: fareClass.changeFee,
          cancelFee: fareClass.cancelFee,
          cancelPenaltyPct: fareClass.cancelPenaltyPct,
        },
        create: {
          airlineId,
          code: fareClass.code,
          cabin: fareClass.cabin,
          name: fareClass.name,
          tier: fareClass.tier,
          baggageAllowance: fareClass.baggage,
          cabinBaggage: fareClass.cabinBag,
          isChangeable: fareClass.changeable,
          isRefundable: fareClass.refundable,
          changeFee: fareClass.changeFee,
          cancelFee: fareClass.cancelFee,
          cancelPenaltyPct: fareClass.cancelPenaltyPct,
        },
        select: { id: true },
      });
      ids.set(`${iata}:${fareClass.code}`, row.id);
    }
  }

  return ids;
}

async function seedFlights(
  airportIds: Map<string, string>,
  airlineIds: Map<string, string>,
  layoutIds: Map<string, string>,
): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const aircraftRows: { id: string; layoutId: string; wide: boolean }[] = [];

  for (const [id, layoutId] of layoutIds) {
    const wide = id.startsWith('wide');
    const model = wide ? 'Boeing 787-9' : 'Boeing 737-800';
    const count = wide ? 6 : 12;

    for (let index = 1; index <= count; index += 1) {
      const registration = wide ? `JU-W${String(index).padStart(3, '0')}` : `JU-N${String(index).padStart(3, '0')}`;
      const row = await prisma.aircraft.upsert({
        where: { registration },
        update: { model, manufacturer: wide ? 'Boeing' : 'Boeing', seatLayoutId: layoutId },
        create: {
          registration,
          model,
          manufacturer: 'Boeing',
          seatLayoutId: layoutId,
        },
        select: { id: true },
      });
      aircraftRows.push({ id: row.id, layoutId, wide });
    }
  }

  // Rotate aircraft across flights so the same tail does not fly every leg.
  let aircraftCursor = 0;

  let flightsCreated = 0;

  for (let day = 0; day < SEED_DAYS; day += 1) {
    const dayStart = new Date(startOfToday.getTime() + day * 86_400_000);

    for (const route of ROUTES) {
      const originId = airportIds.get(route.origin);
      const destinationId = airportIds.get(route.destination);
      const airlineId = airlineIds.get(route.airline);
      if (!originId || !destinationId || !airlineId) continue;

      const layout = LAYOUTS.find((entry) => entry.aircraftModel === (route.wideBody ? 'Boeing 787-9' : 'Boeing 737-800'));
      if (!layout) continue;

      const seatsForLayout = seatNumbers(layout).length;

      for (const hour of DEPARTURE_HOURS) {
        // A deterministic spread avoids two flights on the same route at the same
        // minute while keeping the timetable stable across reseeds.
        const minute = (route.durationMinutes + hour * 7) % 60;
        const departureAt = new Date(
          dayStart.getTime() + hour * 3_600_000 + minute * 60_000,
        );
        const arrivalAt = new Date(departureAt.getTime() + route.durationMinutes * 60_000);

        if (arrivalAt.getTime() < Date.now()) continue;

        const flightNumber = `${route.airline}${String(100 + ROUTES.indexOf(route)).padStart(3, '0')}`;

        const existing = await prisma.flight.findFirst({
          where: { airlineId, flightNumber, departureAt },
          select: { id: true },
        });

        if (existing) continue;

        const aircraft = aircraftRows[aircraftCursor % aircraftRows.length];
        aircraftCursor += 1;

        const flight = await prisma.flight.create({
          data: {
            flightNumber,
            airlineId,
            aircraftId: aircraft?.id ?? null,
            originId,
            destinationId,
            departureAt,
            arrivalAt,
            durationMinutes: route.durationMinutes,
            status: 'SCHEDULED',
            provider: 'MOCK',
            seatLayoutId: layoutIds.get(layout.id) ?? null,
            seatsAvailable: seatsForLayout,
          },
          select: { id: true },
        });

        // A seasonal multiplier keeps prices from being flat across the calendar.
        const seasonality = 1 + (day % 14) * 0.015;

        for (const fareClass of FARE_CLASSES) {
          const fareClassId = await prisma.fareClass.findUnique({
            where: { airlineId_code: { airlineId, code: fareClass.code } },
            select: { id: true },
          });
          if (!fareClassId) continue;

          const base = Math.round(route.basePrice * fareClass.multiplier * seasonality);
          const taxes = Math.round(base * 0.11);

          await prisma.fare.create({
            data: {
              flightId: flight.id,
              fareClassId: fareClassId.id,
              basePrice: base,
              taxes,
              fees: 2_500,
              currency: 'USD',
              seatsAvailable: Math.max(1, Math.round(seatsForLayout / 12)),
            },
          });
        }

        const seatRows = buildSeatRows(layout, flight.id, route.basePrice);
        await prisma.seat.createMany({ data: seatRows });

        flightsCreated += 1;
      }
    }
  }

  console.log(`  flights created: ${flightsCreated}`);
}

/** Materialises every seat for a layout onto a specific flight. */
function buildSeatRows(
  layout: SeatLayout,
  flightId: string,
  basePrice: number,
): Prisma.SeatCreateManyInput[] {
  const rows: Prisma.SeatCreateManyInput[] = [];

  for (const cabin of layout.cabins) {
    for (const rowLayout of cabin.rows) {
      cabin.columns.forEach((column, index) => {
        if (rowLayout.missingColumns.includes(column)) return;

        const isBlocked = rowLayout.blockedColumns.includes(column);
        const hasSurcharge = rowLayout.surchargeColumns.includes(column);
        const isAisle = cabin.aisleAfter.includes(index) || cabin.aisleAfter.includes(index + 1);

        rows.push({
          id: randomUUID(),
          flightId,
          seatNumber: `${rowLayout.row}${column}`,
          row: rowLayout.row,
          column,
          cabin: cabin.cabin,
          position: isAisle
            ? 'AISLE'
            : index === 0 || index === cabin.columns.length - 1
              ? 'WINDOW'
              : 'MIDDLE',
          status: isBlocked ? 'BLOCKED' : 'AVAILABLE',
          // Surcharge is a flat premium plus a small share of the base fare for
          // business cabin, so pricing stays proportional to the route.
          surcharge: hasSurcharge
            ? rowLayout.surcharge
            : cabin.cabin === 'BUSINESS'
              ? Math.round(basePrice * 0.05)
              : 0,
          isExitRow: rowLayout.isExitRow,
          isBulkhead: rowLayout.isBulkhead,
          hasBassinet: rowLayout.hasBassinet && (column === 'A' || column === 'K' || column === 'F'),
        });
      });
    }
  }

  return rows;
}

async function seedPromoCodes(): Promise<void> {
  const now = new Date();
  const validUntil = new Date(now.getTime() + 365 * 86_400_000);

  const codes = [
    { code: 'WELCOME10', description: '10% off the base fare', discountType: 'PERCENTAGE', discountValue: 10, maxDiscountAmount: 50_000 },
    { code: 'MONGOOSE50', description: '50 USD off', discountType: 'FIXED_AMOUNT', discountValue: 5_000, maxDiscountAmount: null },
    { code: 'SUMMER2026', description: '15% off summer travel', discountType: 'PERCENTAGE', discountValue: 15, maxDiscountAmount: 80_000 },
  ] as const;

  for (const code of codes) {
    await prisma.promoCode.upsert({
      where: { code: code.code },
      update: {
        description: code.description,
        discountType: code.discountType,
        discountValue: code.discountValue,
        maxDiscountAmount: code.maxDiscountAmount,
        validUntil,
        isActive: true,
      },
      create: {
        code: code.code,
        description: code.description,
        discountType: code.discountType,
        discountValue: code.discountValue,
        maxDiscountAmount: code.maxDiscountAmount,
        validFrom: now,
        validUntil,
        currency: 'USD',
        minSpend: 0,
        maxRedemptions: null,
        maxRedemptionsPerUser: 1,
        isActive: true,
      },
    });
  }
}

async function seedTaxonomy(): Promise<void> {
  // Categories are matched by slug so re-running the seed never duplicates them.
  const categories = [
    { slug: 'seats', name: 'Seat selection', description: 'Preferred and extra-legroom seats', sortOrder: 1 },
    { slug: 'baggage', name: 'Baggage', description: 'Extra checked and cabin baggage', sortOrder: 2 },
    { slug: 'meals', name: 'Meals', description: 'Onboard meal options', sortOrder: 3 },
    { slug: 'insurance', name: 'Insurance', description: 'Travel and cancellation cover', sortOrder: 4 },
    { slug: 'lounge', name: 'Lounge access', description: 'Airport lounge passes', sortOrder: 5 },
  ] as const;

  const ids = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, sortOrder: category.sortOrder },
      create: category,
      select: { id: true },
    });
    ids.set(category.slug, row.id);
  }

  const products = [
    { sku: 'SEAT-XL', name: 'Extra legroom seat', description: 'Exit-row or bulkhead seat with more space', price: 4800, kind: 'SEAT', slug: 'seats' },
    { sku: 'SEAT-STD', name: 'Standard seat choice', description: 'Pick any available standard seat', price: 1500, kind: 'SEAT', slug: 'seats' },
    { sku: 'BAG-23', name: '23 kg checked bag', description: 'One additional 23 kg checked bag', price: 3500, kind: 'BAGGAGE', slug: 'baggage' },
    { sku: 'BAG-32', name: '32 kg checked bag', description: 'One additional 32 kg checked bag', price: 5500, kind: 'BAGGAGE', slug: 'baggage' },
    { sku: 'MEAL-VGML', name: 'Vegetarian meal', description: 'Special vegetarian meal', price: 1200, kind: 'MEAL', slug: 'meals' },
    { sku: 'MEAL-HLML', name: 'Halal meal', description: 'Special halal meal', price: 1200, kind: 'MEAL', slug: 'meals' },
    { sku: 'INS-TRAVEL', name: 'Travel insurance', description: 'Trip cancellation and medical cover', price: 2900, kind: 'INSURANCE', slug: 'insurance' },
    { sku: 'LOUNGE-PASS', name: 'Lounge pass', description: 'Single-visit airport lounge pass', price: 3900, kind: 'LOUNGE', slug: 'lounge' },
  ] as const;

  for (const product of products) {
    const categoryId = ids.get(product.slug);
    if (!categoryId) continue;

    const { slug: _slug, ...fields } = product;
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: { ...fields, categoryId },
      create: { ...fields, categoryId },
    });
  }

  console.log(`  categories: ${categories.length}, products: ${products.length}`);
}

async function seedDemoUsers(): Promise<void> {
  // Hashes are for the literal password `DemoPassword123!`, documented in README.
  // Seeding real credentials would be a deployment hazard, so this is dev-only.
  const users = [
    { email: 'admin@airline.local', role: 'ADMIN' as const, firstName: 'Ada', lastName: 'Admin' },
    { email: 'agent@airline.local', role: 'AGENT' as const, firstName: 'Grace', lastName: 'Agent' },
    { email: 'customer@airline.local', role: 'CUSTOMER' as const, firstName: 'Chris', lastName: 'Customer' },
  ];

  const hash = process.env.SEED_PASSWORD_HASH;
  if (!hash) {
    console.log('  skipping demo users: set SEED_PASSWORD_HASH to seed them');
    return;
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { role: user.role },
      create: {
        email: user.email,
        passwordHash: hash,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  }

  console.log(`  demo users: ${users.length}`);
}

export async function seed(): Promise<void> {
  console.log('Seeding reference data...');

  const airportIds = await seedAirports();
  console.log(`  airports: ${airportIds.size}`);

  await seedCities(airportIds);

  const { airlineIds, layoutIds } = await seedAirlinesAndLayouts();
  console.log(`  airlines: ${airlineIds.size}, layouts: ${layoutIds.size}`);

  const fareClassIds = await seedFareClasses(airlineIds);
  console.log(`  fare classes: ${fareClassIds.size}`);

  await seedFlights(airportIds, airlineIds, layoutIds);
  await seedPromoCodes();
  await seedTaxonomy();
  await seedDemoUsers();

  console.log('Seed complete.');
}

seed()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
