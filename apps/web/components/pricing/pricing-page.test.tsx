// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams(),
  auth: {
    status: 'signed-in',
    user: { uid: 'u1', email: 'creator@example.com', getIdToken: vi.fn(async () => 'tok_1') },
  } as {
    status: string;
    user?: { uid: string; email: string; getIdToken: () => Promise<string> };
  },
  balance: 15 as number | null,
  plan: 'free' as string | null,
  fetchBillingPacks: vi.fn(),
  startPackCheckout: vi.fn(),
  fetchPaymentStatus: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => h.searchParams,
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => h.auth }));
vi.mock('@/lib/credits/use-credits-client', () => ({ useCreditsBalance: () => h.balance }));
vi.mock('@/lib/credits/use-credits', () => ({
  useCredits: () => ({ balance: h.balance, plan: h.plan, settings: null }),
}));
vi.mock('@/components/settings/account-menu', () => ({
  AccountMenu: () => <button type="button">Account</button>,
}));
vi.mock('@/lib/billing/client', () => ({
  fetchBillingPacks: h.fetchBillingPacks,
  startPackCheckout: h.startPackCheckout,
  fetchPaymentStatus: h.fetchPaymentStatus,
}));

import { PricingPage } from './pricing-page';

beforeEach(() => {
  h.push.mockReset();
  h.searchParams = new URLSearchParams();
  h.auth = {
    status: 'signed-in',
    user: { uid: 'u1', email: 'creator@example.com', getIdToken: vi.fn(async () => 'tok_1') },
  };
  h.balance = 15;
  h.plan = 'free';
  h.fetchBillingPacks.mockReset();
  h.fetchBillingPacks.mockResolvedValue({
    configured: true,
    environment: 'test_mode',
    packs: [
      { id: 'starter', available: true },
      { id: 'creator', available: true },
      { id: 'studio', available: true },
    ],
  });
  h.startPackCheckout.mockReset();
  h.fetchPaymentStatus.mockReset();
});

afterEach(() => cleanup());

describe('PricingPage (spec 44)', () => {
  it('renders 15 free welcome credits, three credit packs, test-mode badge, and redirects to Dodo checkout on Buy', async () => {
    h.startPackCheckout.mockResolvedValue({
      checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_999',
      sessionId: 'cks_999',
      environment: 'test_mode',
    });
    const onRedirect = vi.fn();

    render(<PricingPage onRedirect={onRedirect} />);

    expect(screen.getByText(/15 free credits/i)).toBeTruthy();
    expect(screen.getByTestId('pricing-balance').textContent).toBe('15');
    expect(await screen.findByTestId('test-mode-badge')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Buy 200 credits/i }));
    await waitFor(() =>
      expect(h.startPackCheckout).toHaveBeenCalledWith('creator', expect.any(Function), 1),
    );
    expect(onRedirect).toHaveBeenCalledWith(
      'https://test.checkout.dodopayments.com/session/cks_999',
    );
  });

  it('redirects signed-out visitors to sign-in with next=/pricing', async () => {
    h.auth = { status: 'signed-out' };
    render(<PricingPage />);
    await screen.findByTestId('test-mode-badge');

    fireEvent.click(screen.getByRole('button', { name: /Sign in to buy 60 credits/i }));
    expect(h.push).toHaveBeenCalledWith('/sign-in?next=/pricing');
    expect(h.startPackCheckout).not.toHaveBeenCalled();
  });

  it('polls read-only payment status on plain Dodo return URL (without checkout=return) and shows confirmation once webhook settles', async () => {
    h.searchParams = new URLSearchParams('payment_id=pay_abc123&status=succeeded');
    h.fetchPaymentStatus.mockResolvedValue({
      paymentId: 'pay_abc123',
      status: 'settled',
      credits: 200,
      balance: 215,
    });

    render(<PricingPage />);
    const banner = await screen.findByTestId('checkout-return-banner');
    await waitFor(() => expect(banner.textContent).toContain('+200 credits added'));
    expect(h.fetchPaymentStatus).toHaveBeenCalledWith('pay_abc123', expect.any(Function));
  });
});
