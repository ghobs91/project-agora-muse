'use client';

import { useTopicStore } from '@/lib/store/topic-store';

interface TopicFollowButtonProps {
  topicId: string;
}

export default function TopicFollowButton({ topicId }: TopicFollowButtonProps) {
  const { isFollowing, followTopic, unfollowTopic } = useTopicStore();
  const following = isFollowing(topicId);

  return (
    <button
      onClick={() => (following ? unfollowTopic(topicId) : followTopic(topicId))}
      className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
        following
          ? 'bg-sky-600/20 text-sky-400 hover:bg-red-500/20 hover:text-red-400'
          : 'bg-surface-lighter text-gray-400 hover:bg-sky-600/20 hover:text-sky-400'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
