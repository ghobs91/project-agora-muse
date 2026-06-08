'use client';

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
  const { status, progress, loadModel } = useLLMStore();
  const config = STATUS_CONFIG[status];

  if (compact) {
    return (
      <button
        onClick={status === 'unloaded' || status === 'error' ? loadModel : undefined}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        title={`${config.label}${status === 'loading' ? ` (${progress}%)` : ''} — click to ${status === 'ready' ? 'view settings' : config.action.toLowerCase()}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        {status === 'loading' ? `${progress}%` : config.label.replace('LLM ', '')}
      </button>
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
          <p>Model: Xenova/all-MiniLM-L6-v2 (~23MB)</p>
          <p>Backend: ONNX Runtime WASM</p>
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
          <p>The model loads on demand (~23MB download).</p>
          <p>Keyword matching is used until the model is ready.</p>
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
