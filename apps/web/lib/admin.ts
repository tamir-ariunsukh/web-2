import 'server-only';

import { getSession } from './auth';
import { GraphQLClientError, graphqlRequest } from './graphql-client';

/**
 * Admin data access.
 *
 * Every call re-reads the session and the API re-checks the role, so a page that
 * forgets to guard still cannot leak data. `requireStaff` exists so the layout can
 * fail fast with a clear redirect instead of an empty page.
 */

export interface AdminSession {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: string;
}

/** The signed-in user when they are ADMIN or AGENT, otherwise `null`. */
export async function getStaff(): Promise<AdminSession | null> {
  const user = await getSession();
  if (!user) return null;
  if (user.role !== 'ADMIN' && user.role !== 'AGENT') return null;
  return user;
}

export function isAdmin(user: AdminSession | null): boolean {
  return user?.role === 'ADMIN';
}

const STATS_QUERY = /* GraphQL */ `
  query AdminStats {
    adminStats {
      users
      bookings
      confirmedBookings
      cancelledBookings
      ticketsIssued
      revenueMinor
      currency
      pendingRefunds
      flightsToday
    }
  }
`;

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

export async function getStats(): Promise<AdminStats | null> {
  try {
    const data = await graphqlRequest<{ adminStats: AdminStats }, Record<string, never>>(
      STATS_QUERY,
      {},
      { tags: ['admin'] },
    );
    return data.adminStats;
  } catch (error) {
    if (error instanceof GraphQLClientError) return null;
    throw error;
  }
}

export interface AdminUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly role: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly lockedUntil: string | null;
  readonly bookingCount: number;
}

const USERS_QUERY = /* GraphQL */ `
  query AdminUsers($search: String, $role: UserRole, $page: Int) {
    adminUsers(search: $search, role: $role, page: $page) {
      id
      email
      firstName
      lastName
      phone
      role
      createdAt
      lastLoginAt
      lockedUntil
      bookingCount
    }
  }
`;

export async function listUsers(options: {
  search?: string;
  role?: string;
  page?: number;
}): Promise<readonly AdminUser[]> {
  try {
    const data = await graphqlRequest<
      { adminUsers: AdminUser[] },
      Record<string, unknown>
    >(USERS_QUERY, options, { tags: ['admin'] });
    return data.adminUsers;
  } catch (error) {
    if (error instanceof GraphQLClientError) return [];
    throw error;
  }
}

export interface AdminBooking {
  readonly pnr: string;
  readonly status: string;
  readonly createdAt: string;
  readonly contactEmail: string;
  readonly passengerCount: number;
  readonly currency: string;
  readonly totalMinor: number;
  readonly ownerEmail: string | null;
}

const BOOKINGS_QUERY = /* GraphQL */ `
  query AdminBookings($status: BookingStatus, $search: String, $page: Int) {
    adminBookings(status: $status, search: $search, page: $page) {
      pnr
      status
      createdAt
      contactEmail
      passengerCount
      currency
      totalMinor
      ownerEmail
    }
  }
`;

export async function listBookings(options: {
  status?: string;
  search?: string;
  page?: number;
}): Promise<readonly AdminBooking[]> {
  try {
    const data = await graphqlRequest<
      { adminBookings: AdminBooking[] },
      Record<string, unknown>
    >(BOOKINGS_QUERY, options, { tags: ['admin'] });
    return data.adminBookings;
  } catch (error) {
    if (error instanceof GraphQLClientError) return [];
    throw error;
  }
}

export interface AdminTicket {
  readonly id: string;
  readonly ticketNumber: string;
  readonly status: string;
  readonly bookingPnr: string;
  readonly passengerName: string;
  readonly issuedAt: string | null;
  readonly createdAt: string;
}

const TICKETS_QUERY = /* GraphQL */ `
  query AdminTickets($status: TicketStatus, $search: String, $page: Int) {
    adminTickets(status: $status, search: $search, page: $page) {
      id
      ticketNumber
      status
      bookingPnr
      passengerName
      issuedAt
      createdAt
    }
  }
`;

export async function listTickets(options: {
  status?: string;
  search?: string;
  page?: number;
}): Promise<readonly AdminTicket[]> {
  try {
    const data = await graphqlRequest<
      { adminTickets: AdminTicket[] },
      Record<string, unknown>
    >(TICKETS_QUERY, options, { tags: ['admin'] });
    return data.adminTickets;
  } catch (error) {
    if (error instanceof GraphQLClientError) return [];
    throw error;
  }
}

export interface Category {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly productCount: number;
}

export interface Product {
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

const TAXONOMY_QUERY = /* GraphQL */ `
  query Taxonomy {
    categories {
      id
      slug
      name
      description
      parentId
      sortOrder
      isActive
      productCount
    }
    products {
      id
      sku
      name
      description
      priceMinor
      currency
      kind
      categoryId
      categoryName
      isActive
    }
  }
`;

export async function getTaxonomy(): Promise<{
  categories: readonly Category[];
  products: readonly Product[];
}> {
  try {
    const data = await graphqlRequest<
      { categories: Category[]; products: Product[] },
      Record<string, never>
    >(TAXONOMY_QUERY, {}, { tags: ['admin'] });
    return { categories: data.categories, products: data.products };
  } catch (error) {
    if (error instanceof GraphQLClientError) return { categories: [], products: [] };
    throw error;
  }
}

export interface SalesReport {
  readonly currency: string;
  readonly totalRevenueMinor: number;
  readonly totalBookings: number;
  readonly averageOrderMinor: number;
  readonly byDay: readonly { bucket: string; bookings: number; revenueMinor: number }[];
  readonly topRoutes: readonly {
    origin: string;
    destination: string;
    bookings: number;
    revenueMinor: number;
  }[];
  readonly byStatus: readonly { status: string; count: number }[];
}

const SALES_QUERY = /* GraphQL */ `
  query SalesReport($days: Int) {
    salesReport(days: $days) {
      currency
      totalRevenueMinor
      totalBookings
      averageOrderMinor
      byDay {
        bucket
        bookings
        revenueMinor
      }
      topRoutes {
        origin
        destination
        bookings
        revenueMinor
      }
      byStatus {
        status
        count
      }
    }
  }
`;

export async function getSalesReport(days: number): Promise<SalesReport | null> {
  try {
    const data = await graphqlRequest<{ salesReport: SalesReport }, { days: number }>(
      SALES_QUERY,
      { days },
      { tags: ['admin'] },
    );
    return data.salesReport;
  } catch (error) {
    if (error instanceof GraphQLClientError) return null;
    throw error;
  }
}
