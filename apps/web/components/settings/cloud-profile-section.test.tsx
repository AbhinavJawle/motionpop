// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const h = vi.hoisted(() => ({
  signOut: vi.fn(() => Promise.resolve()),
  firebaseEnabled: vi.fn(() => true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/auth/actions', () => ({ signOutUser: h.signOut }));
vi.mock('@/lib/firebase/client', () => ({ firebaseEnabled: h.firebaseEnabled }));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import { CloudProfileSection } from './cloud-profile-section';

const SAMPLE_STATUS = {
  activeProfile: 'personal',
  currentEnv: { projectId: 'motionpop-48409', aiBackend: 'vertex' },
  profiles: [
    {
      name: 'personal',
      label: 'Personal',
      account: 'personal@example.com',
      projectId: 'motionpop-48409',
      aiBackend: 'vertex',
      envReady: true,
      adcReady: true,
      gcloudAuthed: true,
      firebaseAuthed: true,
      state: 'ready' as const,
    },
    {
      name: 'lab',
      label: 'GCP Lab',
      account: 'lab@example.com',
      projectId: 'lab-proj-123',
      aiBackend: 'vertex',
      envReady: true,
      adcReady: true,
      gcloudAuthed: true,
      firebaseAuthed: true,
      state: 'ready' as const,
    },
  ],
  warnings: [],
};

beforeEach(() => {
  h.signOut.mockClear();
  h.toastSuccess.mockClear();
  h.toastError.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            ...SAMPLE_STATUS,
            activeProfile: 'lab',
            currentEnv: { projectId: 'lab-proj-123', aiBackend: 'vertex' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(SAMPLE_STATUS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CloudProfileSection', () => {
  it('stays hidden in test mode unless forced (preserves Settings tests)', () => {
    const { container } = render(<CloudProfileSection variant="page" />);
    expect(container.innerHTML).toBe('');
  });

  it('lists saved profiles and switches when clicked', async () => {
    render(<CloudProfileSection variant="page" forceShow />);
    await waitFor(() => expect(screen.getByTestId('cloud-profile-list')).toBeTruthy());
    expect(screen.getByTestId('cloud-profile-personal').textContent).toContain('Active');

    const switchBtn = screen.getByRole('button', { name: 'Use GCP Lab' });
    fireEvent.click(switchBtn);

    await waitFor(() =>
      expect(screen.getByTestId('cloud-profile-lab').textContent).toContain('Active'),
    );
    expect(h.signOut).toHaveBeenCalledOnce();
    expect(h.toastSuccess).toHaveBeenCalledOnce();
  });

  it('disables switching for profiles that are not configured yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...SAMPLE_STATUS,
              profiles: [
                SAMPLE_STATUS.profiles[0],
                {
                  ...SAMPLE_STATUS.profiles[1],
                  projectId: null,
                  envReady: false,
                  state: 'needs-login',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    render(<CloudProfileSection variant="page" forceShow />);
    await waitFor(() => expect(screen.getByTestId('cloud-profile-lab')).toBeTruthy());
    const btn = screen.getByRole('button', { name: 'Use GCP Lab' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('cloud-profile-lab').textContent).toContain('Needs Google login');
  });
});
