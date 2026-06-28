'use client';

import { useState } from 'react';
import type { ModerationRuleRecord } from '@/types';
import { useModerationStore } from '@/lib/store/moderation-store';

interface ModerationRuleEditorProps {
  onClose?: () => void;
}

const SUGGESTED_FILTERS = [
  { value: 'ragebait — posts designed to provoke outrage or anger', label: 'Ragebait' },
  { value: 'slurs, hate speech, or derogatory language targeting any group', label: 'Slurs' },
  { value: 'identity politics and tribal political arguments', label: 'Identity Politics' },
  { value: 'spam, scams, or unsolicited commercial content', label: 'Spam' },
  { value: 'crypto scams, pump-and-dump schemes, or NFT shilling', label: 'Crypto Scams' },
  { value: 'harassment, doxxing, or targeted personal attacks', label: 'Harassment' },
  { value: 'conspiracy theories, disinformation, or fake news', label: 'Disinformation' },
  { value: 'excessively graphic violence or gore', label: 'Violence' },
];

export default function ModerationRuleEditor({ onClose }: ModerationRuleEditorProps) {
  const { rules, addRule, removeRule } = useModerationStore();

  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const alreadyAdded = (v: string) => rules.some((r) => r.value === v);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;

    setSubmitting(true);
    try {
      await addRule({
        id: crypto.randomUUID(),
        ruleType: 'semantic',
        value: value.trim(),
      });
      setValue('');
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSuggestion = async (suggestion: string) => {
    if (alreadyAdded(suggestion)) return;
    setSubmitting(true);
    try {
      await addRule({
        id: crypto.randomUUID(),
        ruleType: 'semantic',
        value: suggestion,
      });
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add rule form */}
      <form onSubmit={handleSubmit} className="card">
        <h4 className="font-medium text-base text-text-200 mb-3">
          Add Semantic Filter
        </h4>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-text-500 mb-1">
              Describe content to filter
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='e.g. "ragebait" or "spam about cryptocurrency"'
              className="input-dark w-full"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="btn-primary text-sm w-full"
          >
            {submitting ? 'Adding...' : 'Add Filter'}
          </button>
        </div>
      </form>

      {/* Suggested filters */}
      {rules.length === 0 && (
        <div className="card">
          <h4 className="font-medium text-base text-text-200 mb-3">
            Example Filters
          </h4>
          <p className="text-xs text-text-500 mb-3">
            Click any to add it, or describe your own above.
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => handleAddSuggestion(s.value)}
                disabled={submitting || alreadyAdded(s.value)}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-lighter text-text-400 hover:bg-sky-600/20 hover:text-sky-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="card">
          <h4 className="font-medium text-base text-text-200 mb-3">
            Active Filters ({rules.length})
          </h4>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0"
              >
                <div className="min-w-0">
                  <span className="text-sm text-text-300 truncate block">
                    {rule.value}
                  </span>
                </div>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="text-sm text-red-400 hover:text-red-300 ml-2 shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
