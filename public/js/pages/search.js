import { api, queryString } from '../api.js';
import {
  cabinLabel,
  dateInZone,
  duration,
  escapeHtml,
  money,
  statusLabel,
  statusTone,
  timeInZone,
} from '../util.js';
import { wireSearchForm } from './home.js';

/**
 * Search results.
 *
 * Filters and sorting live in the URL rather than in page state, so a filtered
 * result set can be shared, bookmarked and restored by the back button.
 */

const DEPART_WINDOWS = [
  { id: 'early', label: 'Before 06:00', before: '06' },
  { id: 'morning', label: '06:00 – 12:00', after: '06', before: '12' },
  { id: 'afternoon', label: '12:00 – 18:00', after: '12', before: '18' },
  { id: 'evening', label: 'After 18:00', after: '18' },
];

const DURATION_CAPS = [
  { id: 'short', label: 'Under 3h', minutes: 180 },
  { id: 'medium', label: 'Under 6h', minutes: 360 },
  { id: 'long', label: 'Under 12h', minutes: 720 },
];

const SORTS = [
  ['BEST', 'Best'],
  ['PRICE_ASC', 'Cheapest'],
  ['PRICE_DESC', 'Most expensive'],
  ['DURATION_ASC', 'Shortest'],
  ['DEPARTURE_ASC', 'Earliest departure'],
];

export async function renderSearch(view, context) {
  const query = context.query;

  if (!query.origin || !query.destination) {
    view.innerHTML = `
      <div class="container container-narrow">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Choose a route first</h1>
          <p class="muted">Return to the search page and enter where you are flying from and to.</p>
          <p><a class="btn" href="/" data-link>Back to search</a></p>
        </div></div>
      </div>`;
    return;
  }

  const input = {
    origin: query.origin,
    destination: query.destination,
    departDate: query.departDate,
    ...(query.returnDate ? { returnDate: query.returnDate } : {}),
    passengers: {
      adults: Number(query.adults ?? 1),
      children: Number(query.children ?? 0),
      infants: Number(query.infants ?? 0),
    },
    cabin: query.cabin ?? 'ECONOMY',
    filters: collectFilters(query),
    sort: query.sort ?? 'BEST',
    limit: 20,
  };

  const [searchResult, airlinesResult] = await Promise.all([
    api.post('/api/flights/search', input),
    api.get('/api/airlines'),
  ]);

  const flights = searchResult.flights ?? [];
  const airlines = airlinesResult.airlines ?? [];
  const passengerCount = input.passengers.adults + input.passengers.children;
  const currency = searchResult.currency ?? 'USD';

  const prices = flights
    .map((flight) => flight.lowestFare?.total)
    .filter((value) => typeof value === 'number');
  const priceFloor = prices.length ? Math.min(...prices) : 0;
  const priceCeiling = prices.length ? Math.max(...prices) : 0;

  view.innerHTML = `
    <div class="container stack">
      <div class="card">
        <div class="card-body stack">
          <div class="spread">
            <div>
              <h1 class="page-title" style="font-size:1.25rem">${escapeHtml(query.origin)} to ${escapeHtml(query.destination)}</h1>
              <p class="muted small">
                ${escapeHtml(query.departDate ?? '')} · ${passengerCount} passenger(s) · ${escapeHtml(
                  cabinLabel(input.cabin).toLowerCase(),
                )}
              </p>
            </div>
          </div>
          <form id="refine-search" class="stack" novalidate>${refineFields(query)}</form>
        </div>
      </div>

      <div class="search-layout">
        <aside class="card">
          <div class="card-body stack">
            <div class="spread">
              <h2 class="card-title">Filters</h2>
              <a class="tiny" href="/search${queryString({ ...query, airlines: '', maxPrice: '', duration: '', window: '', refundable: '' })}" data-link>Clear all</a>
            </div>
            ${filterPanel(airlines, priceFloor, priceCeiling, currency, query)}
          </div>
        </aside>

        <div class="stack">
          <div class="spread">
            <p class="muted small">${flights.length} flight(s)</p>
            <label class="field" style="min-width:12rem">
              <span class="label">Sort by</span>
              <select class="select" id="sort-select">
                ${SORTS.map(
                  ([value, label]) =>
                    `<option value="${value}"${(query.sort ?? 'BEST') === value ? ' selected' : ''}>${label}</option>`,
                ).join('')}
              </select>
            </label>
          </div>

          ${
            flights.length === 0
              ? `<div class="card"><div class="card-body stack-sm">
                   <h2 class="card-title">No flights match</h2>
                   <p class="muted small">Try relaxing the filters, or pick a different date. Fares change often, so a nearby date may be cheaper.</p>
                 </div></div>`
              : flights.map((flight) => flightCard(flight, passengerCount)).join('')
          }

          ${
            searchResult.nextCursor
              ? `<button class="btn secondary" id="load-more" data-cursor="${escapeHtml(searchResult.nextCursor)}">Load more flights</button>`
              : ''
          }
        </div>
      </div>
    </div>
  `;

  wireSearchForm(view.querySelector('#refine-search') ?? view, '/search');
  wireFilters(view, query);
  wireLoadMore(view, query, input);
}

function collectFilters(query) {
  const filters = {};
  if (query.airlines) filters.airlines = String(query.airlines).split(',').filter(Boolean);
  if (query.maxPrice) filters.maxPrice = Number(query.maxPrice);
  if (query.duration) {
    const cap = DURATION_CAPS.find((entry) => entry.id === query.duration);
    if (cap) filters.maxDurationMinutes = cap.minutes;
  }
  if (query.window) {
    const window = DEPART_WINDOWS.find((entry) => entry.id === query.window);
    if (window) {
      if (window.after) filters.departAfter = window.after;
      if (window.before) filters.departBefore = window.before;
    }
  }
  if (query.refundable === '1') filters.refundableOnly = true;
  return filters;
}

function refineFields(query) {
  return `
    <div class="grid-4">
      <label class="field"><span class="label">From</span>
        <input class="input" name="origin" value="${escapeHtml(query.origin)}" maxlength="3" required /></label>
      <label class="field"><span class="label">To</span>
        <input class="input" name="destination" value="${escapeHtml(query.destination)}" maxlength="3" required /></label>
      <label class="field"><span class="label">Departure</span>
        <input class="input" name="departDate" type="date" value="${escapeHtml(query.departDate ?? '')}" required /></label>
      <label class="field"><span class="label">Cabin</span>
        <select class="select" name="cabin">
          ${['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']
            .map(
              (cabin) =>
                `<option value="${cabin}"${(query.cabin ?? 'ECONOMY') === cabin ? ' selected' : ''}>${cabin.replace('_', ' ')}</option>`,
            )
            .join('')}
        </select></label>
    </div>
    <input type="hidden" name="adults" value="${escapeHtml(query.adults ?? '1')}" />
    <input type="hidden" name="children" value="${escapeHtml(query.children ?? '0')}" />
    <input type="hidden" name="infants" value="${escapeHtml(query.infants ?? '0')}" />
    <p class="error-text" data-role="error" hidden></p>
    <button class="btn sm" type="submit" style="justify-self:start">Update search</button>
  `;
}

function filterPanel(airlines, priceFloor, priceCeiling, currency, query) {
  const selectedAirlines = String(query.airlines ?? '').split(',').filter(Boolean);

  return `
    <div class="stack-sm">
      <p class="label">Airline</p>
      <div class="stack-sm" style="max-height:14rem;overflow:auto">
        ${airlines
          .map(
            (airline) => `
          <label class="row small" style="gap:.5rem">
            <input type="checkbox" data-filter="airline" value="${escapeHtml(airline.iataCode)}"${
              selectedAirlines.includes(airline.iataCode) ? ' checked' : ''
            } />
            ${escapeHtml(airline.name)}
          </label>`,
          )
          .join('')}
      </div>
    </div>

    <div class="stack-sm">
      <p class="label">Max price</p>
      <input type="range" data-filter="maxPrice" aria-label="Maximum price" min="${priceFloor}" max="${priceCeiling || priceFloor + 1}" step="1000" value="${
        query.maxPrice ?? priceCeiling
      }" style="width:100%" />
      <p class="subtle tiny" data-role="max-price-label">${money(Number(query.maxPrice ?? priceCeiling), currency)}</p>
    </div>

    <div class="stack-sm">
      <p class="label">Departure time</p>
      <div class="chip-group">
        <button type="button" class="chip" data-filter="window" data-value=""${
          !query.window ? ' aria-pressed="true"' : ''
        }>Any time</button>
        ${DEPART_WINDOWS.map(
          (entry) =>
            `<button type="button" class="chip" data-filter="window" data-value="${entry.id}"${
              query.window === entry.id ? ' aria-pressed="true"' : ''
            }>${entry.label}</button>`,
        ).join('')}
      </div>
    </div>

    <div class="stack-sm">
      <p class="label">Duration</p>
      <div class="chip-group">
        <button type="button" class="chip" data-filter="duration" data-value=""${
          !query.duration ? ' aria-pressed="true"' : ''
        }>Any duration</button>
        ${DURATION_CAPS.map(
          (entry) =>
            `<button type="button" class="chip" data-filter="duration" data-value="${entry.id}"${
              query.duration === entry.id ? ' aria-pressed="true"' : ''
            }>${entry.label} · ${duration(entry.minutes)}</button>`,
        ).join('')}
      </div>
    </div>

    <label class="row small" style="gap:.5rem">
      <input type="checkbox" data-filter="refundable"${query.refundable === '1' ? ' checked' : ''} />
      Refundable fares only
    </label>
  `;
}

function flightCard(flight, passengerCount) {
  const fare = flight.lowestFare;
  const seatsShort = fare !== null && fare !== undefined && fare.seatsAvailable <= passengerCount + 2;

  return `
    <div class="card">
      <div class="card-body spread">
        <div class="row" style="gap:1rem;flex-wrap:nowrap">
          <div class="badge info" style="width:2.75rem;height:2.75rem;justify-content:center;border-radius:.75rem;font-size:.875rem">
            ${escapeHtml(flight.airline.iataCode)}
          </div>
          <div class="stack-sm" style="gap:.25rem">
            <div class="row" style="gap:.5rem">
              <span class="tabular" style="font-size:1.125rem;font-weight:600">${timeInZone(flight.departureAt, flight.origin.timezone)}</span>
              <span class="subtle tiny">${escapeHtml(flight.origin.iataCode)}</span>
              <span aria-hidden="true" class="subtle">→</span>
              <span class="tabular" style="font-size:1.125rem;font-weight:600">${timeInZone(flight.arrivalAt, flight.destination.timezone)}</span>
              <span class="subtle tiny">${escapeHtml(flight.destination.iataCode)}</span>
            </div>
            <div class="row subtle tiny" style="gap:.5rem">
              <span>${escapeHtml(flight.airline.name)}</span>
              <span aria-hidden="true">·</span>
              <span>${escapeHtml(flight.flightNumber)}</span>
              <span aria-hidden="true">·</span>
              <span>${duration(flight.durationMinutes)}</span>
              <span aria-hidden="true">·</span>
              <span>${dateInZone(flight.departureAt, flight.origin.timezone)}</span>
              <span class="badge success">Direct</span>
              ${
                flight.status !== 'SCHEDULED'
                  ? `<span class="badge ${flight.status === 'CANCELLED' ? 'danger' : 'warning'}">${statusLabel(flight.status)}</span>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="stack-sm" style="align-items:flex-end;text-align:right">
          ${
            fare
              ? `<div>
                   <p class="price-tag">${money(fare.total, fare.currency)}</p>
                   <p class="subtle tiny">per passenger · ${escapeHtml(fare.fareClass.name)}</p>
                   ${seatsShort ? `<p class="seats-left">Only ${fare.seatsAvailable} seats left</p>` : ''}
                 </div>
                 <a class="btn" href="/booking/${escapeHtml(flight.id)}?fareId=${escapeHtml(fare.id)}" data-link>Select</a>`
              : '<span class="muted small">Sold out</span>'
          }
        </div>
      </div>
    </div>
  `;
}

/** Rebuilds the query string from the current filters, dropping `cursor`. */
function updateFilters(context, patch) {
  const next = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === undefined || value === null) next.delete(key);
    else next.set(key, String(value));
  }
  // A filter change invalidates a cursor from a previous result set.
  next.delete('cursor');

  window.history.pushState({}, '', `${context.pathname}?${next.toString()}`);
  void import('../app.js').then((app) => app.render());
}

function wireFilters(view, query, context) {
  const pathname = window.location.pathname;

  const read = () => {
    const checked = Array.from(view.querySelectorAll('[data-filter="airline"]:checked')).map(
      (input) => input.value,
    );
    const maxPrice = view.querySelector('[data-filter="maxPrice"]')?.value;
    const window_ = view.querySelector('[data-filter="window"][aria-pressed="true"]')?.dataset.value;
    const durationCap = view.querySelector('[data-filter="duration"][aria-pressed="true"]')?.dataset.value;
    const refundable = view.querySelector('[data-filter="refundable"]')?.checked;

    const next = new URLSearchParams(window.location.search);
    if (checked.length > 0) next.set('airlines', checked.join(','));
    else next.delete('airlines');

    // The slider only pins a price once the user has actually moved it; until
    // then it shows the ceiling, and writing that would freeze every later search
    // to today's most expensive fare.
    const range = view.querySelector('[data-filter="maxPrice"]');
    if (range && range.dataset.touched === 'true' && maxPrice) next.set('maxPrice', maxPrice);
    else next.delete('maxPrice');

    if (window_) next.set('window', window_);
    else next.delete('window');
    if (durationCap) next.set('duration', durationCap);
    else next.delete('duration');
    if (refundable) next.set('refundable', '1');
    else next.delete('refundable');
    next.delete('cursor');

    window.history.pushState({}, '', `${pathname}?${next.toString()}`);
    void import('../app.js').then((app) => app.render());
  };

  view.querySelectorAll('[data-filter="airline"]').forEach((input) =>
    input.addEventListener('change', read),
  );
  view.querySelector('[data-filter="refundable"]')?.addEventListener('change', read);

  const range = view.querySelector('[data-filter="maxPrice"]');
  range?.addEventListener('change', () => {
    range.dataset.touched = 'true';
    read();
  });
  range?.addEventListener('input', () => {
    // Only a real interaction marks the slider as touched; the initial value is
    // the ceiling, not a choice.
    range.dataset.touched = 'true';
    const label = view.querySelector('[data-role="max-price-label"]');
    if (label) label.textContent = money(Number(range.value), 'USD');
  });

  view.querySelectorAll('[data-filter="window"], [data-filter="duration"]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const group = chip.dataset.filter;
      view.querySelectorAll(`[data-filter="${group}"]`).forEach((sibling) => {
        sibling.setAttribute('aria-pressed', String(sibling === chip));
      });
      read();
    });
  });

  view.querySelector('#sort-select')?.addEventListener('change', (event) => {
    updateFilters({ pathname }, { sort: event.target.value === 'BEST' ? '' : event.target.value });
  });

  void query;
  void context;
}

function wireLoadMore(view, query, input) {
  const button = view.querySelector('#load-more');
  if (!button) return;

  button.addEventListener('click', async () => {
    button.classList.add('loading');
    const cursor = button.dataset.cursor;

    try {
      const payload = await api.post('/api/flights/search', { ...input, cursor });
      const list = button.parentElement;
      const cards = (payload.flights ?? []).map((flight) =>
        flightCard(flight, input.passengers.adults + input.passengers.children),
      );
      button.insertAdjacentHTML('beforebegin', cards.join(''));

      if (payload.nextCursor) button.dataset.cursor = payload.nextCursor;
      else button.remove();
    } catch (error) {
      button.insertAdjacentHTML(
        'beforebegin',
        `<p class="alert error">${escapeHtml(error.message)}</p>`,
      );
      button.remove();
    } finally {
      button.classList.remove('loading');
    }
  });

  void query;
  void statusTone;
}
