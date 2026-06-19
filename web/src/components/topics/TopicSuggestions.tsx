'use client';

import { useState, useEffect } from 'react';
import type { Topic } from '@/types';
import { suggestTopics } from '@/lib/llm/topic-matcher';
import { useTopicStore } from '@/lib/store/topic-store';

interface TopicSuggestionsProps {
  content: string;
  onSelect: (topic: Topic) => void;
  selectedTopics: Topic[];
}

export default function TopicSuggestions({
  content,
  onSelect,
  selectedTopics,
}: TopicSuggestionsProps) {
  const { topics } = useTopicStore();
  const [suggestions, setSuggestions] = useState<Array<{ topic: Topic; score: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!content || content.length < 20) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await suggestTopics(content, topics);
        setSuggestions(
          result.filter((s) => !selectedTopics.find((t) => t.id === s.topic.id)),
        );
      } catch {
        // Silently fail - suggestions are optional
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [content, topics, selectedTopics]);

  if (!content || content.length < 20) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-500">
        <div className="w-3 h-3 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        Analyzing content...
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div>
      <p className="text-xs text-text-500 mb-2">Suggested topics:</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(({ topic, score }) => (
          <button
            key={topic.id}
            onClick={() => onSelect(topic)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-lighter text-text-400 hover:bg-sky-600/20 hover:text-sky-400 transition-colors"
          >
            + {topic.name}
            <span className="text-text-600">
              {Math.round(score * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
