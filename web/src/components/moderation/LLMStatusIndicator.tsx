'use client';

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
  const { status, progress, loadModel } = useLLMStore();
  const config = STATUS_CONFIG[status];

  if (compact) {
    return (
      <button
        onClick={() => {
          if (status === 'unloaded' || status === 'error') loadModel();
        }}
        disabled={status === 'loading'}
        className="flex items-center gap-1.5 text-xs text-text-500 hover:text-text-300 transition-colors disabled:cursor-default"
        title={`${config.label}${status === 'loading' ? ` (${progress}%)` : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
        {status === 'loading' ? `${progress}%` : config.label.replace('AI model ', '')}
      </button>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-base text-text-200">In-Browser AI</h4>
          <p className="text-sm text-text-500">
            EmbeddingGemma 2 &middot; topic matching &amp; moderation
          </p>
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
        <p className="text-sm text-text-500">
          Posts are matched to topics and checked for your filters entirely in
          this browser.
        </p>
      )}

      {status === 'error' && (
        <div className="text-sm text-red-400 space-y-1">
          <p>The AI model could not start.</p>
          <p>Topic matching and moderation are skipped until it loads.</p>
        </div>
      )}

      {status === 'unloaded' && (
        <p className="text-sm text-text-500">
          The AI model is not loaded yet. Load it to enable topic matching and
          moderation.
        </p>
      )}

      {(status === 'unloaded' || status === 'error') && (
        <button onClick={loadModel} className="btn-primary text-sm w-full">
          {status === 'error' ? 'Retry Loading AI Model' : 'Load AI Model'}
        </button>
      )}
    </div>
  );
}
