import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firebaseEnabled, getAuthClient } from '@/lib/firebase/client';
import { apiHeaders } from '@/lib/users/bootstrap-client';
import { requestPlanAllowance } from './plan-allowance';

vi.mock('@/lib/firebase/client', () => ({ firebaseEnabled: vi.fn(), getAuthClient: vi.fn() }));
vi.mock('@/lib/users/bootstrap-client', () => ({ apiHeaders: vi.fn() }));

const TOKEN = 'id-token-secret';
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'X-Firebase-AppCheck': 'app-check-secret' };

function signedIn(user: { getIdToken: () => Promise<string> } | null): void {
  vi.mocked(getAuthClient).mockResolvedValue({
    authStateReady: () => Promise.resolve(),
    currentUser: user,
  } as unknown as Awaited<ReturnType<typeof getAuthClient>>);
}

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.mocked(firebaseEnabled).mockReturnValue(true);
  signedIn({ getIdToken: () => Promise.resolve(TOKEN) });
  vi.mocked(apiHeaders).mockImplementation(async (getIdToken) => {
    await getIdToken();
    return HEADERS;
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestPlanAllowance', () => {
  it('POSTs to the route with the API headers and maps an allowed answer', async () => {
    reply(200, { allowed: true, used: 3, limit: 10 });
    await expect(requestPlanAllowance()).resolves.toEqual({ allowed: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/plan-allowance', {
      method: 'POST',
      headers: HEADERS,
    });
  });

  it('maps the daily limit', async () => {
    reply(200, { allowed: false, reason: 'limit', used: 10, limit: 10 });
    await expect(requestPlanAllowance()).resolves.toEqual({ allowed: false, reason: 'limit' });
  });

  it.each([
    ['local mode', () => vi.mocked(firebaseEnabled).mockReturnValue(false)],
    ['no signed-in user', () => signedIn(null)],
    ['auth failing to start', () => vi.mocked(getAuthClient).mockRejectedValue(new Error('x'))],
    ['an App Check failure', () => vi.mocked(apiHeaders).mockRejectedValue(new Error('x'))],
    ['a 401', () => reply(401, { error: 'Invalid ID token' })],
    ['a 500', () => reply(500, { error: 'Internal error' })],
    ['a malformed body', () => reply(200, { allowed: 'yes' })],
    ['a network error', () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))],
  ])('answers unavailable on %s', async (_, setup) => {
    setup();
    await expect(requestPlanAllowance()).resolves.toEqual({
      allowed: false,
      reason: 'unavailable',
    });
  });

  it('never logs tokens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    reply(401, { error: 'Invalid ID token' });
    await requestPlanAllowance();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await requestPlanAllowance();
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('app-check-secret');
  });
});
