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

interface TopicFeedStore {
  /** topicId -> array of associated feed generators */
  feedsByTopic: Record<string, FeedGenerator[]>;
  /** true while discovering feeds for any topic */
  discovering: boolean;
  error: string | null;

  getFeedsForTopic: (topicId: string) => FeedGenerator[];
  getAllFeeds: () => FeedGenerator[];
  setFeedsForTopic: (topicId: string, feeds: FeedGenerator[]) => void;
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

      setFeedsForTopic: (topicId, feeds) => {
        const existing = get().feedsByTopic[topicId];
        if (existing && existing.length > 0) return;
        set({
          feedsByTopic: {
            ...get().feedsByTopic,
            [topicId]: feeds,
          },
        });
      },

      discoverFeedsForTopic: async (topicId) => {
        const { agent } = useAuthStore.getState();
        if (!agent) return;

        const { useTopicStore } = await import('./topic-store');
        const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
        if (!topic) return;

        let allFeeds = get().feedsByTopic[topicId];

        // Fetch feeds if we haven't yet
        if (!allFeeds || allFeeds.length === 0) {
          set({ discovering: true, error: null });
          try {
            allFeeds = await feeds.searchFeedGenerators(agent, topic.name, 3);
            if (allFeeds.length === 0) {
              set({ discovering: false });
              return;
            }
            set({
              feedsByTopic: {
                ...get().feedsByTopic,
                [topicId]: allFeeds,
              },
              discovering: false,
            });
          } catch (err) {
            set({
              discovering: false,
              error: err instanceof Error ? err.message : 'Failed to discover feeds',
            });
            return;
          }
        }

        // Update topic icon from the top feed's avatar
        const avatar = allFeeds[0]?.avatar;
        if (avatar) {
          useTopicStore.getState().setTopicIcon(topicId, avatar);
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
