import Link from 'next/link';

/**
 * Site footer.
 *
 * Server component — no interactivity beyond links, so it costs nothing on the
 * client. The newsletter form is intentionally inert: this project has no
 * marketing backend and a fake submit handler would be worse than none.
 */

const COMPANY_LINKS = [
  { href: '/about', label: 'Бидний тухай' },
  { href: '/news', label: 'Мэдээ' },
  { href: '/contact', label: 'Холбоо барих' },
];

const HELP_LINKS = [
  { href: '/my-bookings', label: 'Миний захиалгууд' },
  { href: '/search', label: 'Нислэг хайх' },
  { href: '/register', label: 'Бүртгүүлэх' },
  { href: '/login', label: 'Нэвтрэх' },
];

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="bg-brand-600 flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white"
              >
                AB
              </span>
              Airline Booking
            </Link>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Нислэг хайх, суудал сонгох, тасалбар авах — бүгд нэг дор. Аялал эхлэхээс өмнөх
              бүх алхмыг хялбар болгосон.
            </p>
            <ul className="flex items-center gap-2" aria-label="Сошиал хаягууд">
              {[
                { label: 'Facebook', href: 'https://facebook.com' },
                { label: 'Instagram', href: 'https://instagram.com' },
                { label: 'X', href: 'https://x.com' },
              ].map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex size-9 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {social.label.slice(0, 1)}
                    <span className="sr-only">{social.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn title="Компани" links={COMPANY_LINKS} />
          <FooterColumn title="Тусламж" links={HELP_LINKS} />

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold">Холбоо барих</h2>
            <ul className="flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <a href="tel:+97670000000" className="transition hover:text-slate-900 dark:hover:text-slate-100">
                  +976 7000 0000
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@airline-booking.mn"
                  className="transition hover:text-slate-900 dark:hover:text-slate-100"
                >
                  support@airline-booking.mn
                </a>
              </li>
              <li className="leading-relaxed">
                Сүхбаатарын талбай 1,
                <br />
                Улаанбаатар 14200, Монгол
              </li>
              <li className="leading-relaxed">Тусламж: өдөр бүр 08:00 — 22:00</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
          <h2 className="text-sm font-semibold">Хямдрал, шинэ чиглэлийн мэдээлэл</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Сард нэг удаа. Зөвхөн үнэ цэнтэй саналууд.
          </p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" aria-label="Мэдээллийн захиалга">
            <label htmlFor="newsletter-email" className="sr-only">
              Имэйл хаяг
            </label>
            <input
              id="newsletter-email"
              type="email"
              name="email"
              placeholder="you@example.com"
              className="focus-visible:outline-brand-500 h-10 w-full rounded-full border border-slate-300 bg-white px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 sm:max-w-xs dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 h-10 rounded-full px-5 text-sm font-medium text-white transition"
            >
              Бүртгүүлэх
            </button>
          </form>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:text-slate-400">
          <p>© {new Date().getFullYear()} Airline Booking. Бүх эрх хуулиар хамгаалагдсан.</p>
          <ul className="flex flex-wrap items-center gap-4">
            {['Үйлчилгээний нөхцөл', 'Нууцлалын бодлого', 'Cookie'].map((item) => (
              <li key={item}>
                <Link href="/about" className="transition hover:text-slate-900 dark:hover:text-slate-100">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  readonly title: string;
  readonly links: readonly { readonly href: string; readonly label: string }[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-3 text-sm text-slate-600 dark:text-slate-400">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="transition hover:text-slate-900 dark:hover:text-slate-100">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
