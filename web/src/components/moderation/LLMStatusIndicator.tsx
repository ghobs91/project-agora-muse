'use client';

import { useState, useRef, useEffect } from 'react';
import { useLLMStore } from '@/lib/store/llm-store';
import type { LLMStatus } from '@/types';

const STATUS_CONFIG: Record<
  LLMStatus,
  { label: string; dot: string; action: string }
> = {
  unloaded: { label: 'LLM idle', dot: 'bg-gray-500', action: 'Load' },
  loading: { label: 'LLM loading', dot: 'bg-amber-400 animate-pulse', action: '' },
  ready: { label: 'LLM ready', dot: 'bg-emerald-400', action: '' },
  error: { label: 'LLM error', dot: 'bg-red-400', action: 'Retry' },
};

export default function LLMStatusIndicator({ compact }: { compact?: boolean }) {
  const { status, progress, loadModel, selectedModel, setModel, availableModels } = useLLMStore();
  const config = STATUS_CONFIG[status];
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedModelInfo = availableModels.find((m) => m.id === selectedModel);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (compact) {
    return (
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => {
            if (status === 'unloaded' || status === 'error') {
              loadModel();
            } else {
              setDropdownOpen(!dropdownOpen);
            }
          }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          title={`${config.label}${status === 'loading' ? ` (${progress}%)` : ''} (${selectedModelInfo?.name}) — ${status === 'ready' ? 'click to change model' : `click to ${config.action.toLowerCase()}`}`}
        >
          <span className={`w-2 h-2 rounded-full ${config.dot}`} />
          {status === 'loading' ? `${progress}%` : config.label.replace('LLM ', '')}
        </button>

        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-2 w-64 card z-50 shadow-xl border border-dark-700/50">
            <div className="p-3 space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Select Model</h4>
              <div className="space-y-1">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setModel(model.id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedModel === model.id
                        ? 'bg-sky-600/20 text-sky-400'
                        : 'text-gray-400 hover:bg-surface-lighter'
                    }`}
                  >
                    <div className="font-medium">{model.name}</div>
                    <div className="text-gray-600">{model.size} · {model.backend === 'webllm' ? 'WebLLM' : 'Embeddings'}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm text-gray-200">In-Browser AI Model</h4>
        <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Status:</span>
        <span
          className={`font-medium ${
            status === 'ready'
              ? 'text-emerald-400'
              : status === 'error'
                ? 'text-red-400'
                : status === 'loading'
                  ? 'text-amber-400'
                  : 'text-gray-500'
          }`}
        >
          {config.label}
        </span>
      </div>

      {status === 'loading' && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Downloading model...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-surface-lighter rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>Model: {selectedModel} ({selectedModelInfo?.size})</p>
          <p>Backend: {selectedModelInfo?.backend === 'webllm' ? 'WebLLM (WebGPU)' : 'ONNX Runtime WASM'}</p>
          <p>Used for topic matching and semantic moderation.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-xs text-red-400 space-y-1">
          <p>Model failed to load. Keyword-based topic matching is active as a fallback.</p>
          <p>Topic relevance and moderation checks may be less accurate.</p>
        </div>
      )}

      {status === 'unloaded' && (
        <div className="text-xs text-gray-500 space-y-1">
          <p>The model loads on demand ({selectedModelInfo?.size} download).</p>
          <p>Keyword matching is used until the model is ready.</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="space-y-2">
          <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Select Model</h5>
          <div className="space-y-1">
            {availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => setModel(model.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  selectedModel === model.id
                    ? 'bg-sky-600/20 text-sky-400'
                    : 'text-gray-400 hover:bg-surface-lighter'
                }`}
              >
                <div className="font-medium">{model.name}</div>
                <div className="text-gray-600">{model.size} · {model.backend === 'webllm' ? 'WebLLM' : 'Embeddings'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(status === 'unloaded' || status === 'error') && (
        <button onClick={loadModel} className="btn-primary text-xs w-full">
          {status === 'error' ? 'Retry Loading Model' : 'Load AI Model'}
        </button>
      )}
    </div>
  );
}
