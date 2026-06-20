'use client';

import { useState, useRef, useEffect } from 'react';
import { useLLMStore } from '@/lib/store/llm-store';
import type { LLMStatus } from '@/types';

const STATUS_CONFIG: Record<
  LLMStatus,
  { label: string; dot: string; action: string }
> = {
  unloaded: { label: 'AI model idle', dot: 'bg-gray-500', action: 'Load' },
  loading: { label: 'Loading AI model...', dot: 'bg-amber-400 animate-pulse', action: '' },
  ready: { label: 'AI model ready', dot: 'bg-emerald-400', action: '' },
  error: { label: 'AI model failed', dot: 'bg-red-400', action: 'Retry' },
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
          className="flex items-center gap-1.5 text-xs text-text-500 hover:text-text-300 transition-colors"
          title={`${config.label}${status === 'loading' ? ` (${progress}%)` : ''} — ${status === 'ready' ? 'click to change model' : `click to ${config.action.toLowerCase()}`}`}
        >
          <span className={`w-2 h-2 rounded-full ${config.dot}`} />
          {status === 'loading' ? `${progress}%` : config.label.replace('AI model ', '')}
        </button>

        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 card z-50 shadow-xl border border-dark-700/50">
            <div className="p-3 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-text-200">Choose AI model</h4>
                <p className="text-xs text-text-500 mt-0.5">Runs in your browser. Downloaded once.</p>
              </div>
              <div className="space-y-1.5">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setModel(model.id);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors border ${
                      selectedModel === model.id
                        ? 'bg-sky-600/15 border-sky-500/30 text-sky-400'
                        : 'bg-surface-dark border-transparent text-text-300 hover:bg-surface-lighter'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{model.label}</div>
                      {model.recommended && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-text-500 mt-0.5">{model.description}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-600">
                      <span className="px-1.5 py-0.5 rounded bg-surface-lighter">{model.size}</span>
                      <span>{model.name}</span>
                    </div>
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
        <div>
          <h4 className="font-medium text-base text-text-200">In-Browser AI</h4>
          <p className="text-sm text-text-500">Powers topic matching & moderation</p>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
      </div>

      <div className="flex items-center gap-2 text-sm">
          <span className="text-text-500">Status:</span>
          <span
            className={`font-medium ${
              status === 'ready'
                ? 'text-emerald-400'
                : status === 'error'
                  ? 'text-red-400'
                  : status === 'loading'
                    ? 'text-amber-400'
                    : 'text-text-500'
            }`}
          >
            {config.label}
          </span>
          {status === 'loading' && (
            <span className="text-xs text-text-500 ml-auto">{progress}%</span>
          )}
      </div>

      {status === 'loading' && (
        <div>
          <div className="flex justify-between text-xs text-text-500 mb-1">
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
        <div className="text-sm text-text-500 space-y-1">
          <p><span className="text-text-400">Active:</span> {selectedModelInfo?.label} ({selectedModelInfo?.size})</p>
          <p>Your posts are matched to topics and checked by AI entirely in this browser.</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 space-y-1">
          <p>The AI model could not start. Falling back to keyword matching.</p>
          <p>Topic relevance and moderation checks may be less accurate.</p>
        </div>
      )}

      {status === 'unloaded' && (
        <div className="text-sm text-text-500 space-y-1">
          <p>Load an AI model to enable smarter topic matching and moderation.</p>
          <p>Until then, basic keyword matching is used.</p>
        </div>
      )}

      {status === 'ready' && (
        <div className="space-y-3">
          <div>
            <h5 className="text-base font-medium text-text-200">Choose AI model</h5>
            <p className="text-sm text-text-500 mt-0.5">Runs in your browser. Downloaded once.</p>
          </div>
          <div className="space-y-1.5">
            {availableModels.map((model) => (
              <button
                key={model.id}
                onClick={() => setModel(model.id)}
                className={`w-full text-left p-2.5 rounded-lg text-sm transition-colors border ${
                  selectedModel === model.id
                    ? 'bg-sky-600/15 border-sky-500/30 text-sky-400'
                    : 'bg-surface-dark border-transparent text-text-300 hover:bg-surface-lighter'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{model.label}</div>
                  {model.recommended && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-medium">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="text-text-500 mt-0.5">{model.description}</div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-text-600">
                  <span className="px-1.5 py-0.5 rounded bg-surface-lighter">{model.size}</span>
                  <span>{model.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(status === 'unloaded' || status === 'error') && (
        <button onClick={loadModel} className="btn-primary text-sm w-full">
          {status === 'error' ? 'Retry Loading AI Model' : 'Load AI Model'}
        </button>
      )}
    </div>
  );
}
