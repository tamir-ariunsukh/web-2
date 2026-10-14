/**
 * Seat map renderer.
 *
 * The layout comes from the API, so this only has to place seats and report
 * toggles. Holds get their own colour because a held seat is not gone — it comes
 * back if the other checkout is abandoned.
 */

const STATUS_LABEL = {
  AVAILABLE: 'available',
  HELD: 'on hold',
  BOOKED: 'taken',
  BLOCKED: 'unavailable',
};

export function renderSeatMap(container, { seatMap, selectedIds, maxSelectable }, onToggle) {
  const selected = new Set(selectedIds);

  if (!seatMap || seatMap.cabins.length === 0) {
    container.innerHTML = '<p class="muted small">No seat map is available for this flight.</p>';
    return;
  }

  const selectionFull = selected.size >= maxSelectable;

  container.innerHTML = `
    <div class="seat-map">
      ${seatMap.cabins
        .map(
          (cabin) => `
        <section class="seat-map-cabin">
          <h3>${escapeText(cabin.label)}</h3>
          <div class="seat-columns" aria-hidden="true">
            ${cabin.columns.map((column) => `<span>${escapeText(column)}</span>`).join('')}
          </div>
          ${cabin.rows
            .map(
              (row) => `
            <div class="seat-row">
              <span class="seat-row-number">${row.row}</span>
              ${row.seats
                .map((seat, index) => {
                  // An aisle is a spacer rather than an extra column, so the deck
                  // shape reads correctly without padding the data.
                  const aisleAfter = row.aislesAfter.includes(index + 1)
                    ? '<span class="seat-aisle" aria-hidden="true"></span>'
                    : '';
                  const isSelected = selected.has(seat.id);
                  const available = seat.status === 'AVAILABLE';
                  const disabled = !isSelected && (!available || selectionFull);

                  return `
                    <button type="button" class="seat"
                      data-seat-id="${escapeText(seat.id)}"
                      data-status="${seat.status}"
                      aria-pressed="${isSelected}"
                      aria-label="Seat ${escapeText(seat.seatNumber)}, ${STATUS_LABEL[seat.status]}${seat.isExitRow ? ', exit row' : ''}${seat.hasBassinet ? ', bassinet position' : ''}"
                      ${disabled ? 'disabled' : ''}
                    >${escapeText(seat.column)}</button>
                    ${aisleAfter}
                  `;
                })
                .join('')}
            </div>
          `,
            )
            .join('')}
        </section>
      `,
        )
        .join('')}

      <div class="seat-legend">
        <span><i style="background: var(--seat-available)"></i>Available</span>
        <span><i style="background: var(--seat-held)"></i>On hold</span>
        <span><i style="background: var(--seat-occupied)"></i>Taken</span>
        <span><i style="background: var(--seat-blocked)"></i>Unavailable</span>
      </div>
    </div>
  `;

  for (const button of container.querySelectorAll('.seat')) {
    button.addEventListener('click', () => {
      const seat = findSeat(seatMap, button.dataset.seatId);
      if (seat) onToggle(seat);
    });
  }
}

function findSeat(seatMap, seatId) {
  for (const cabin of seatMap.cabins) {
    for (const row of cabin.rows) {
      const seat = row.seats.find((entry) => entry.id === seatId);
      if (seat) return seat;
    }
  }
  return null;
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
