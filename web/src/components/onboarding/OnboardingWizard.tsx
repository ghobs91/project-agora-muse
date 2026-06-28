'use client';

import { useState } from 'react';
import { Icon } from '@iconify/react';
import { useTopicStore } from '@/lib/store/topic-store';
import { useModerationStore } from '@/lib/store/moderation-store';
import TopicFollowButton from '@/components/topics/TopicFollowButton';

const ONBOARDING_KEY = 'agora-muse-onboarded';

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

interface OnboardingWizardProps {
  onComplete: () => void;
}

export { ONBOARDING_KEY };

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch { /* ignore */ }
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const topics = useTopicStore((s) => s.topics.filter((t) => !t.isCustom));
  const { followTopic } = useTopicStore();
  const { addRule } = useModerationStore();

  const [step, setStep] = useState(1);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  const toggleTopic = (id: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFilter = (value: string) => {
    setSelectedFilters((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      for (const topicId of selectedTopics) {
        try {
          await followTopic(topicId);
        } catch { /* skip individual failures */ }
      }
      for (const filterValue of selectedFilters) {
        try {
          await addRule({
            id: crypto.randomUUID(),
            ruleType: 'semantic',
            value: filterValue,
          });
        } catch { /* skip individual failures */ }
      }
      markOnboardingComplete();
      onComplete();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-in">
        {/* Progress bar */}
        <div className="px-6 pt-6">
          <div className="flex gap-2 mb-6">
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                step >= 1 ? 'bg-sky-500' : 'bg-surface-lighter'
              }`}
            />
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                step >= 2 ? 'bg-sky-500' : 'bg-surface-lighter'
              }`}
            />
          </div>
        </div>

        {step === 1 && (
          <>
            <div className="px-6">
              <h2 className="text-xl font-bold text-text-100 mb-1">
                Follow your interests
              </h2>
              <p className="text-sm text-text-500 mb-4">
                Pick topics you want to see in your feed. You can always add
                more later.
              </p>
            </div>

            <div className="px-6 pb-6">
              <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                {topics.map((topic) => {
                  const selected = selectedTopics.has(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => toggleTopic(topic.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors border ${
                        selected
                          ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                          : 'border-dark-700/50 hover:border-dark-600/50 text-text-300'
                      }`}
                    >
                      <Icon
                        icon={getTopicIcon(topic.id)}
                        className="w-4 h-4 shrink-0"
                      />
                      <span className="truncate font-medium">{topic.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-between">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn-ghost text-sm"
                >
                  Skip
                </button>
                {selectedTopics.size > 0 && (
                  <span className="self-center text-xs text-text-500">
                    {selectedTopics.size} selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="px-6">
              <h2 className="text-xl font-bold text-text-100 mb-1">
                Set your boundaries
              </h2>
              <p className="text-sm text-text-500 mb-4">
                Choose what you&apos;d rather not see. These semantic filters
                use AI to match the <em>meaning</em> of posts, not just keywords.
              </p>
            </div>

            <div className="px-6 pb-6">
              <div className="space-y-2">
                {SUGGESTED_FILTERS.map((filter) => {
                  const selected = selectedFilters.has(filter.value);
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => toggleFilter(filter.value)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors border ${
                        selected
                          ? 'border-red-500/40 bg-red-500/10 text-red-300'
                          : 'border-dark-700/50 hover:border-dark-600/50 text-text-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selected
                            ? 'border-red-400 bg-red-500/30'
                            : 'border-dark-600'
                        }`}
                      >
                        {selected && (
                          <Icon icon="lucide:check" className="w-3.5 h-3.5 text-red-300" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{filter.label}</div>
                        <div className="text-xs text-text-500 mt-0.5 line-clamp-1">
                          {filter.value}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-ghost text-sm"
                >
                  Back
                </button>
                {selectedFilters.size > 0 && (
                  <span className="self-center text-xs text-text-500">
                    {selectedFilters.size} selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={finishing}
                  className="btn-primary text-sm"
                >
                  {finishing ? 'Saving...' : 'Finish'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getTopicIcon(topicId: string): string {
  const icons: Record<string, string> = {
    technology: 'lucide:laptop',
    science: 'lucide:flask-conical',
    art: 'lucide:palette',
    music: 'lucide:music',
    gaming: 'lucide:gamepad-2',
    politics: 'lucide:landmark',
    cooking: 'lucide:utensils-crossed',
    photography: 'lucide:camera',
    books: 'lucide:book-open',
    fitness: 'lucide:dumbbell',
    movies: 'lucide:film',
    sports: 'lucide:trophy',
    nature: 'lucide:leaf',
    philosophy: 'lucide:lightbulb',
    humor: 'lucide:smile',
    fashion: 'lucide:shirt',
    anime: 'lucide:sparkles',
    travel: 'lucide:map-pin',
    pets: 'lucide:paw-print',
    history: 'lucide:scroll-text',
    design: 'lucide:pen-tool',
    crypto: 'lucide:bitcoin',
    education: 'lucide:graduation-cap',
    news: 'lucide:newspaper',
  };
  return icons[topicId] || 'lucide:hash';
}
