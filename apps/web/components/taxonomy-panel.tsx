'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  deleteCategoryAction,
  deleteProductAction,
  upsertCategoryAction,
  upsertProductAction,
} from '../lib/admin-actions';

import type { Category, Product } from '../lib/admin';

const KINDS = ['SEAT', 'BAGGAGE', 'INSURANCE', 'MEAL', 'LOUNGE', 'OTHER'] as const;

export interface TaxonomyPanelProps {
  readonly categories: readonly Category[];
  readonly products: readonly Product[];
  readonly canEdit: boolean;
}

/** Category tree and the products filed under it. Every write goes through the API. */
export function TaxonomyPanel({
  categories,
  products,
  canEdit,
}: TaxonomyPanelProps): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [catSlug, setCatSlug] = useState('');
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catParent, setCatParent] = useState('');

  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodKind, setProdKind] = useState<string>('OTHER');
  const [prodCategory, setProdCategory] = useState(categories[0]?.id ?? '');

  function run(action: () => Promise<{ error?: string }>, success: string): void {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.error) {
          setError(result.error);
          return;
        }
        setNotice(success);
        router.refresh();
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {notice}
        </p>
      ) : null}

      {canEdit ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parent = categories.find((category) => category.id === catParent);
              run(
                () =>
                  upsertCategoryAction({
                    slug: catSlug,
                    name: catName,
                    description: catDescription || null,
                    parentSlug: parent?.slug ?? null,
                  }),
                `Category "${catName}" saved`,
              );
              setCatSlug('');
              setCatName('');
              setCatDescription('');
            }}
            className="rounded-card shadow-card flex flex-col gap-4 border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-semibold">Add or update a category</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Matched by slug, so saving an existing slug updates it.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug" hint="lowercase, hyphens">
                <input
                  required
                  value={catSlug}
                  onChange={(event) => setCatSlug(event.target.value)}
                  placeholder="priority-boarding"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
              <Field label="Name">
                <input
                  required
                  value={catName}
                  onChange={(event) => setCatName(event.target.value)}
                  placeholder="Priority boarding"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
              <Field label="Parent" hint="optional">
                <select
                  value={catParent}
                  onChange={(event) => setCatParent(event.target.value)}
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                >
                  <option value="">Top level</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description" hint="optional">
                <input
                  value={catDescription}
                  onChange={(event) => setCatDescription(event.target.value)}
                  placeholder="Board before general cabin"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="bg-brand-600 hover:bg-brand-700 self-start inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition disabled:opacity-50"
            >
              Save category
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  upsertProductAction({
                    sku: prodSku,
                    name: prodName,
                    priceMinor: Math.round(Number(prodPrice) * 100),
                    kind: prodKind,
                    categoryId: prodCategory,
                  }),
                `Product "${prodName}" saved`,
              );
              setProdSku('');
              setProdName('');
              setProdPrice('');
            }}
            className="rounded-card shadow-card flex flex-col gap-4 border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-semibold">Add or update a product</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Matched by SKU. Price is entered in major units and stored in minor units.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU">
                <input
                  required
                  value={prodSku}
                  onChange={(event) => setProdSku(event.target.value.toUpperCase())}
                  placeholder="PB-FAST"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
              <Field label="Name">
                <input
                  required
                  value={prodName}
                  onChange={(event) => setProdName(event.target.value)}
                  placeholder="Priority boarding"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
              <Field label="Price" hint="USD">
                <input
                  required
                  value={prodPrice}
                  onChange={(event) => setProdPrice(event.target.value)}
                  inputMode="decimal"
                  placeholder="22.00"
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                />
              </Field>
              <Field label="Kind">
                <select
                  value={prodKind}
                  onChange={(event) => setProdKind(event.target.value)}
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  required
                  value={prodCategory}
                  onChange={(event) => setProdCategory(event.target.value)}
                  className="focus:ring-brand-500 dark:bg-slate-950 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none dark:border-slate-700"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <button
              type="submit"
              disabled={pending || categories.length === 0}
              className="bg-brand-600 hover:bg-brand-700 self-start inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white transition disabled:opacity-50"
            >
              Save product
            </button>
          </form>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Categories</h2>
        <div className="rounded-card shadow-card overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Products</th>
                <th className="px-5 py-3 font-medium">Active</th>
                {canEdit ? <th className="px-5 py-3 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 5 : 4}
                    className="px-5 py-6 text-center text-sm text-slate-600 dark:text-slate-400"
                  >
                    No categories yet.
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr
                    key={category.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-5 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{category.name}</span>
                        {category.description ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {category.description}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{category.slug}</td>
                    <td className="px-5 py-3 tabular-nums">{category.productCount}</td>
                    <td className="px-5 py-3">{category.isActive ? 'Yes' : 'No'}</td>
                    {canEdit ? (
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending || category.productCount > 0}
                          title={
                            category.productCount > 0
                              ? 'Move or delete the products first'
                              : undefined
                          }
                          onClick={() =>
                            run(
                              () => deleteCategoryAction(category.id),
                              `Category "${category.name}" deleted`,
                            )
                          }
                          className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-40 dark:bg-red-950 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Products</h2>
        <div className="rounded-card shadow-card overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">SKU</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Kind</th>
                <th className="px-5 py-3 font-medium">Price</th>
                {canEdit ? <th className="px-5 py-3 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 6 : 5}
                    className="px-5 py-6 text-center text-sm text-slate-600 dark:text-slate-400"
                  >
                    No products yet.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-5 py-3 font-medium">{product.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{product.sku}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                      {product.categoryName}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {product.kind}
                    </td>
                    <td className="px-5 py-3 tabular-nums">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: product.currency,
                      }).format(product.priceMinor / 100)}
                    </td>
                    {canEdit ? (
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => deleteProductAction(product.id),
                              `Product "${product.name}" deleted`,
                            )
                          }
                          className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-40 dark:bg-red-950 dark:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}
