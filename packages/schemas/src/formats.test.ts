import { describe, expect, it } from 'vitest';
import { FORMAT_PRESETS, FormatPresetSchema, getSafeArea } from './formats';

describe('format presets', () => {
  it('have the MVP output sizes at 30fps', () => {
    expect(FORMAT_PRESETS['youtube-16x9']).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(FORMAT_PRESETS['shorts-9x16']).toMatchObject({ width: 1080, height: 1920, fps: 30 });
    expect(FORMAT_PRESETS['square-1x1']).toMatchObject({ width: 1080, height: 1080, fps: 30 });
    expect(FORMAT_PRESETS['product-demo-16x9']).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
    });
  });

  it('all parse with the schema', () => {
    for (const preset of Object.values(FORMAT_PRESETS)) {
      expect(() => FormatPresetSchema.parse(preset)).not.toThrow();
    }
  });

  it('computes the YouTube title-safe area', () => {
    expect(getSafeArea(FORMAT_PRESETS['youtube-16x9'])).toEqual({
      x: 96,
      y: 54,
      width: 1728,
      height: 972,
    });
  });
});
