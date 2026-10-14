import { escapeHtml } from '../util.js';

/** Contact page: support channels, offices and FAQ. Static content. */

const CHANNELS = [
  { title: 'Утас', value: '+976 7000 0000', note: 'Өдөр бүр 08:00 — 22:00', href: 'tel:+97670000000' },
  {
    title: 'Имэйл',
    value: 'support@airline-booking.mn',
    note: '24 цагийн дотор хариулна',
    href: 'mailto:support@airline-booking.mn',
  },
  {
    title: 'Буцаалт, өөрчлөлт',
    value: 'refunds@airline-booking.mn',
    note: 'Ажлын өдрүүдэд 09:00 — 18:00',
    href: 'mailto:refunds@airline-booking.mn',
  },
  {
    title: 'Хамтын ажиллагаа',
    value: 'partners@airline-booking.mn',
    note: 'Ажлын өдрүүдэд 09:00 — 18:00',
    href: 'mailto:partners@airline-booking.mn',
  },
];

const OFFICES = [
  { city: 'Улаанбаатар', address: 'Сүхбаатарын талбай 1, Улаанбаатар 14200, Монгол' },
  { city: 'Сөүл', address: 'Jongno-gu, Sejong-daero 110, Seoul 03120, Korea' },
];

const FAQ = [
  [
    'Захиалгаа хэрхэн цуцлах вэ?',
    '"Миний захиалгууд" хэсэгт нэвтэрч, тухайн захиалгын хуудаснаас "Cancel booking" товчийг дарна. Суудал шууд чөлөөлөгдөнө.',
  ],
  [
    'Төлбөр хэзээ буцаж ирэх вэ?',
    'Цуцалснаас хойш 3 ажлын өдөрт багтаж буцаалт бүртгэгдэнэ. Банкнаас хамаарч 1-3 хоног нэмэгдэж болно.',
  ],
  ['Суудал сонгох шаардлагатай юу?', 'Шаардлагагүй. Суудал сонгохгүй бол нислэгийн бүртгэлд автоматаар хуваарилагдана.'],
  ['Захиалгаа өөр хүнд шилжүүлж болох уу?', 'Нэрийг өөрчлөх боломжгүй. Захиалгыг цуцалж, шинээр захиалах шаардлагатай.'],
];

export async function renderContact(view) {
  view.innerHTML = `
    <div class="container stack">
      <p class="breadcrumbs"><a href="/" data-link>Нүүр</a> / ${escapeHtml('Холбоо барих')}</p>

      <section class="hero">
        <div class="hero-scrim" aria-hidden="true" style="background:linear-gradient(to right, var(--brand-700), var(--brand-900))"></div>
        <div class="hero-content">
          <p class="eyebrow">Холбоо барих</p>
          <h1>Бидэнд хандаарай</h1>
          <p>Захиалга, төлбөр, буцаалтын асуудлаар бидэнтэй холбогдоорой. Ажлын өдрүүдэд 24 цагийн дотор хариулна.</p>
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Холбогдох суваг</h2>
        <div class="grid-4">
          ${CHANNELS.map(
            (channel) => `
            <div class="card"><div class="card-body stack-sm">
              <h3 class="card-title">${channel.title}</h3>
              <a href="${channel.href}">${channel.value}</a>
              <p class="subtle tiny">${channel.note}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Оффисууд</h2>
        <div class="grid-2">
          ${OFFICES.map(
            (office) => `
            <div class="card"><div class="card-body stack-sm">
              <h3 class="card-title">${office.city}</h3>
              <p class="muted small">${office.address}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm faq">
        <h2 class="section-title">Түгээмэл асуултууд</h2>
        ${FAQ.map(
          ([question, answer]) => `
          <details>
            <summary>${question}</summary>
            <p>${answer}</p>
          </details>`,
        ).join('')}
      </section>
    </div>
  `;
}

