/**
 * Zustand store for topic-to-feed-generator associations.
 *
 * When a user follows a topic, we discover Bluesky custom feeds
 * relevant to that topic and store the mappings. Topic pages
 * then aggregate posts from those feeds instead of raw keyword search.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeedGenerator, TopicCustomizationRecord } from '@/types';
import { useAuthStore } from './auth-store';
import * as feeds from '@/lib/atproto/feeds';
import * as records from '@/lib/atproto/records';
import { matchFeedsToTopic } from '@/lib/llm/topic-matcher';

interface TopicFeedStore {
  /** topicId -> array of associated feed generators */
  feedsByTopic: Record<string, FeedGenerator[]>;
  /** topicId -> user customization (removed/added feeds and seed terms) */
  customizationsByTopic: Record<string, TopicCustomizationRecord>;
  /** true while discovering feeds for any topic */
  discovering: boolean;
  error: string | null;

  getFeedsForTopic: (topicId: string) => FeedGenerator[];
  getAllFeeds: () => FeedGenerator[];
  setFeedsForTopic: (topicId: string, feeds: FeedGenerator[]) => void;
  /** Append a feed to a topic's list, deduplicating by URI. */
  addFeedForTopic: (topicId: string, feed: FeedGenerator) => void;
  /** True if Agora auto-published a Skyfeed feed for this topic. */
  hasAutoPublishedFeed: (topicId: string) => boolean;
  discoverFeedsForTopic: (topicId: string) => Promise<void>;
  removeFeedForTopic: (topicId: string, feedUri: string) => void;
  clearFeedsForTopic: (topicId: string) => void;

  getCustomizationForTopic: (topicId: string) => TopicCustomizationRecord | undefined;
  setTopicCustomization: (topicId: string, customization: TopicCustomizationRecord) => void;
  loadTopicCustomizations: () => Promise<void>;
  saveTopicCustomization: (topicId: string, customization: TopicCustomizationRecord) => Promise<void>;
}

export const useTopicFeedStore = create<TopicFeedStore>()(
  persist(
    (set, get) => ({
      feedsByTopic: {},
      customizationsByTopic: {},
      discovering: false,
      error: null,

      getFeedsForTopic: (topicId) => {
        const storeFeeds = get().feedsByTopic[topicId] || [];
        const customization = get().customizationsByTopic[topicId];
        if (!customization) return storeFeeds;

        const removedUris = new Set(customization.removedFeedUris);
        const storeUris = new Set(storeFeeds.map((f) => f.uri));
        return [
          ...storeFeeds.filter((f) => !removedUris.has(f.uri)),
          ...customization.addedFeeds.filter((f) => !storeUris.has(f.uri)),
        ];
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

      addFeedForTopic: (topicId, feed) => {
        const existing = get().feedsByTopic[topicId] ?? [];
        // Deduplicate by URI so re-publishing or re-discovery doesn't stack.
        if (existing.some((f) => f.uri === feed.uri)) return;
        set({
          feedsByTopic: {
            ...get().feedsByTopic,
            [topicId]: [...existing, feed],
          },
        });
      },

      hasAutoPublishedFeed: (topicId) => {
        return (get().feedsByTopic[topicId] ?? []).some((f) => f.autoPublished);
      },

      discoverFeedsForTopic: async (topicId) => {
        const { agent } = useAuthStore.getState();
        if (!agent) return;

        const { useTopicStore } = await import('./topic-store');
        const topic = useTopicStore.getState().topics.find((t) => t.id === topicId);
        if (!topic) return;

        let allFeeds = get().feedsByTopic[topicId];

        // If we already have feeds, make sure they still look relevant to this
        // topic. Stale or low-quality associations (e.g. a history feed under
        // Technology) get dropped so we can re-discover better matches.
        if (allFeeds && allFeeds.length > 0) {
          const matched = await matchFeedsToTopic(allFeeds, topic);
          if (matched.length === 0) {
            allFeeds = [];
            set({
              feedsByTopic: {
                ...get().feedsByTopic,
                [topicId]: [],
              },
            });
          } else {
            // Always update — popularity-adjusted scoring may reorder or
            // filter feeds that were previously accepted.
            allFeeds = matched;
            set({
              feedsByTopic: {
                ...get().feedsByTopic,
                [topicId]: matched,
              },
            });
          }
        }

        // No relevant feeds yet — discover from Bluesky.
        // Search by topic name AND by seed terms to cast a wider net.
        // The matchFeedsToTopic pass will filter for relevance and boost
        // popular feeds, so we want as many candidates as possible.
        if (!allFeeds || allFeeds.length === 0) {
          set({ discovering: true, error: null });
          try {
            // Build search queries: topic name + first 5 seed terms.
            // Searching multiple related terms casts a wider net than the
            // topic name alone, so feeds like "Tech by Flipboard" (matched
            // by the "tech" seed term) are discovered alongside generic
            // "Technology" feeds.
            const queries = [topic.name, ...topic.seedTerms.slice(0, 5)]
              .map((q) => q.trim())
              .filter((q) => q.length > 0);
            const uniqueQueries = [...new Set(queries)];

            // Fetch feed generators for each query in parallel
            const resultsPerQuery = await Promise.all(
              uniqueQueries.map((q) =>
                feeds.searchFeedGenerators(agent, q, 40).catch(() => [] as FeedGenerator[]),
              ),
            );

            // Deduplicate by URI (favouring the first occurrence since
            // getPopularFeedGenerators returns popularity-ordered results)
            const seen = new Set<string>();
            const allFeedList: FeedGenerator[] = [];
            for (const batch of resultsPerQuery) {
              for (const f of batch) {
                if (!seen.has(f.uri)) {
                  seen.add(f.uri);
                  allFeedList.push(f);
                }
              }
            }

            const matchedFeeds = await matchFeedsToTopic(allFeedList, topic);
            if (matchedFeeds.length === 0) {
              set({ discovering: false });
              return;
            }
            allFeeds = matchedFeeds;
            set({
              feedsByTopic: {
                ...get().feedsByTopic,
                [topicId]: matchedFeeds,
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

      removeFeedForTopic: (topicId, feedUri) => {
        const existing = get().feedsByTopic[topicId] ?? [];
        const filtered = existing.filter((f) => f.uri !== feedUri);
        set({
          feedsByTopic: {
            ...get().feedsByTopic,
            [topicId]: filtered.length > 0 ? filtered : [],
          },
        });
      },

      getCustomizationForTopic: (topicId) => {
        return get().customizationsByTopic[topicId];
      },

      setTopicCustomization: (topicId, customization) => {
        set({
          customizationsByTopic: {
            ...get().customizationsByTopic,
            [topicId]: customization,
          },
        });
      },

      loadTopicCustomizations: async () => {
        const { agent } = useAuthStore.getState();
        if (!agent) return;
        try {
          const customizations = await records.getTopicCustomizations(agent);
          const byTopic: Record<string, TopicCustomizationRecord> = {};
          for (const c of customizations) {
            byTopic[c.topicId] = c;
          }
          set({ customizationsByTopic: byTopic });
        } catch {
          // Leave local state as-is on failure
        }
      },

      saveTopicCustomization: async (topicId, customization) => {
        set({
          customizationsByTopic: {
            ...get().customizationsByTopic,
            [topicId]: customization,
          },
        });

        const { agent } = useAuthStore.getState();
        if (!agent) return;
        try {
          await records.saveTopicCustomization(agent, customization);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to save customization' });
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
      // Persist feed mappings and customizations locally for fast startup;
      // customizations are also synced to the user's PDS.
      partialize: (state) => ({
        feedsByTopic: state.feedsByTopic,
        customizationsByTopic: state.customizationsByTopic,
      }),
    },
  ),
);
