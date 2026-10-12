import { Card, CardBody } from '@repo/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatArticleDate, getArticle, NEWS_ARTICLES } from '../../../../lib/news';

import type { Metadata } from 'next';

interface ArticlePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

/** Prerenders every article at build time; the list is static data. */
export function generateStaticParams(): { slug: string }[] {
  return NEWS_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) {
    return { title: 'Мэдээ олдсонгүй' };
  }

  return {
    title: article.title,
    description: article.excerpt,
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: 'article',
      publishedTime: article.date,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) {
    notFound();
  }

  const related = NEWS_ARTICLES.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="transition hover:text-slate-900 dark:hover:text-slate-100">
              Нүүр
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href="/news"
              className="transition hover:text-slate-900 dark:hover:text-slate-100"
            >
              Мэдээ
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="truncate font-medium text-slate-900 dark:text-slate-100">
            {article.category}
          </li>
        </ol>
      </nav>

      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-200 rounded-full px-2.5 py-0.5 font-medium">
              {article.category}
            </span>
            <time dateTime={article.date} className="text-slate-500 dark:text-slate-400">
              {formatArticleDate(article.date)}
            </time>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{article.title}</h1>
          <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400">
            {article.excerpt}
          </p>
        </header>

        <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
          {article.body.map((paragraph) => (
            <p
              key={paragraph}
              className="text-base leading-relaxed text-slate-700 dark:text-slate-300"
            >
              {paragraph}
            </p>
          ))}
        </div>

        <footer className="flex flex-col gap-4 border-t border-slate-200 pt-6 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Асуулт байвал{' '}
            <Link href="/contact" className="text-brand-600 dark:text-brand-400 hover:underline">
              бидэнтэй холбогдоорой
            </Link>
            .
          </p>
        </footer>
      </article>

      {related.length > 0 ? (
        <section aria-labelledby="related-news" className="flex flex-col gap-5">
          <h2 id="related-news" className="text-lg font-semibold tracking-tight">
            Бусад мэдээ
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/news/${item.slug}`} className="rounded-card flex h-full">
                  <Card className="hover:border-brand-400 h-full w-full transition hover:shadow-lg">
                    <CardBody className="flex h-full flex-col gap-2">
                      <time
                        dateTime={item.date}
                        className="text-xs text-slate-500 dark:text-slate-400"
                      >
                        {formatArticleDate(item.date)}
                      </time>
                      <h3 className="text-sm leading-snug font-semibold">{item.title}</h3>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
