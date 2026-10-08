/**
 * Zustand store for moderation preferences.
 *
 * Two kinds of filter exist:
 *  - Predefined categories: static, bundled rule vectors. Toggling one only
 *    swaps a row in the in-memory active rule matrix — no model inference.
 *  - Custom rules: user-authored descriptions stored on the PDS and embedded
 *    once at runtime (see `lib/moderation/engine.ts`).
 */

import { create } from 'zustand';
import type { ModerationRuleRecord } from '@/types';
import { useAuthStore } from './auth-store';
import * as records from '@/lib/atproto/records';
import { getBundledRuleIds } from '@/lib/moderation/engine';

/** localStorage key for the enabled predefined filter toggles. */
export const ENABLED_FILTERS_KEY = 'agora-muse-enabled-filters';

function readEnabledRuleIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ENABLED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = new Set(getBundledRuleIds());
    // Drop ids that no longer map to a bundled vector (e.g. after a rename).
    return parsed.filter((id): id is string => typeof id === 'string' && valid.has(id));
  } catch {
    return [];
  }
}

function writeEnabledRuleIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ENABLED_FILTERS_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage unavailable — toggles stay in memory for this session */
  }
}

interface ModerationStore {
  rules: ModerationRuleRecord[];
  /** Enabled predefined filter category ids. Drives the active rule matrix. */
  enabledRuleIds: string[];
  loading: boolean;
  error: string | null;

  loadRules: () => Promise<void>;
  addRule: (rule: { id: string; ruleType: ModerationRuleRecord['ruleType']; value: string }) => Promise<void>;
  removeRule: (ruleId: string) => Promise<void>;

  /** Sync predefined toggles from localStorage (safe to call repeatedly). */
  hydrateEnabledRules: () => void;
  toggleRule: (ruleId: string) => void;
  setEnabledRules: (ruleIds: string[]) => void;
}

export const useModerationStore = create<ModerationStore>((set, get) => ({
  rules: [],
  enabledRuleIds: [],
  loading: false,
  error: null,

  loadRules: async () => {
    // Predefined toggles are local; hydrate them regardless of auth.
    get().hydrateEnabledRules();

    const { agent } = useAuthStore.getState();
    if (!agent) return;

    set({ loading: true });
    try {
      const rules = await records.getModerationRules(agent);
      set({ rules, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load rules',
      });
    }
  },

  addRule: async (rule) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      await records.addModerationRule(agent, rule);
      const createdAt = new Date().toISOString();
      const newRule: ModerationRuleRecord = {
        id: rule.id,
        ruleType: rule.ruleType,
        value: rule.value,
        createdAt,
      };
      set({
        rules: [...get().rules, newRule],
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to add rule',
      });
    }
  },

  removeRule: async (ruleId) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      await records.removeModerationRule(agent, ruleId);
      set({
        rules: get().rules.filter((r) => r.id !== ruleId),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to remove rule',
      });
    }
  },

  hydrateEnabledRules: () => {
    const next = readEnabledRuleIds();
    const current = get().enabledRuleIds;
    // Avoid a needless state update (and re-render) when nothing changed.
    if (
      next.length === current.length &&
      next.every((id, i) => current[i] === id)
    ) {
      return;
    }
    set({ enabledRuleIds: next });
  },

  toggleRule: (ruleId) => {
    const current = get().enabledRuleIds;
    const next = current.includes(ruleId)
      ? current.filter((id) => id !== ruleId)
      : [...current, ruleId];
    writeEnabledRuleIds(next);
    set({ enabledRuleIds: next });
  },

  setEnabledRules: (ruleIds) => {
    const valid = new Set(getBundledRuleIds());
    const next = Array.from(new Set(ruleIds)).filter((id) => valid.has(id));
    writeEnabledRuleIds(next);
    set({ enabledRuleIds: next });
  },
}));
