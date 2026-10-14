import { api, queryString } from '../api.js';
import { isAdmin, session } from '../session.js';
import {
  dateTime,
  escapeHtml,
  money,
  statusLabel,
  statusTone,
} from '../util.js';

/**
 * Admin console.
 *
 * The shell, navigation and role gating live here; each page fetches only the
 * data it renders. Role is re-checked by the API, so hiding a panel is a
 * convenience rather than the control.
 */

const NAV = [
  { href: '/admin', label: 'Dashboard', adminOnly: false },
  { href: '/admin/bookings', label: 'Bookings', adminOnly: false },
  { href: '/admin/tickets', label: 'Tickets', adminOnly: false },
  { href: '/admin/taxonomy', label: 'Taxonomy', adminOnly: false },
  { href: '/admin/reports', label: 'Reports', adminOnly: false },
  { href: '/admin/users', label: 'Users', adminOnly: true },
];

const BOOKING_STATUSES = [
  'HELD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'TICKETED',
  'CHECKED_IN',
  'EXPIRED',
  'CANCELLED',
  'PAYMENT_FAILED',
];

const TICKET_STATUSES = ['PENDING', 'ISSUED', 'VOIDED', 'REFUNDED'];
const ROLES = ['CUSTOMER', 'AGENT', 'ADMIN'];
const KINDS = ['SEAT', 'BAGGAGE', 'INSURANCE', 'MEAL', 'LOUNGE', 'OTHER'];

/** Wraps a page body in the console shell. */
function shell(activeHref, body) {
  return `
    <div class="container container-wide stack">
      <div class="spread">
        <div>
          <p class="eyebrow subtle">Admin</p>
          <h1 class="page-title">${isAdmin() ? 'Control panel' : 'Agent console'}</h1>
          <p class="muted small">Signed in as ${escapeHtml(session.user?.email ?? '')} · ${escapeHtml(
            session.user?.role ?? '',
          )}</p>
        </div>
        <a class="btn secondary sm" href="/" data-link>Back to site</a>
      </div>

      <nav aria-label="Admin sections">
        <ul class="row" style="gap:.5rem;list-style:none;padding:0;margin:0">
          ${NAV.filter((entry) => !entry.adminOnly || isAdmin())
            .map(
              (entry) => `
            <li><a class="nav-link${entry.href === activeHref ? ' is-primary' : ''}" href="${entry.href}" data-link>${
              entry.label
            }</a></li>`,
            )
            .join('')}
        </ul>
      </nav>

      ${body}
    </div>
  `;
}

function alertBox(kind, message) {
  return `<p class="alert ${kind}">${escapeHtml(message)}</p>`;
}

export async function renderAdminDashboard(view) {
  const [statsResult, reportResult] = await Promise.all([
    api.get('/api/admin/stats').catch(() => null),
    api.get('/api/admin/reports/sales?days=30').catch(() => null),
  ]);

  if (!statsResult) {
    view.innerHTML = shell('/admin', alertBox('warn', 'Could not load statistics. Is the API running?'));
    return;
  }

  const stats = statsResult.stats;
  const report = reportResult?.report;
  const peak = Math.max(1, ...(report?.byDay ?? []).map((point) => point.revenueMinor));

  const tiles = [
    ['Revenue (settled)', money(stats.revenueMinor, stats.currency)],
    ['Bookings', stats.bookings],
    ['Confirmed', stats.confirmedBookings],
    ['Cancelled', stats.cancelledBookings],
    ['Tickets issued', stats.ticketsIssued],
    ['Pending refunds', stats.pendingRefunds],
    ['Users', stats.users],
    ['Flights today', stats.flightsToday],
  ];

  view.innerHTML = shell(
    '/admin',
    `
    <div class="grid-4">
      ${tiles
        .map(
          ([label, value]) => `
        <div class="card"><div class="card-body">
          <p class="label">${escapeHtml(label)}</p>
          <p class="stat-value">${escapeHtml(String(value))}</p>
        </div></div>`,
        )
        .join('')}
    </div>

    <section class="card">
      <div class="card-body stack-sm">
        <div class="spread">
          <h2 class="card-title">Revenue, last 30 days</h2>
          <a class="small" href="/admin/reports" data-link>Full report →</a>
        </div>
        ${
          report && report.byDay.length > 0
            ? `<div class="bar-chart">
                 ${report.byDay
                   .map(
                     (point) => `
                   <div class="bar" style="height:${Math.max(6, Math.round((point.revenueMinor / peak) * 120))}px"
                        title="${point.bucket}: ${money(point.revenueMinor, report.currency)} from ${point.bookings} booking(s)">
                     <span>${point.bucket.slice(5)}</span>
                   </div>`,
                   )
                   .join('')}
               </div>`
            : '<p class="muted small">No settled payments in this period.</p>'
        }
      </div>
    </section>

    ${
      isAdmin()
        ? `<div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))">
             <a class="card" href="/admin/users" data-link style="text-decoration:none;color:inherit">
               <div class="card-body stack-sm"><h2 class="card-title">Users</h2>
                 <p class="muted small">Search accounts, change roles, unlock logins.</p></div></a>
             <a class="card" href="/admin/tickets" data-link style="text-decoration:none;color:inherit">
               <div class="card-body stack-sm"><h2 class="card-title">Tickets</h2>
                 <p class="muted small">Issue or void a ticket when ticketing failed.</p></div></a>
             <a class="card" href="/admin/taxonomy" data-link style="text-decoration:none;color:inherit">
               <div class="card-body stack-sm"><h2 class="card-title">Taxonomy</h2>
                 <p class="muted small">Categories and the extras sold under them.</p></div></a>
           </div>`
        : ''
    }
  `,
  );
}

export async function renderAdminBookings(view, context) {
  const params = {
    status: context.query.status,
    search: context.query.search,
    page: context.query.page ?? 1,
  };
  const payload = await api.get(`/api/admin/bookings${queryString(params)}`);
  const bookings = payload.bookings ?? [];

  view.innerHTML = shell(
    '/admin/bookings',
    `
    <form class="card" id="booking-filters">
      <div class="card-body grid-4">
        <label class="field"><span class="label">PNR</span>
          <input class="input" name="search" value="${escapeHtml(params.search ?? '')}" placeholder="e.g. 2JQRZ2" /></label>
        <label class="field"><span class="label">Status</span>
          <select class="select" name="status">
            <option value="">Any</option>
            ${BOOKING_STATUSES.map(
              (status) =>
                `<option value="${status}"${params.status === status ? ' selected' : ''}>${statusLabel(status)}</option>`,
            ).join('')}
          </select></label>
        <div class="row" style="align-items:flex-end"><button class="btn sm" type="submit">Apply</button></div>
      </div>
    </form>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>PNR</th><th>Status</th><th>Passengers</th><th>Total</th><th>Contact</th><th>Created</th>
        </tr></thead>
        <tbody>
          ${
            bookings.length === 0
              ? '<tr><td class="empty-row" colspan="6">No bookings match.</td></tr>'
              : bookings
                  .map(
                    (booking) => `
            <tr>
              <td><a class="mono" href="/my-bookings/${escapeHtml(booking.pnr)}" data-link>${escapeHtml(booking.pnr)}</a></td>
              <td><span class="badge ${statusTone(booking.status)}">${statusLabel(booking.status)}</span></td>
              <td class="tabular">${booking.passengerCount}</td>
              <td class="tabular">${money(booking.totalMinor, booking.currency)}</td>
              <td>
                <div>${escapeHtml(booking.contactEmail)}</div>
                ${
                  booking.ownerEmail && booking.ownerEmail !== booking.contactEmail
                    ? `<div class="subtle tiny">account: ${escapeHtml(booking.ownerEmail)}</div>`
                    : ''
                }
              </td>
              <td class="subtle tiny">${escapeHtml(dateTime(booking.createdAt))}</td>
            </tr>`,
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `,
  );

  wireFilters(view, '/admin/bookings');
}

export async function renderAdminTickets(view, context) {
  const params = {
    status: context.query.status,
    search: context.query.search,
    page: context.query.page ?? 1,
  };
  const payload = await api.get(`/api/admin/tickets${queryString(params)}`);
  const tickets = payload.tickets ?? [];
  const canVoid = isAdmin();

  view.innerHTML = shell(
    '/admin/tickets',
    `
    <form class="card" id="ticket-filters">
      <div class="card-body grid-4">
        <label class="field"><span class="label">Search</span>
          <input class="input" name="search" value="${escapeHtml(params.search ?? '')}" placeholder="ticket number or PNR" /></label>
        <label class="field"><span class="label">Status</span>
          <select class="select" name="status">
            <option value="">Any</option>
            ${TICKET_STATUSES.map(
              (status) =>
                `<option value="${status}"${params.status === status ? ' selected' : ''}>${statusLabel(status)}</option>`,
            ).join('')}
          </select></label>
        <div class="row" style="align-items:flex-end"><button class="btn sm" type="submit">Apply</button></div>
      </div>
    </form>

    <div id="ticket-feedback"></div>

    <form class="card" id="issue-ticket">
      <div class="card-body stack">
        <div>
          <h2 class="card-title">Issue a ticket</h2>
          <p class="muted small">For a booking whose ticketing job failed. Passengers must exist on the booking.</p>
        </div>
        <div class="grid-2">
          <label class="field"><span class="label">Booking PNR</span>
            <input class="input mono" name="bookingPnr" required maxlength="6" placeholder="2JQRZ2" /></label>
          <label class="field"><span class="label">Ticket number</span>
            <input class="input mono" name="ticketNumber" required maxlength="13" placeholder="1761234567890" />
            <span class="hint">13 digits</span></label>
          <label class="field"><span class="label">Segment ID</span>
            <input class="input mono" name="segmentId" required placeholder="00000000-0000-0000-0000-000000000000" />
            <span class="hint">UUID from the booking</span></label>
          <label class="field"><span class="label">Passenger ID</span>
            <input class="input mono" name="passengerId" required placeholder="00000000-0000-0000-0000-000000000000" />
            <span class="hint">UUID from the booking</span></label>
        </div>
        <button class="btn" type="submit" style="justify-self:start">Issue ticket</button>
      </div>
    </form>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Ticket</th><th>Status</th><th>Passenger</th><th>PNR</th><th>Issued</th>
          ${canVoid ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${
            tickets.length === 0
              ? `<tr><td class="empty-row" colspan="${canVoid ? 6 : 5}">No tickets yet. They are created when a payment settles, or issue one above.</td></tr>`
              : tickets
                  .map(
                    (ticket) => `
            <tr>
              <td class="mono">${escapeHtml(ticket.ticketNumber)}</td>
              <td><span class="badge ${statusTone(ticket.status)}">${statusLabel(ticket.status)}</span></td>
              <td>${escapeHtml(ticket.passengerName)}</td>
              <td class="mono">${escapeHtml(ticket.bookingPnr)}</td>
              <td class="subtle tiny">${escapeHtml(ticket.issuedAt ? dateTime(ticket.issuedAt) : '—')}</td>
              ${
                canVoid
                  ? `<td style="text-align:right">${
                      ticket.status !== 'VOIDED'
                        ? `<button type="button" class="btn danger sm" data-void="${escapeHtml(ticket.id)}">Void</button>`
                        : ''
                    }</td>`
                  : ''
              }
            </tr>`,
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `,
  );

  wireFilters(view, '/admin/tickets');

  const feedback = view.querySelector('#ticket-feedback');
  const show = (kind, message) => {
    feedback.innerHTML = `<p class="alert ${kind}" role="status">${escapeHtml(message)}</p>`;
  };

  view.querySelector('#issue-ticket').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());

    button.classList.add('loading');
    button.disabled = true;
    try {
      const payload = await api.post('/api/admin/tickets', values);
      show('success', `Ticket ${payload.ticket?.ticketNumber ?? ''} issued for ${values.bookingPnr.toUpperCase()}`);
      form.reset();
    } catch (error) {
      show('error', error.message);
    } finally {
      button.classList.remove('loading');
      button.disabled = false;
    }
  });

  view.querySelectorAll('[data-void]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.classList.add('loading');
      button.disabled = true;
      try {
        await api.post(`/api/admin/tickets/${encodeURIComponent(button.dataset.void)}/void`);
        show('success', 'Ticket voided');
        const app = await import('../app.js');
        app.render();
      } catch (error) {
        show('error', error.message);
        button.classList.remove('loading');
        button.disabled = false;
      }
    });
  });
}

export async function renderAdminTaxonomy(view) {
  const [categoriesResult, productsResult] = await Promise.all([
    api.get('/api/admin/categories'),
    api.get('/api/admin/products'),
  ]);

  const categories = categoriesResult.categories ?? [];
  const products = productsResult.products ?? [];
  const canEdit = isAdmin();

  view.innerHTML = shell(
    '/admin/taxonomy',
    `
    <div id="taxonomy-feedback"></div>

    ${
      canEdit
        ? `<div class="grid-2">
             <form class="card" id="category-form">
               <div class="card-body stack">
                 <div>
                   <h2 class="card-title">Add or update a category</h2>
                   <p class="muted small">Matched by slug, so saving an existing slug updates it.</p>
                 </div>
                 <div class="grid-2">
                   <label class="field"><span class="label">Slug</span>
                     <input class="input" name="slug" required placeholder="priority-boarding" />
                     <span class="hint">lowercase, hyphens</span></label>
                   <label class="field"><span class="label">Name</span>
                     <input class="input" name="name" required placeholder="Priority boarding" /></label>
                   <label class="field"><span class="label">Parent</span>
                     <select class="select" name="parentSlug">
                       <option value="">Top level</option>
                       ${categories
                         .map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`)
                         .join('')}
                     </select></label>
                   <label class="field"><span class="label">Description</span>
                     <input class="input" name="description" placeholder="Board before general cabin" />
                     <span class="hint">optional</span></label>
                 </div>
                 <button class="btn" type="submit" style="justify-self:start">Save category</button>
               </div>
             </form>

             <form class="card" id="product-form">
               <div class="card-body stack">
                 <div>
                   <h2 class="card-title">Add or update a product</h2>
                   <p class="muted small">Matched by SKU. Price is entered in major units and stored in minor units.</p>
                 </div>
                 <div class="grid-2">
                   <label class="field"><span class="label">SKU</span>
                     <input class="input mono" name="sku" required placeholder="PB-FAST" /></label>
                   <label class="field"><span class="label">Name</span>
                     <input class="input" name="name" required placeholder="Priority boarding" /></label>
                   <label class="field"><span class="label">Price</span>
                     <input class="input" name="price" required inputmode="decimal" placeholder="22.00" />
                     <span class="hint">USD</span></label>
                   <label class="field"><span class="label">Kind</span>
                     <select class="select" name="kind">
                       ${KINDS.map((kind) => `<option value="${kind}">${kind}</option>`).join('')}
                     </select></label>
                   <label class="field"><span class="label">Category</span>
                     <select class="select" name="categoryId" required>
                       ${categories
                         .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`)
                         .join('')}
                     </select></label>
                 </div>
                 <button class="btn" type="submit" ${categories.length === 0 ? 'disabled' : ''} style="justify-self:start">Save product</button>
               </div>
             </form>
           </div>`
        : ''
    }

    <section class="stack-sm">
      <h2 class="section-title">Categories</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Slug</th><th>Products</th><th>Active</th>${canEdit ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${
              categories.length === 0
                ? `<tr><td class="empty-row" colspan="${canEdit ? 5 : 4}">No categories yet.</td></tr>`
                : categories
                    .map(
                      (category) => `
              <tr>
                <td><div>${escapeHtml(category.name)}</div>${
                  category.description ? `<div class="subtle tiny">${escapeHtml(category.description)}</div>` : ''
                }</td>
                <td class="mono tiny">${escapeHtml(category.slug)}</td>
                <td class="tabular">${category.productCount}</td>
                <td>${category.isActive ? 'Yes' : 'No'}</td>
                ${
                  canEdit
                    ? `<td style="text-align:right">
                         <button type="button" class="btn danger sm" data-delete-category="${escapeHtml(category.id)}"
                           ${category.productCount > 0 ? 'disabled' : ''}
                           title="${category.productCount > 0 ? 'Move or delete the products first' : ''}">Delete</button>
                       </td>`
                    : ''
                }
              </tr>`,
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="stack-sm">
      <h2 class="section-title">Products</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Kind</th><th>Price</th>${canEdit ? '<th></th>' : ''}</tr></thead>
          <tbody>
            ${
              products.length === 0
                ? `<tr><td class="empty-row" colspan="${canEdit ? 6 : 5}">No products yet.</td></tr>`
                : products
                    .map(
                      (product) => `
              <tr>
                <td>${escapeHtml(product.name)}</td>
                <td class="mono tiny">${escapeHtml(product.sku)}</td>
                <td class="muted">${escapeHtml(product.categoryName)}</td>
                <td class="subtle tiny">${escapeHtml(product.kind)}</td>
                <td class="tabular">${money(product.priceMinor, product.currency)}</td>
                ${
                  canEdit
                    ? `<td style="text-align:right">
                         <button type="button" class="btn danger sm" data-delete-product="${escapeHtml(product.id)}">Delete</button>
                       </td>`
                    : ''
                }
              </tr>`,
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  );

  const feedback = view.querySelector('#taxonomy-feedback');
  const show = (kind, message) => {
    feedback.innerHTML = `<p class="alert ${kind}" role="status">${escapeHtml(message)}</p>`;
  };

  const reload = async () => {
    const app = await import('../app.js');
    app.render();
  };

  view.querySelector('#category-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api.post('/api/admin/categories', {
        slug: values.slug,
        name: values.name,
        ...(values.description ? { description: values.description } : {}),
        ...(values.parentSlug ? { parentSlug: values.parentSlug } : {}),
      });
      show('success', `Category "${values.name}" saved`);
      await reload();
    } catch (error) {
      show('error', error.message);
    }
  });

  view.querySelector('#product-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api.post('/api/admin/products', {
        sku: values.sku,
        name: values.name,
        // The form collects major units because that is what a person types.
        priceMinor: Math.round(Number(values.price) * 100),
        kind: values.kind,
        categoryId: values.categoryId,
      });
      show('success', `Product "${values.name}" saved`);
      await reload();
    } catch (error) {
      show('error', error.message);
    }
  });

  view.querySelectorAll('[data-delete-category]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.delete(`/api/admin/categories/${encodeURIComponent(button.dataset.deleteCategory)}`);
        show('success', 'Category deleted');
        await reload();
      } catch (error) {
        show('error', error.message);
      }
    });
  });

  view.querySelectorAll('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.delete(`/api/admin/products/${encodeURIComponent(button.dataset.deleteProduct)}`);
        show('success', 'Product deleted');
        await reload();
      } catch (error) {
        show('error', error.message);
      }
    });
  });
}

export async function renderAdminReports(view, context) {
  const requested = Number(context.query.days ?? 30);
  const days = [7, 30, 90, 365].includes(requested) ? requested : 30;

  const payload = await api.get(`/api/admin/reports/sales?days=${days}`).catch(() => null);
  const report = payload?.report;

  if (!report) {
    view.innerHTML = shell('/admin/reports', alertBox('warn', 'Could not load the report. Is the API running?'));
    return;
  }

  const peak = Math.max(1, ...report.byDay.map((point) => point.revenueMinor));
  const statusPeak = Math.max(1, ...report.byStatus.map((entry) => entry.count));

  view.innerHTML = shell(
    '/admin/reports',
    `
    <div>
      <p class="label">Period</p>
      <div class="chip-group">
        ${[
          [7, '7 days'],
          [30, '30 days'],
          [90, '90 days'],
          [365, '1 year'],
        ]
          .map(
            ([value, label]) =>
              `<a class="chip" style="text-decoration:none" href="/admin/reports?days=${value}" data-link${
                value === days ? ' aria-pressed="true"' : ''
              }>${label}</a>`,
          )
          .join('')}
      </div>
    </div>

    <div class="grid-4">
      ${[
        ['Revenue (settled)', money(report.totalRevenueMinor, report.currency)],
        ['Paid bookings', report.totalBookings],
        ['Average order', money(report.averageOrderMinor, report.currency)],
      ]
        .map(
          ([label, value]) => `
        <div class="card"><div class="card-body">
          <p class="label">${escapeHtml(label)}</p>
          <p class="stat-value">${escapeHtml(String(value))}</p>
        </div></div>`,
        )
        .join('')}
    </div>

    <section class="card">
      <div class="card-body stack-sm">
        <h2 class="card-title">Revenue by day</h2>
        ${
          report.byDay.length > 0
            ? `<div class="bar-chart">
                 ${report.byDay
                   .map(
                     (point) => `
                   <div class="bar" style="height:${Math.max(6, Math.round((point.revenueMinor / peak) * 140))}px"
                        title="${point.bucket}: ${money(point.revenueMinor, report.currency)} from ${point.bookings} booking(s)">
                     <span>${point.bucket.slice(5)}</span>
                   </div>`,
                   )
                   .join('')}
               </div>`
            : '<p class="muted small">No settled payments in this period.</p>'
        }
      </div>
    </section>

    <section class="stack-sm">
      <h2 class="section-title">Top routes</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Route</th><th>Bookings</th><th>Revenue</th></tr></thead>
          <tbody>
            ${
              report.topRoutes.length === 0
                ? '<tr><td class="empty-row" colspan="3">No paid routes yet.</td></tr>'
                : report.topRoutes
                    .map(
                      (route) => `
              <tr>
                <td>${escapeHtml(route.origin)} → ${escapeHtml(route.destination)}</td>
                <td class="tabular">${route.bookings}</td>
                <td class="tabular">${money(route.revenueMinor, report.currency)}</td>
              </tr>`,
                    )
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-body stack-sm">
        <h2 class="card-title">Bookings by status</h2>
        ${report.byStatus
          .map((entry) => {
            const percentage = Math.round((entry.count / statusPeak) * 100);
            return `
            <div class="spread">
              <span class="small">${statusLabel(entry.status)}</span>
              <span class="tabular small">${entry.count}</span>
            </div>
            <div style="background:var(--slate-100);border-radius:9999px;height:.5rem;overflow:hidden">
              <div style="width:${percentage}%;height:100%;background:var(--brand-500)"></div>
            </div>`;
          })
          .join('')}
      </div>
    </section>
  `,
  );
}

export async function renderAdminUsers(view, context) {
  if (!isAdmin()) {
    view.innerHTML = shell('/admin/users', alertBox('warn', 'Admin access required.'));
    return;
  }

  const params = { search: context.query.search, role: context.query.role, page: context.query.page ?? 1 };
  const payload = await api.get(`/api/admin/users${queryString(params)}`);
  const users = payload.users ?? [];

  view.innerHTML = shell(
    '/admin/users',
    `
    <form class="card" id="user-filters">
      <div class="card-body grid-4">
        <label class="field"><span class="label">Search</span>
          <input class="input" name="search" value="${escapeHtml(params.search ?? '')}" placeholder="email or name" /></label>
        <label class="field"><span class="label">Role</span>
          <select class="select" name="role">
            <option value="">Any</option>
            ${ROLES.map(
              (role) => `<option value="${role}"${params.role === role ? ' selected' : ''}>${role}</option>`,
            ).join('')}
          </select></label>
        <div class="row" style="align-items:flex-end"><button class="btn sm" type="submit">Apply</button></div>
      </div>
    </form>

    <div id="user-feedback"></div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>User</th><th>Role</th><th>Bookings</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            users.length === 0
              ? '<tr><td class="empty-row" colspan="5">No users match.</td></tr>'
              : users
                  .map((user) => {
                    const isSelf = user.id === session.user?.id;
                    const locked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
                    return `
              <tr>
                <td>
                  <div>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}${
                    isSelf ? ' <span class="subtle tiny">(you)</span>' : ''
                  }</div>
                  <div class="subtle tiny">${escapeHtml(user.email)}</div>
                </td>
                <td>
                  <span class="badge ${statusTone(user.role)}">${user.role}</span>
                  <select class="select" style="width:auto;display:inline-block;height:auto;padding:.25rem .5rem;font-size:.75rem"
                    aria-label="Change role for ${escapeHtml(user.email)}"
                    data-role-user="${escapeHtml(user.id)}" ${isSelf ? 'disabled title="You cannot change your own role"' : ''}>
                    ${ROLES.map(
                      (role) => `<option value="${role}"${user.role === role ? ' selected' : ''}>${role}</option>`,
                    ).join('')}
                  </select>
                </td>
                <td class="tabular">${user.bookingCount}</td>
                <td class="subtle tiny">${escapeHtml(user.lastLoginAt ? dateTime(user.lastLoginAt) : 'never')}</td>
                <td>
                  ${
                    locked
                      ? `<button type="button" class="btn sm" data-unlock="${escapeHtml(user.id)}">Unlock</button>`
                      : '<span class="subtle tiny">—</span>'
                  }
                </td>
              </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `,
  );

  wireFilters(view, '/admin/users');

  const feedback = view.querySelector('#user-feedback');
  const show = (kind, message) => {
    feedback.innerHTML = `<p class="alert ${kind}" role="status">${escapeHtml(message)}</p>`;
    if (kind === 'success') {
      void import('../app.js').then((app) => app.render());
    }
  };

  view.querySelectorAll('[data-role-user]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api.post(`/api/admin/users/${encodeURIComponent(select.dataset.roleUser)}/role`, {
          role: select.value,
        });
        show('success', 'Role updated');
      } catch (error) {
        show('error', error.message);
      }
    });
  });

  view.querySelectorAll('[data-unlock]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api.post(`/api/admin/users/${encodeURIComponent(button.dataset.unlock)}/unlock`);
        show('success', 'User unlocked');
      } catch (error) {
        show('error', error.message);
      }
    });
  });
}

/** Turns a filter form into a URL update, so filters stay shareable. */
function wireFilters(view, pathname) {
  const form = view.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    void import('../app.js').then((app) => app.navigate(`${pathname}${queryString(values)}`));
  });

  // A select change is already a decision, so it applies without a submit press.
  for (const select of form.querySelectorAll('select')) {
    select.addEventListener('change', () => form.requestSubmit());
  }
}

void statusLabel;
