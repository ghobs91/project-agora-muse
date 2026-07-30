'use client';

import { memo } from 'react';
import { useTopicStore } from '@/lib/store/topic-store';

interface TopicFollowButtonProps {
  topicId: string;
}

const TopicFollowButton = memo(function TopicFollowButton({ topicId }: TopicFollowButtonProps) {
  const { isFollowing, followTopic, unfollowTopic } = useTopicStore();
  const following = isFollowing(topicId);

  return (
    <button
      onClick={() => (following ? unfollowTopic(topicId) : followTopic(topicId))}
      className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
        following
          ? 'bg-sky-600/20 text-sky-400 hover:bg-red-500/20 hover:text-red-400'
          : 'bg-surface-lighter text-text-400 hover:bg-sky-600/20 hover:text-sky-400'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
});

export default TopicFollowButton;
