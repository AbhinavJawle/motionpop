import type { Metadata } from 'next';
import { SettingsPage } from '@/components/settings/settings-page';

export const metadata: Metadata = { title: 'Settings · motionpop' };

export default function Page() {
  return <SettingsPage />;
}
