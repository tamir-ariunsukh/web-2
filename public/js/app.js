/**
 * Client entry point and router.
 *
 * Routes are matched by pattern, so `/my-bookings/:pnr` reads the same way a
 * server route would. Navigation is intercepted so an in-app link does not reload
 * the document, but a deep link and a reload both work because the server falls
 * back to `index.html` for extension-less paths.
 */

import { loadSession, session, isStaff, signOut } from './session.js';
import { escapeHtml, initials } from './util.js';
import { renderHome } from './pages/home.js';
import { renderSearch } from './pages/search.js';
import { renderLogin, renderRegister } from './pages/auth.js';
import { renderAccount } from './pages/account.js';
import { renderMyBookings, renderBookingDetail } from './pages/my-bookings.js';
import { renderBooking } from './pages/booking.js';
import { renderAbout } from './pages/about.js';
import { renderContact } from './pages/contact.js';
import { renderNews, renderArticle } from './pages/news.js';
import {
  renderAdminDashboard,
  renderAdminBookings,
  renderAdminTickets,
  renderAdminTaxonomy,
  renderAdminReports,
  renderAdminUsers,
} from './pages/admin.js';

const ROUTES = [
  { pattern: '/', render: renderHome, title: 'Нислэгээ олоорой' },
  { pattern: '/search', render: renderSearch, title: 'Flight results' },
  { pattern: '/login', render: renderLogin, title: 'Sign in' },
  { pattern: '/register', render: renderRegister, title: 'Create an account' },
  { pattern: '/account', render: renderAccount, title: 'Your account', requiresAuth: true },
  { pattern: '/my-bookings', render: renderMyBookings, title: 'My bookings' },
  { pattern: '/my-bookings/:pnr', render: renderBookingDetail, title: 'Booking details' },
  { pattern: '/booking/:flightId', render: renderBooking, title: 'Complete your booking' },
  { pattern: '/about', render: renderAbout, title: 'Бидний тухай' },
  { pattern: '/contact', render: renderContact, title: 'Холбоо барих' },
  { pattern: '/news', render: renderNews, title: 'Мэдээ' },
  { pattern: '/news/:slug', render: renderArticle, title: 'Мэдээ' },
  { pattern: '/admin', render: renderAdminDashboard, title: 'Admin dashboard', requiresStaff: true },
  { pattern: '/admin/bookings', render: renderAdminBookings, title: 'Bookings', requiresStaff: true },
  { pattern: '/admin/tickets', render: renderAdminTickets, title: 'Tickets', requiresStaff: true },
  { pattern: '/admin/taxonomy', render: renderAdminTaxonomy, title: 'Taxonomy', requiresStaff: true },
  { pattern: '/admin/reports', render: renderAdminReports, title: 'Sales report', requiresStaff: true },
  { pattern: '/admin/users', render: renderAdminUsers, title: 'Users', requiresStaff: true, requiresAdmin: true },
];

function matchRoute(pathname) {
  const requested = pathname.split('/').filter(Boolean);

  for (const route of ROUTES) {
    const segments = route.pattern.split('/').filter(Boolean);
    if (segments.length !== requested.length) continue;

    const params = {};
    let matched = true;
    for (let index = 0; index < segments.length; index += 1) {
      if (segments[index].startsWith(':')) {
        params[segments[index].slice(1)] = decodeURIComponent(requested[index]);
      } else if (segments[index] !== requested[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return null;
}

/** Route context handed to each page render function. */
export function createContext(pathname, params) {
  const url = new URL(window.location.href);
  return {
    pathname,
    params,
    query: Object.fromEntries(url.searchParams),
    navigate,
    refresh: () => render(),
  };
}

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', to);
  else window.history.pushState({}, '', to);
  void render();
}

function renderNav() {
  const list = document.getElementById('nav-items');
  if (!list) return;

  const current = window.location.pathname;
  const link = (href, label, options = {}) => {
    const active = current === href || (href !== '/' && current.startsWith(href));
    const classes = ['nav-link'];
    if (options.primary) classes.push('is-primary');
    return `<li><a href="${href}" class="${classes.join(' ')}" data-link${
      active ? ' aria-current="page"' : ''
    }>${escapeHtml(label)}</a></li>`;
  };

  const items = [
    link('/', 'Search'),
    link('/about', 'Бидний тухай'),
    link('/news', 'Мэдээ'),
    link('/contact', 'Холбоо барих'),
    link('/my-bookings', 'My bookings'),
  ];

  if (isStaff()) items.push(link('/admin', 'Admin'));

  if (session.user) {
    items.push(
      `<li><a href="/account" class="nav-link" data-link><span class="avatar" aria-hidden="true">${escapeHtml(
        initials(session.user.firstName, session.user.lastName),
      )}</span>${escapeHtml(session.user.firstName)}</a></li>`,
    );
    items.push('<li><button type="button" class="btn ghost" id="sign-out">Sign out</button></li>');
  } else {
    items.push(link('/login', 'Sign in'));
    items.push(link('/register', 'Register', { primary: true }));
  }

  list.innerHTML = items.join('');

  const signOutButton = document.getElementById('sign-out');
  signOutButton?.addEventListener('click', async () => {
    await signOut();
    renderNav();
    navigate('/');
  });
}

function renderCopyright() {
  const target = document.getElementById('footer-copyright');
  if (target) {
    target.textContent = `© ${new Date().getFullYear()} Airline Booking. Бүх эрх хуулиар хамгаалагдсан.`;
  }
}

/** Renders the current location into `#view`. */
export async function render() {
  const view = document.getElementById('view');
  const pathname = window.location.pathname;
  const matched = matchRoute(pathname);

  renderNav();

  if (!matched) {
    document.title = 'Not found | Airline Booking';
    view.innerHTML = `
      <div class="container container-narrow stack">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Page not found</h1>
          <p class="muted">No page matches <span class="mono">${escapeHtml(pathname)}</span>.</p>
          <p><a class="btn" href="/" data-link>Back to search</a></p>
        </div></div>
      </div>`;
    return;
  }

  const { route, params } = matched;

  // Guards run before the page renders so a protected view never flashes.
  if (route.requiresAuth && !session.user) {
    navigate('/login', { replace: true });
    return;
  }
  if (route.requiresStaff && !isStaff()) {
    navigate('/', { replace: true });
    return;
  }
  if (route.requiresAdmin && session.user?.role !== 'ADMIN') {
    navigate('/admin', { replace: true });
    return;
  }

  if (route.title) document.title = `${route.title} | Airline Booking`;
  document.documentElement.dataset.route = route.pattern;

  view.setAttribute('aria-busy', 'true');
  try {
    await route.render(view, createContext(pathname, params));
  } catch (error) {
    view.innerHTML = `
      <div class="container container-narrow stack">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Something went wrong</h1>
          <p class="alert error">${escapeHtml(error?.message ?? 'Unknown error')}</p>
          <p><a class="btn" href="/" data-link>Back to search</a></p>
        </div></div>
      </div>`;
  } finally {
    view.removeAttribute('aria-busy');
  }

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function interceptLinks() {
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[data-link]');
    if (!anchor) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    const url = new URL(anchor.href, window.location.origin);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    if (url.pathname + url.search !== window.location.pathname + window.location.search) {
      navigate(url.pathname + url.search);
    }
  });
}

async function start() {
  renderCopyright();
  interceptLinks();
  window.addEventListener('popstate', () => void render());

  await loadSession();
  await render();
}

void start();
