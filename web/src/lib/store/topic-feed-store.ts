/**
 * Zustand store for topic-to-feed-generator associations.
 *
 * When a user follows a topic, we discover Bluesky custom feeds
 * relevant to that topic and store the mappings. Topic pages
 * then aggregate posts from those feeds instead of raw keyword search.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeedGenerator } from '@/types';
import { useAuthStore } from './auth-store';
import * as feeds from '@/lib/atproto/feeds';
import * as llm from '@/lib/llm/topic-matcher';
import { useTopicStore } from './topic-store';

interface TopicFeedStore {
  /** topicId -> array of associated feed generators */
  feedsByTopic: Record<string, FeedGenerator[]>;
  /** true while discovering feeds for any topic */
  discovering: boolean;
  error: string | null;

  getFeedsForTopic: (topicId: string) => FeedGenerator[];
  getAllFeeds: () => FeedGenerator[];
  discoverFeedsForTopic: (topicId: string) => Promise<void>;
  clearFeedsForTopic: (topicId: string) => void;
}

export const useTopicFeedStore = create<TopicFeedStore>()(
  persist(
    (set, get) => ({
      feedsByTopic: {},
      discovering: false,
      error: null,

      getFeedsForTopic: (topicId) => {
        return get().feedsByTopic[topicId] || [];
      },

      getAllFeeds: () => {
        return Object.values(get().feedsByTopic).flat();
      },

      discoverFeedsForTopic: async (topicId) => {
        const { agent } = useAuthStore.getState();
        if (!agent) return;

        const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
        if (!topic) return;

        // Already discovered?
        const existing = get().feedsByTopic[topicId];
        if (existing && existing.length > 0) return;

        set({ discovering: true, error: null });

        try {
          // Step 1: Search for feed generators matching the topic name
          const allFeeds = await feeds.searchFeedGenerators(agent, topic.name, 10);

          if (allFeeds.length === 0) {
            // No feeds found — that's OK, we'll keep trying
            set({ discovering: false });
            return;
          }

          // Step 2: Use LLM to determine which feeds are relevant
          const matched = await llm.matchFeedsToTopic(allFeeds, topic);

          // Step 3: Store the associations
          set({
            feedsByTopic: {
              ...get().feedsByTopic,
              [topicId]: matched,
            },
            discovering: false,
          });
        } catch (err) {
          set({
            discovering: false,
            error: err instanceof Error ? err.message : 'Failed to discover feeds',
          });
        }
      },

      clearFeedsForTopic: (topicId) => {
        const next = { ...get().feedsByTopic };
        delete next[topicId];
        set({ feedsByTopic: next });
      },
    }),
    {
      name: 'agora-muse-topic-feeds',
      // Only persist feedsByTopic, not transient state
      partialize: (state) => ({ feedsByTopic: state.feedsByTopic }),
    },
  ),
);
