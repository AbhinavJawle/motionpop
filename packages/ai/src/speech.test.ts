import { describe, expect, it } from 'vitest';
import { deliveryNote, splitScript } from './speech';

describe('deliveryNote', () => {
  it('sends the bare script at the natural pace, and the documented "Say …:" form otherwise', () => {
    expect(deliveryNote(1)).toBe('');
    expect(deliveryNote(0.9)).toBe('Say slowly and clearly: ');
    expect(deliveryNote(1.1)).toBe('Say briskly, with energy: ');
  });
});

describe('splitScript', () => {
  it('keeps short scripts whole and splits long ones on sentence ends, in order', () => {
    expect(splitScript('One. Two.')).toEqual(['One. Two.']);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = splitScript(long, 300);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 300)).toBe(true);
    expect(parts.every((p) => p.endsWith('.'))).toBe(true);
    expect(parts.join(' ')).toBe(long);
  });
  it('breaks a run-on sentence at commas or spaces, never mid-word', () => {
    const runOn = Array.from({ length: 80 }, (_, i) => `word${i}`).join(', ');
    const parts = splitScript(runOn, 200);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(' ').split(/[\s,]+/).filter(Boolean)).toEqual(runOn.split(/[\s,]+/));
  });
});
