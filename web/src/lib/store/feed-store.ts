/**
 * Zustand store for feed state and post interactions.
 */

import { create } from 'zustand';
import type { EnrichedPost, FeedSortMode } from '@/types';
import { useAuthStore } from './auth-store';
import { useTopicStore } from './topic-store';
import { useTopicFeedStore } from './topic-feed-store';
import * as feeds from '@/lib/atproto/feeds';
import * as records from '@/lib/atproto/records';
import * as llm from '@/lib/llm/topic-matcher';

interface FeedStore {
  posts: EnrichedPost[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  sortMode: FeedSortMode;
  hiddenPostUris: Set<string>;

  loadFeed: () => Promise<void>;
  loadMore: () => Promise<void>;
  setSortMode: (mode: FeedSortMode) => void;
  loadHiddenPosts: () => Promise<void>;

  // Post actions
  upvote: (post: EnrichedPost) => Promise<void>;
  downvote: (post: EnrichedPost) => Promise<void>;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  posts: [],
  cursor: null,
  loading: false,
  error: null,
  sortMode: 'hot',
  hiddenPostUris: new Set(),

  loadFeed: async () => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    const followedIds = useTopicStore.getState().followedTopicIds;
    const topicFeeds = useTopicFeedStore.getState();

    set({ loading: true, error: null });

    try {
      let allPosts: EnrichedPost[] = [];
      const seen = new Set<string>();

      if (followedIds.size > 0) {
        // Collect feed URIs from all followed topics that have discovered feeds
        const feedsByTopic: Array<{ topicId: string; feedUri: string }> = [];

        for (const topicId of followedIds) {
          const feeds = topicFeeds.feedsByTopic[topicId];
          if (feeds && feeds.length > 0) {
            for (const feed of feeds) {
              feedsByTopic.push({ topicId, feedUri: feed.uri });
            }
          }
        }

        if (feedsByTopic.length > 0) {
          // ── Aggregate posts from discovered feed URIs ───────────
          for (const { topicId, feedUri } of feedsByTopic) {
            try {
              const result = await feeds.fetchCustomFeed(agent, feedUri, { limit: 10 });
              for (const post of result.posts) {
                if (seen.has(post.uri)) continue;
                seen.add(post.uri);
                allPosts.push({
                  ...post,
                  matchedTopics: [{ topicId, score: 0.5 }],
                });
              }
            } catch {
              // Skip failed feeds
            }
          }
        } else {
          // ── No feeds discovered yet — fall back to seed term search ──
          // Same approach as per-topic feed: score against the search topic,
          // tag every post (even score 0), no threshold filtering.
          const allTopics = useTopicStore.getState().topics;
          const followedTopics = allTopics.filter((t) => followedIds.has(t.id));

          for (const topic of followedTopics) {
            for (const term of topic.seedTerms.slice(0, 3)) {
              try {
                const result = await feeds.searchPosts(agent, term, { limit: 10 });
                for (const post of result.posts) {
                  if (seen.has(post.uri)) continue;
                  seen.add(post.uri);
                  const score = await llm.scoreTopicMatch(post.text, topic);
                  allPosts.push({
                    ...post,
                    matchedTopics: [{ topicId: topic.id, score }],
                  });
                }
              } catch {
                // Skip failed searches
              }
            }
          }
        }

        // Sort by best topic match score, then by popularity
        allPosts.sort((a, b) => {
          const aBest = Math.max(0, ...a.matchedTopics.map((m) => m.score));
          const bBest = Math.max(0, ...b.matchedTopics.map((m) => m.score));
          const scoreDiff = bBest - aBest;
          if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
          return b.likeCount - a.likeCount;
        });
      } else {
        // No topics followed — show the What's Hot feed as a discovery feed
        try {
          const hotResult = await feeds.fetchPopularFeed(agent, { limit: 30 });
          allPosts = hotResult.posts;
        } catch {
          const timelineResult = await feeds.fetchHomeFeed(agent, { limit: 30 });
          allPosts = timelineResult.posts;
        }
      }

      set({
        posts: allPosts,
        cursor: null,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load feed',
      });
    }
  },

  loadMore: async () => {
    // Aggregated feeds don't use cursor-based pagination.
    // The initial load already fetches from all feed URIs.
  },

  setSortMode: (mode) => {
    set({ sortMode: mode, posts: [], cursor: null });
    get().loadFeed();
  },

  loadHiddenPosts: async () => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      const hidden = await records.getHiddenPosts(agent);
      set({ hiddenPostUris: new Set(hidden.map((h) => h.postUri)) });
    } catch {
      // Silently fail - hidden posts are non-critical
    }
  },

  upvote: async (post) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      await feeds.likePost(agent, post.uri, post.cid);
      // Optimistically update like count
      set({
        posts: get().posts.map((p) =>
          p.uri === post.uri
            ? { ...p, likeCount: p.likeCount + 1 }
            : p,
        ),
      });
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  },

  downvote: async (post) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      // Hide the post locally
      await records.hidePost(agent, post.uri, 'downvote');
      // Mute the user
      await feeds.muteUser(agent, post.author.did);

      const newHidden = new Set(get().hiddenPostUris);
      newHidden.add(post.uri);
      set({ hiddenPostUris: newHidden });
    } catch (err) {
      console.error('Failed to downvote:', err);
    }
  },
}));
