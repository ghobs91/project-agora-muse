'use client';

import { useState, useEffect, memo } from 'react';
import { useModerationStore } from '@/lib/store/moderation-store';
import { analyzeSentiment } from '@/lib/llm/sentiment';

interface VibeCheckProps {
  postUri: string;
  postText: string;
  onClose: () => void;
}

const VibeCheck = memo(function VibeCheck({ postText, onClose }: VibeCheckProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{
    sentiment: 'positive' | 'negative' | 'neutral';
    explanation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ruleAdded, setRuleAdded] = useState(false);
  const addRule = useModerationStore((s) => s.addRule);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    analyzeSentiment(postText).then((r) => {
      if (cancelled) return;
      if (r) {
        setResult({ sentiment: r.sentiment, explanation: r.explanation });
      } else {
        setError('Could not analyze this post. The AI model may still be loading.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [postText]);

  const handleFilterSimilar = async () => {
    if (!result) return;
    const id = `vibe-${Date.now()}`;
    const ruleValue = `${result.sentiment} sentiment — ${result.explanation}`;
    await addRule({
      id,
      ruleType: 'semantic',
      value: ruleValue,
    });
    setRuleAdded(true);
  };

  const sentimentColor =
    result?.sentiment === 'positive'
      ? 'text-green-400'
      : result?.sentiment === 'negative'
        ? 'text-red-400'
        : 'text-gray-400';

  return (
    <div className="card mt-2 animate-in fade-in">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-text-400">
          <div className="w-4 h-4 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
          Analyzing sentiment…
        </div>
      )}

      {error && (
        <div>
          <p className="text-sm text-text-400">{error}</p>
          <button
            onClick={onClose}
            className="text-xs text-sky-500 hover:underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {result && (
        <div>
          <p className="text-sm font-medium text-text-200 mb-1">
            Vibe: <span className={sentimentColor}>{result.sentiment}</span>
          </p>
          <p className="text-xs text-text-500 mb-3">{result.explanation}</p>

          {ruleAdded ? (
            <p className="text-xs text-green-400 font-medium">
              Filter added: posts with similar {result.sentiment} sentiment will be hidden.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleFilterSimilar}
                className="btn-primary text-xs"
              >
                Filter similar posts
              </button>
              <button
                onClick={onClose}
                className="btn-ghost text-xs"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default VibeCheck;
