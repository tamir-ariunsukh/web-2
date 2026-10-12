import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Холбоо барих',
  description: 'Асуулт, санал хүсэлт, тусламж — бидэнтэй холбогдох бүх суваг.',
};

const CHANNELS = [
  {
    title: 'Утас',
    value: '+976 7000 0000',
    href: 'tel:+97670000000',
    note: 'Өдөр бүр 08:00 — 22:00',
  },
  {
    title: 'Имэйл',
    value: 'support@airline-booking.mn',
    href: 'mailto:support@airline-booking.mn',
    note: '24 цагийн дотор хариулна',
  },
  {
    title: 'Буцаалт, өөрчлөлт',
    value: 'refunds@airline-booking.mn',
    href: 'mailto:refunds@airline-booking.mn',
    note: 'Ажлын өдрүүдэд 09:00 — 18:00',
  },
  {
    title: 'Хамтын ажиллагаа',
    value: 'partners@airline-booking.mn',
    href: 'mailto:partners@airline-booking.mn',
    note: 'Ажлын өдрүүдэд 09:00 — 18:00',
  },
];

const OFFICES = [
  {
    city: 'Улаанбаатар',
    address: 'Сүхбаатарын талбай 1, Улаанбаатар 14200',
    phone: '+976 7000 0000',
    hours: 'Да — Ба 09:00 — 18:00',
  },
  {
    city: 'Сөүл',
    address: 'Gangnam-gu, Teheran-ro 152, Seoul 06236',
    phone: '+82 2 0000 0000',
    hours: 'Да — Ба 09:00 — 18:00',
  },
];

const FAQ = [
  {
    question: 'Захиалгаа хэрхэн цуцлах вэ?',
    answer:
      '"Миний захиалгууд" хуудаснаасаа захиалгаа сонгоод "Цуцлах" товчийг дарна. Буцаалт автоматаар эхэлж, 3 ажлын өдөрт багтаж шийдэгдэнэ.',
  },
  {
    question: 'Нэрийн алдааг засах боломжтой юу?',
    answer:
      'Нислэгээс 24 цагийн өмнө бидэнтэй холбогдвол зөвлөгөө өгнө. Овог, нэрийг бүрэн солих нь агаарын тээвэрлэгчийн дүрмээс хамаарна.',
  },
  {
    question: 'Тасалбар хэзээ ирэх вэ?',
    answer:
      'Төлбөр баталгаажмагц boarding pass автоматаар олгогдож, имэйл болон утасны түрийвчинд нэмэгдэнэ.',
  },
  {
    question: 'Гарах ачааны эрхийг хаанаас харах вэ?',
    answer:
      'Захиалгын дэлгэрэнгүй хуудаснаас тасалбарын хамт ачааны эрхийн мэдээлэл харагдана.',
  },
];

export default function ContactPage(): React.JSX.Element {
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
            Холбоо барих
          </li>
        </ol>
      </nav>

      <section aria-labelledby="contact-hero" className="flex flex-col gap-4">
        <p className="text-brand-600 dark:text-brand-400 text-xs font-semibold tracking-[0.18em] uppercase">
          Холбоо барих
        </p>
        <h1
          id="contact-hero"
          className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          Бидэнд хандаарай
        </h1>
        <p className="max-w-2xl text-base text-slate-600 dark:text-slate-400">
          Асуулт, санал хүсэлт, тусламж хэрэгтэй бол доорх сувгаар холбогдоорой. Захиалгатай
          холбоотой асуултад хурдан хариулахын тулд PNR кодоо бэлэн байлгаарай.
        </p>
      </section>

      <section aria-labelledby="contact-channels" className="flex flex-col gap-6">
        <h2 id="contact-channels" className="text-2xl font-semibold tracking-tight">
          Холбогдох суваг
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <Card key={channel.title}>
              <CardBody className="flex flex-col gap-2">
                <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {channel.title}
                </h3>
                <a
                  href={channel.href}
                  className="text-brand-600 dark:text-brand-400 text-sm font-semibold transition hover:underline"
                >
                  {channel.value}
                </a>
                <p className="text-xs text-slate-500 dark:text-slate-400">{channel.note}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="contact-offices" className="flex flex-col gap-6">
        <h2 id="contact-offices" className="text-2xl font-semibold tracking-tight">
          Оффисууд
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {OFFICES.map((office) => (
            <Card key={office.city}>
              <CardBody className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{office.city}</h3>
                <address className="text-sm leading-relaxed text-slate-600 not-italic dark:text-slate-400">
                  {office.address}
                </address>
                <dl className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex gap-2">
                    <dt className="font-medium">Утас:</dt>
                    <dd>{office.phone}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium">Цаг:</dt>
                    <dd>{office.hours}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="contact-faq" className="flex flex-col gap-6">
        <h2 id="contact-faq" className="text-2xl font-semibold tracking-tight">
          Түгээмэл асуултууд
        </h2>
        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details
              key={item.question}
              className="rounded-card group border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {item.question}
                  <span
                    aria-hidden="true"
                    className="text-slate-400 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
