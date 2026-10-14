import { api } from '../api.js';
import { todayIso } from '../util.js';
import { session } from '../session.js';

/** Home page: hero, search card, features, destinations, steps, stats and news. */

const DESTINATIONS = [
  { city: 'Сөүл', country: 'БНСУ', code: 'SEL', price: '₮1,280,000' },
  { city: 'Бээжин', country: 'БНХАУ', code: 'PEK', price: '₮1,150,000' },
  { city: 'Хонг Конг', country: 'Хонг Конг', code: 'HKG', price: '₮1,620,000' },
  { city: 'Токио', country: 'Япон', code: 'NRT', price: '₮1,940,000' },
  { city: 'Истанбул', country: 'Турк', code: 'IST', price: '₮2,310,000' },
  { city: 'Сингапур', country: 'Сингапур', code: 'SIN', price: '₮1,870,000' },
];

const FEATURES = [
  {
    title: 'Шууд суудлын сонголт',
    body: 'Суудал сонгосон даруйд тань түгжигдэнэ. Харж байгаа нь үнэхээр чөлөөтэй суудал.',
  },
  {
    title: 'Шуурхай тасалбар',
    body: 'Төлбөр баталгаажмагц boarding pass автоматаар олгогдоно. Хүлээх шаардлагагүй.',
  },
  {
    title: 'Энгийн буцаалт',
    body: 'Захиалгын хуудаснаасаа цуцалбал утсаар ярилгүйгээр буцаан төлбөр шийдэгдэнэ.',
  },
];

const STEPS = [
  { number: '01', title: 'Хай', body: 'Чиглэл, огноогоо оруулаад боломжтой нислэгүүдийг харна.' },
  { number: '02', title: 'Сонго', body: 'Таалагдсан нислэгээ сонгож, зорчигчдын мэдээллийг оруулна.' },
  { number: '03', title: 'Суудал', body: 'Амьд суудлын зураглалаас суудлаа сонгоно.' },
  { number: '04', title: 'Төл', body: 'Төлбөр баталгаажмагц тасалбар шууд ирнэ.' },
];

export async function renderHome(view) {
  const payload = await api.get('/api/news');
  const articles = (payload.articles ?? []).slice(0, 3);

  view.innerHTML = `
    <div class="container stack">
      <section class="hero">
        <picture>
          <source type="image/avif" srcset="/img/banner-800.avif 800w, /img/banner-1200.avif 1200w, /img/banner-1600.avif 1600w, /img/banner-2400.avif 2400w" sizes="(max-width: 1088px) 100vw, 1024px" />
          <source type="image/webp" srcset="/img/banner-800.webp 800w, /img/banner-1200.webp 1200w, /img/banner-1600.webp 1600w, /img/banner-2400.webp 2400w" sizes="(max-width: 1088px) 100vw, 1024px" />
          <img class="hero-art" src="/img/banner.png" alt="" aria-hidden="true" fetchpriority="high" decoding="async" />
        </picture>
        <div class="hero-scrim" aria-hidden="true"></div>
        <div class="hero-content">
          <p class="eyebrow">Ухаалгаар нис</p>
          <h1>Хаашаа нисэх вэ?</h1>
          <p>Үнэ харьцуулж, амьд суудлын зураглалаас суудлаа сонгож, төлбөр баталгаажмагц boarding pass-аа аваарай.</p>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Нислэг хайх</h2></div>
        <div class="card-body">
          <form id="home-search" class="stack" novalidate>${searchFields()}</form>
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Яагаад бид гэж?</h2>
        <p class="muted">Аялал эхлэхээс өмнөх бүх алхмыг нэг дор, төвөггүй болгосон.</p>
        <div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))">
          ${FEATURES.map(
            (feature) => `
            <div class="card"><div class="card-body stack-sm">
              <h3 class="card-title">${feature.title}</h3>
              <p class="muted small">${feature.body}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <div class="spread">
          <div>
            <h2 class="section-title">Эрэлттэй чиглэлүүд</h2>
            <p class="muted small">Хамгийн их аялагддаг хотууд. Үнэ нь нэг талын, эдийн засгийн ангиллаас эхэлнэ.</p>
          </div>
        </div>
        <div class="destination-grid">
          ${DESTINATIONS.map(
            (destination) => `
            <a class="card" href="/search?origin=ULN&destination=${destination.code}&departDate=${todayIso()}&adults=1&children=0&infants=0&cabin=ECONOMY" data-link style="text-decoration:none;color:inherit">
              <div class="card-body stack-sm">
                <div>
                  <p class="eyebrow subtle">${destination.country}</p>
                  <h3 class="card-title" style="font-size:1.25rem">${destination.city}</h3>
                </div>
                <p class="muted small">${destination.code} · нэг тал</p>
                <p class="price-tag">${destination.price}</p>
              </div>
            </a>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Хэрхэн ажилладаг вэ</h2>
        <p class="muted small">Дөрвөн алхам. Дунджаар хоёр минутын дотор захиалгаа баталгаажуулна.</p>
        <div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))">
          ${STEPS.map(
            (step) => `
            <div class="card"><div class="card-body stack-sm">
              <p class="eyebrow" style="color:var(--brand-600)">${step.number}</p>
              <h3 class="card-title">${step.title}</h3>
              <p class="muted small">${step.body}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="gradient-band">
        <p class="sr-only">Бидний тухай тоо баримт</p>
        <div class="grid-4">
          ${[
            ['Чиглэл', '120+'],
            ['Тусламж', '24/7'],
            ['Суудал хадгалах', '15 мин'],
            ['Дундаж захиалга', '2 мин'],
          ]
            .map(
              ([label, value]) => `
            <div><p class="stat-value">${value}</p><p class="stat-label">${label}</p></div>`,
            )
            .join('')}
        </div>
      </section>

      <section class="stack-sm">
        <div class="spread">
          <div>
            <h2 class="section-title">Мэдээ</h2>
            <p class="muted small">Шинэ чиглэл, үйлчилгээний өөрчлөлт, аяллын зөвлөгөө.</p>
          </div>
          <a class="btn secondary sm" href="/news" data-link>Бүх мэдээ →</a>
        </div>
        <div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr))">
          ${articles
            .map(
              (article) => `
            <a class="card" href="/news/${article.slug}" data-link style="text-decoration:none;color:inherit">
              <div class="card-body stack-sm">
                <p class="eyebrow" style="color:var(--brand-600)">${article.category}</p>
                <h3 class="card-title">${article.title}</h3>
                <p class="muted small">${article.excerpt}</p>
                <p class="subtle tiny">${article.date.split('-').join('.')}</p>
              </div>
            </a>`,
            )
            .join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-body stack-sm">
          <h2 class="section-title">Аялалдаа бэлэн үү?</h2>
          <p class="muted small">Бүртгүүлээд захиалгаа хянаж, нэг товшилтоор дараагийн нислэгээ захиалаарай.</p>
          <div class="row">
            <a class="btn" href="/search?origin=ULN&destination=SEL&departDate=${todayIso()}&adults=1&children=0&infants=0&cabin=ECONOMY" data-link>Нислэг хайх</a>
            <a class="btn secondary" href="/about" data-link>Бидний тухай</a>
          </div>
        </div>
      </section>
    </div>
  `;

  wireSearchForm(view, '/search');
  void session;
}

/** Shared search fields. Used by the home page and the search results header. */
export function searchFields(prefill = {}) {
  const origin = prefill.origin ?? 'ULN';
  const destination = prefill.destination ?? 'SEL';

  return `
    <div class="grid-2">
      <label class="field">
        <span class="label">From</span>
        <input class="input" name="origin" value="${origin}" placeholder="ULN" maxlength="3" autocomplete="off" required />
      </label>
      <label class="field">
        <span class="label">To</span>
        <input class="input" name="destination" value="${destination}" placeholder="SEL" maxlength="3" autocomplete="off" required />
      </label>
      <label class="field">
        <span class="label">Departure</span>
        <input class="input" name="departDate" type="date" value="${prefill.departDate ?? todayIso()}" min="${todayIso()}" required />
      </label>
      <label class="field">
        <span class="label">Return</span>
        <input class="input" name="returnDate" type="date" value="${prefill.returnDate ?? ''}" min="${prefill.departDate ?? todayIso()}" />
      </label>
    </div>

    <div class="grid-4">
      <label class="field">
        <span class="label">Adults</span>
        <input class="input" name="adults" type="number" min="1" max="9" value="${prefill.adults ?? 1}" />
      </label>
      <label class="field">
        <span class="label">Children</span>
        <input class="input" name="children" type="number" min="0" max="8" value="${prefill.children ?? 0}" />
      </label>
      <label class="field">
        <span class="label">Infants</span>
        <input class="input" name="infants" type="number" min="0" max="4" value="${prefill.infants ?? 0}" />
      </label>
      <label class="field">
        <span class="label">Cabin</span>
        <select class="select" name="cabin">
          ${['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']
            .map((cabin) => {
              const label = cabin.replace('_', ' ');
              const selected = (prefill.cabin ?? 'ECONOMY') === cabin ? ' selected' : '';
              return `<option value="${cabin}"${selected}>${label}</option>`;
            })
            .join('')}
        </select>
      </label>
    </div>

    <p class="error-text" data-role="error" hidden></p>
    <button class="btn lg" type="submit" style="justify-self:start">Search flights</button>
  `;
}

/** Validates the shared search fields and navigates to the results page. */
export function wireSearchForm(root, target) {
  const form = root.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const errorText = form.querySelector('[data-role="error"]');
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());

    const showError = (message) => {
      if (errorText) {
        errorText.textContent = message;
        errorText.hidden = false;
      }
    };

    const origin = String(values.origin ?? '').trim().toUpperCase();
    const destination = String(values.destination ?? '').trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(origin)) return showError('Enter a 3-letter IATA code');
    if (!/^[A-Z]{3}$/.test(destination)) return showError('Enter a 3-letter IATA code');
    if (origin === destination) return showError('Destination must differ from origin');
    if (!values.departDate) return showError('Choose a departure date');
    if (values.returnDate && values.returnDate < values.departDate) {
      return showError('Return date cannot precede departure');
    }

    const adults = Number(values.adults);
    const children = Number(values.children);
    const infants = Number(values.infants);
    if (!Number.isInteger(adults) || adults < 1 || adults > 9) return showError('Invalid passenger count');
    if (!Number.isInteger(children) || children < 0 || children > 8) return showError('Invalid passenger count');
    if (!Number.isInteger(infants) || infants < 0 || infants > 4) return showError('Invalid passenger count');
    if (infants > adults) return showError('Each infant must be accompanied by an adult');

    if (errorText) errorText.hidden = true;

    const params = new URLSearchParams({
      origin,
      destination,
      departDate: values.departDate,
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin: values.cabin ?? 'ECONOMY',
    });
    if (values.returnDate) params.set('returnDate', values.returnDate);

    window.history.pushState({}, '', `${target}?${params.toString()}`);
    void import('../app.js').then((app) => app.render());
  });
}
