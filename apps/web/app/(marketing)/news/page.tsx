import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';

import { formatArticleDate, NEWS_ARTICLES } from '../../../lib/news';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Мэдээ',
  description: 'Шинэ чиглэл, үйлчилгээний өөрчлөлт, аяллын зөвлөгөө.',
};

export default function NewsIndexPage(): React.JSX.Element {
  const [lead, ...rest] = NEWS_ARTICLES;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Нүүр
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-slate-900 dark:text-slate-100">
            Мэдээ
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-3">
        <p className="text-brand-600 dark:text-brand-400 text-xs font-semibold tracking-[0.18em] uppercase">
          Мэдээ
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Шинэ мэдээ, зарлалууд
        </h1>
        <p className="max-w-2xl text-base text-slate-600 dark:text-slate-400">
          Шинэ чиглэл, үйлчилгээний өөрчлөлт, аяллын зөвлөгөөг эндээс уншина уу.
        </p>
      </header>

      {lead ? (
        <section aria-labelledby="lead-article">
          <h2 id="lead-article" className="sr-only">
            Онцлох мэдээ
          </h2>
          <Link href={`/news/${lead.slug}`} className="rounded-card block">
            <Card className="hover:border-brand-400 from-brand-50 transition hover:shadow-lg dark:from-brand-950 bg-gradient-to-br to-transparent">
              <CardBody className="flex flex-col gap-4 px-6 py-8 sm:px-10">
                <div className="flex items-center gap-3 text-xs">
                  <span className="bg-brand-600 rounded-full px-2.5 py-0.5 font-medium text-white">
                    Онцлох
                  </span>
                  <span className="bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200 rounded-full px-2.5 py-0.5 font-medium">
                    {lead.category}
                  </span>
                  <time
                    dateTime={lead.date}
                    className="text-slate-500 dark:text-slate-400"
                  >
                    {formatArticleDate(lead.date)}
                  </time>
                </div>
                <h3 className="max-w-3xl text-xl font-semibold tracking-tight sm:text-2xl">
                  {lead.title}
                </h3>
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
                  {lead.excerpt}
                </p>
                <span className="text-brand-600 dark:text-brand-400 text-sm font-medium">
                  Дэлгэрэнгүй унших →
                </span>
              </CardBody>
            </Card>
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="all-articles" className="flex flex-col gap-6">
        <h2 id="all-articles" className="text-2xl font-semibold tracking-tight">
          Бүх мэдээ
        </h2>

        <ul className="grid gap-4 sm:grid-cols-2">
          {rest.map((article) => (
            <li key={article.slug}>
              <Link href={`/news/${article.slug}`} className="rounded-card flex h-full">
                <Card className="hover:border-brand-400 h-full w-full transition hover:shadow-lg">
                  <CardBody className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200 rounded-full px-2.5 py-0.5 font-medium">
                        {article.category}
                      </span>
                      <time
                        dateTime={article.date}
                        className="text-slate-500 dark:text-slate-400"
                      >
                        {formatArticleDate(article.date)}
                      </time>
                    </div>
                    <h3 className="text-base leading-snug font-semibold">{article.title}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{article.excerpt}</p>
                    <span className="text-brand-600 dark:text-brand-400 mt-auto text-sm font-medium">
                      Дэлгэрэнгүй →
                    </span>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
