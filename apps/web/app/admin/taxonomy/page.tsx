import { TaxonomyPanel } from '../../../components/taxonomy-panel';
import { getStaff, getTaxonomy, isAdmin } from '../../../lib/admin';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Taxonomy',
  robots: { index: false },
};

export default async function AdminTaxonomyPage(): Promise<React.JSX.Element> {
  const [staff, taxonomy] = await Promise.all([getStaff(), getTaxonomy()]);

  return (
    <TaxonomyPanel
      categories={taxonomy.categories}
      products={taxonomy.products}
      canEdit={isAdmin(staff)}
    />
  );
}
