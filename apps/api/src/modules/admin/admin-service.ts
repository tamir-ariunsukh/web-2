import { BookingStatus, CorsairError, ErrorCode } from '@repo/shared';

import { requireRole } from '../context.js';

import type { GraphQLContext } from '../context.js';

/**
 * Admin operations.
 *
 * Every entry point calls `requireRole` first: authorisation is never inferred
 * from the fact that a resolver was reached, so a new query cannot accidentally
 * ship unguarded.
 */

/** Writes a staff action to the audit log. `diff` carries the change detail. */
async function audit(
  context: GraphQLContext,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  await context.prisma.auditLog.create({
    data: {
      actorId,
      actorType: 'staff',
      actorEmail: context.user?.email ?? null,
      action,
      entity,
      entityId,
      ...(diff ? { diff: diff as never } : {}),
      requestId: context.requestId,
    },
  });
}

/** Rows per page for the admin tables. */
const PAGE_SIZE = 25;

export interface AdminStats {
  readonly users: number;
  readonly bookings: number;
  readonly confirmedBookings: number;
  readonly cancelledBookings: number;
  readonly ticketsIssued: number;
  readonly revenueMinor: number;
  readonly currency: string;
  readonly pendingRefunds: number;
  readonly flightsToday: number;
}

export async function adminStats(context: GraphQLContext): Promise<AdminStats> {
  requireRole(context, 'ADMIN', 'AGENT');
  const { prisma } = context;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const [
    users,
    bookings,
    confirmedBookings,
    cancelledBookings,
    ticketsIssued,
    pendingRefunds,
    flightsToday,
    settled,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
    prisma.booking.count({ where: { status: BookingStatus.CANCELLED } }),
    prisma.ticket.count({ where: { status: 'ISSUED' } }),
    prisma.refund.count({ where: { status: 'REQUESTED' } }),
    prisma.flight.count({ where: { departureAt: { gte: startOfDay, lt: endOfDay } } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
  ]);

  return {
    users,
    bookings,
    confirmedBookings,
    cancelledBookings,
    ticketsIssued,
    revenueMinor: settled._sum.amount ?? 0,
    currency: 'USD',
    pendingRefunds,
    flightsToday,
  };
}

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly role: string;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
  readonly lockedUntil: Date | null;
  readonly bookingCount: number;
}

export async function listUsers(
  context: GraphQLContext,
  options: { search?: string | undefined; role?: string | undefined; page?: number | undefined },
): Promise<readonly AdminUser[]> {
  requireRole(context, 'ADMIN');

  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim();

  const users = await context.prisma.user.findMany({
    where: {
      deletedAt: null,
      ...(options.role ? { role: options.role as never } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      lockedUntil: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return users.map(({ _count, ...user }) => ({ ...user, bookingCount: _count.bookings }));
}

/** Changes a user's role. An admin cannot demote their own account. */
export async function setUserRole(
  context: GraphQLContext,
  userId: string,
  role: string,
): Promise<AdminUser> {
  const actor = requireRole(context, 'ADMIN');

  if (actor.id === userId) {
    throw new CorsairError(ErrorCode.VALIDATION_FAILED, 'You cannot change your own role');
  }

  const target = await context.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!target) throw CorsairError.notFound('User', userId);

  await context.prisma.user.update({
    where: { id: userId },
    data: { role: role as never },
  });

  // Role changes are security-relevant, so they are recorded.
  await audit(context, actor.id, 'user.role_changed', 'User', userId, { role });

  context.logger.info({ actorId: actor.id, userId, role }, 'user role changed');

  const updated = await context.prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      lockedUntil: true,
      _count: { select: { bookings: true } },
    },
  });

  const { _count, ...rest } = updated;
  return { ...rest, bookingCount: _count.bookings };
}

/** Unlocks an account that was locked by failed logins. */
export async function unlockUser(context: GraphQLContext, userId: string): Promise<boolean> {
  const actor = requireRole(context, 'ADMIN');

  await context.prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  await audit(context, actor.id, 'user.unlocked', 'User', userId);

  return true;
}

export interface AdminBooking {
  readonly pnr: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly contactEmail: string;
  readonly passengerCount: number;
  readonly currency: string;
  readonly totalMinor: number;
  readonly ownerEmail: string | null;
}

export async function listBookings(
  context: GraphQLContext,
  options: { status?: string | undefined; search?: string | undefined; page?: number | undefined },
): Promise<readonly AdminBooking[]> {
  requireRole(context, 'ADMIN', 'AGENT');

  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim().toUpperCase();

  const bookings = await context.prisma.booking.findMany({
    where: {
      ...(options.status ? { status: options.status as never } : {}),
      ...(search ? { pnr: { contains: search } } : {}),
    },
    select: {
      pnr: true,
      status: true,
      createdAt: true,
      contactEmail: true,
      currency: true,
      user: { select: { email: true } },
      _count: { select: { passengers: true } },
      segments: {
        select: { baseFare: true, taxes: true, fees: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return bookings.map((booking) => ({
    pnr: booking.pnr,
    status: booking.status,
    createdAt: booking.createdAt,
    contactEmail: booking.contactEmail,
    passengerCount: booking._count.passengers,
    currency: booking.currency,
    totalMinor: booking.segments.reduce(
      (sum, segment) => sum + segment.baseFare + segment.taxes + segment.fees,
      0,
    ),
    ownerEmail: booking.user?.email ?? null,
  }));
}

export interface AdminTicket {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly bookingPnr: string;
  readonly passengerName: string;
  readonly issuedAt: Date | null;
  readonly createdAt: Date;
}

const TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  status: true,
  bookingPnr: true,
  issuedAt: true,
  createdAt: true,
  passenger: { select: { firstName: true, lastName: true } },
} as const;

function toAdminTicket(ticket: {
  id: string;
  ticketNumber: string;
  status: string;
  bookingPnr: string;
  issuedAt: Date | null;
  createdAt: Date;
  passenger: { firstName: string; lastName: string };
}): AdminTicket {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    bookingPnr: ticket.bookingPnr,
    passengerName: `${ticket.passenger.firstName} ${ticket.passenger.lastName}`,
    issuedAt: ticket.issuedAt,
    createdAt: ticket.createdAt,
  };
}

export async function listTickets(
  context: GraphQLContext,
  options: { status?: string | undefined; search?: string | undefined; page?: number | undefined },
): Promise<readonly AdminTicket[]> {
  requireRole(context, 'ADMIN', 'AGENT');

  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim();

  const tickets = await context.prisma.ticket.findMany({
    where: {
      ...(options.status ? { status: options.status as never } : {}),
      ...(search
        ? {
            OR: [
              { ticketNumber: { contains: search } },
              { bookingPnr: { contains: search.toUpperCase() } },
            ],
          }
        : {}),
    },
    select: TICKET_SELECT,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return tickets.map(toAdminTicket);
}

/**
 * Manually issues a ticket for a booking segment and passenger pair.
 *
 * The API normally issues tickets from the payment webhook; this exists so an
 * agent can recover a booking whose ticketing job failed.
 */
export async function issueTicket(
  context: GraphQLContext,
  input: { bookingPnr: string; segmentId: string; passengerId: string; ticketNumber: string },
): Promise<AdminTicket> {
  const actor = requireRole(context, 'ADMIN', 'AGENT');

  const booking = await context.prisma.booking.findUnique({
    where: { pnr: input.bookingPnr.toUpperCase() },
    select: { pnr: true },
  });
  if (!booking) throw CorsairError.notFound('Booking', input.bookingPnr);

  const existing = await context.prisma.ticket.findFirst({
    where: { segmentId: input.segmentId, passengerId: input.passengerId },
    select: { id: true },
  });

  const data = {
    ticketNumber: input.ticketNumber,
    status: 'ISSUED' as const,
    issuedAt: new Date(),
  };

  const ticket = existing
    ? await context.prisma.ticket.update({
        where: { id: existing.id },
        data,
        select: TICKET_SELECT,
      })
    : await context.prisma.ticket.create({
        data: {
          bookingPnr: booking.pnr,
          segmentId: input.segmentId,
          passengerId: input.passengerId,
          ...data,
        },
        select: TICKET_SELECT,
      });

  await audit(context, actor.id, 'ticket.issued_manually', 'Ticket', ticket.id, {
    bookingPnr: booking.pnr,
    ticketNumber: input.ticketNumber,
  });

  return toAdminTicket(ticket);
}

export async function voidTicket(context: GraphQLContext, ticketId: string): Promise<boolean> {
  const actor = requireRole(context, 'ADMIN');

  const ticket = await context.prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!ticket) throw CorsairError.notFound('Ticket', ticketId);

  await context.prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'VOIDED', voidedAt: new Date() },
  });

  await audit(context, actor.id, 'ticket.voided', 'Ticket', ticketId);

  return true;
}

export interface CategoryNode {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly productCount: number;
}

const CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
  _count: { select: { products: true } },
} as const;

function toCategory(category: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number };
}): CategoryNode {
  const { _count, ...rest } = category;
  return { ...rest, productCount: _count.products };
}

export async function listCategories(context: GraphQLContext): Promise<readonly CategoryNode[]> {
  requireRole(context, 'ADMIN', 'AGENT');

  const categories = await context.prisma.category.findMany({
    select: CATEGORY_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return categories.map(toCategory);
}

/** Creates or updates a category, matched by slug so seeding stays idempotent. */
export async function upsertCategory(
  context: GraphQLContext,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    parentSlug?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<CategoryNode> {
  const actor = requireRole(context, 'ADMIN');

  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');

  if (slug.length === 0) {
    throw CorsairError.validation('Category slug must contain letters or digits');
  }

  let parentId: string | null = null;
  if (input.parentSlug) {
    const parent = await context.prisma.category.findUnique({
      where: { slug: input.parentSlug.trim().toLowerCase() },
      select: { id: true },
    });
    if (!parent) throw CorsairError.notFound('Category', input.parentSlug);
    parentId = parent.id;
  }

  const category = await context.prisma.category.upsert({
    where: { slug },
    create: {
      slug,
      name: input.name.trim(),
      description: input.description ?? null,
      parentId,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
    update: {
      name: input.name.trim(),
      description: input.description ?? null,
      parentId,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
    select: CATEGORY_SELECT,
  });

  await audit(context, actor.id, 'category.upserted', 'Category', category.id, { slug });

  return toCategory(category);
}

export async function deleteCategory(context: GraphQLContext, id: string): Promise<boolean> {
  const actor = requireRole(context, 'ADMIN');

  const products = await context.prisma.product.count({ where: { categoryId: id } });
  if (products > 0) {
    throw new CorsairError(
      ErrorCode.VALIDATION_FAILED,
      `Move or delete the ${products} product(s) in this category first`,
    );
  }

  await context.prisma.category.delete({ where: { id } });

  await audit(context, actor.id, 'category.deleted', 'Category', id);

  return true;
}

export interface ProductNode {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceMinor: number;
  readonly currency: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly isActive: boolean;
}

const PRODUCT_SELECT = {
  id: true,
  sku: true,
  name: true,
  description: true,
  price: true,
  currency: true,
  kind: true,
  categoryId: true,
  isActive: true,
  category: { select: { name: true } },
} as const;

function toProduct(product: {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  kind: string;
  categoryId: string;
  isActive: boolean;
  category: { name: string };
}): ProductNode {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    priceMinor: product.price,
    currency: product.currency,
    kind: product.kind,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    isActive: product.isActive,
  };
}

export async function listProducts(
  context: GraphQLContext,
  options: { categoryId?: string | undefined } = {},
): Promise<readonly ProductNode[]> {
  requireRole(context, 'ADMIN', 'AGENT');

  const products = await context.prisma.product.findMany({
    where: options.categoryId ? { categoryId: options.categoryId } : {},
    select: PRODUCT_SELECT,
    orderBy: [{ name: 'asc' }],
    take: 200,
  });

  return products.map(toProduct);
}

export async function upsertProduct(
  context: GraphQLContext,
  input: {
    sku: string;
    name: string;
    description?: string | null;
    priceMinor: number;
    currency?: string;
    kind?: string;
    categoryId: string;
    isActive?: boolean;
  },
): Promise<ProductNode> {
  const actor = requireRole(context, 'ADMIN');

  const category = await context.prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { id: true },
  });
  if (!category) throw CorsairError.notFound('Category', input.categoryId);

  const sku = input.sku.trim().toUpperCase();
  if (sku.length === 0) {
    throw CorsairError.validation('Product SKU is required');
  }
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
    throw CorsairError.validation('Product price must be a non-negative whole number of cents');
  }

  const shared = {
    name: input.name.trim(),
    description: input.description ?? null,
    price: input.priceMinor,
    currency: input.currency ?? 'USD',
    kind: (input.kind ?? 'OTHER') as never,
    categoryId: input.categoryId,
    isActive: input.isActive ?? true,
  };

  const product = await context.prisma.product.upsert({
    where: { sku },
    create: { sku, ...shared },
    update: shared,
    select: PRODUCT_SELECT,
  });

  await audit(context, actor.id, 'product.upserted', 'Product', product.id, { sku });

  return toProduct(product);
}

export async function deleteProduct(context: GraphQLContext, id: string): Promise<boolean> {
  const actor = requireRole(context, 'ADMIN');

  await context.prisma.product.delete({ where: { id } });

  await audit(context, actor.id, 'product.deleted', 'Product', id);

  return true;
}

export interface SalesPoint {
  readonly bucket: string;
  readonly bookings: number;
  readonly revenueMinor: number;
}

export interface SalesReport {
  readonly currency: string;
  readonly totalRevenueMinor: number;
  readonly totalBookings: number;
  readonly averageOrderMinor: number;
  readonly byDay: readonly SalesPoint[];
  readonly topRoutes: readonly {
    readonly origin: string;
    readonly destination: string;
    readonly bookings: number;
    readonly revenueMinor: number;
  }[];
  readonly byStatus: readonly { readonly status: string; readonly count: number }[];
}

/**
 * Sales report.
 *
 * Revenue is summed from settled payments rather than bookings, so a booking that
 * never paid is excluded. Aggregation runs in SQL because the row count grows
 * without bound.
 */
export async function salesReport(
  context: GraphQLContext,
  options: { days?: number | undefined } = {},
): Promise<SalesReport> {
  requireRole(context, 'ADMIN', 'AGENT');

  const days = Math.min(Math.max(options.days ?? 30, 1), 365);

  const byDay = await context.prisma.$queryRaw<
    { bucket: Date; bookings: bigint; revenue: bigint | null }[]
  >`
    SELECT date_trunc('day', p."createdAt") AS bucket,
           count(DISTINCT b.pnr)::bigint     AS bookings,
           coalesce(sum(p.amount), 0)::bigint AS revenue
    FROM payments p
    JOIN bookings b ON b.pnr = p."bookingPnr"
    WHERE p.status = 'SUCCEEDED'
      AND p."createdAt" >= now() - (${days} || ' days')::interval
    GROUP BY 1
    ORDER BY 1
  `;

  const topRoutes = await context.prisma.$queryRaw<
    { origin: string; destination: string; bookings: bigint; revenue: bigint | null }[]
  >`
    SELECT o."iataCode" AS origin,
           d."iataCode" AS destination,
           count(DISTINCT b.pnr)::bigint AS bookings,
           coalesce(sum(p.amount), 0)::bigint AS revenue
    FROM bookings b
    JOIN booking_segments bs ON bs."bookingPnr" = b.pnr
    JOIN flights f ON f.id = bs."flightId"
    JOIN airports o ON o.id = f."originId"
    JOIN airports d ON d.id = f."destinationId"
    LEFT JOIN payments p ON p."bookingPnr" = b.pnr AND p.status = 'SUCCEEDED'
    WHERE b.status IN ('CONFIRMED', 'TICKETED', 'CHECKED_IN')
    GROUP BY 1, 2
    ORDER BY revenue DESC NULLS LAST
    LIMIT 10
  `;

  const [statuses, totals, totalBookings] = await Promise.all([
    context.prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    context.prisma.payment.aggregate({
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    }),
    context.prisma.booking.count({
      where: { status: { in: ['CONFIRMED', 'TICKETED', 'CHECKED_IN'] as never } },
    }),
  ]);

  const totalRevenueMinor = totals._sum.amount ?? 0;

  return {
    currency: 'USD',
    totalRevenueMinor,
    totalBookings,
    averageOrderMinor: totalBookings > 0 ? Math.round(totalRevenueMinor / totalBookings) : 0,
    byDay: byDay.map((row) => ({
      bucket: row.bucket.toISOString().slice(0, 10),
      bookings: Number(row.bookings),
      revenueMinor: Number(row.revenue ?? 0),
    })),
    topRoutes: topRoutes.map((row) => ({
      origin: row.origin,
      destination: row.destination,
      bookings: Number(row.bookings),
      revenueMinor: Number(row.revenue ?? 0),
    })),
    byStatus: statuses.map((row) => ({ status: row.status, count: row._count._all })),
  };
}
