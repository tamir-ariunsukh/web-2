import { api } from '../api.js';
import { articleDate, escapeHtml } from '../util.js';

/** News index and article pages. Static content served from the API. */

export async function renderNews(view) {
  const payload = await api.get('/api/news');
  const articles = payload.articles ?? [];

  if (articles.length === 0) {
    view.innerHTML = emptyCard();
    return;
  }

  const [lead, ...rest] = articles;

  view.innerHTML = `
    <div class="container stack">
      <p class="breadcrumbs"><a href="/" data-link>Нүүр</a> / ${escapeHtml('Мэдээ')}</p>

      <div>
        <h1 class="page-title">Мэдээ</h1>
        <p class="muted small">Шинэ мэдээ, зарлалууд</p>
        <p class="muted small">Шинэ чиглэл, үйлчилгээний өөрчлөлт, аяллын зөвлөгөөг эндээс уншина уу.</p>
      </div>

      <a class="card" href="/news/${escapeHtml(lead.slug)}" data-link style="text-decoration:none;color:inherit">
        <div class="card-body stack-sm">
          <div class="row" style="gap:.5rem">
            <span class="badge info">Онцлох</span>
            <span class="eyebrow subtle">${escapeHtml(lead.category)}</span>
          </div>
          <h2 class="page-title" style="font-size:1.5rem">${escapeHtml(lead.title)}</h2>
          <p class="muted">${escapeHtml(lead.excerpt)}</p>
          <p class="subtle tiny">${articleDate(lead.date)}</p>
          <span class="small" style="color:var(--brand-600);font-weight:500">Дэлгэрэнгүй унших →</span>
        </div>
      </a>

      <section class="stack-sm">
        <h2 class="section-title">Бүх мэдээ</h2>
        <div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))">
          ${rest
            .map(
              (article) => `
            <a class="card" href="/news/${escapeHtml(article.slug)}" data-link style="text-decoration:none;color:inherit">
              <div class="card-body stack-sm">
                <p class="eyebrow" style="color:var(--brand-600)">${escapeHtml(article.category)}</p>
                <h3 class="card-title">${escapeHtml(article.title)}</h3>
                <p class="muted small">${escapeHtml(article.excerpt)}</p>
                <span class="subtle tiny">${articleDate(article.date)} · Дэлгэрэнгүй →</span>
              </div>
            </a>`,
            )
            .join('')}
        </div>
      </section>
    </div>
  `;
}

export async function renderArticle(view, context) {
  const slug = context.params.slug;

  let article = null;
  try {
    const payload = await api.get(`/api/news/${encodeURIComponent(slug)}`);
    article = payload.article;
  } catch {
    article = null;
  }

  if (!article) {
    view.innerHTML = `
      <div class="container container-narrow">
        <div class="card"><div class="card-body stack-sm">
          <h1 class="page-title">Мэдээ олдсонгүй</h1>
          <p><a class="btn secondary" href="/news" data-link>Бүх мэдээ</a></p>
        </div></div>
      </div>`;
    return;
  }

  const payload = await api.get('/api/news');
  const related = (payload.articles ?? []).filter((entry) => entry.slug !== slug).slice(0, 3);

  document.title = `${article.title} | Airline Booking`;

  view.innerHTML = `
    <div class="container container-narrow stack">
      <p class="breadcrumbs">
        <a href="/" data-link>Нүүр</a> / <a href="/news" data-link>Мэдээ</a> / ${escapeHtml(article.category)}
      </p>

      <header class="stack-sm">
        <span class="badge info">${escapeHtml(article.category)}</span>
        <h1 class="page-title">${escapeHtml(article.title)}</h1>
        <p class="subtle tiny">${articleDate(article.date)}</p>
        <p class="muted">${escapeHtml(article.excerpt)}</p>
      </header>

      <div class="stack-sm">
        ${article.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      </div>

      <p class="muted small">Асуулт байвал <a href="/contact" data-link>бидэнтэй холбогдоорой</a>.</p>

      <section class="stack-sm">
        <h2 class="section-title">Бусад мэдээ</h2>
        <div class="grid-2" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))">
          ${related
            .map(
              (entry) => `
            <a class="card" href="/news/${escapeHtml(entry.slug)}" data-link style="text-decoration:none;color:inherit">
              <div class="card-body stack-sm">
                <p class="eyebrow" style="color:var(--brand-600)">${escapeHtml(entry.category)}</p>
                <h3 class="card-title">${escapeHtml(entry.title)}</h3>
              </div>
            </a>`,
            )
            .join('')}
        </div>
      </section>
    </div>
  `;
}

function emptyCard() {
  return `
    <div class="container container-narrow">
      <div class="card"><div class="card-body stack-sm">
        <h1 class="page-title">Мэдээ</h1>
        <p class="muted">Одоогоор мэдээ байхгүй.</p>
        <p><a class="btn secondary" href="/" data-link>Нүүр хуудас</a></p>
      </div></div>
    </div>`;
}
