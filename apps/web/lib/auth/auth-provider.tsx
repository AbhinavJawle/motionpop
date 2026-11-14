'use client';

import { useSyncExternalStore } from 'react';
import {
  getAuthSnapshot,
  getServerAuthSnapshot,
  subscribeAuth,
  type AuthState,
} from './auth-store';

export type { AuthState, AuthUser } from './auth-store';

/** Current auth state (spec 01 R4). `loading` on the server and until Firebase answers. */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
}
