'use client';

import { useState } from 'react';
import type { ModerationRuleRecord } from '@/types';
import { useModerationStore } from '@/lib/store/moderation-store';
import { PREDEFINED_RULES } from '@/lib/moderation/rules';

interface ModerationRuleEditorProps {
  onClose?: () => void;
}

export default function ModerationRuleEditor({ onClose }: ModerationRuleEditorProps) {
  const { rules, enabledRuleIds, toggleRule, addRule, removeRule } =
    useModerationStore();

  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div className="space-y-4">
      {/* Predefined category toggles — bundled rule vectors, instant. */}
      <div className="card">
        <h4 className="font-medium text-base text-text-200 mb-1">
          Filter Categories
        </h4>
        <p className="text-xs text-text-500 mb-3">
          Toggle a category to hide posts that match it. Uses bundled on-device
          vectors — switching is instant.
        </p>
        <ul className="space-y-1">
          {PREDEFINED_RULES.map((rule) => {
            const enabled = enabledRuleIds.includes(rule.id);
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0"
              >
                <div className="min-w-0 pr-3">
                  <span className="text-sm text-text-300 block">
                    {rule.label}
                  </span>
                  <span className="text-xs text-text-600 block truncate">
                    {rule.description}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleRule(rule.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    enabled ? 'bg-sky-500' : 'bg-dark-600'
                  }`}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Toggle ${rule.label} filter`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Custom rule form — embedded on-device at runtime. */}
      <form onSubmit={handleSubmit} className="card">
        <h4 className="font-medium text-base text-text-200 mb-3">
          Add Custom Filter
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
              placeholder='e.g. "spoilers about the new season"'
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

      {/* Existing custom rules */}
      {rules.length > 0 && (
        <div className="card">
          <h4 className="font-medium text-base text-text-200 mb-3">
            Custom Filters ({rules.length})
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
