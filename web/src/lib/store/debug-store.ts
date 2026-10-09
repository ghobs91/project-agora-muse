/**
 * Zustand store for moderation debug-panel state.
 *
 * Kept deliberately small: most telemetry is derived directly from
 * `feed-store` at render time (posts + the filtered URI sets). This store
 * only holds what isn't already in a shared store — panel visibility and the
 * language-filtered set, which `FeedList` computes locally and reports here.
 */

import { create } from 'zustand';

const PANEL_KEY = 'agora-muse-debug-panel';

function readOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (open) window.localStorage.setItem(PANEL_KEY, '1');
    else window.localStorage.removeItem(PANEL_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

interface DebugStore {
  /** Whether the floating moderation debug panel is visible. */
  panelOpen: boolean;
  /** Post URIs dropped by the language filter (`langs` field / script heuristic). */
  languageFilteredUris: Set<string>;

  hydrateOpen: () => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setLanguageFilteredUris: (uris: Set<string>) => void;
}

export const useDebugStore = create<DebugStore>((set, get) => ({
  panelOpen: false,
  languageFilteredUris: new Set(),

  // Initial value is `false` for SSR/hydration parity; the panel calls this on
  // mount to pick up the persisted preference.
  hydrateOpen: () => {
    set({ panelOpen: readOpen() });
  },

  setPanelOpen: (open) => {
    writeOpen(open);
    set({ panelOpen: open });
  },

  togglePanel: () => {
    get().setPanelOpen(!get().panelOpen);
  },

  setLanguageFilteredUris: (uris) => {
    // Called from a render-driven effect; skip no-op updates so the panel
    // doesn't re-render on every FeedList render.
    const current = get().languageFilteredUris;
    if (current.size === uris.size && [...uris].every((u) => current.has(u))) {
      return;
    }
    set({ languageFilteredUris: uris });
  },
}));
