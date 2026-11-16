import { describe, expect, it } from 'vitest';
import { deliveryNote } from './speech';

describe('deliveryNote', () => {
  it('sends the bare script at the natural pace, and the documented "Say …:" form otherwise', () => {
    expect(deliveryNote(1)).toBe('');
    expect(deliveryNote(0.9)).toBe('Say slowly and clearly: ');
    expect(deliveryNote(1.1)).toBe('Say briskly, with energy: ');
  });
});
