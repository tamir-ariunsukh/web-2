import { api } from '../api.js';
import { session } from '../session.js';
import { renderSeatMap } from '../components/seat-map.js';
import {
  cabinLabel,
  dateInZone,
  duration,
  escapeHtml,
  money,
  timeInZone,
} from '../util.js';

/**
 * Booking wizard: passengers, seats, payment.
 *
 * The order mirrors the API's state machine — create the hold, attach seats,
 * confirm, then pay — so an abandoned step leaves a recoverable HELD booking
 * rather than a half-written one.
 */

const STEPS = ['Passengers', 'Seats', 'Payment'];
const EMPTY_PASSENGER = {
  type: 'ADULT',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  passportNumber: '',
  passportExpiry: '',
  passportIssuingCountry: '',
};

export async function renderBooking(view, context) {
  const flightId = context.params.flightId;
  const fareId = context.query.fareId;

  const [detailResult, seatResult] = await Promise.all([
    api.get(`/api/flights/${encodeURIComponent(flightId)}/detail`).catch(() => null),
    api.get(`/api/flights/${encodeURIComponent(flightId)}/seats`).catch(() => null),
  ]);

  const flight = detailResult?.flight;
  if (!flight) {
    view.innerHTML = notFoundCard('Flight not found', 'This flight is no longer in the schedule.');
    return;
  }

  const fare = fareId
    ? flight.fares.find((entry) => entry.id === fareId)
    : flight.lowestFare;

  if (!fare) {
    view.innerHTML = notFoundCard('No fare available', 'Pick a fare from the search results.');
    return;
  }

  const state = {
    step: 'Passengers',
    passengers: [{ ...EMPTY_PASSENGER }],
    contactEmail: session.user?.email ?? '',
    contactPhone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    homeAddress: '',
    selectedSeats: [],
    confirmedPnr: null,
  };

  const seatMap = seatResult?.seatMap ?? null;

  const draw = () => {
    if (state.confirmedPnr) {
      view.innerHTML = confirmationView(flight, fare, state);
      return;
    }

    view.innerHTML = `
      <div class="container container-wide stack">
        <nav aria-label="Booking steps">
          <ol class="steps">
            ${STEPS.map(
              (step, index) =>
                `${index > 0 ? '<li aria-hidden="true">/</li>' : ''}<li${
                  step === state.step ? ' aria-current="step"' : ''
                }>${step}</li>`,
            ).join('')}
          </ol>
        </nav>

        <div class="booking-layout">
          <div class="stack" id="wizard-main"></div>
          <div class="card sticky">
            <div class="card-body stack-sm">
              <h2 class="card-title">Trip summary</h2>
              <div class="stack-sm" style="gap:.25rem">
                <span style="font-size:1.125rem;font-weight:600" class="tabular">
                  ${timeInZone(flight.departureAt, flight.origin.timezone)} → ${timeInZone(
                    flight.arrivalAt,
                    flight.destination.timezone,
                  )}
                </span>
                <span class="muted small">${escapeHtml(flight.origin.iataCode)} to ${escapeHtml(
                  flight.destination.iataCode,
                )} · ${duration(flight.durationMinutes)}</span>
                <span class="muted small">${escapeHtml(flight.airline.name)} · ${escapeHtml(flight.flightNumber)}</span>
                <span class="subtle small">${dateInZone(flight.departureAt, flight.origin.timezone)}</span>
              </div>
              <dl class="stack-sm" style="border-top:1px solid var(--slate-200);padding-top:1rem;margin:0">
                <div class="spread"><dt class="muted small">Fare × ${state.passengers.length}</dt>
                  <dd class="tabular" style="margin:0">${money(fare.total * state.passengers.length, fare.currency)}</dd></div>
                <div class="spread"><dt class="muted small">Seats × ${state.selectedSeats.length}</dt>
                  <dd class="tabular" style="margin:0">${money(seatTotal(state), fare.currency)}</dd></div>
                <div class="spread"><dt style="font-weight:600">Total</dt>
                  <dd class="tabular" style="margin:0;font-weight:600">${money(grandTotal(state, fare), fare.currency)}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    `;

    const main = view.querySelector('#wizard-main');
    if (state.step === 'Passengers') drawPassengers(main, state, draw);
    if (state.step === 'Seats') drawSeats(main, state, seatMap, draw);
    if (state.step === 'Payment') drawPayment(main, state, flight, fare, draw);
  };

  draw();
}

function seatTotal(state) {
  return state.selectedSeats.reduce((sum, seat) => sum + (seat.price ?? 0), 0);
}

function grandTotal(state, fare) {
  return fare.total * state.passengers.length + seatTotal(state);
}

function notFoundCard(title, body) {
  return `
    <div class="container container-narrow">
      <div class="card"><div class="card-body stack-sm">
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(body)}</p>
        <p><a class="btn secondary" href="/" data-link>Back to search</a></p>
      </div></div>
    </div>`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function drawPassengers(main, state, draw) {
  main.innerHTML = `
    <section class="card">
      <div class="card-body stack">
        <h2 class="card-title">Contact details</h2>
        <div class="grid-2">
          <label class="field"><span class="label">Email</span>
            <input class="input" id="contact-email" type="email" value="${escapeHtml(state.contactEmail)}" placeholder="you@example.com" /></label>
          <label class="field"><span class="label">Phone</span>
            <input class="input" id="contact-phone" type="tel" value="${escapeHtml(state.contactPhone)}" placeholder="+976 9900 1122" /></label>
        </div>
        <p class="error-text" data-role="contactEmail" hidden></p>
        <p class="error-text" data-role="contactPhone" hidden></p>
      </div>
    </section>

    <section class="card">
      <div class="card-body stack">
        <div>
          <h2 class="card-title">Emergency contact</h2>
          <p class="muted small">Optional. Someone we can call if we cannot reach you on the day of travel.</p>
        </div>
        <div class="grid-2">
          <label class="field"><span class="label">Name</span>
            <input class="input" id="emergency-name" value="${escapeHtml(state.emergencyContactName)}" placeholder="Dulmaa Bat" /></label>
          <label class="field"><span class="label">Phone</span>
            <input class="input" id="emergency-phone" type="tel" value="${escapeHtml(state.emergencyContactPhone)}" placeholder="+976 8800 1122" /></label>
        </div>
        <p class="error-text" data-role="emergency" hidden></p>
      </div>
    </section>

    <div id="passenger-cards" class="stack"></div>

    <div class="row">
      <button class="btn secondary" type="button" id="add-passenger">Add passenger</button>
      <button class="btn" type="button" id="to-seats">Continue to seats</button>
    </div>
  `;

  const cards = main.querySelector('#passenger-cards');

  const drawCards = () => {
    cards.innerHTML = state.passengers
      .map(
        (passenger, index) => `
      <section class="card">
        <div class="card-body stack">
          <div class="spread">
            <h2 class="card-title">Passenger ${index + 1}</h2>
            ${
              state.passengers.length > 1
                ? `<button class="btn ghost sm" type="button" data-remove="${index}">Remove</button>`
                : ''
            }
          </div>
          <div class="grid-2">
            <label class="field"><span class="label">First name</span>
              <input class="input" data-field="firstName" data-index="${index}" value="${escapeHtml(passenger.firstName)}" placeholder="Bat" /></label>
            <label class="field"><span class="label">Last name</span>
              <input class="input" data-field="lastName" data-index="${index}" value="${escapeHtml(passenger.lastName)}" placeholder="Erdene" /></label>
            <label class="field"><span class="label">Date of birth</span>
              <input class="input" type="date" max="${todayIso()}" data-field="dateOfBirth" data-index="${index}" value="${escapeHtml(passenger.dateOfBirth)}" /></label>
            <label class="field"><span class="label">Passport number</span>
              <input class="input" data-field="passportNumber" data-index="${index}" value="${escapeHtml(passenger.passportNumber)}" /></label>
            <label class="field"><span class="label">Passport expiry</span>
              <input class="input" type="date" data-field="passportExpiry" data-index="${index}" value="${escapeHtml(passenger.passportExpiry)}" /></label>
            <label class="field"><span class="label">Issuing country</span>
              <input class="input" maxlength="3" data-field="passportIssuingCountry" data-index="${index}" value="${escapeHtml(passenger.passportIssuingCountry)}" placeholder="MNG" /></label>
          </div>
          <p class="error-text" data-role="passenger-${index}" hidden></p>
        </div>
      </section>`,
      )
      .join('');

    cards.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const index = Number(input.dataset.index);
        state.passengers[index][input.dataset.field] = input.value;
      });
    });

    cards.querySelectorAll('[data-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        state.passengers.splice(Number(button.dataset.remove), 1);
        state.selectedSeats = state.selectedSeats.slice(0, state.passengers.length);
        drawCards();
      });
    });
  };

  drawCards();

  main.querySelector('#contact-email').addEventListener('input', (event) => {
    state.contactEmail = event.target.value;
  });
  main.querySelector('#contact-phone').addEventListener('input', (event) => {
    state.contactPhone = event.target.value;
  });
  main.querySelector('#emergency-name').addEventListener('input', (event) => {
    state.emergencyContactName = event.target.value;
  });
  main.querySelector('#emergency-phone').addEventListener('input', (event) => {
    state.emergencyContactPhone = event.target.value;
  });

  main.querySelector('#add-passenger').addEventListener('click', () => {
    if (state.passengers.length >= 9) return;
    state.passengers.push({ ...EMPTY_PASSENGER });
    drawCards();
  });

  main.querySelector('#to-seats').addEventListener('click', () => {
    const problems = validatePassengers(state);
    for (const element of main.querySelectorAll('[data-role]')) element.hidden = true;

    if (Object.keys(problems).length > 0) {
      for (const [field, message] of Object.entries(problems)) {
        const element = main.querySelector(`[data-role="${field}"]`);
        if (element) {
          element.textContent = message;
          element.hidden = false;
        }
      }
      // A per-passenger error must be visible even if its card is off-screen.
      main.querySelector('[data-role^="passenger-"]:not([hidden])')?.scrollIntoView({ block: 'center' });
      return;
    }

    state.step = 'Seats';
    draw();
  });
}

function validatePassengers(state) {
  const problems = {};

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.contactEmail.trim())) {
    problems.contactEmail = 'Enter a valid email address';
  }
  if (state.contactPhone.trim().length < 6) {
    problems.contactPhone = 'Enter a contact phone number';
  }

  // An emergency contact is only useful as a pair, so require both or neither.
  const hasName = state.emergencyContactName.trim().length > 0;
  const hasPhone = state.emergencyContactPhone.trim().length > 0;
  if (hasName !== hasPhone) {
    problems.emergency = 'Provide both an emergency contact name and phone';
  }

  state.passengers.forEach((passenger, index) => {
    if (passenger.firstName.trim().length === 0) {
      problems[`passenger-${index}`] = 'First and last name are required';
    } else if (passenger.lastName.trim().length === 0) {
      problems[`passenger-${index}`] = 'First and last name are required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.dateOfBirth)) {
      problems[`passenger-${index}`] = 'Use YYYY-MM-DD for the date of birth';
    } else if (passenger.dateOfBirth > todayIso()) {
      problems[`passenger-${index}`] = 'Date of birth cannot be in the future';
    } else if (passenger.passportNumber.trim().length < 5) {
      problems[`passenger-${index}`] = 'Enter a passport number';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(passenger.passportExpiry)) {
      problems[`passenger-${index}`] = 'Use YYYY-MM-DD for the passport expiry';
    } else if (passenger.passportExpiry <= todayIso()) {
      problems[`passenger-${index}`] = 'Passport must not be expired';
    } else if (!/^[A-Za-z]{3}$/.test(passenger.passportIssuingCountry.trim())) {
      problems[`passenger-${index}`] = 'Use a 3-letter country code';
    }
  });

  return problems;
}

function drawSeats(main, state, seatMap, draw) {
  main.innerHTML = `
    <section class="card">
      <div class="card-body stack">
        <div>
          <h2 class="card-title">Choose your seats</h2>
          <p class="muted small" data-role="seat-count"></p>
        </div>
        <div id="seat-map-target"></div>
        <div class="row">
          <button class="btn secondary" type="button" id="back-to-passengers">Back</button>
          <button class="btn" type="button" id="to-payment">Continue to payment</button>
        </div>
      </div>
    </section>
  `;

  const target = main.querySelector('#seat-map-target');
  const label = main.querySelector('[data-role="seat-count"]');

  const updateLabel = () => {
    label.textContent = `${state.selectedSeats.length} of ${state.passengers.length} selected${
      state.selectedSeats.length > 0
        ? ` · ${state.selectedSeats.map((seat) => seat.seatNumber).join(', ')}`
        : ''
    }`;
  };

  const toggle = (seat) => {
    const index = state.selectedSeats.findIndex((entry) => entry.id === seat.id);
    if (index >= 0) {
      state.selectedSeats.splice(index, 1);
    } else if (state.selectedSeats.length < state.passengers.length) {
      state.selectedSeats.push(seat);
    } else {
      // One seat per passenger: replace the oldest rather than exceed the party.
      state.selectedSeats.shift();
      state.selectedSeats.push(seat);
    }
    render();
  };

  const render = () => {
    renderSeatMap(
      target,
      {
        seatMap,
        selectedIds: state.selectedSeats.map((seat) => seat.id),
        maxSelectable: state.passengers.length,
      },
      toggle,
    );
    updateLabel();
  };

  render();

  main.querySelector('#back-to-passengers').addEventListener('click', () => {
    state.step = 'Passengers';
    draw();
  });
  main.querySelector('#to-payment').addEventListener('click', () => {
    state.step = 'Payment';
    draw();
  });
}

function drawPayment(main, state, flight, fare, draw) {
  const signedIn = Boolean(session.user);

  main.innerHTML = `
    <section class="card">
      <div class="card-body stack">
        <div>
          <h2 class="card-title">Payment</h2>
          <p class="muted small">Mock gateway. No card is charged, but the booking is written to the database.</p>
        </div>

        ${
          signedIn
            ? ''
            : `<p class="alert warn" role="status">
                 <a href="/login" data-link class="underline">Sign in</a> or
                 <a href="/register" data-link class="underline">create an account</a> to complete this booking.
               </p>`
        }

        <label class="field"><span class="label">Card number</span>
          <input class="input" id="card-number" inputmode="numeric" placeholder="4242 4242 4242 4242" /></label>
        <div class="grid-2">
          <label class="field"><span class="label">Expiry</span><input class="input" placeholder="12 / 30" /></label>
          <label class="field"><span class="label">CVC</span><input class="input" placeholder="123" /></label>
        </div>

        <p class="error-text" data-role="error" hidden></p>

        <div class="row">
          <button class="btn secondary" type="button" id="back-to-seats">Back</button>
          <button class="btn" type="button" id="pay" ${signedIn ? '' : 'disabled'}>
            Pay ${money(grandTotal(state, fare), fare.currency)}
          </button>
        </div>
      </div>
    </section>
  `;

  main.querySelector('#back-to-seats').addEventListener('click', () => {
    state.step = 'Seats';
    draw();
  });

  main.querySelector('#pay').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const error = main.querySelector('[data-role="error"]');
    const card = main.querySelector('#card-number').value;

    if (card.replace(/\D/g, '').length < 12) {
      error.textContent = 'Enter a card number with at least 12 digits';
      error.hidden = false;
      return;
    }

    error.hidden = true;
    button.classList.add('loading');
    button.disabled = true;

    try {
      // The order matters: hold, seats, confirm, then pay. Each step is a legal
      // transition, so a failure part-way leaves a recoverable booking.
      const created = await api.post('/api/bookings', {
        segments: [{ flightId: flight.id, fareId: fare.id }],
        contactEmail: state.contactEmail.trim(),
        contactPhone: state.contactPhone.trim(),
        ...(state.emergencyContactName.trim()
          ? { emergencyContactName: state.emergencyContactName.trim() }
          : {}),
        ...(state.emergencyContactPhone.trim()
          ? { emergencyContactPhone: state.emergencyContactPhone.trim() }
          : {}),
        ...(state.homeAddress.trim() ? { homeAddress: state.homeAddress.trim() } : {}),
        passengers: state.passengers.map((passenger) => ({
          type: passenger.type,
          firstName: passenger.firstName,
          lastName: passenger.lastName,
          dateOfBirth: passenger.dateOfBirth,
          passportNumber: passenger.passportNumber,
          passportExpiry: passenger.passportExpiry,
          passportIssuingCountry: passenger.passportIssuingCountry.toUpperCase(),
        })),
      });

      const pnr = created.booking.pnr;

      if (state.selectedSeats.length > 0) {
        const segments = created.booking.segments;
        await api.post(`/api/bookings/${pnr}/seats`, {
          selections: state.selectedSeats.map((seat, index) => ({
            passengerIndex: index,
            segmentId: segments[0].id,
            seatId: seat.id,
          })),
        });
      }

      await api.post(`/api/bookings/${pnr}/confirm`);

      const intent = await api.post('/api/payments/intent', { pnr });
      await api.post(`/api/payments/${intent.intent.paymentId}/simulate`, { outcome: 'SUCCESS' });

      state.confirmedPnr = pnr;
      draw();
    } catch (thrown) {
      error.textContent = thrown.message;
      error.hidden = false;
      button.classList.remove('loading');
      button.disabled = false;
    }
  });
}

function confirmationView(flight, fare, state) {
  return `
    <div class="container container-narrow">
      <div class="card"><div class="card-body stack">
        <div>
          <h1 class="page-title">Booking confirmed</h1>
          <p class="muted small">Reference <span class="mono" style="font-size:1.0625rem;font-weight:600">${escapeHtml(
            state.confirmedPnr,
          )}</span></p>
        </div>

        <dl class="grid-2">
          <div><dt class="label">Route</dt><dd style="margin:0">${escapeHtml(flight.origin.iataCode)} to ${escapeHtml(
            flight.destination.iataCode,
          )}</dd></div>
          <div><dt class="label">Departure</dt><dd style="margin:0">${dateInZone(
            flight.departureAt,
            flight.origin.timezone,
          )} · ${timeInZone(flight.departureAt, flight.origin.timezone)}</dd></div>
          <div><dt class="label">Passengers</dt><dd style="margin:0">${state.passengers
            .map((passenger) => escapeHtml(`${passenger.firstName} ${passenger.lastName}`))
            .join('<br />')}</dd></div>
          <div><dt class="label">Seats</dt><dd style="margin:0">${
            state.selectedSeats.length > 0
              ? escapeHtml(state.selectedSeats.map((seat) => seat.seatNumber).join(', '))
              : 'Not selected'
          }</dd></div>
          <div><dt class="label">Fare</dt><dd style="margin:0">${escapeHtml(fare.fareClass.name)} · ${escapeHtml(
            cabinLabel(fare.fareClass.cabin),
          )}</dd></div>
          <div><dt class="label">Total</dt><dd style="margin:0;font-weight:600">${money(
            grandTotal(state, fare),
            fare.currency,
          )}</dd></div>
        </dl>

        <div class="row">
          <a class="btn" href="/my-bookings/${escapeHtml(state.confirmedPnr)}" data-link>View booking</a>
          <a class="btn secondary" href="/" data-link>Book another flight</a>
        </div>
      </div></div>
    </div>
  `;
}
