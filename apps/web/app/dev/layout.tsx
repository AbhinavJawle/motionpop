import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Dev-only tools (walking skeleton, UI gallery). Never served in production.
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <div className="min-h-dvh bg-bg p-8 text-text">{children}</div>;
}
