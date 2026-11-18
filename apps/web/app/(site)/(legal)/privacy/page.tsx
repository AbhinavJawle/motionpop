import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = { title: 'Privacy · motionpop' };

const ISSUES = 'https://github.com/AbhinavJawle/motionpop/issues';

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="16 November 2026">
      <p>
        Motionpop is a small, open-source project built and run by one person. This page says
        plainly what it stores, where your words and voice go, and how to remove them.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address, and your name and photo if you sign in
          with Google.
        </li>
        <li>
          <strong>Your projects:</strong> titles, transcripts, slots, graphics and their versions.
          They are saved in your browser first and copied to your account so they open on any
          device.
        </li>
        <li>
          <strong>Your voice recordings:</strong> kept in your browser and, when you are signed in,
          in your account&apos;s storage. A copy is used to render each video you export.
        </li>
        <li>
          <strong>Exports and share links:</strong> the videos you render. Anyone holding a share
          link can watch that video until you turn the link off.
        </li>
        <li>
          <strong>Credits and usage:</strong> your credit balance and history, and for each AI call
          its task, model, where it ran, how long it took and what it cost. This powers the usage
          chart in Settings.
        </li>
      </ul>

      <h2>Where your words and voice go</h2>
      <ul>
        <li>
          <strong>On your device:</strong> transcription and quick edits run in your browser when it
          can. Nothing leaves your computer for those.
        </li>
        <li>
          <strong>In the cloud:</strong> when an action runs in the cloud (it is marked with a cloud
          and its price), the text it needs (for example the words of one slot, your prompt, or a
          cropped frame for a frame note) is sent to Google&apos;s Gemini models through Firebase AI
          Logic. Voices made from a script are generated the same way. Custom graphics may instead
          be written by Anthropic&apos;s Claude, through our server.
        </li>
        <li>
          <strong>Hosting:</strong> accounts, projects, files and rendering run on Google Cloud and
          Firebase in the United States. Sign-in is protected by Firebase App Check, which uses
          reCAPTCHA.
        </li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>No ads, no tracking pixels, and no selling or sharing of your data.</li>
        <li>We do not use your projects or voice to train models.</li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        Deleting a project removes it from your account, with its audio, renders and share links. To
        delete your whole account, open an issue on the{' '}
        <a href={ISSUES} target="_blank" rel="noreferrer">
          project&apos;s GitHub
        </a>{' '}
        without personal details and we will reply with a private way to confirm it is you.
      </p>

      <h2>Changes</h2>
      <p>If this page changes, the date at the top changes with it.</p>
    </LegalPage>
  );
}
