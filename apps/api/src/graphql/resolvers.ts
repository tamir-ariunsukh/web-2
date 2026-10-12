import {
  BookingStatus,
  CorsairError,
  ErrorCode,
  flightSearchSchema,
  createBookingSchema,
  updateBookingContactSchema,
  registerSchema,
  loginSchema,
  mockPaymentOutcomeSchema,
  isCorsairError,
  type FlightSearchInput,
  type RegisterInput,
  type LoginInput,
} from '@repo/shared';
import { GraphQLError, GraphQLScalarType, Kind  } from 'graphql';



import {
  adminStats,
  deleteCategory,
  deleteProduct,
  issueTicket,
  listBookings,
  listCategories,
  listProducts,
  listTickets,
  listUsers,
  salesReport,
  setUserRole,
  unlockUser,
  upsertCategory,
  upsertProduct,
  voidTicket,
} from '../modules/admin/admin-service.js';
import { login, register, refreshSession, logout } from '../modules/auth/auth-service.js';
import { createBooking, selectSeats, transitionBooking, cancelBooking, updateBookingContact } from '../modules/booking/booking-service.js';
import { requireUser, isPrivileged } from '../modules/context.js';
import { searchFlights } from '../modules/flights/search-service.js';
import {
  createPaymentIntent,
  simulatePayment,
  requestRefund,
  checkIn,
} from '../modules/payment/payment-service.js';
import { buildSeatMap } from '../modules/seats/seat-map-service.js';

import type { GraphQLContext } from '../modules/context.js';
import type { FareRow } from '../modules/loaders.js';


/**
 * Resolvers.
 *
 * Thin by design: validation and business rules live in the service modules and
 * in @repo/shared. Each resolver's only job is to translate GraphQL arguments
 * into a service call and map domain errors onto GraphQL errors with a stable
 * `extensions.code`.
 */

function fail(error: unknown): never {
  if (isCorsairError(error)) {
    throw new GraphQLError(error.message, {
      extensions: {
        code: error.code,
        ...(error.expose && error.details ? { details: error.details } : {}),
      },
    });
  }
  throw error;
}

// ── Scalars ──────────────────────────────────────────────────

const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'An ISO-8601 UTC timestamp.',
  serialize: (value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    throw new GraphQLError('DateTime cannot represent this value');
  },
  parseValue: (value) => {
    if (typeof value !== 'string') throw new GraphQLError('DateTime must be a string');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError('Invalid ISO-8601 timestamp');
    return date;
  },
  parseLiteral: (node) => {
    if (node.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string');
    const date = new Date(node.value);
    if (Number.isNaN(date.getTime())) throw new GraphQLError('Invalid ISO-8601 timestamp');
    return date;
  },
});

const DateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'A calendar date without a time zone, `YYYY-MM-DD`.',
  serialize: (value) => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    throw new GraphQLError('Date cannot represent this value');
  },
  parseValue: (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new GraphQLError('Date must be YYYY-MM-DD');
    }
    return value;
  },
  parseLiteral: (node) => {
    if (node.kind !== Kind.STRING) throw new GraphQLError('Date must be a string');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(node.value)) throw new GraphQLError('Date must be YYYY-MM-DD');
    return node.value;
  },
});

const TimeScalar = new GraphQLScalarType({
  name: 'Time',
  description: 'A wall-clock time, `HH:mm`.',
  serialize: (value) => String(value),
  parseValue: (value) => {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      throw new GraphQLError('Time must be HH:mm');
    }
    return value;
  },
  parseLiteral: (node) => {
    if (node.kind !== Kind.STRING || !/^([01]\d|2[0-3]):[0-5]\d$/.test(node.value)) {
      throw new GraphQLError('Time must be HH:mm');
    }
    return node.value;
  },
});

const MoneyScalar = new GraphQLScalarType({
  name: 'Money',
  description: 'An integer amount in minor units (cents).',
  serialize: (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new GraphQLError('Money must be an integer in minor units');
    }
    return value;
  },
  parseValue: (value) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new GraphQLError('Money must be an integer in minor units');
    }
    return value;
  },
  parseLiteral: (node) => {
    if (node.kind !== Kind.INT) throw new GraphQLError('Money must be an integer');
    return Number.parseInt(node.value, 10);
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,
  Date: DateScalar,
  Time: TimeScalar,
  Money: MoneyScalar,

  Query: {
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const user = requireUser(context);
      return context.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });
    },

    searchFlights: async (
      _parent: unknown,
      args: { input: FlightSearchInput },
      context: GraphQLContext,
    ) => {
      const parsed = flightSearchSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError('Invalid flight search', {
          extensions: {
            code: ErrorCode.VALIDATION_FAILED,
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }
      try {
        return await searchFlights(context, parsed.data);
      } catch (error) {
        fail(error);
      }
    },

    flight: async (_parent: unknown, args: { id: string }, context: GraphQLContext) =>
      context.prisma.flight.findUnique({ where: { id: args.id } }),

    seatMap: async (
      _parent: unknown,
      args: { flightId: string; cabin?: string },
      context: GraphQLContext,
    ) => {
      try {
        return await buildSeatMap(context, args.flightId, args.cabin);
      } catch (error) {
        fail(error);
      }
    },

    booking: async (_parent: unknown, args: { pnr: string }, context: GraphQLContext) => {
      const booking = await context.prisma.booking.findUnique({ where: { pnr: args.pnr } });
      if (!booking) return null;

      assertCanReadBooking(context, booking.userId);
      return booking;
    },

    myBookings: async (
      _parent: unknown,
      args: { status?: BookingStatus },
      context: GraphQLContext,
    ) => {
      const user = requireUser(context);
      return context.prisma.booking.findMany({
        where: {
          userId: user.id,
          ...(args.status ? { status: args.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },

    bookingEvents: async (_parent: unknown, args: { pnr: string }, context: GraphQLContext) => {
      const booking = await context.prisma.booking.findUnique({
        where: { pnr: args.pnr },
        select: { userId: true },
      });
      if (!booking) throw CorsairError.notFound('Booking', args.pnr);

      assertCanReadBooking(context, booking.userId, { allowPrivileged: true });
      return context.prisma.bookingEvent.findMany({
        where: { bookingPnr: args.pnr },
        orderBy: { createdAt: 'asc' },
      });
    },

    airports: async (_parent: unknown, args: { query: string }, context: GraphQLContext) =>
      context.prisma.airport.findMany({
        where: {
          isActive: true,
          OR: [
            { iataCode: { equals: args.query.toUpperCase() } },
            { city: { contains: args.query, mode: 'insensitive' } },
            { name: { contains: args.query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),

    airlines: async (_parent: unknown, _args: unknown, context: GraphQLContext) =>
      context.prisma.airline.findMany({ where: { isActive: true }, take: 100 }),

    // ── Admin: every entry point re-checks the role in the service layer ──
    adminStats: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      try {
        return await adminStats(context);
      } catch (error) {
        fail(error);
      }
    },

    adminUsers: async (
      _parent: unknown,
      args: { search?: string; role?: string; page?: number },
      context: GraphQLContext,
    ) => {
      try {
        return await listUsers(context, args);
      } catch (error) {
        fail(error);
      }
    },

    adminBookings: async (
      _parent: unknown,
      args: { status?: string; search?: string; page?: number },
      context: GraphQLContext,
    ) => {
      try {
        return await listBookings(context, args);
      } catch (error) {
        fail(error);
      }
    },

    adminTickets: async (
      _parent: unknown,
      args: { status?: string; search?: string; page?: number },
      context: GraphQLContext,
    ) => {
      try {
        return await listTickets(context, args);
      } catch (error) {
        fail(error);
      }
    },

    categories: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      try {
        return await listCategories(context);
      } catch (error) {
        fail(error);
      }
    },

    products: async (
      _parent: unknown,
      args: { categoryId?: string },
      context: GraphQLContext,
    ) => {
      try {
        return await listProducts(context, args);
      } catch (error) {
        fail(error);
      }
    },

    salesReport: async (
      _parent: unknown,
      args: { days?: number },
      context: GraphQLContext,
    ) => {
      try {
        return await salesReport(context, args);
      } catch (error) {
        fail(error);
      }
    },
  },

  Mutation: {
    register: async (_parent: unknown, args: { input: RegisterInput }, context: GraphQLContext) => {
      const parsed = registerSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError('Invalid registration', {
          extensions: {
            code: ErrorCode.VALIDATION_FAILED,
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }
      try {
        return await register(context, parsed.data);
      } catch (error) {
        fail(error);
      }
    },

    login: async (_parent: unknown, args: { input: LoginInput }, context: GraphQLContext) => {
      const parsed = loginSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError('Invalid credentials payload', {
          extensions: { code: ErrorCode.VALIDATION_FAILED },
        });
      }
      try {
        return await login(context, parsed.data);
      } catch (error) {
        fail(error);
      }
    },

    refreshToken: async (
      _parent: unknown,
      args: { refreshToken: string },
      context: GraphQLContext,
    ) => {
      try {
        return await refreshSession(context, args.refreshToken);
      } catch (error) {
        fail(error);
      }
    },

    logout: async (_parent: unknown, args: { refreshToken: string }, context: GraphQLContext) => {
      try {
        await logout(context, args.refreshToken);
        return true;
      } catch (error) {
        fail(error);
      }
    },

    createBooking: async (_parent: unknown, args: { input: unknown }, context: GraphQLContext) => {
      const parsed = createBookingSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError('Invalid booking', {
          extensions: {
            code: ErrorCode.VALIDATION_FAILED,
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }
      try {
        const pnr = await createBooking(context, parsed.data);
        return context.prisma.booking.findUnique({ where: { pnr } });
      } catch (error) {
        fail(error);
      }
    },

    updateBookingContact: async (
      _parent: unknown,
      args: { input: unknown },
      context: GraphQLContext,
    ) => {
      const parsed = updateBookingContactSchema.safeParse(args.input);
      if (!parsed.success) {
        throw new GraphQLError('Invalid contact details', {
          extensions: {
            code: ErrorCode.VALIDATION_FAILED,
            details: parsed.error.flatten().fieldErrors,
          },
        });
      }
      try {
        const { pnr, ...update } = parsed.data;
        await updateBookingContact(context, pnr, update);
        return context.prisma.booking.findUnique({ where: { pnr } });
      } catch (error) {
        fail(error);
      }
    },

    selectSeats: async (
      _parent: unknown,
      args: { pnr: string; selections: Parameters<typeof selectSeats>[2] },
      context: GraphQLContext,
    ) => {
      try {
        await selectSeats(context, args.pnr, args.selections);
        return context.prisma.booking.findUnique({ where: { pnr: args.pnr } });
      } catch (error) {
        fail(error);
      }
    },

    confirmBooking: async (_parent: unknown, args: { pnr: string }, context: GraphQLContext) => {
      try {
        await transitionBooking(context.prisma, args.pnr, BookingStatus.PENDING_PAYMENT, {
          actorType: context.user ? 'customer' : 'system',
          actorId: context.user?.id,
          privileged: isPrivileged(context),
        });
        return context.prisma.booking.findUnique({ where: { pnr: args.pnr } });
      } catch (error) {
        fail(error);
      }
    },

    cancelBooking: async (
      _parent: unknown,
      args: { pnr: string; reason?: string },
      context: GraphQLContext,
    ) => {
      try {
        await cancelBooking(context, args.pnr, args.reason);
        return context.prisma.booking.findUnique({ where: { pnr: args.pnr } });
      } catch (error) {
        fail(error);
      }
    },

    createPaymentIntent: async (
      _parent: unknown,
      args: { pnr: string },
      context: GraphQLContext,
    ) => {
      try {
        return await createPaymentIntent(context, args.pnr);
      } catch (error) {
        fail(error);
      }
    },

    simulatePayment: async (
      _parent: unknown,
      args: { paymentId: string; outcome: string },
      context: GraphQLContext,
    ) => {
      const outcome = mockPaymentOutcomeSchema.safeParse(args.outcome);
      if (!outcome.success) {
        throw new GraphQLError('Unknown mock outcome', {
          extensions: { code: ErrorCode.VALIDATION_FAILED },
        });
      }
      try {
        return await simulatePayment(context, args.paymentId, outcome.data);
      } catch (error) {
        fail(error);
      }
    },

    requestRefund: async (
      _parent: unknown,
      args: { pnr: string; reason?: string; amount?: number },
      context: GraphQLContext,
    ) => {
      try {
        return await requestRefund(context, args.pnr, args.reason, args.amount);
      } catch (error) {
        fail(error);
      }
    },

    checkIn: async (
      _parent: unknown,
      args: { pnr: string; passengerId: string },
      context: GraphQLContext,
    ) => {
      try {
        return await checkIn(context, args.pnr, args.passengerId);
      } catch (error) {
        fail(error);
      }
    },

    // ── Admin ──
    setUserRole: async (
      _parent: unknown,
      args: { userId: string; role: string },
      context: GraphQLContext,
    ) => {
      try {
        return await setUserRole(context, args.userId, args.role);
      } catch (error) {
        fail(error);
      }
    },

    unlockUser: async (_parent: unknown, args: { userId: string }, context: GraphQLContext) => {
      try {
        return await unlockUser(context, args.userId);
      } catch (error) {
        fail(error);
      }
    },

    issueTicket: async (
      _parent: unknown,
      args: {
        input: {
          bookingPnr: string;
          segmentId: string;
          passengerId: string;
          ticketNumber: string;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        return await issueTicket(context, args.input);
      } catch (error) {
        fail(error);
      }
    },

    voidTicket: async (_parent: unknown, args: { ticketId: string }, context: GraphQLContext) => {
      try {
        return await voidTicket(context, args.ticketId);
      } catch (error) {
        fail(error);
      }
    },

    upsertCategory: async (
      _parent: unknown,
      args: { input: Parameters<typeof upsertCategory>[1] },
      context: GraphQLContext,
    ) => {
      try {
        return await upsertCategory(context, args.input);
      } catch (error) {
        fail(error);
      }
    },

    deleteCategory: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        return await deleteCategory(context, args.id);
      } catch (error) {
        fail(error);
      }
    },

    upsertProduct: async (
      _parent: unknown,
      args: { input: Parameters<typeof upsertProduct>[1] },
      context: GraphQLContext,
    ) => {
      try {
        return await upsertProduct(context, args.input);
      } catch (error) {
        fail(error);
      }
    },

    deleteProduct: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      try {
        return await deleteProduct(context, args.id);
      } catch (error) {
        fail(error);
      }
    },
  },

  Booking: {
    price: (booking: {
      baseFare: number;
      taxes: number;
      fees: number;
      discount: number;
      total: number;
      currency: string;
    }) => ({
      baseFare: booking.baseFare,
      taxes: booking.taxes,
      fees: booking.fees,
      discount: booking.discount,
      total: booking.total,
      currency: booking.currency,
    }),

    segments: (booking: { pnr: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.segmentsByBookingPnr.load(booking.pnr),

    passengers: (booking: { pnr: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.passengersByBookingPnr.load(booking.pnr),

    payments: (booking: { pnr: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.paymentsByBookingPnr.load(booking.pnr),

    tickets: (booking: { pnr: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.ticketsByBookingPnr.load(booking.pnr),
  },

  BookingSegment: {
    flight: (segment: { flightId: string }, _args: unknown, context: GraphQLContext) =>
      context.prisma.flight.findUnique({ where: { id: segment.flightId } }),

    fare: (segment: { fareId: string }, _args: unknown, context: GraphQLContext) =>
      context.prisma.fare.findUnique({ where: { id: segment.fareId } }),

    assignedSeats: (segment: { id: string }, _args: unknown, context: GraphQLContext) =>
      context.prisma.seat.findMany({
        where: { bookingSeats: { some: { segmentId: segment.id } } },
      }),
  },

  Flight: {
    airline: (flight: { airlineId: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.airlineById.load(flight.airlineId),

    origin: (flight: { originId: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.airportById.load(flight.originId),

    destination: (flight: { destinationId: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.airportById.load(flight.destinationId),

    // The local catalogue models single-leg flights, so stop count is always 0.
    stops: () => 0,

    fares: (flight: { id: string }, args: { cabin?: string }, context: GraphQLContext) =>
      context.loaders.faresByFlightId
        .load(flight.id)
        .then((fares: FareRow[]) =>
          args.cabin ? fares.filter((fare) => fare.fareClass.cabin === args.cabin) : fares,
        ),

    lowestFare: (flight: { id: string }, _args: unknown, context: GraphQLContext) =>
      context.loaders.faresByFlightId.load(flight.id).then((fares: FareRow[]) => {
        let cheapest: FareRow | null = null;
        for (const fare of fares) {
          if (cheapest === null) {
            cheapest = fare;
            continue;
          }
          const fareTotal = fare.basePrice + fare.taxes + fare.fees;
          const cheapestTotal = cheapest.basePrice + cheapest.taxes + cheapest.fees;
          if (fareTotal < cheapestTotal) cheapest = fare;
        }
        return cheapest;
      }),
  },

  Fare: {
    total: (fare: { basePrice: number; taxes: number; fees: number }) =>
      fare.basePrice + fare.taxes + fare.fees,
  },
};

/** Booking reads are owner-only, with an escape hatch for staff. */
function assertCanReadBooking(
  context: GraphQLContext,
  ownerId: string | null,
  options: { readonly allowPrivileged?: boolean } = {},
): void {
  if (options.allowPrivileged && isPrivileged(context)) return;

  // A guest booking has no owner; the PNR itself is the credential.
  if (ownerId === null) return;

  if (context.user?.id !== ownerId) {
    throw new GraphQLError('You do not have access to this booking', {
      extensions: { code: ErrorCode.FORBIDDEN },
    });
  }
}
