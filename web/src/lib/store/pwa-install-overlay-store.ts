/**
 * Zustand store for PWA install overlay state.
 * Persists whether the user has already seen/dismissed the overlay.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'agora-muse-pwa-overlay-dismissed';

function getInitialDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface PwaInstallOverlayStore {
  dismissed: boolean;
  dismiss: () => void;
}

export const usePwaInstallOverlayStore = create<PwaInstallOverlayStore>((set) => ({
  dismissed: getInitialDismissed(),

  dismiss: () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { /* localStorage unavailable */ }
    set({ dismissed: true });
  },
}));
