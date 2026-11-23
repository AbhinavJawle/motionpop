import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { display, hand } from '@/components/landing/fonts';
import { Toaster } from '@/components/ui/toast';
import { MotionProvider } from '@/lib/motion/motion-provider';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'motionpop',
  description:
    'The AI video editor that follows every word. Drop a talking video, a voiceover or a script and get captions, graphics and motion.',
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
