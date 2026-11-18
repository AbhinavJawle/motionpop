import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import Script from 'next/script';
import './studio.css';

/**
 * Root layout for the studio (spec 17, D-076): the embedded Pireel editor brings its own Tailwind
 * theme, so it gets its own root layout. Moving between this and the site's root layout is a full
 * page load, so the two stylesheets never meet on one page.
 */
export const metadata: Metadata = {
  title: 'motionpop studio',
  description: "Bring your voice. We'll bring the motion.",
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {/* Our engine for graphic blocks: the in-page preview stage runs block timelines on this page. */}
        <Script src="/mp-runtime/block-runtime.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
