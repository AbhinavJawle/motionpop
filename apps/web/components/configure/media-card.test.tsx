// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@/lib/pipeline/jobs-store';
import { initialProcessing } from '@/lib/pipeline/processing-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as never;
}

import { MediaCard, pipLine } from './media-card';

afterEach(cleanup);

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j-1',
  title: 'Take',
  kind: 'voiceover',
  source: 'upload',
  media: { name: 'take.mp3', mimeType: 'audio/mpeg', sizeBytes: 2_500_000, durationMs: 83_000 },
  status: 'preparing',
  prep: { pct: 42, stage: 'transcribing' },
  processing: initialProcessing(),
  createdAt: 0,
  progressPct: 0,
  etaMs: null,
  ...over,
});

describe('MediaCard', () => {
  it('shows "Preparing N%" and the bar value while preparing', () => {
    render(<MediaCard job={job()} onRemove={() => {}} />);
    expect(screen.getByText('Preparing 42%')).toBeTruthy();
    expect(screen.getByText('free · on this device')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText('take.mp3')).toBeTruthy();
    expect(screen.getByText('1:23')).toBeTruthy();
    expect(screen.getByText('2.5 MB')).toBeTruthy();
  });

  it('shows "Ready" when preparation is done', () => {
    render(<MediaCard job={job({ prep: { pct: 100, stage: 'ready' } })} onRemove={() => {}} />);
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Preparing/)).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('shows the error, a full red bar and "Choose another file" on failure', () => {
    const onRemove = vi.fn();
    render(
      <MediaCard
        job={job({
          prep: { pct: 0, stage: 'failed', error: "I couldn't hear anything in that file." },
        })}
        onRemove={onRemove}
      />,
    );
    expect(screen.getAllByText("I couldn't hear anything in that file.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Preparing/)).toBeNull();
    expect(screen.queryByText('free · on this device')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a normal take is removed with "Remove this take"', () => {
    const onRemove = vi.fn();
    render(<MediaCard job={job()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this take' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a video shows its frame, resolution and aspect', () => {
    render(
      <MediaCard
        job={job({
          kind: 'video',
          media: {
            name: 'clip.mp4',
            mimeType: 'video/mp4',
            sizeBytes: 12_000_000,
            durationMs: 30_000,
            width: 1080,
            height: 1920,
            thumbUrl: 'data:image/jpeg;base64,AAAA',
          },
        })}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText('1080×1920')).toBeTruthy();
    expect(screen.getByText('9:16')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
  });

  it('a script shows its word count and its first lines, not file facts', () => {
    render(
      <MediaCard
        job={job({
          script: 'Revenue grew forty percent since twenty twenty. Here is why.',
          source: 'tts',
          media: { name: 'Revenue grew', mimeType: 'audio/wav', sizeBytes: 0 },
          prep: { pct: 100, stage: 'ready' },
        })}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText('Your script')).toBeTruthy();
    expect(screen.getByText('10 words · voice made after Create')).toBeTruthy();
    expect(screen.getByText(/Revenue grew forty percent/)).toBeTruthy();
    expect(screen.queryByText('Duration')).toBeNull();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
  });
});

describe('pipLine', () => {
  it('follows the stage and the kind', () => {
    expect(pipLine(job({ prep: { pct: 0, stage: 'failed' } }))).toBe('Hmm, that one slipped.');
    expect(pipLine(job({ prep: { pct: 100, stage: 'ready' } }))).toBe('Got every word!');
    expect(pipLine(job())).toBe('Listening closely…');
    expect(pipLine(job({ prep: { pct: 2, stage: 'reading' } }))).toBe('Reading your audio…');
    expect(pipLine(job({ kind: 'video', prep: { pct: 2, stage: 'reading' } }))).toBe(
      'Reading your video…',
    );
    expect(pipLine(job({ script: 'hi there' }))).toBe('Your words are ready!');
  });
});
