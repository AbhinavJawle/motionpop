import { redirect } from 'next/navigation';

/** The landing page is spec 16; until then the app starts at the dashboard. */
export default function Home() {
  redirect('/dashboard');
}
