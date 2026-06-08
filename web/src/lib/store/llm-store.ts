/**
 * Zustand store for LLM model state.
 */

import { create } from 'zustand';
import type { LLMStatus } from '@/types';
import { onLLMStatusChange, loadModel, getLLMStatus, getLLMProgress } from '@/lib/llm/topic-matcher';

interface LLMStore {
  status: LLMStatus;
  progress: number;
  error: string | null;
  loadModel: () => Promise<void>;
}

export const useLLMStore = create<LLMStore>((set) => {
  // Subscribe to status changes from the LLM module
  const unsubscribe = onLLMStatusChange((status, progress) => {
    set({ status, progress });
  });

  return {
    status: getLLMStatus(),
    progress: getLLMProgress(),
    error: null,

    loadModel: async () => {
      try {
        await loadModel();
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'Model load failed',
        });
      }
    },
  };
});
