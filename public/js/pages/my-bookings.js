import { api } from '../api.js';
import { session } from '../session.js';
import {
  dateInZone,
  dateTime,
  duration,
  escapeHtml,
  money,
  statusLabel,
  statusTone,
  timeInZone,
} from '../util.js';

/** Booking list and booking detail. */

export async function renderMyBookings(view) {
  if (!session.user) {
    view.innerHTML = `
      <div class="container container-narrow">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Sign in required</h1>
          <p class="muted">Sign in to see the bookings linked to your account.</p>
          <p class="muted small">Bookings are stored against your account.</p>
          <div class="row">
            <a class="btn" href="/login" data-link>Sign in</a>
            <a class="btn secondary" href="/register" data-link>Create an account</a>
          </div>
        </div></div>
      </div>`;
    return;
  }

  const payload = await api.get('/api/bookings');
  const bookings = payload.bookings ?? [];

  view.innerHTML = `
    <div class="container stack">
      <div class="spread">
        <div>
          <h1 class="page-title">My bookings</h1>
          <p class="muted small">Signed in as ${escapeHtml(session.user.email)}</p>
        </div>
      </div>
      ${
        bookings.length === 0
          ? `<div class="card"><div class="card-body stack-sm">
               <h2 class="card-title">No bookings yet</h2>
               <p class="muted small">Bookings you make while signed in appear here.</p>
               <p><a class="btn" href="/" data-link>Search flights</a></p>
             </div></div>`
          : bookings.map(bookingRow).join('')
      }
    </div>
  `;
}

function bookingRow(booking) {
  const segment = booking.segments?.[0];
  const seats = (booking.segments ?? []).flatMap((entry) =>
    (entry.assignedSeats ?? []).map((seat) => seat.seatNumber),
  );

  return `
    <div class="card">
      <div class="card-body spread">
        <div class="stack-sm" style="gap:.4rem">
          <div class="row" style="gap:.75rem">
            <span class="mono" style="font-weight:600;letter-spacing:.06em">${escapeHtml(booking.pnr)}</span>
            <span class="badge ${statusTone(booking.status)}">${statusLabel(booking.status)}</span>
          </div>
          ${
            segment
              ? `<span class="small">${escapeHtml(segment.flight.origin.iataCode)} → ${escapeHtml(
                  segment.flight.destination.iataCode,
                )} · ${escapeHtml(segment.flight.airline.name)} ${escapeHtml(segment.flight.flightNumber)}</span>
                 <span class="subtle tiny">${dateInZone(segment.flight.departureAt, segment.flight.origin.timezone)} · ${timeInZone(
                   segment.flight.departureAt,
                   segment.flight.origin.timezone,
                 )} → ${timeInZone(segment.flight.arrivalAt, segment.flight.destination.timezone)}</span>`
              : ''
          }
          <span class="subtle tiny">${booking.passengers.length} ${
            booking.passengers.length === 1 ? 'passenger' : 'passengers'
          }${seats.length > 0 ? ` · seats ${seats.join(', ')}` : ''}</span>
        </div>

        <div class="stack-sm" style="align-items:flex-end">
          <span class="price-tag">${money(booking.price.total, booking.price.currency)}</span>
          <a class="small" href="/my-bookings/${escapeHtml(booking.pnr)}" data-link>View details</a>
        </div>
      </div>
    </div>
  `;
}

export async function renderBookingDetail(view, context) {
  const pnr = String(context.params.pnr ?? '').toUpperCase();

  let booking = null;
  try {
    const payload = await api.get(`/api/bookings/${encodeURIComponent(pnr)}`);
    booking = payload.booking;
  } catch {
    booking = null;
  }

  if (!booking) {
    view.innerHTML = `
      <div class="container container-narrow">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Booking not found</h1>
          <p class="muted">No booking with reference ${escapeHtml(pnr)} is visible to this account.</p>
          <p><a class="btn secondary" href="/my-bookings" data-link>Back to my bookings</a></p>
        </div></div>
      </div>`;
    return;
  }

  const cancellable = ['HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'TICKETED'].includes(booking.status);
  const editable = !['CANCELLED', 'EXPIRED'].includes(booking.status);

  view.innerHTML = `
    <div class="container stack">
      <div class="card">
        <div class="card-body spread">
          <div class="stack-sm" style="gap:.25rem">
            <h1 class="page-title mono" style="font-size:1.5rem;letter-spacing:.06em">${escapeHtml(booking.pnr)}</h1>
            <p class="muted small">Booked ${escapeHtml(dateTime(booking.createdAt))}</p>
          </div>
          <span class="badge ${statusTone(booking.status)}">${statusLabel(booking.status)}</span>
        </div>
      </div>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Itinerary</h2></div>
        <div class="card-body stack">
          ${(booking.segments ?? [])
            .map((segment) => {
              const flight = segment.flight;
              return `
              <div class="stack-sm" style="gap:.25rem">
                <span style="font-size:1.125rem;font-weight:600">${escapeHtml(flight.origin.iataCode)} → ${escapeHtml(
                  flight.destination.iataCode,
                )}</span>
                <span class="muted small">${escapeHtml(flight.airline.name)} · ${escapeHtml(flight.flightNumber)} · ${duration(
                  flight.durationMinutes,
                )}</span>
                <span class="muted small">Departs ${dateInZone(flight.departureAt, flight.origin.timezone)} at ${timeInZone(
                  flight.departureAt,
                  flight.origin.timezone,
                )} (${escapeHtml(flight.origin.timezone)})</span>
                <span class="muted small">Arrives ${dateInZone(flight.arrivalAt, flight.destination.timezone)} at ${timeInZone(
                  flight.arrivalAt,
                  flight.destination.timezone,
                )} (${escapeHtml(flight.destination.timezone)})</span>
              </div>`;
            })
            .join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Passengers</h2></div>
        <div class="card-body stack-sm">
          ${(booking.passengers ?? [])
            .map((passenger, index) => {
              const seat = (booking.segments ?? [])
                .flatMap((entry) => entry.assignedSeats ?? [])
                .map((entry) => entry.seatNumber)[index];
              return `
              <div class="spread">
                <span>${escapeHtml(passenger.firstName)} ${escapeHtml(passenger.lastName)}</span>
                <span class="muted small">${seat ? `Seat ${escapeHtml(seat)}` : 'No seat selected'}</span>
              </div>`;
            })
            .join('')}
          ${
            (booking.tickets ?? []).length > 0
              ? `<p class="muted small">Tickets: ${booking.tickets.map((ticket) => escapeHtml(ticket.ticketNumber)).join(', ')}</p>`
              : '<p class="subtle small">Tickets are issued once payment settles.</p>'
          }
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Contact details</h2></div>
        <div class="card-body">
          <div id="contact-panel">
            ${contactView(booking, editable)}
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Payment</h2></div>
        <div class="card-body">
          <div class="spread">
            <span class="muted small">Total</span>
            <span class="tabular" style="font-weight:600">${money(booking.price.total, booking.price.currency)}</span>
          </div>
        </div>
      </section>

      <div class="row">
        <a class="btn secondary" href="/my-bookings" data-link>Back to my bookings</a>
        ${
          cancellable
            ? `<button class="btn danger" type="button" id="cancel-booking">Cancel booking</button>`
            : ''
        }
      </div>
      <div id="booking-actions"></div>
    </div>
  `;

  wireContactPanel(view, booking, editable);

  view.querySelector('#cancel-booking')?.addEventListener('click', () => {
    confirmCancel(view, booking.pnr);
  });
}

function contactView(booking, editable) {
  const hasEmergency = Boolean(booking.emergencyContactName && booking.emergencyContactPhone);

  return `
    <dl class="stack-sm">
      ${contactRow('Contact phone', booking.contactPhone)}
      ${contactRow('Email', booking.contactEmail)}
      ${contactRow(
        'Emergency contact',
        hasEmergency ? `${booking.emergencyContactName} · ${booking.emergencyContactPhone}` : null,
      )}
      ${contactRow('Home address', booking.homeAddress)}
    </dl>
    ${
      editable
        ? `<div style="margin-top:1rem">
             <button class="btn secondary sm" type="button" id="edit-contact">${
               hasEmergency || booking.homeAddress ? 'Edit details' : 'Add details'
             }</button>
           </div>`
        : '<p class="subtle small" style="margin-top:1rem">This booking can no longer be edited.</p>'
    }
  `;
}

function contactRow(label, value) {
  return `
    <div class="row" style="align-items:baseline;gap:1rem">
      <dt class="label" style="min-width:10rem">${escapeHtml(label)}</dt>
      <dd style="margin:0" class="${value ? '' : 'subtle'}">${escapeHtml(value ?? 'Not provided')}</dd>
    </div>
  `;
}

function wireContactPanel(view, booking, editable) {
  const panel = view.querySelector('#contact-panel');
  if (!panel) return;

  panel.querySelector('#edit-contact')?.addEventListener('click', () => {
    panel.innerHTML = `
      <form id="contact-form" class="stack">
        <p class="muted small">An emergency contact and home address help us reach someone if we cannot contact you directly.</p>
        <label class="field"><span class="label">Contact phone</span>
          <input class="input" name="contactPhone" required value="${escapeHtml(booking.contactPhone)}" /></label>
        <label class="field"><span class="label">Email</span>
          <input class="input" name="contactEmail" type="email" value="${escapeHtml(booking.contactEmail)}" /></label>
        <label class="field"><span class="label">Emergency contact name</span>
          <input class="input" name="emergencyContactName" value="${escapeHtml(booking.emergencyContactName ?? '')}" /></label>
        <label class="field"><span class="label">Emergency contact phone</span>
          <input class="input" name="emergencyContactPhone" value="${escapeHtml(booking.emergencyContactPhone ?? '')}" /></label>
        <label class="field"><span class="label">Home address</span>
          <input class="input" name="homeAddress" placeholder="Street, city, postal code" value="${escapeHtml(booking.homeAddress ?? '')}" /></label>
        <p class="error-text" data-role="error" hidden></p>
        <div class="row">
          <button class="btn" type="submit">Save details</button>
          <button class="btn secondary" type="button" id="cancel-edit">Cancel</button>
        </div>
      </form>
    `;

    panel.querySelector('#cancel-edit').addEventListener('click', () => {
      panel.innerHTML = contactView(booking, editable);
      wireContactPanel(view, booking, editable);
    });

    panel.querySelector('#contact-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const error = form.querySelector('[data-role="error"]');
      const values = Object.fromEntries(new FormData(form).entries());

      if (!values.contactPhone?.trim()) {
        error.textContent = 'A contact phone number is required';
        error.hidden = false;
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      button.classList.add('loading');
      button.disabled = true;

      try {
        const payload = await api.patch(
          `/api/bookings/${encodeURIComponent(booking.pnr)}/contact`,
          values,
        );
        Object.assign(booking, payload.booking);
        panel.innerHTML = contactView(booking, editable);
        panel.insertAdjacentHTML(
          'beforeend',
          '<p class="alert success" role="status" style="margin-top:1rem">Contact details saved.</p>',
        );
        wireContactPanel(view, booking, editable);
      } catch (thrown) {
        error.textContent = thrown.message;
        error.hidden = false;
      } finally {
        button.classList.remove('loading');
        button.disabled = false;
      }
    });
  });
}

function confirmCancel(view, pnr) {
  const target = view.querySelector('#booking-actions');
  target.innerHTML = `
    <div class="card"><div class="card-body stack-sm">
      <p class="muted small">Cancel ${escapeHtml(pnr)}? Seats are released and cannot be restored.</p>
      <div class="row">
        <button class="btn danger" type="button" id="confirm-cancel">Yes, cancel it</button>
        <button class="btn secondary" type="button" id="keep-booking">Keep booking</button>
      </div>
      <p class="error-text" data-role="error" hidden></p>
    </div></div>
  `;

  target.querySelector('#keep-booking').addEventListener('click', () => {
    target.innerHTML = '';
  });

  target.querySelector('#confirm-cancel').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const error = target.querySelector('[data-role="error"]');
    button.classList.add('loading');
    button.disabled = true;

    try {
      await api.post(`/api/bookings/${encodeURIComponent(pnr)}/cancel`);
      const app = await import('../app.js');
      app.navigate(`/my-bookings/${pnr}`);
    } catch (thrown) {
      error.textContent = thrown.message;
      error.hidden = false;
      button.classList.remove('loading');
      button.disabled = false;
    }
  });
}
