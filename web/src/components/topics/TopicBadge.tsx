'use client';

import Link from 'next/link';
import { useTopicStore } from '@/lib/store/topic-store';

interface TopicBadgeProps {
  topicId: string;
  score?: number;
  className?: string;
}

export default function TopicBadge({ topicId, score, className }: TopicBadgeProps) {
  const topic = useTopicStore((s) => s.topics.find((t) => t.id === topicId));

  if (!topic) return null;

  return (
    <Link
      href={topic.isCustom ? `/topics/custom?id=${encodeURIComponent(topic.id)}` : `/topics/${topic.id}`}
      className={
        className ??
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-lighter text-gray-400 hover:bg-surface-light hover:text-sky-400 transition-colors'
      }
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
