import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { display, hand } from '@/components/landing/fonts';
import { Toaster } from '@/components/ui/toast';
import { MotionProvider } from '@/lib/motion/motion-provider';
import '@/styles/globals.css';

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

export const metadata: Metadata = {
  ...(appUrl && /^https?:\/\//i.test(appUrl) ? { metadataBase: new URL(appUrl) } : {}),
  title: {
    default: 'Motionpop — AI Video Editor',
    template: '%s · Motionpop',
  },
  description:
    'The AI video editor that follows every word. Drop a talking video, a voiceover or a script and get captions, graphics and motion.',
  openGraph: {
    title: 'Motionpop — AI Video Editor',
    description:
      'The AI video editor that follows every word. Drop a talking video, a voiceover or a script and get captions, graphics and motion.',
    type: 'website',
    siteName: 'Motionpop',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Motionpop — AI Video Editor',
    description:
      'The AI video editor that follows every word. Drop a talking video, a voiceover or a script and get captions, graphics and motion.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${display.variable} ${hand.variable}`}
    >
      <body>
        <MotionProvider>
          {children}
          <Toaster />
        </MotionProvider>
      </body>
    </html>
  );
}
