import { getDatabase, inTransaction, withWriteRetry } from '../db/connection.js';
import { AppError, ErrorCode, isAppError } from '../lib/errors.js';
import { BookingStatus, UserRole } from '../lib/enums.js';
import { newId } from '../lib/ids.js';

/**
 * Admin and agent operations.
 *
 * Role checks live here rather than in the route layer, so every caller — route
 * handler, script or test — is subject to the same rule. A route cannot
 * accidentally expose an admin operation by forgetting to guard it.
 */

const PAGE_SIZE = 25;

export function requireUser(user) {
  if (!user) throw new AppError(ErrorCode.UNAUTHENTICATED, 'You must be signed in');
  return user;
}

export function requireRole(user, ...roles) {
  const resolved = requireUser(user);
  if (!roles.includes(resolved.role)) {
    throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to do that');
  }
  return resolved;
}

function audit(user, action, entity, entityId, diff, requestId) {
  getDatabase()
    .prepare(
      `INSERT INTO audit_logs (actor_id, actor_type, actor_email, action, entity, entity_id, diff, request_id)
       VALUES (?, 'staff', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      user.id,
      user.email ?? null,
      action,
      entity,
      entityId,
      diff ? JSON.stringify(diff) : null,
      requestId ?? null,
    );
}

export function adminStats(user) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const db = getDatabase();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const count = (sql, ...params) => db.prepare(sql).get(...params).count;

  const revenue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'SUCCEEDED'")
    .get();

  return {
    users: count('SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL'),
    bookings: count('SELECT COUNT(*) AS count FROM bookings'),
    confirmedBookings: count("SELECT COUNT(*) AS count FROM bookings WHERE status = 'CONFIRMED'"),
    cancelledBookings: count("SELECT COUNT(*) AS count FROM bookings WHERE status = 'CANCELLED'"),
    ticketsIssued: count("SELECT COUNT(*) AS count FROM tickets WHERE status = 'ISSUED'"),
    revenueMinor: revenue.total,
    currency: 'USD',
    pendingRefunds: count("SELECT COUNT(*) AS count FROM refunds WHERE status = 'REQUESTED'"),
    flightsToday: count(
      'SELECT COUNT(*) AS count FROM flights WHERE departure_at >= ? AND departure_at < ?',
      startOfDay.toISOString(),
      endOfDay.toISOString(),
    ),
  };
}

export function listUsers(user, { search, role, page = 1 } = {}) {
  requireRole(user, UserRole.ADMIN);
  const currentPage = Math.max(1, Number(page) || 1);

  const conditions = ['deleted_at IS NULL'];
  const params = [];
  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }
  if (search) {
    conditions.push('(email LIKE ? COLLATE NOCASE OR first_name LIKE ? COLLATE NOCASE OR last_name LIKE ? COLLATE NOCASE)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  return getDatabase()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS booking_count
       FROM users u
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE)
    .map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      role: row.role,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      lockedUntil: row.locked_until,
      bookingCount: row.booking_count,
    }));
}

export function setUserRole(user, userId, role, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  if (actor.id === userId) {
    throw AppError.validation('You cannot change your own role');
  }
  if (!Object.values(UserRole).includes(role)) {
    throw AppError.validation('Unknown role');
  }

  const target = getDatabase().prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) throw AppError.notFound('User', userId);

  getDatabase().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  audit(actor, 'user.role_changed', 'User', userId, { role }, requestId);

  const updated = getDatabase()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS booking_count
       FROM users u WHERE u.id = ?`,
    )
    .get(userId);

  return {
    id: updated.id,
    email: updated.email,
    firstName: updated.first_name,
    lastName: updated.last_name,
    phone: updated.phone,
    role: updated.role,
    createdAt: updated.created_at,
    lastLoginAt: updated.last_login_at,
    lockedUntil: updated.locked_until,
    bookingCount: updated.booking_count,
  };
}

export function unlockUser(user, userId, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  getDatabase()
    .prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?')
    .run(userId);
  audit(actor, 'user.unlocked', 'User', userId, null, requestId);
  return true;
}

export function listBookings(user, { status, search, page = 1 } = {}) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const currentPage = Math.max(1, Number(page) || 1);

  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('b.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('b.pnr LIKE ?');
    params.push(`%${String(search).trim().toUpperCase()}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return getDatabase()
    .prepare(
      `SELECT b.pnr, b.status, b.created_at, b.contact_email, b.currency, b.id,
              u.email AS owner_email,
              (SELECT COUNT(*) FROM passengers p WHERE p.booking_pnr = b.pnr) AS passenger_count,
              (SELECT COALESCE(SUM(s.base_fare + s.taxes + s.fees), 0) FROM booking_segments s
               WHERE s.booking_pnr = b.pnr) AS total_minor
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE)
    .map((row) => ({
      pnr: row.pnr,
      status: row.status,
      createdAt: row.created_at,
      contactEmail: row.contact_email,
      passengerCount: row.passenger_count,
      currency: row.currency,
      totalMinor: row.total_minor,
      ownerEmail: row.owner_email,
    }));
}

export function listTickets(user, { status, search, page = 1 } = {}) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const currentPage = Math.max(1, Number(page) || 1);

  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  if (search) {
    conditions.push('(t.ticket_number LIKE ? OR t.booking_pnr LIKE ?)');
    const upper = String(search).trim().toUpperCase();
    params.push(`%${search}%`, `%${upper}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return getDatabase()
    .prepare(
      `SELECT t.*, p.first_name, p.last_name
       FROM tickets t
       JOIN passengers p ON p.id = t.passenger_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE)
    .map((row) => ({
      id: row.id,
      ticketNumber: row.ticket_number,
      status: row.status,
      bookingPnr: row.booking_pnr,
      passengerName: `${row.first_name} ${row.last_name}`,
      issuedAt: row.issued_at,
      createdAt: row.created_at,
    }));
}

export function issueTicketManually(user, { bookingPnr, segmentId, passengerId, ticketNumber }, requestId) {
  const actor = requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const pnr = String(bookingPnr).trim().toUpperCase();

  const booking = getDatabase().prepare('SELECT pnr FROM bookings WHERE pnr = ?').get(pnr);
  if (!booking) throw AppError.notFound('Booking', pnr);

  const existing = getDatabase()
    .prepare('SELECT id FROM tickets WHERE segment_id = ? AND passenger_id = ?')
    .get(segmentId, passengerId);

  if (existing) {
    getDatabase()
      .prepare("UPDATE tickets SET ticket_number = ?, status = 'ISSUED', issued_at = ? WHERE id = ?")
      .run(ticketNumber, new Date().toISOString(), existing.id);
  } else {
    getDatabase()
      .prepare(
        `INSERT INTO tickets (id, booking_pnr, segment_id, passenger_id, ticket_number, status, issued_at)
         VALUES (?, ?, ?, ?, ?, 'ISSUED', ?)`,
      )
      .run(newId(), pnr, segmentId, passengerId, ticketNumber, new Date().toISOString());
  }

  audit(actor, 'ticket.issued_manually', 'Ticket', ticketNumber, { pnr }, requestId);

  return listTickets(actor, { search: ticketNumber })[0];
}

export function voidTicket(user, ticketId, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  const ticket = getDatabase().prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) throw AppError.notFound('Ticket', ticketId);

  getDatabase()
    .prepare("UPDATE tickets SET status = 'VOIDED', voided_at = ? WHERE id = ?")
    .run(new Date().toISOString(), ticketId);

  audit(actor, 'ticket.voided', 'Ticket', ticketId, null, requestId);
  return true;
}

export function listCategories(user) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  return getDatabase()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ORDER BY c.sort_order ASC, c.name ASC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      parentId: row.parent_id,
      sortOrder: row.sort_order,
      isActive: Boolean(row.is_active),
      productCount: row.product_count,
    }));
}

export function upsertCategory(user, input, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  const slug = String(input.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    // Runs of separators collapse and the ends are trimmed, so `Test-Category!`
    // becomes `test-category` rather than `test-category-`.
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw AppError.validation('A slug is required');

  let parentId = null;
  if (input.parentSlug) {
    const parent = getDatabase()
      .prepare('SELECT id FROM categories WHERE slug = ?')
      .get(String(input.parentSlug).trim().toLowerCase());
    if (!parent) throw AppError.notFound('Category', input.parentSlug);
    parentId = parent.id;
  }

  const existing = getDatabase().prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) {
    getDatabase()
      .prepare(
        'UPDATE categories SET name = ?, description = ?, parent_id = ?, sort_order = ?, is_active = ? WHERE slug = ?',
      )
      .run(
        input.name,
        input.description ?? null,
        parentId,
        input.sortOrder ?? 0,
        input.isActive === false ? 0 : 1,
        slug,
      );
  } else {
    getDatabase()
      .prepare(
        'INSERT INTO categories (id, slug, name, description, parent_id, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId(),
        slug,
        input.name,
        input.description ?? null,
        parentId,
        input.sortOrder ?? 0,
        input.isActive === false ? 0 : 1,
      );
  }

  audit(actor, 'category.upserted', 'Category', slug, { name: input.name }, requestId);
  return listCategories(actor).find((category) => category.slug === slug);
}

export function deleteCategory(user, id, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  const products = getDatabase()
    .prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?')
    .get(id);
  if (products.count > 0) {
    throw AppError.validation('Move or delete the products first');
  }
  getDatabase().prepare('DELETE FROM categories WHERE id = ?').run(id);
  audit(actor, 'category.deleted', 'Category', id, null, requestId);
  return true;
}

export function listProducts(user, { categoryId } = {}) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const sql = categoryId
    ? `SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.category_id = ? ORDER BY p.name ASC LIMIT 200`
    : `SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id
       ORDER BY p.name ASC LIMIT 200`;
  const statement = getDatabase().prepare(sql);
  const rows = categoryId ? statement.all(categoryId) : statement.all();

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    priceMinor: row.price,
    currency: row.currency,
    kind: row.kind,
    categoryId: row.category_id,
    categoryName: row.category_name,
    isActive: Boolean(row.is_active),
  }));
}

export function upsertProduct(user, input, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);

  const category = getDatabase().prepare('SELECT id FROM categories WHERE id = ?').get(input.categoryId);
  if (!category) throw AppError.notFound('Category', input.categoryId);

  const sku = String(input.sku ?? '').trim().toUpperCase();
  if (!sku) throw AppError.validation('A SKU is required');
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
    throw AppError.validation('Price must be a non-negative amount in minor units');
  }

  const existing = getDatabase().prepare('SELECT id FROM products WHERE sku = ?').get(sku);
  if (existing) {
    getDatabase()
      .prepare(
        'UPDATE products SET name = ?, description = ?, price = ?, currency = ?, kind = ?, category_id = ?, is_active = ? WHERE sku = ?',
      )
      .run(
        input.name,
        input.description ?? null,
        input.priceMinor,
        input.currency ?? 'USD',
        input.kind ?? 'OTHER',
        input.categoryId,
        input.isActive === false ? 0 : 1,
        sku,
      );
  } else {
    getDatabase()
      .prepare(
        'INSERT INTO products (id, sku, name, description, price, currency, kind, category_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId(),
        sku,
        input.name,
        input.description ?? null,
        input.priceMinor,
        input.currency ?? 'USD',
        input.kind ?? 'OTHER',
        input.categoryId,
        input.isActive === false ? 0 : 1,
      );
  }

  audit(actor, 'product.upserted', 'Product', sku, { name: input.name }, requestId);
  return listProducts(actor).find((product) => product.sku === sku);
}

export function deleteProduct(user, id, requestId) {
  const actor = requireRole(user, UserRole.ADMIN);
  getDatabase().prepare('DELETE FROM products WHERE id = ?').run(id);
  audit(actor, 'product.deleted', 'Product', id, null, requestId);
  return true;
}

/**
 * Revenue report.
 *
 * The Postgres version used `date_trunc` and `count(DISTINCT ...)`; SQLite has
 * neither, so buckets are built with `substr` on the ISO timestamp and distinct
 * bookings are counted with a correlated subquery.
 */
export function salesReport(user, { days = 30 } = {}) {
  requireRole(user, UserRole.ADMIN, UserRole.AGENT);
  const window = Math.min(365, Math.max(1, Number(days) || 30));
  const since = new Date(Date.now() - window * 86_400_000).toISOString();
  const db = getDatabase();

  const byDay = db
    .prepare(
      `SELECT substr(p.created_at, 1, 10) AS bucket,
              (SELECT COUNT(DISTINCT b.pnr) FROM bookings b
               JOIN payments p2 ON p2.booking_pnr = b.pnr
               WHERE p2.status = 'SUCCEEDED' AND substr(p2.created_at, 1, 10) = substr(p.created_at, 1, 10)) AS bookings,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM payments p
       WHERE p.status = 'SUCCEEDED' AND p.created_at >= ?
       GROUP BY bucket
       ORDER BY bucket ASC`,
    )
    .all(since)
    .map((row) => ({
      bucket: row.bucket,
      bookings: Number(row.bookings),
      revenueMinor: Number(row.revenue),
    }));

  const topRoutes = db
    .prepare(
      `SELECT o.iata_code AS origin, d.iata_code AS destination,
              COUNT(DISTINCT b.pnr) AS bookings,
              COALESCE(SUM(p.amount), 0) AS revenue
       FROM bookings b
       JOIN booking_segments bs ON bs.booking_pnr = b.pnr
       JOIN flights f ON f.id = bs.flight_id
       JOIN airports o ON o.id = f.origin_id
       JOIN airports d ON d.id = f.destination_id
       LEFT JOIN payments p ON p.booking_pnr = b.pnr AND p.status = 'SUCCEEDED'
       WHERE b.status IN ('CONFIRMED', 'TICKETED', 'CHECKED_IN')
       GROUP BY origin, destination
       HAVING revenue > 0
       ORDER BY revenue DESC
       LIMIT 10`,
    )
    .all()
    .map((row) => ({
      origin: row.origin,
      destination: row.destination,
      bookings: Number(row.bookings),
      revenueMinor: Number(row.revenue),
    }));

  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status ORDER BY status ASC')
    .all()
    .map((row) => ({ status: row.status, count: row.count }));

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS bookings FROM bookings
       WHERE status IN ('CONFIRMED', 'TICKETED', 'CHECKED_IN')`,
    )
    .get();
  const revenue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'SUCCEEDED'")
    .get();

  return {
    currency: 'USD',
    totalRevenueMinor: revenue.total,
    totalBookings: totals.bookings,
    averageOrderMinor: totals.bookings > 0 ? Math.round(revenue.total / totals.bookings) : 0,
    byDay,
    topRoutes,
    byStatus,
  };
}

export { inTransaction, withWriteRetry, isAppError, BookingStatus };
