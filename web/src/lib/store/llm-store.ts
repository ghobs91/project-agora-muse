/**
 * Zustand store for the in-browser embedding model state.
 *
 * EmbeddingGemma 2 is the only in-browser AI. It powers topic matching and
 * moderation; there is no longer a model chooser.
 */

import { create } from 'zustand';
import type { LLMStatus } from '@/types';
import {
  onLLMStatusChange,
  loadModel as loadEmbeddingModel,
  getLLMStatus,
  getLLMProgress,
} from '@/lib/llm/topic-matcher';

interface LLMStore {
  status: LLMStatus;
  progress: number;
  error: string | null;
  loadModel: () => Promise<void>;
}

export const useLLMStore = create<LLMStore>((set) => {
  // EmbeddingGemma 2 is the only backend, so mirror its status directly.
  onLLMStatusChange((status, progress) => set({ status, progress }));

  return {
    status: getLLMStatus(),
    progress: getLLMProgress(),
    error: null,

    loadModel: async () => {
      set({ error: null });
      try {
        await loadEmbeddingModel();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Model load failed' });
      }
    },
  };
});
