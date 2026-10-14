import { session } from '../session.js';
import { escapeHtml, initials, statusLabel, statusTone } from '../util.js';

/** Signed-in profile page. */

export async function renderAccount(view) {
  const user = session.user;
  if (!user) {
    window.history.replaceState({}, '', '/login');
    void import('../app.js').then((app) => app.render());
    return;
  }

  view.innerHTML = `
    <div class="container container-narrow stack">
      <div class="card">
        <div class="card-body row" style="gap:1rem">
          <span class="avatar" style="width:3rem;height:3rem;font-size:1rem" aria-hidden="true">${escapeHtml(
            initials(user.firstName, user.lastName),
          )}</span>
          <div>
            <h1 class="page-title" style="font-size:1.25rem">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</h1>
            <p class="muted small">${escapeHtml(user.email)}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2 class="card-title">Profile</h2></div>
        <div class="card-body">
          <dl class="stack-sm">
            ${row('First name', user.firstName)}
            ${row('Last name', user.lastName)}
            ${row('Email', user.email)}
            ${row('Phone', user.phone)}
            ${row('Role', `<span class="badge ${statusTone(user.role)}">${statusLabel(user.role)}</span>`, true)}
          </dl>
        </div>
      </div>

      <div class="grid-2">
        <a class="card" href="/my-bookings" data-link style="text-decoration:none;color:inherit">
          <div class="card-body stack-sm">
            <h2 class="card-title">My bookings</h2>
            <p class="muted small">View, manage and cancel the trips on your account.</p>
          </div>
        </a>
        <a class="card" href="/" data-link style="text-decoration:none;color:inherit">
          <div class="card-body stack-sm">
            <h2 class="card-title">Book another flight</h2>
            <p class="muted small">Search routes, compare fares and pick your seat.</p>
          </div>
        </a>
      </div>
    </div>
  `;
}

function row(label, value, raw = false) {
  return `
    <div class="row" style="align-items:baseline;gap:1rem">
      <dt class="label" style="min-width:8rem">${escapeHtml(label)}</dt>
      <dd style="margin:0">${raw ? value : escapeHtml(value ?? 'Not provided')}</dd>
    </div>
  `;
}
