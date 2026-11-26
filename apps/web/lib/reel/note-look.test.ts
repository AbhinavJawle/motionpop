// @vitest-environment happy-dom
import type { ReelPlan } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { readReelTarget } from './note-look';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockBox(el: HTMLElement, x: number, y: number, w: number, h: number) {
  el.getBoundingClientRect = () => rect(x, y, w, h);
}

const PLAN: Pick<ReelPlan, 'scenes' | 'hook'> = {
  scenes: [
    {
      id: 's1',
      startMs: 0,
      endMs: 3000,
      layout: 'card',
      content: {
        template: 'flow',
        steps: [
          { at: 200, icon: 'shopping-cart', text: 'Buy cheap cereal' },
          { at: 900, icon: 'package', text: 'Print custom' },
        ],
      },
    },
  ],
};

describe('readReelTarget (card layout)', () => {
  function mountCardStage() {
    const stage = document.createElement('div');
    mockBox(stage, 0, 0, 720, 1280);

    const sceneHost = document.createElement('div');
    sceneHost.setAttribute('data-reel-scene', 's1');
    mockBox(sceneHost, 0, 0, 720, 1280);

    const cam = document.createElement('div');
    cam.setAttribute('data-reel-part', 'graphic');
    mockBox(cam, 0, 0, 720, 690);
    const label = document.createElement('div');
    label.textContent = 'Buy cheap cereal';
    mockBox(label, 80, 220, 240, 40);
    cam.append(label);
    sceneHost.append(cam);

    const speaker = document.createElement('div');
    speaker.setAttribute('data-reel-part', 'speaker');
    mockBox(speaker, 0, 790, 720, 490);

    stage.append(sceneHost, speaker);
    document.body.append(stage);
    return stage;
  }

  it('keeps graphic as the target and drops minor speaker edge overlap in card layout', () => {
    const stage = mountCardStage();
    // Circle covers most of the graphic panel and grazes the top of the speaker card (~16% overlap).
    const res = readReelTarget(stage, { x: 0.1, y: 0.15, w: 0.8, h: 0.56 }, PLAN, 's1');
    expect(res.parts).toEqual(['graphic']);
    expect(res.texts).toContain('Buy cheap cereal');
    stage.remove();
  });

  it('orders graphic ahead of speaker when graphic has larger overlap even though speaker box is smaller', () => {
    const stage = mountCardStage();
    // Circle covers ~60% graphic panel (y 0.25..0.62) and ~38% speaker (y 0.62..0.85).
    const res = readReelTarget(stage, { x: 0.1, y: 0.25, w: 0.8, h: 0.6 }, PLAN, 's1');
    expect(res.parts[0]).toBe('graphic');
    stage.remove();
  });

  it('detects speaker when the user circles the speaker region', () => {
    const stage = mountCardStage();
    const res = readReelTarget(stage, { x: 0.15, y: 0.68, w: 0.7, h: 0.28 }, PLAN, 's1');
    expect(res.parts).toEqual(['speaker']);
    stage.remove();
  });
});
