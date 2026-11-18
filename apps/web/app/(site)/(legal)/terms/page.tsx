import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Terms · motionpop' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="16 November 2026">
      <p>
        Motionpop turns your voice into videos with motion graphics. By using it you agree to these
        terms. They are short on purpose.
      </p>

      <h2>Your content is yours</h2>
      <p>
        You own your voice recordings, scripts, projects and exported videos. You let us store and
        process them only to run Motionpop for you: transcribing, generating graphics, rendering and
        showing your share links.
      </p>

      <h2>Use it fairly</h2>
      <ul>
        <li>Only upload voices you have the right to use, and never impersonate someone.</li>
        <li>Don&apos;t make anything illegal, hateful or meant to deceive.</li>
        <li>Don&apos;t try to break, overload or get around the limits of the service.</li>
      </ul>
      <p>We may suspend accounts that break these rules.</p>

      <h2>Credits</h2>
      <p>
        New accounts get free credits. Cloud actions show their price before you click and are
        refunded when they fail. Credits have no cash value and can&apos;t be transferred. There are
        no paid plans yet.
      </p>

      <h2>AI output</h2>
      <p>
        Graphics, voices and captions are made with AI and can be wrong. Check facts, numbers and
        names before you publish.
      </p>

      <h2>No guarantees</h2>
      <p>
        Motionpop is an early, independent project. It is provided as it is, without warranties, and
        it may change, pause or end. Export anything you want to keep. To the extent the law allows,
        we are not liable for lost data or indirect damages.
      </p>

      <h2>Open source</h2>
      <p>
        The code is available under the Apache License 2.0. That licence covers the code; these
        terms cover the hosted service.
      </p>

      <h2>Changes</h2>
      <p>If these terms change, the date at the top changes with them.</p>
    </LegalPage>
  );
}
