-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateEnum
CREATE TYPE "SeatPosition" AS ENUM ('WINDOW', 'MIDDLE', 'AISLE');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'TICKETED', 'CHECKED_IN', 'EXPIRED', 'CANCELLED', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "PassengerType" AS ENUM ('ADULT', 'CHILD', 'INFANT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'WALLET');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('PENDING', 'ISSUED', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'DELAYED', 'DEPARTED', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('MOCK', 'DUFFEL', 'AMADEUS');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "id" UUID NOT NULL,
    "iataCode" CHAR(3) NOT NULL,
    "icaoCode" CHAR(4),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "code" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_airports" (
    "cityId" UUID NOT NULL,
    "airportId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "city_airports_pkey" PRIMARY KEY ("cityId","airportId")
);

-- CreateTable
CREATE TABLE "airlines" (
    "id" UUID NOT NULL,
    "iataCode" CHAR(2) NOT NULL,
    "icaoCode" CHAR(3),
    "numericCode" CHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "cabinLayoutRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "airlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aircraft" (
    "id" UUID NOT NULL,
    "registration" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "seatLayoutId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_layouts" (
    "id" UUID NOT NULL,
    "airlineId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "aircraftModel" TEXT NOT NULL,
    "configuration" TEXT NOT NULL,
    "cabins" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" UUID NOT NULL,
    "flightNumber" VARCHAR(10) NOT NULL,
    "airlineId" UUID NOT NULL,
    "aircraftId" UUID,
    "originId" UUID NOT NULL,
    "destinationId" UUID NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "arrivalAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "provider" "ProviderKind" NOT NULL DEFAULT 'MOCK',
    "providerRef" TEXT,
    "providerData" JSONB,
    "seatLayoutId" UUID,
    "seatsAvailable" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_classes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "cabin" "CabinClass" NOT NULL,
    "name" TEXT NOT NULL,
    "airlineId" UUID NOT NULL,
    "baggageAllowance" TEXT NOT NULL,
    "cabinBaggage" TEXT NOT NULL,
    "isChangeable" BOOLEAN NOT NULL DEFAULT false,
    "isRefundable" BOOLEAN NOT NULL DEFAULT false,
    "changeFee" INTEGER NOT NULL DEFAULT 0,
    "cancelFee" INTEGER NOT NULL DEFAULT 0,
    "cancelPenaltyPct" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "fare_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fares" (
    "id" UUID NOT NULL,
    "flightId" UUID NOT NULL,
    "fareClassId" UUID NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "seatsAvailable" INTEGER NOT NULL,
    "allowWaitlist" BOOLEAN NOT NULL DEFAULT false,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" UUID NOT NULL,
    "flightId" UUID NOT NULL,
    "seatNumber" VARCHAR(4) NOT NULL,
    "row" INTEGER NOT NULL,
    "column" CHAR(1) NOT NULL,
    "cabin" "CabinClass" NOT NULL,
    "position" "SeatPosition" NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "surcharge" INTEGER NOT NULL DEFAULT 0,
    "isExitRow" BOOLEAN NOT NULL DEFAULT false,
    "isBulkhead" BOOLEAN NOT NULL DEFAULT false,
    "hasBassinet" BOOLEAN NOT NULL DEFAULT false,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seatLayoutId" UUID,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "pnr" VARCHAR(6) NOT NULL,
    "id" UUID NOT NULL,
    "userId" UUID,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "baseFare" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "contactEmail" CITEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "ticketedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "promoCodeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("pnr")
);

-- CreateTable
CREATE TABLE "booking_segments" (
    "id" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "flightId" UUID NOT NULL,
    "fareId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "baseFare" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "fareBasisCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "PassengerType" NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "passportNumberEnc" TEXT,
    "passportLast4" VARCHAR(4),
    "passportExpiry" DATE,
    "passportIssuingCountry" CHAR(3),
    "nationality" CHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_seats" (
    "id" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "segmentId" UUID NOT NULL,
    "passengerId" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_ACTION',
    "method" "PaymentMethod" NOT NULL DEFAULT 'CARD',
    "provider" "ProviderKind" NOT NULL DEFAULT 'MOCK',
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "rawPayload" JSONB,
    "cardSummary" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "providerRef" TEXT,
    "requestedById" UUID,
    "approvedById" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "segmentId" UUID NOT NULL,
    "passengerId" UUID NOT NULL,
    "ticketNumber" VARCHAR(13) NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "pdfKey" TEXT,
    "qrPayload" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" BIGSERIAL NOT NULL,
    "bookingPnr" VARCHAR(6) NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" UUID,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "appliesToBaseFareOnly" BOOLEAN NOT NULL DEFAULT true,
    "maxDiscountAmount" INTEGER,
    "currency" CHAR(3),
    "minSpend" INTEGER NOT NULL DEFAULT 0,
    "maxRedemptions" INTEGER,
    "maxRedemptionsPerUser" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "cabinRestrictions" "CabinClass"[],
    "originRestrictions" CHAR(3)[],
    "destinationRestrictions" CHAR(3)[],
    "minStayDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_airlines" (
    "promoCodeId" UUID NOT NULL,
    "airlineId" UUID NOT NULL,

    CONSTRAINT "promo_code_airlines_pkey" PRIMARY KEY ("promoCodeId","airlineId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" UUID,
    "actorType" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "ProviderKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_deletedAt_idx" ON "users"("role", "deletedAt");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_revokedAt_idx" ON "refresh_tokens"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "airports_iataCode_key" ON "airports"("iataCode");

-- CreateIndex
CREATE UNIQUE INDEX "airports_icaoCode_key" ON "airports"("icaoCode");

-- CreateIndex
CREATE INDEX "airports_city_idx" ON "airports"("city");

-- CreateIndex
CREATE INDEX "airports_country_isActive_idx" ON "airports"("country", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cities_code_key" ON "cities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "airlines_iataCode_key" ON "airlines"("iataCode");

-- CreateIndex
CREATE UNIQUE INDEX "airlines_icaoCode_key" ON "airlines"("icaoCode");

-- CreateIndex
CREATE UNIQUE INDEX "airlines_numericCode_key" ON "airlines"("numericCode");

-- CreateIndex
CREATE INDEX "airlines_name_idx" ON "airlines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "aircraft_registration_key" ON "aircraft"("registration");

-- CreateIndex
CREATE INDEX "aircraft_model_idx" ON "aircraft"("model");

-- CreateIndex
CREATE INDEX "seat_layouts_aircraftModel_idx" ON "seat_layouts"("aircraftModel");

-- CreateIndex
CREATE UNIQUE INDEX "seat_layouts_airlineId_code_key" ON "seat_layouts"("airlineId", "code");

-- CreateIndex
CREATE INDEX "flights_originId_destinationId_departureAt_idx" ON "flights"("originId", "destinationId", "departureAt");

-- CreateIndex
CREATE INDEX "flights_departureAt_status_idx" ON "flights"("departureAt", "status");

-- CreateIndex
CREATE INDEX "flights_airlineId_flightNumber_departureAt_idx" ON "flights"("airlineId", "flightNumber", "departureAt");

-- CreateIndex
CREATE INDEX "flights_provider_providerRef_idx" ON "flights"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "flights_arrivalAt_idx" ON "flights"("arrivalAt");

-- CreateIndex
CREATE INDEX "fare_classes_cabin_idx" ON "fare_classes"("cabin");

-- CreateIndex
CREATE UNIQUE INDEX "fare_classes_airlineId_code_key" ON "fare_classes"("airlineId", "code");

-- CreateIndex
CREATE INDEX "fares_flightId_seatsAvailable_idx" ON "fares"("flightId", "seatsAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "fares_flightId_fareClassId_key" ON "fares"("flightId", "fareClassId");

-- CreateIndex
CREATE INDEX "seats_flightId_status_idx" ON "seats"("flightId", "status");

-- CreateIndex
CREATE INDEX "seats_status_holdExpiresAt_idx" ON "seats"("status", "holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "seats_flightId_seatNumber_key" ON "seats"("flightId", "seatNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_id_key" ON "bookings"("id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bookings_userId_status_idx" ON "bookings"("userId", "status");

-- CreateIndex
CREATE INDEX "bookings_status_expiresAt_idx" ON "bookings"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "bookings_contactEmail_idx" ON "bookings"("contactEmail");

-- CreateIndex
CREATE INDEX "bookings_createdAt_idx" ON "bookings"("createdAt");

-- CreateIndex
CREATE INDEX "booking_segments_flightId_idx" ON "booking_segments"("flightId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_segments_bookingPnr_sequence_key" ON "booking_segments"("bookingPnr", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_bookingPnr_sequence_key" ON "passengers"("bookingPnr", "sequence");

-- CreateIndex
CREATE INDEX "booking_seats_bookingPnr_idx" ON "booking_seats"("bookingPnr");

-- CreateIndex
CREATE UNIQUE INDEX "booking_seats_segmentId_passengerId_key" ON "booking_seats"("segmentId", "passengerId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_seats_segmentId_seatId_key" ON "booking_seats"("segmentId", "seatId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_bookingPnr_status_idx" ON "payments"("bookingPnr", "status");

-- CreateIndex
CREATE INDEX "payments_provider_providerRef_idx" ON "payments"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX "refunds_bookingPnr_status_idx" ON "refunds"("bookingPnr", "status");

-- CreateIndex
CREATE INDEX "refunds_status_requestedAt_idx" ON "refunds"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_bookingPnr_status_idx" ON "tickets"("bookingPnr", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_segmentId_passengerId_key" ON "tickets"("segmentId", "passengerId");

-- CreateIndex
CREATE INDEX "booking_events_bookingPnr_createdAt_idx" ON "booking_events"("bookingPnr", "createdAt");

-- CreateIndex
CREATE INDEX "booking_events_toStatus_createdAt_idx" ON "booking_events"("toStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_isActive_validUntil_idx" ON "promo_codes"("isActive", "validUntil");

-- CreateIndex
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_createdAt_idx" ON "audit_logs"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_processedAt_createdAt_idx" ON "webhook_events"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_externalId_key" ON "webhook_events"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_airports" ADD CONSTRAINT "city_airports_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_airports" ADD CONSTRAINT "city_airports_airportId_fkey" FOREIGN KEY ("airportId") REFERENCES "airports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aircraft" ADD CONSTRAINT "aircraft_seatLayoutId_fkey" FOREIGN KEY ("seatLayoutId") REFERENCES "seat_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_layouts" ADD CONSTRAINT "seat_layouts_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "aircraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_originId_fkey" FOREIGN KEY ("originId") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_seatLayoutId_fkey" FOREIGN KEY ("seatLayoutId") REFERENCES "seat_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_classes" ADD CONSTRAINT "fare_classes_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fares" ADD CONSTRAINT "fares_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fares" ADD CONSTRAINT "fares_fareClassId_fkey" FOREIGN KEY ("fareClassId") REFERENCES "fare_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_seatLayoutId_fkey" FOREIGN KEY ("seatLayoutId") REFERENCES "seat_layouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_segments" ADD CONSTRAINT "booking_segments_fareId_fkey" FOREIGN KEY ("fareId") REFERENCES "fares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "booking_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "booking_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_bookingPnr_fkey" FOREIGN KEY ("bookingPnr") REFERENCES "bookings"("pnr") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_airlines" ADD CONSTRAINT "promo_code_airlines_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_airlines" ADD CONSTRAINT "promo_code_airlines_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "airlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
