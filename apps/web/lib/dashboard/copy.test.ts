import { describe, expect, it } from 'vitest';
import { INTAKE_MESSAGES } from '../audio/intake';
import { DASHBOARD_COPY, START_COPY } from './copy';

/** Spec 39 R1.1, R1.2: the product leads with video and still takes voiceovers and scripts. */
describe('video-first copy', () => {
  const listsVideoFirst = (s: string) => {
    expect(s).toMatch(/MP4/);
    expect(s).toMatch(/MOV/);
    expect(s).toMatch(/WebM/);
    expect(s.indexOf('MP4')).toBeLessThan(s.indexOf('MP3'));
    expect(s.indexOf('WebM')).toBeLessThan(s.indexOf('MP3'));
    expect(s).toMatch(/M4A/);
  };

  it('/start leads with video and names video and audio on the upload panel', () => {
    expect(START_COPY.headline).toMatch(/video/i);
    expect(START_COPY.subline).toMatch(/video/i);
    expect(START_COPY.subline).toMatch(/voiceover|script/i);
    expect(START_COPY.upload.title).toBe('Upload video or audio');
    expect(START_COPY.upload.drop).toMatch(/video or audio/);
    listsVideoFirst(START_COPY.upload.formats);
  });

  it('the dashboard capture bar, empty state and drag overlay mention video', () => {
    expect(DASHBOARD_COPY.capture.hint).toMatch(/video/);
    expect(DASHBOARD_COPY.empty.body).toMatch(/video/);
    expect(DASHBOARD_COPY.empty.body).toMatch(/voiceover/);
    expect(DASHBOARD_COPY.empty.body).toMatch(/script/);
    listsVideoFirst(DASHBOARD_COPY.drag.formats);
  });

  it('the file-type error lists the same formats in the same order', () => {
    listsVideoFirst(INTAKE_MESSAGES['not-audio']);
  });

  it('keeps no third-party creator or brand names in the copy', () => {
    const all = JSON.stringify([START_COPY, DASHBOARD_COPY]);
    expect(all).not.toMatch(/capcut|descript|veed|runway|premiere|final cut/i);
  });
});
