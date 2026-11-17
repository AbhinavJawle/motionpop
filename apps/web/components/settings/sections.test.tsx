// @vitest-environment happy-dom
import { emptyUsageDay } from '@motionpop/schemas';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateUsage } from '@/lib/usage/aggregate';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  cancel: vi.fn(),
  auth: {
    status: 'signed-in',
    user: { uid: 'u1', email: 'ada@example.com', displayName: 'Ada', photoURL: null },
  } as unknown,
  credits: { balance: 17, plan: 'free', settings: null } as {
    balance: number | null;
    plan: string | null;
    settings: unknown;
  },
  prefer: { preferOnDevice: true, loaded: true, save: vi.fn(() => Promise.resolve(true)) },
  status: { availability: 'available', setupProgress: null as number | null },
  setUp: vi.fn(),
  usage: { status: 'ready', scope: 'account', summary: undefined as unknown },
  ledger: { status: 'ready', rows: [] } as unknown,
  signOut: vi.fn(() => Promise.resolve()),
  push: vi.fn(),
  balance: 17 as number | null,
}));

vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => h.auth }));
vi.mock('@/lib/auth/actions', () => ({ signOutUser: h.signOut }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/lib/credits/use-credits', () => ({ useCredits: () => h.credits }));
vi.mock('@/lib/credits/use-credits-client', () => ({ useCreditsBalance: () => h.balance }));
vi.mock('@/lib/settings/use-prefer-on-device', () => ({ usePreferOnDevice: () => h.prefer }));
vi.mock('@/lib/ai/ai-status', () => ({
  useAIStatus: () => h.status,
  setUpOnDevice: h.setUp,
  cancelSetUp: h.cancel,
}));
vi.mock('@/lib/usage/use-usage-summary', () => ({ useUsageSummary: () => h.usage }));
vi.mock('@/lib/credits/use-ledger', () => ({ useLedger: () => h.ledger }));
vi.mock('@/lib/renders/hooks', () => ({
  useAppConfig: () => ({
    freeCredits: 20,
    creditCosts: {},
    imageCredits: 3,
    exportCredits: undefined,
  }),
}));

import { AccountSection } from './account-section';
import { AISection, statusView } from './ai-section';
import { CreditsSection } from './credits-section';

const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  h.auth = {
    status: 'signed-in',
    user: { uid: 'u1', email: 'ada@example.com', displayName: 'Ada', photoURL: null },
  };
  h.credits = { balance: 17, plan: 'free', settings: null };
  h.prefer.save.mockClear();
  h.prefer.preferOnDevice = true;
  h.status = { availability: 'available', setupProgress: null };
  h.setUp.mockClear();
  h.balance = 17;
  h.ledger = { status: 'ready', rows: [] };
  const usage = { ...emptyUsageDay(), device: 4, cloud: 1, saved: 6 };
  h.usage = {
    status: 'ready',
    scope: 'account',
    summary: aggregateUsage([{ day: TODAY, usage }], TODAY),
  };
});
afterEach(cleanup);

describe('AccountSection', () => {
  it('shows the name, email, plan chip and signs out', async () => {
    render(<AccountSection variant="page" />);
    expect(screen.getByTestId('account-name').textContent).toBe('Ada');
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByTestId('plan-chip').textContent).toBe('Free');
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith('/sign-in'));
    expect(h.signOut).toHaveBeenCalled();
  });

  it('shows "Judge" for a judge and the local state without an account', () => {
    h.credits = { balance: 500, plan: 'judge', settings: null };
    const { unmount } = render(<AccountSection variant="panel" />);
    expect(screen.getByTestId('plan-chip').textContent).toBe('Judge');
    unmount();
    h.auth = { status: 'local' };
    h.credits = { balance: null, plan: null, settings: null };
    render(<AccountSection variant="panel" />);
    expect(screen.getByText('Working locally')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });
});

describe('statusView', () => {
  it('maps every availability to its words and colour', () => {
    expect(statusView('available', null)).toEqual({ tone: 'mint', label: 'Ready' });
    expect(statusView('downloading', 0.34)).toEqual({ tone: 'violet', label: 'Setting up · 34 %' });
    expect(statusView('downloadable', null)).toEqual({ tone: 'warn', label: 'Can be set up' });
    expect(statusView('unavailable', null)).toEqual({
      tone: 'muted',
      label: 'Not available in this browser',
    });
  });
});

describe('AISection', () => {
  it('the switch shows the saved value and saves a change', () => {
    render(<AISection variant="page" />);
    const toggle = screen.getByRole('switch', { name: 'Prefer on-device AI' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(h.prefer.save).toHaveBeenCalledWith(false);
  });

  it('is disabled until the saved value is known', () => {
    h.prefer.loaded = false;
    render(<AISection variant="page" />);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    h.prefer.loaded = true;
  });

  it('offers set-up when the model can be downloaded, and shows progress while it does', () => {
    h.status = { availability: 'downloadable', setupProgress: null };
    const { unmount } = render(<AISection variant="page" />);
    // The download is optional and large: the button opens a warning first (founder, 2026-11-16).
    fireEvent.click(screen.getByRole('button', { name: 'Set up on-device AI' }));
    expect(h.setUp).not.toHaveBeenCalled();
    expect(screen.getByText(/22 GB of disk space/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(h.setUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Set up on-device AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download model' }));
    expect(h.setUp).toHaveBeenCalledOnce();
    unmount();
    h.status = { availability: 'downloading', setupProgress: 0.34 };
    render(<AISection variant="page" />);
    expect(
      within(screen.getByTestId('on-device-status')).getByText('Setting up · 34 %'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set up on-device AI' })).toBeNull();
    // A running download can be cancelled (founder, 2026-11-16).
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cancel).toHaveBeenCalledOnce();
  });

  it('links to the instructions when the browser has no on-device model', () => {
    h.status = { availability: 'unavailable', setupProgress: null };
    render(<AISection variant="page" />);
    const link = screen.getByRole('link', { name: 'How to turn it on' });
    expect(link.getAttribute('href')).toContain('github.com');
    expect(screen.getByText('Not available in this browser')).toBeTruthy();
  });

  it('draws the usage chart with its footnote', () => {
    render(<AISection variant="page" />);
    expect(screen.getByTestId('usage-chart')).toBeTruthy();
    expect(screen.getByText('Usage is reported by your browser.')).toBeTruthy();
  });
});

describe('CreditsSection', () => {
  it('shows the balance, the plan line and the prices from costOf', () => {
    render(<CreditsSection variant="page" />);
    expect(screen.getByLabelText('17 credits')).toBeTruthy();
    expect(screen.getByTestId('plan-line').textContent).toBe('Free plan · 20 credits on sign-up');
    const costs = screen.getByRole('list', { name: 'Credit costs' });
    expect(within(costs).getByText('Generate a graphic')).toBeTruthy();
    expect(within(costs).getByLabelText('3 credits, runs in the cloud')).toBeTruthy();
    expect(within(costs).getByLabelText('1 credits, runs in the cloud')).toBeTruthy();
    expect(within(costs).getByLabelText('2 credits, runs in the cloud')).toBeTruthy();
    // Exports are free by default (spec 13b R1): no export row.
    expect(within(costs).queryByText('5')).toBeNull();
  });

  it('says "Judge plan · topped up daily" for a judge', () => {
    h.credits = { balance: 500, plan: 'judge', settings: null };
    render(<CreditsSection variant="panel" />);
    expect(screen.getByTestId('plan-line').textContent).toBe('Judge plan · topped up daily');
  });

  it('shimmers while the balance is unknown', () => {
    h.balance = null;
    render(<CreditsSection variant="page" />);
    expect(screen.getByLabelText('Credits loading')).toBeTruthy();
  });

  it('lists the ledger in words with signed deltas and relative times', () => {
    const now = Date.UTC(2026, 10, 20, 12, 0, 0);
    h.ledger = {
      status: 'ready',
      rows: [
        { id: 'r-1', reason: 'refund', delta: 3, balanceAfter: 20, at: new Date(now - 60_000) },
        {
          id: 's-1',
          reason: 'generate',
          delta: -3,
          balanceAfter: 17,
          at: new Date(now - 5 * 60_000),
        },
        {
          id: 'signup',
          reason: 'signup',
          delta: 20,
          balanceAfter: 20,
          at: new Date(now - 3 * 3600_000),
        },
        {
          id: 'judge-upgrade',
          reason: 'judge-grant',
          delta: 480,
          balanceAfter: 500,
          at: new Date(now - 2 * 86_400_000),
        },
      ],
    };
    render(<CreditsSection variant="page" nowMs={now} />);
    const rows = screen.getAllByTestId('ledger-row').map((r) => r.textContent);
    expect(rows).toEqual([
      'Refund1 min ago+3',
      'Generated a graphic5 min ago\u22123',
      'Welcome credits3 h ago+20',
      'Judge top-up2 d ago+480',
    ]);
  });

  it('shows the empty and error states', () => {
    h.ledger = { status: 'none' };
    const { unmount } = render(<CreditsSection variant="page" />);
    expect(screen.getByText('Your activity shows up here once you sign in.')).toBeTruthy();
    unmount();
    h.ledger = { status: 'error' };
    render(<CreditsSection variant="page" />);
    expect(screen.getByText("Couldn't load your activity.")).toBeTruthy();
  });

  it('ends with the promise about zero and refunds', () => {
    render(<CreditsSection variant="page" />);
    expect(
      screen.getByText('Credits never go below zero. Failed cloud work is refunded.'),
    ).toBeTruthy();
  });
});
