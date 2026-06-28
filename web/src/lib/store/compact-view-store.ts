/**
 * Zustand store for compact/expanded post view preference.
 * Persisted to localStorage.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'agora-muse-compact-view';

function getInitialCompact(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface CompactViewStore {
  compact: boolean;
  toggle: () => void;
  set: (value: boolean) => void;
}

export const useCompactViewStore = create<CompactViewStore>((set) => ({
  compact: getInitialCompact(),

  toggle: () => {
    set((state) => {
      const next = !state.compact;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch { /* localStorage unavailable */ }
      return { compact: next };
    });
  },

  set: (value: boolean) => {
    set({ compact: value });
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch { /* localStorage unavailable */ }
  },
}));
