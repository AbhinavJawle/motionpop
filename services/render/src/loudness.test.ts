import { describe, expect, it } from 'vitest';
import { parseLoudnorm } from './ffmpeg';

describe('parseLoudnorm (spec 27 R3.3)', () => {
  it('reads the first-pass measurement from the end of the log', () => {
    const log = `ffmpeg version 7
[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-17.52",
	"input_tp" : "-3.61",
	"input_lra" : "6.40",
	"input_thresh" : "-27.70",
	"output_i" : "-14.02",
	"output_tp" : "-1.00",
	"output_lra" : "5.90",
	"output_thresh" : "-24.20",
	"normalization_type" : "dynamic",
	"target_offset" : "0.02"
}`;
    expect(parseLoudnorm(log)).toEqual({
      input_i: '-17.52',
      input_tp: '-3.61',
      input_lra: '6.4',
      input_thresh: '-27.7',
      target_offset: '0.02',
    });
  });

  it('refuses silence and broken logs', () => {
    expect(parseLoudnorm('no json here')).toBeNull();
    expect(
      parseLoudnorm(
        '{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70","target_offset":"0"}',
      ),
    ).toBeNull();
  });
});
