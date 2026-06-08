/**
 * Zustand store for moderation preferences.
 */

import { create } from 'zustand';
import type { ModerationRuleRecord } from '@/types';
import { useAuthStore } from './auth-store';
import * as records from '@/lib/atproto/records';

interface ModerationStore {
  rules: ModerationRuleRecord[];
  loading: boolean;
  error: string | null;

  loadRules: () => Promise<void>;
  addRule: (rule: { id: string; ruleType: ModerationRuleRecord['ruleType']; value: string }) => Promise<void>;
  removeRule: (ruleId: string) => Promise<void>;
}

export const useModerationStore = create<ModerationStore>((set, get) => ({
  rules: [],
  loading: false,
  error: null,

  loadRules: async () => {
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
}));
