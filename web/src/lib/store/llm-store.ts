/**
 * Zustand store for LLM model state.
 */

import { create } from 'zustand';
import type { LLMStatus, ModelOption } from '@/types';
import {
  onLLMStatusChange,
  loadModel as loadEmbeddingModel,
  getLLMStatus,
  getLLMProgress,
  unloadModel,
  ensureEmbeddingModel,
} from '@/lib/llm/topic-matcher';
import {
  onWebLLMStatusChange,
  loadWebLLM,
  getWebLLMStatus,
  getWebLLMProgress,
  unloadWebLLM,
  isWebGPUSupported,
  getDefaultModelForDevice,
} from '@/lib/llm/web-llm';

const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B IT', size: '~1.9GB', backend: 'webllm' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.9GB', backend: 'webllm' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '~2.3GB', backend: 'webllm' },
  { id: 'Xenova/all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2', size: '~23MB', backend: 'embeddings' },
];

function getInitialStatus(): { status: LLMStatus; progress: number } {
  const defaultModelId = getDefaultModelForDevice();
  const defaultModel = AVAILABLE_MODELS.find((m) => m.id === defaultModelId);
  if (defaultModel?.backend === 'webllm') {
    return { status: getWebLLMStatus(), progress: getWebLLMProgress() };
  }
  return { status: getLLMStatus(), progress: getLLMProgress() };
}

interface LLMStore {
  status: LLMStatus;
  progress: number;
  error: string | null;
  selectedModel: string;
  availableModels: ModelOption[];
  loadModel: () => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
}

export const useLLMStore = create<LLMStore>((set, get) => {
  // Subscribe to both backends
  onLLMStatusChange((status, progress) => {
    const current = get();
    const model = AVAILABLE_MODELS.find((m) => m.id === current.selectedModel);
    if (model?.backend === 'embeddings') {
      set({ status, progress });
    }
  });

  onWebLLMStatusChange((status, progress) => {
    const current = get();
    const model = AVAILABLE_MODELS.find((m) => m.id === current.selectedModel);
    if (model?.backend === 'webllm') {
      set({ status, progress });
    }
  });

  const initial = getInitialStatus();

  return {
    status: initial.status,
    progress: initial.progress,
    error: null,
    selectedModel: getDefaultModelForDevice(),
    availableModels: AVAILABLE_MODELS,

    loadModel: async () => {
      const current = get();
      const model = AVAILABLE_MODELS.find((m) => m.id === current.selectedModel);
      if (!model) return;

      // Embedding model always loads (uses WASM, no WebGPU needed)
      // WebLLM models require WebGPU — skip gracefully if unavailable
      if (model.backend === 'webllm' && !isWebGPUSupported()) {
        set({ status: 'ready', progress: 100 });
        return;
      }

      // Always ensure embedding model is loaded in background for fast matching
      ensureEmbeddingModel();

      try {
        if (model.backend === 'embeddings') {
          await loadEmbeddingModel();
        } else {
          await loadWebLLM(model.id);
        }
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'Model load failed',
        });
      }
    },

    setModel: async (modelId: string) => {
      if (get().selectedModel === modelId) return;

      const oldModel = AVAILABLE_MODELS.find((m) => m.id === get().selectedModel);
      const newModel = AVAILABLE_MODELS.find((m) => m.id === modelId);
      if (!newModel) return;

      set({ status: 'unloaded', progress: 0, error: null, selectedModel: modelId });

      // Embedding model always loads; WebLLM requires WebGPU
      if (newModel.backend === 'webllm' && !isWebGPUSupported()) {
        set({ status: 'ready', progress: 100 });
        return;
      }

      // Unload old model only if backend changes
      if (oldModel?.backend !== newModel.backend) {
        if (oldModel?.backend === 'embeddings') {
          unloadModel();
        } else if (oldModel?.backend === 'webllm') {
          unloadWebLLM();
        }
      }

      // Load new model
      try {
        if (newModel.backend === 'embeddings') {
          await loadEmbeddingModel();
        } else {
          await loadWebLLM(newModel.id);
        }
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : 'Model load failed',
          status: 'error',
        });
      }
    },
  };
});
