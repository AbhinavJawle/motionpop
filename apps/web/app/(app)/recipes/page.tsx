import type { Metadata } from 'next';
import { RecipesPage } from '@/components/recipes/recipes-page';

export const metadata: Metadata = {
  title: 'Recipes · motionpop',
  description:
    'Every Motionpop editing recipe, its director skill, layout mix, templates, soundtrack brief and curated styles.',
};

export default function Page() {
  return <RecipesPage />;
}
