// @vitest-environment happy-dom
import { emptyUsageDay } from '@motionpop/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { aggregateUsage } from '@/lib/usage/aggregate';
import { UsageChart, segmentHeights, usageChartLabel } from './usage-chart';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
afterEach(cleanup);

const TODAY = '2026-11-20';
const summaryWith = (device: number, cloud: number) => {
  const usage = { ...emptyUsageDay(), device, cloud, saved: device * 2 };
  usage.deviceMs[2] = device;
  usage.cloudMs[5] = cloud;
  return aggregateUsage([{ day: TODAY, usage }], TODAY);
};

describe('segmentHeights', () => {
  it('property: no segment is thicker than the chart, a non-empty one is at least 3 px, empty is 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 1000 }),
        (device, cloud, extra) => {
          const max = Math.max(device + cloud, 1) + extra - 1;
          const h = segmentHeights(device, cloud, max, 88);
          expect(h.device).toBeLessThanOrEqual(88);
          expect(h.cloud).toBeLessThanOrEqual(88);
          expect(h.device === 0).toBe(device === 0);
          expect(h.cloud === 0).toBe(cloud === 0);
          if (device > 0) expect(h.device).toBeGreaterThanOrEqual(3);
        },
      ),
    );
  });
  it('the biggest day fills the chart', () => {
    expect(segmentHeights(10, 0, 10, 88)).toEqual({ device: 88, cloud: 0 });
    expect(segmentHeights(0, 0, 0, 88)).toEqual({ device: 0, cloud: 0 });
  });
});

describe('UsageChart', () => {
  it('draws 14 bars with mint on-device and violet cloud segments, and the three figures', () => {
    render(<UsageChart summary={summaryWith(12, 3)} scope="account" variant="page" />);
    expect(screen.getAllByTestId('usage-bar')).toHaveLength(14);
    const last = screen.getAllByTestId('usage-bar')[13]!;
    expect(last.getAttribute('data-device')).toBe('12');
    expect(last.getAttribute('data-cloud')).toBe('3');
    expect(last.querySelector('[data-segment="device"]')).not.toBeNull();
    expect(last.querySelector('[data-segment="cloud"]')).not.toBeNull();
    expect(screen.getByText('calls ran on your device')).toBeTruthy();
    expect(screen.getByText('12', { selector: 'dt' })).toBeTruthy();
    expect(screen.getByText('~24')).toBeTruthy();
    expect(screen.getByText(/on device · about 4 s in the cloud/)).toBeTruthy();
    expect(screen.getByText('Usage is reported by your browser.')).toBeTruthy();
    expect(screen.getByText('Last 14 days')).toBeTruthy();
  });

  it('says so when there are no calls, and labels the session in local mode', () => {
    render(<UsageChart summary={aggregateUsage([], TODAY)} scope="session" variant="panel" />);
    expect(screen.getByText('No AI calls yet. Try a quick edit.')).toBeTruthy();
    expect(screen.getByText('This session')).toBeTruthy();
  });

  it('is one image for assistive tech with the totals in its label', () => {
    const s = summaryWith(5, 2);
    render(<UsageChart summary={s} scope="account" variant="page" />);
    expect(screen.getByRole('img', { name: usageChartLabel(s) })).toBeTruthy();
    expect(usageChartLabel(s)).toBe(
      'AI calls in the last 14 days: 5 on your device, 2 in the cloud',
    );
  });

  it('shows an error line instead of the empty line when loading failed', () => {
    render(
      <UsageChart summary={aggregateUsage([], TODAY)} scope="account" variant="page" failed />,
    );
    expect(screen.getByText("Couldn't load your usage.")).toBeTruthy();
    expect(screen.queryByText('No AI calls yet. Try a quick edit.')).toBeNull();
  });
});
