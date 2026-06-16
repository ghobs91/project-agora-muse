/**
 * Zustand store for authentication state.
 */

import { create } from 'zustand';
import type { Agent } from '@atproto/api';
import * as auth from '@/lib/atproto/auth';

interface AuthStore {
  isAuthenticated: boolean;
  did: string | null;
  handle: string | null;
  agent: Agent | null;
  loading: boolean;
  error: string | null;

  login: () => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setAgent: (agent: Agent, did: string, handle: string) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  did: null,
  handle: null,
  agent: null,
  loading: false,
  error: null,

  login: async () => {
    set({ loading: true, error: null });
    try {
      await auth.login();
      // The OAuth flow will redirect the page, so we don't set state here
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      });
    }
  },

  logout: async () => {
    set({ loading: true });
    try {
      await auth.logout();
    } finally {
      set({
        isAuthenticated: false,
        did: null,
        handle: null,
        agent: null,
        loading: false,
      });
    }
  },

  restoreSession: async () => {
    // If already authenticated, skip re-restore to avoid redundant
    // network requests and potential state races.  Subsequent calls
    // to restoreSession (e.g. from pages that mount after the user
    // is already signed in) should be safely idempotent.
    const current = get();
    if (current.isAuthenticated && current.agent) {
      return;
    }

    set({ loading: true });
    try {
      const session = await auth.restoreSession();
      if (session) {
        set({
          isAuthenticated: true,
          did: session.did,
          handle: session.handle,
          agent: session.agent,
          loading: false,
          error: null,
        });
      } else {
        set({ loading: false });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to restore session',
      });
    }
  },

  setAgent: (agent, did, handle) => {
    set({
      isAuthenticated: true,
      agent,
      did,
      handle,
      error: null,
    });
  },
}));
