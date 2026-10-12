
import { Card, CardBody, CardHeader } from '@repo/ui';
import Link from 'next/link';

import { HeroBanner } from '../../components/hero-banner';
import { SearchForm } from '../../components/search-form';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Нислэгээ олоорой',
  description:
    'Нислэг хайж, суудлаа сонгоод, тасалбараа шууд аваарай. Буцаалтыг автоматаар шийдвэрлэнэ.',
  openGraph: {
    title: 'Нислэгээ олоорой',
    description: 'Нислэг хайж, суудлаа сонгоод, тасалбараа шууд аваарай.',
    images: [{ url: '/img/og.png', width: 1200, height: 628 }],
  },
};

const FEATURES = [
  {
    icon: '🪑',
    title: 'Шууд суудлын сонголт',
    body: 'Суудал сонгосон даруйд тань түгжигдэнэ. Харж байгаа нь үнэхээр чөлөөтэй суудал.',
  },
  {
    icon: '🎫',
    title: 'Шуурхай тасалбар',
    body: 'Төлбөр баталгаажмагц boarding pass автоматаар олгогдоно. Хүлээх шаардлагагүй.',
  },
  {
    icon: '↩️',
    title: 'Энгийн буцаалт',
    body: 'Захиалгын хуудаснаасаа цуцалбал утсаар ярилгүйгээр буцаан төлбөр шийдэгдэнэ.',
  },
];

const DESTINATIONS = [
  { code: 'SEL', city: 'Сөүл', country: 'БНСУ', price: '₮1,280,000', href: '/search?destination=SEL' },
  { code: 'PEK', city: 'Бээжин', country: 'БНХАУ', price: '₮1,150,000', href: '/search?destination=PEK' },
  { code: 'HKG', city: 'Хонг Конг', country: 'Хонг Конг', price: '₮1,620,000', href: '/search?destination=HKG' },
  { code: 'NRT', city: 'Токио', country: 'Япон', price: '₮1,940,000', href: '/search?destination=NRT' },
  { code: 'IST', city: 'Истанбул', country: 'Турк', price: '₮2,310,000', href: '/search?destination=IST' },
  { code: 'SIN', city: 'Сингапур', country: 'Сингапур', price: '₮1,870,000', href: '/search?destination=SIN' },
];

const STATS = [
  { value: '120+', label: 'Чиглэл' },
  { value: '24/7', label: 'Тусламж' },
  { value: '15 мин', label: 'Суудал хадгалах' },
  { value: '2 мин', label: 'Дундаж захиалга' },
];

const STEPS = [
  { step: '01', title: 'Хай', body: 'Чиглэл, огноогоо оруулаад боломжтой нислэгүүдийг харна.' },
  { step: '02', title: 'Сонго', body: 'Таалагдсан нислэгээ сонгож, зорчигчдын мэдээллийг оруулна.' },
  { step: '03', title: 'Суудал', body: 'Амьд суудлын зураглалаас суудлаа сонгоно.' },
  { step: '04', title: 'Төл', body: 'Төлбөр баталгаажмагц тасалбар шууд ирнэ.' },
];

const NEWS_TEASER = [
  {
    date: '2026-09-28',
    category: 'Шинэ чиглэл',
    title: 'Улаанбаатар — Сингапур шууд нислэг нээгдлээ',
    excerpt: 'Долоо хоногт 4 удаа нислэг үйлдэх бөгөөд эхний сард 15% хямдралтай.',
    href: '/news',
  },
  {
    date: '2026-09-15',
    category: 'Үйлчилгээ',
    title: 'Буцаалтын хугацаа 3 хоног болж буурлаа',
    excerpt: 'Автоматжуулсан буцаалтын урсгалаар мөнгө 3 ажлын өдөрт багтаж буцна.',
    href: '/news',
  },
  {
    date: '2026-08-30',
    category: 'Технологи',
    title: 'Суудлын зураглал бодит цагт шинэчлэгддэг боллоо',
    excerpt: 'Одоо суудлын төлөв өөрчлөгдөх бүрд шууд харагдана. Хуучирсан мэдээлэл байхгүй.',
    href: '/news',
  },
];

export default function HomePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-8 sm:py-12">
      {/* The banner is the LCP element, but it is deliberately NOT preloaded.
          The <picture> sits in the first HTML response, so the preload scanner
          already discovers its AVIF source immediately, and `fetchPriority` on the
          <img> carries the priority hint. A separate <link rel=preload> resolves
          the URL independently of <picture>, so any mismatch in `sizes` or format
          negotiation makes the browser fetch the preloaded frame and then fetch
          the real one as well - an extra download on every visit. */}
      <div className="flex flex-col gap-8">
        <HeroBanner
          eyebrow="Ухаалгаар нис"
          title="Хаашаа нисэх вэ?"
          subtitle="Үнэ харьцуулж, амьд суудлын зураглалаас суудлаа сонгож, төлбөр баталгаажмагц boarding pass-аа аваарай."
        />

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Нислэг хайх</h2>
          </CardHeader>
          <CardBody>
            <SearchForm />
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="features-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
            Яагаад бид гэж?
          </h2>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Аялал эхлэхээс өмнөх бүх алхмыг нэг дор, төвөггүй болгосон.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardBody className="flex flex-col gap-2">
                <span aria-hidden="true" className="text-2xl">
                  {feature.icon}
                </span>
                <h3 className="text-sm font-semibold">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{feature.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="destinations-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="destinations-heading" className="text-2xl font-semibold tracking-tight">
              Эрэлттэй чиглэлүүд
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Хамгийн их аялагддаг хотууд. Үнэ нь нэг талын, эдийн засгийн ангиллаас эхэлнэ.
            </p>
          </div>
          <Link
            href="/search"
            className="text-brand-600 dark:text-brand-400 text-sm font-medium transition hover:underline"
          >
            Бүх чиглэл харах →
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DESTINATIONS.map((destination) => (
            <li key={destination.code}>
              <Link
                href={destination.href}
                className="rounded-card shadow-card hover:border-brand-400 focus-visible:outline-brand-500 flex h-full items-center justify-between gap-4 border border-slate-200 bg-white px-5 py-4 transition hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{destination.city}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {destination.country} · {destination.code}
                  </span>
                </span>
                <span className="text-brand-600 dark:text-brand-400 text-sm font-semibold">
                  {destination.price}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
            Хэрхэн ажилладаг вэ
          </h2>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Дөрвөн алхам. Дунджаар хоёр минутын дотор захиалгаа баталгаажуулна.
          </p>
        </div>

        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((item) => (
            <li key={item.step}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col gap-2">
                  <span className="text-brand-600 dark:text-brand-400 text-xs font-bold tracking-widest">
                    {item.step}
                  </span>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{item.body}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="stats-heading"
        className="rounded-card from-brand-600 to-brand-800 bg-gradient-to-r px-6 py-10 text-white sm:px-10"
      >
        <h2 id="stats-heading" className="sr-only">
          Бидний тухай тоо баримт
        </h2>
        <dl className="grid gap-6 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="text-brand-100 text-xs font-medium tracking-wide uppercase">
                {stat.label}
              </dt>
              <dd className="text-3xl font-semibold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="news-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="news-heading" className="text-2xl font-semibold tracking-tight">
              Мэдээ
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Шинэ чиглэл, үйлчилгээний өөрчлөлт, аяллын зөвлөгөө.
            </p>
          </div>
          <Link
            href="/news"
            className="text-brand-600 dark:text-brand-400 text-sm font-medium transition hover:underline"
          >
            Бүх мэдээ →
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {NEWS_TEASER.map((article) => (
            <li key={article.title}>
              <Link href={article.href} className="rounded-card flex h-full">
                <Card className="hover:border-brand-400 h-full w-full transition hover:shadow-lg">
                  <CardBody className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200 rounded-full px-2.5 py-0.5 font-medium">
                        {article.category}
                      </span>
                      <time dateTime={article.date} className="text-slate-500 dark:text-slate-400">
                        {formatDate(article.date)}
                      </time>
                    </div>
                    <h3 className="text-sm leading-snug font-semibold">{article.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{article.excerpt}</p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="cta-heading"
        className="rounded-card border border-slate-200 bg-slate-50 px-6 py-10 text-center sm:px-10 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="cta-heading" className="text-2xl font-semibold tracking-tight">
          Аялалдаа бэлэн үү?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Бүртгүүлээд захиалгаа хянаж, нэг товшилтоор дараагийн нислэгээ захиалаарай.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/search"
            className="bg-brand-600 hover:bg-brand-700 focus-visible:outline-brand-500 inline-flex h-10 items-center rounded-full px-6 text-sm font-medium text-white transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Нислэг хайх
          </Link>
          <Link
            href="/about"
            className="inline-flex h-10 items-center rounded-full border border-slate-300 px-6 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Бидний тухай
          </Link>
        </div>
      </section>
    </main>
  );
}

/** Renders an ISO date as `2026.09.28`, which reads naturally in Mongolian. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${year}.${month}.${day}`;
}

