'use client';

import { useState } from 'react';
import type { ModerationRuleRecord } from '@/types';
import { useModerationStore } from '@/lib/store/moderation-store';

interface ModerationRuleEditorProps {
  onClose?: () => void;
}

export default function ModerationRuleEditor({ onClose }: ModerationRuleEditorProps) {
  const { rules, addRule, removeRule } = useModerationStore();

  const [ruleType, setRuleType] = useState<ModerationRuleRecord['ruleType']>('keyword');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;

    setSubmitting(true);
    try {
      await addRule({
        id: crypto.randomUUID(),
        ruleType,
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
      {/* Add rule form */}
      <form onSubmit={handleSubmit} className="card">
        <h4 className="font-medium text-sm text-gray-200 mb-3">
          Add Moderation Rule
        </h4>

        <div className="space-y-3">
          {/* Rule type */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rule Type</label>
            <select
              value={ruleType}
              onChange={(e) =>
                setRuleType(e.target.value as ModerationRuleRecord['ruleType'])
              }
              className="select-dark w-full"
            >
              <option value="keyword">Keyword Filter</option>
              <option value="semantic">Semantic Filter</option>
              <option value="mute">Mute User (DID)</option>
              <option value="labeler">Bluesky Labeler</option>
            </select>
          </div>

          {/* Value */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {ruleType === 'keyword'
                ? 'Keyword or phrase to filter'
                : ruleType === 'semantic'
                  ? 'Describe content to filter (e.g., "spam about cryptocurrency")'
                  : ruleType === 'mute'
                    ? 'User DID to mute'
                    : 'Labeler DID'}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                ruleType === 'mute'
                  ? 'did:plc:...'
                  : ruleType === 'labeler'
                    ? 'did:plc:...'
                    : 'Enter value...'
              }
              className="input-dark w-full"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="btn-primary text-sm w-full"
          >
            {submitting ? 'Adding...' : 'Add Rule'}
          </button>
        </div>
      </form>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="card">
          <h4 className="font-medium text-sm text-gray-200 mb-3">
            Active Rules ({rules.length})
          </h4>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0"
              >
                <div className="min-w-0">
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-surface-lighter text-gray-400 mr-2">
                    {rule.ruleType}
                  </span>
                  <span className="text-sm text-gray-300 truncate">
                    {rule.value}
                  </span>
                </div>
                <button
                  onClick={() => removeRule(rule.id)}
                  className="text-xs text-red-400 hover:text-red-300 ml-2 shrink-0"
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
