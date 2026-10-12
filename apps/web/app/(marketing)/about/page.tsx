import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Бидний тухай',
  description:
    'Airline Booking бол нислэг хайх, суудал сонгох, тасалбар авах үйл явцыг хялбарчлахыг зорьсон баг юм.',
};

const STATS = [
  { value: '2019', label: 'Үүсгэн байгуулсан' },
  { value: '120+', label: 'Чиглэл' },
  { value: '480K', label: 'Аялагч' },
  { value: '32', label: 'Ажилтан' },
];

const VALUES = [
  {
    title: 'Ил тод үнэ',
    body: 'Нэмэлт хураамж нуухгүй. Харсан үнэ нь төлөх үнэ.',
  },
  {
    title: 'Хурдтай шийдэл',
    body: 'Асуулт гарвал чат, утсаар хурдан хариулна. Хүлээлгэхгүй.',
  },
  {
    title: 'Энгийн байдал',
    body: 'Нарийн журам биш, ойлгомжтой алхмууд. Хэрэглэгч эхэнд.',
  },
  {
    title: 'Хариуцлага',
    body: 'Алдаа гарвал засна. Буцаалт, өөрчлөлт бүрийг бичгээр баталгаажуулна.',
  },
];

const MILESTONES = [
  {
    year: '2019',
    title: 'Эхлэл',
    body: 'Гурван хүнтэй баг Улаанбаатарт анхны хувилбарыг гаргасан.',
  },
  {
    year: '2021',
    title: 'Өргөжилт',
    body: 'Дотоодын 8 чиглэлд үйлчилж, 50,000 аялагчид хүрсэн.',
  },
  { year: '2023', title: 'Олон улс', body: 'Сөүл, Бээжин, Токио чиглэлүүд нээгдсэн.' },
  { year: '2026', title: 'Өнөөдөр', body: '120 гаруй чиглэл, 32 ажилтан, 480,000 аялагч.' },
];

const TEAM = [
  { name: 'Бат-Эрдэнэ Д.', role: 'Гүйцэтгэх захирал', initials: 'БЭ' },
  { name: 'Сарангэрэл М.', role: 'Технологийн захирал', initials: 'СМ' },
  { name: 'Тэмүүлэн Б.', role: 'Үйл ажиллагааны захирал', initials: 'ТБ' },
  { name: 'Оюунчимэг Ц.', role: 'Хэрэглэгчийн туршлагын ахлах', initials: 'ОЦ' },
];

export default function AboutPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Нүүр
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-slate-900 dark:text-slate-100">
            Бидний тухай
          </li>
        </ol>
      </nav>

      <section aria-labelledby="about-hero" className="flex flex-col gap-4">
        <p className="text-brand-600 dark:text-brand-400 text-xs font-semibold tracking-[0.18em] uppercase">
          Бидний тухай
        </p>
        <h1
          id="about-hero"
          className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          Аяллыг хүндрэлгүй болгох нь бидний зорилго
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
          Airline Booking нь 2019 онд Улаанбаатарт эхэлсэн. Нислэг хайх, үнэ харьцуулах, суудал
          сонгох, тасалбар авах гэсэн дөрвөн төвөгтэй алхмыг нэг энгийн урсгал болгохыг бид зорьж
          байна. Өнөөдөр 120 гаруй чиглэлд үйлчилж, 480,000 гаруй аялагчид үйлчилсэн.
        </p>
      </section>

      <section
        aria-labelledby="about-stats"
        className="rounded-card border border-slate-200 bg-slate-50 px-6 py-8 sm:px-10 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 id="about-stats" className="sr-only">
          Тоо баримт
        </h2>
        <dl className="grid gap-6 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {stat.label}
              </dt>
              <dd className="text-2xl font-semibold tracking-tight">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="mission" className="flex flex-col gap-6">
        <h2 id="mission" className="text-2xl font-semibold tracking-tight">
          Эрхэм зорилго
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Хүрэх зорилт</h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Монголын аялагч бүр нислэгээ гэртээсээ, хэдхэн минутын дотор, ойлгомжтой үнээр
                захиалах боломжтой болгох.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Хэрхэн хүрэх вэ</h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Технологид тулгуурласан энгийн урсгал, ил тод үнэ, хурдан хариу үйлчилгээгээр
                дамжин аяллын туршлагыг сайжруулна.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      <section aria-labelledby="values" className="flex flex-col gap-6">
        <h2 id="values" className="text-2xl font-semibold tracking-tight">
          Үнэт зүйлс
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((value) => (
            <Card key={value.title}>
              <CardBody className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{value.title}</h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {value.body}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="milestones" className="flex flex-col gap-6">
        <h2 id="milestones" className="text-2xl font-semibold tracking-tight">
          Түүхэн замнал
        </h2>
        <ol className="flex flex-col gap-0">
          {MILESTONES.map((milestone, index) => (
            <li key={milestone.year} className="flex gap-5">
              <div className="flex flex-col items-center">
                <span className="bg-brand-600 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                  {milestone.year.slice(2)}
                </span>
                {index < MILESTONES.length - 1 ? (
                  <span aria-hidden="true" className="w-px flex-1 bg-slate-200 dark:bg-slate-800" />
                ) : null}
              </div>
              <div className="flex flex-col gap-1 pb-8">
                <h3 className="text-sm font-semibold">
                  {milestone.year} · {milestone.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{milestone.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="team" className="flex flex-col gap-6">
        <h2 id="team" className="text-2xl font-semibold tracking-tight">
          Баг
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <li key={member.name}>
              <Card className="h-full">
                <CardBody className="flex flex-col items-center gap-3 text-center">
                  <span
                    aria-hidden="true"
                    className="bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200 flex size-14 items-center justify-center rounded-full text-base font-bold"
                  >
                    {member.initials}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{member.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {member.role}
                    </span>
                  </span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="about-cta"
        className="rounded-card from-brand-600 to-brand-800 bg-gradient-to-r px-6 py-10 text-center text-white sm:px-10"
      >
        <h2 id="about-cta" className="text-2xl font-semibold tracking-tight">
          Бидэнтэй хамт нисээрэй
        </h2>
        <p className="text-brand-100 mx-auto mt-2 max-w-xl text-sm">
          Асуулт байвал бидэнтэй холбогдоорой. Ажлын өдрүүдэд 24 цагийн дотор хариулна.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="text-brand-700 hover:bg-brand-50 inline-flex h-10 items-center rounded-full bg-white px-6 text-sm font-medium transition"
          >
            Холбоо барих
          </Link>
          <Link
            href="/news"
            className="inline-flex h-10 items-center rounded-full border border-white/40 px-6 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Мэдээ үзэх
          </Link>
        </div>
      </section>
    </main>
  );
}
