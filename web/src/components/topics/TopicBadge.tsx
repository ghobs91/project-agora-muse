'use client';

import { useRouter } from 'next/navigation';
import { useTopicStore } from '@/lib/store/topic-store';

interface TopicBadgeProps {
  topicId: string;
  score?: number;
  className?: string;
}

export default function TopicBadge({ topicId, score, className }: TopicBadgeProps) {
  const topic = useTopicStore((s) => s.topics.find((t) => t.id === topicId));
  const router = useRouter();

  if (!topic) return null;

  const href = topic.isCustom
    ? `/topics/custom?id=${encodeURIComponent(topic.id)}`
    : `/topics/${topic.id}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };

  return (
    <span
      onClick={handleClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          router.push(href);
        }
      }}
      className={
        className ??
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-sky-400 transition-colors cursor-pointer'
      }
    >
      {topic.name}
      {score !== undefined && (
        <span className="text-text-600">
          {Math.round(score * 100)}%
        </span>
      )}
    </span>
  );
}
