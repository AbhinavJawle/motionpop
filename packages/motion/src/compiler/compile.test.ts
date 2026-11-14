import { describe, expect, it } from 'vitest';
import { compileProject } from './compile';
import type { CompileInput } from './types';

const style = {
  colors: { bg: '#0b0b0f', ink: '#f4f3f8', muted: '#a09eae', accent: '#ff7a3d' },
  fonts: { display: 'Geist', body: 'Geist', mono: 'Geist Mono' },
};
const assets = { runtimeJs: '/*mp*/', hyperframesRuntimeJs: '/*hf*/' };
const input: CompileInput = {
  width: 1280,
  height: 720,
  format: '16:9',
  durationMs: 18000,
  style,
  voiceSrc: 'assets/voice.wav',
  slots: [
    { id: 'slot-1', startMs: 4200, endMs: 7800, componentId: 'big-number', params: { value: 40 } },
    { id: 'slot-2', startMs: 12000, endMs: 15000, componentId: 'big-number', params: { value: 2 } },
  ],
};

describe('compileProject', () => {
  it('emits one .clip per slot with data-start/data-duration in seconds', () => {
    const html = compileProject(input, assets);
    expect(html).toContain('id="slot-1" class="clip mp-slot" data-start="4.2" data-duration="3.6"');
    expect(html).toContain('id="slot-2" class="clip mp-slot" data-start="12" data-duration="3"');
  });

  it('sets the root duration and size and includes the voice clip', () => {
    const html = compileProject(input, assets);
    expect(html).toContain('data-composition-id="motionpop" data-width="1280" data-height="720"');
    expect(html).toContain('data-duration="18"');
    expect(html).toContain(
      '<audio id="voice" class="clip" data-start="0" data-duration="18" src="assets/voice.wav">',
    );
  });

  it('embeds the HyperFrames runtime before the project and our runtime', () => {
    const html = compileProject(input, assets);
    const hf = html.indexOf('/*hf*/');
    const proj = html.indexOf('window.__MP_PROJECT__');
    const mp = html.indexOf('/*mp*/');
    expect(hf).toBeGreaterThan(-1);
    expect(hf).toBeLessThan(proj);
    expect(proj).toBeLessThan(mp);
  });

  it('cannot be broken out of by a closing script tag in params', () => {
    const evil = {
      ...input,
      slots: [{ ...input.slots[0]!, params: { label: '</script><script>alert(1)</script>' } }],
    };
    const html = compileProject(evil, assets);
    expect(html).not.toContain('</script><script>alert(1)');
  });

  it('rejects non-integer or empty slot times', () => {
    expect(() =>
      compileProject({ ...input, slots: [{ ...input.slots[0]!, startMs: 4200.5 }] }, assets),
    ).toThrow(/integer ms/);
    expect(() =>
      compileProject({ ...input, slots: [{ ...input.slots[0]!, endMs: 4200 }] }, assets),
    ).toThrow(/endMs > startMs/);
  });
});
