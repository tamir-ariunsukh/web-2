import { escapeHtml } from '../util.js';

/** Marketing pages: about and contact. Static content, no data fetch. */

const STATS = [
  ['Үүсгэн байгуулсан', '2019'],
  ['Чиглэл', '120+'],
  ['Аялагч', '480K'],
  ['Ажилтан', '32'],
];

const MISSION = [
  {
    title: 'Хүрэх зорилт',
    body: 'Онгоцны тийз захиалах үйл явцыг гурван минутаас бага хугацаанд, ойлгомжтой, ил тод болгох. Хэрэглэгч ямар үнэ төлж байгаагаа, ямар суудал сонгосноо тэр даруй харах ёстой.',
  },
  {
    title: 'Хэрхэн хүрэх вэ',
    body: 'Нисэх буудлын системүүдтэй шууд холбогдож, суудлын нөөцийг бодит цагт хянана. Ингэснээр хэт зарах, дараа нь цуцлах тохиолдол бараг гарахгүй.',
  },
];

const VALUES = [
  { title: 'Ил тод үнэ', body: 'Нэмэлт хураамж нуухгүй. Нийт үнийг төлбөрийн өмнө бүрэн харуулна.' },
  { title: 'Хурдтай шийдэл', body: 'Буцаалт, өөрчлөлтийг автоматжуулсан урсгалаар шийднэ.' },
  { title: 'Энгийн байдал', body: 'Дөрвөн алхам. Илүүц мэдээлэл, дараалал байхгүй.' },
  { title: 'Хариуцлага', body: 'Нислэг өөрчлөгдвөл урьдчилан мэдэгдэж, сонголт санал болгоно.' },
];

const TIMELINE = [
  { year: '2019', title: 'Эхлэл', body: 'Улаанбаатарт гурван хүнтэй баг эхэлсэн.' },
  { year: '2021', title: 'Өргөжилт', body: 'Азийн 20 чиглэлд нислэг үйлдэж эхэлсэн.' },
  { year: '2023', title: 'Олон улс', body: 'Европ, Ойрхи Дорнодын нисэх компаниудтай холбогдсон.' },
  { year: '2026', title: 'Өнөөдөр', body: '120 гаруй чиглэлд үйлчилж, бодит цагийн суудлын зураглал нэвтрүүлсэн.' },
];

const TEAM = [
  { name: 'Бат-Эрдэнэ Д.', role: 'Гүйцэтгэх захирал' },
  { name: 'Сарангэрэл М.', role: 'Технологийн захирал' },
  { name: 'Тэмүүлэн Б.', role: 'Үйл ажиллагааны захирал' },
  { name: 'Оюунчимэг Ц.', role: 'Хэрэглэгчийн туршлагын ахлах' },
];

export async function renderAbout(view) {
  view.innerHTML = `
    <div class="container stack">
      <p class="breadcrumbs"><a href="/" data-link>Нүүр</a> / ${escapeHtml('Бидний тухай')}</p>

      <section class="hero">
        <div class="hero-scrim" aria-hidden="true" style="background:linear-gradient(to right, var(--brand-700), var(--brand-900))"></div>
        <div class="hero-content">
          <p class="eyebrow">Бидний тухай</p>
          <h1>Аяллыг хүндрэлгүй болгох нь бидний зорилго</h1>
          <p>2019 оноос хойш Монголын аялагчдад нислэг хайх, суудал сонгох, тасалбар авах үйл явцыг хялбар болгож байна.</p>
        </div>
      </section>

      <section class="gradient-band">
        <div class="grid-4">
          ${STATS.map(
            ([label, value]) => `<div><p class="stat-value">${value}</p><p class="stat-label">${label}</p></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Эрхэм зорилго</h2>
        <div class="grid-2">
          ${MISSION.map(
            (entry) => `
            <div class="card"><div class="card-body stack-sm">
              <h3 class="card-title">${entry.title}</h3>
              <p class="muted small">${entry.body}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Үнэт зүйлс</h2>
        <div class="grid-4">
          ${VALUES.map(
            (value) => `
            <div class="card"><div class="card-body stack-sm">
              <h3 class="card-title">${value.title}</h3>
              <p class="muted small">${value.body}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Түүхэн замнал</h2>
        <div class="timeline">
          ${TIMELINE.map(
            (entry) => `
            <div>
              <p class="eyebrow" style="color:var(--brand-600)">${entry.year}</p>
              <h3 class="card-title">${entry.title}</h3>
              <p class="muted small">${entry.body}</p>
            </div>`,
          ).join('')}
        </div>
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Баг</h2>
        <div class="grid-4">
          ${TEAM.map(
            (member) => `
            <div class="card"><div class="card-body">
              <h3 class="card-title">${member.name}</h3>
              <p class="muted small">${member.role}</p>
            </div></div>`,
          ).join('')}
        </div>
      </section>

      <section class="gradient-band stack-sm">
        <h2 class="section-title">Бидэнтэй хамт нисээрэй</h2>
        <p class="small" style="opacity:.9">Асуулт байвал бидэнтэй холбогдоорой. Ажлын өдрүүдэд 24 цагийн дотор хариулна.</p>
        <div class="row">
          <a class="btn secondary" href="/contact" data-link>Холбоо барих</a>
          <a class="btn secondary" href="/news" data-link>Мэдээ үзэх</a>
        </div>
      </section>
    </div>
  `;
}
