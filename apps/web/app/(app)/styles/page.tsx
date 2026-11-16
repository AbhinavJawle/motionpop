import type { Metadata } from 'next';
import { StylesGallery } from '@/components/dashboard/styles-gallery';

export const metadata: Metadata = { title: 'Styles · motionpop' };

export default function Page() {
  return <StylesGallery />;
}
