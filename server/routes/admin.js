import { ErrorCode } from '../lib/errors.js';
import * as admin from '../services/admin.js';
import { readJsonBody, sendJson } from '../http/router.js';

/** Admin and agent routes. Every handler delegates its role check to the service. */

export function registerAdminRoutes(router) {
  router.get('/api/admin/stats', (req, res, context) => {
    sendJson(res, 200, { stats: admin.adminStats(context.user) });
  });

  router.get('/api/admin/users', (req, res, context) => {
    sendJson(res, 200, {
      users: admin.listUsers(context.user, {
        search: context.query.search,
        role: context.query.role,
        page: Number(context.query.page ?? 1),
      }),
    });
  });

  router.post('/api/admin/users/:id/role', async (req, res, context) => {
    const body = await readJsonBody(req);
    sendJson(res, 200, {
      user: admin.setUserRole(context.user, context.params.id, body.role, context.requestId),
    });
  });

  router.post('/api/admin/users/:id/unlock', (req, res, context) => {
    sendJson(res, 200, {
      ok: admin.unlockUser(context.user, context.params.id, context.requestId),
    });
  });

  router.get('/api/admin/bookings', (req, res, context) => {
    sendJson(res, 200, {
      bookings: admin.listBookings(context.user, {
        status: context.query.status,
        search: context.query.search,
        page: Number(context.query.page ?? 1),
      }),
    });
  });

  router.get('/api/admin/tickets', (req, res, context) => {
    sendJson(res, 200, {
      tickets: admin.listTickets(context.user, {
        status: context.query.status,
        search: context.query.search,
        page: Number(context.query.page ?? 1),
      }),
    });
  });

  router.post('/api/admin/tickets', async (req, res, context) => {
    const body = await readJsonBody(req);
    sendJson(res, 201, {
      ticket: admin.issueTicketManually(context.user, body, context.requestId),
    });
  });

  router.post('/api/admin/tickets/:id/void', (req, res, context) => {
    sendJson(res, 200, {
      ok: admin.voidTicket(context.user, context.params.id, context.requestId),
    });
  });

  router.get('/api/admin/categories', (req, res, context) => {
    sendJson(res, 200, { categories: admin.listCategories(context.user) });
  });

  router.post('/api/admin/categories', async (req, res, context) => {
    const body = await readJsonBody(req);
    sendJson(res, 201, {
      category: admin.upsertCategory(context.user, body, context.requestId),
    });
  });

  router.delete('/api/admin/categories/:id', (req, res, context) => {
    sendJson(res, 200, {
      ok: admin.deleteCategory(context.user, context.params.id, context.requestId),
    });
  });

  router.get('/api/admin/products', (req, res, context) => {
    sendJson(res, 200, {
      products: admin.listProducts(context.user, { categoryId: context.query.categoryId }),
    });
  });

  router.post('/api/admin/products', async (req, res, context) => {
    const body = await readJsonBody(req);
    sendJson(res, 201, {
      product: admin.upsertProduct(context.user, body, context.requestId),
    });
  });

  router.delete('/api/admin/products/:id', (req, res, context) => {
    sendJson(res, 200, {
      ok: admin.deleteProduct(context.user, context.params.id, context.requestId),
    });
  });

  router.get('/api/admin/reports/sales', (req, res, context) => {
    sendJson(res, 200, {
      report: admin.salesReport(context.user, { days: Number(context.query.days ?? 30) }),
    });
  });

  void ErrorCode;
}
