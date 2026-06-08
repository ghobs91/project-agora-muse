'use client';

import Link from 'next/link';
import { useTopicStore } from '@/lib/store/topic-store';

interface TopicBadgeProps {
  topicId: string;
  score?: number;
}

export default function TopicBadge({ topicId, score }: TopicBadgeProps) {
  const { topics } = useTopicStore();
  const topic = topics.find((t) => t.id === topicId);

  if (!topic) return null;

  return (
    <Link
      href={`/topics/${topic.id}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-lighter text-gray-400 hover:bg-surface-light hover:text-sky-400 transition-colors"
    >
      {topic.name}
      {score !== undefined && (
        <span className="text-gray-600">
          {Math.round(score * 100)}%
        </span>
      )}
    </Link>
  );
}
