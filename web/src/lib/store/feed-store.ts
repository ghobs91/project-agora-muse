/**
 * Zustand store for feed state and post interactions.
 */

import { create } from 'zustand';
import type { EnrichedPost, FeedSortMode, Topic } from '@/types';
import { useAuthStore } from './auth-store';
import { useTopicStore } from './topic-store';
import { useTopicFeedStore } from './topic-feed-store';
import * as feeds from '@/lib/atproto/feeds';
import * as records from '@/lib/atproto/records';
import * as llm from '@/lib/llm/topic-matcher';

const feedCache = new Map<string, EnrichedPost[]>();
const feedCursors = new Map<string, string | null>();
const MAX_FEED_CACHE = 100;
const MAX_CURSOR_CACHE = 200;

/** Max time (ms) to wait for a feed-generator fetch before timing out. */
const FEED_FETCH_TIMEOUT_MS = 8_000;

function setFeedCache(key: string, posts: EnrichedPost[]) {
  if (feedCache.size >= MAX_FEED_CACHE) feedCache.clear();
  feedCache.set(key, posts);
}

function setCursorCache(key: string, cursor: string | null) {
  if (feedCursors.size >= MAX_CURSOR_CACHE) feedCursors.clear();
  feedCursors.set(key, cursor);
}

async function batchWithLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number = 4,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

interface FeedStore {
  posts: EnrichedPost[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  sortMode: FeedSortMode;
  hiddenPostUris: Set<string>;
  upvotedPostUris: Set<string>;
  displayCount: number;
  moderatedPostUris: Set<string>;

  loadFeed: (skipLLMScoring?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  setSortMode: (mode: FeedSortMode) => void;
  loadHiddenPosts: () => Promise<void>;
  reRankWithLLM: () => Promise<void>;

  // Post actions
  upvote: (post: EnrichedPost) => Promise<void>;
  downvote: (post: EnrichedPost) => Promise<void>;
}

// ─── Moderation Rule Application ───────────────────────────────────

async function applyModerationRules(
  agent: any,
  posts: EnrichedPost[],
): Promise<{ moderatedPostUris: Set<string> }> {
  // If the embedding model isn't already loaded, skip semantic moderation
  // entirely — loading the 23MB model + running embeddings here would spike
  // CPU right after the feed renders, freezing the UI.
  if (llm.getLLMStatus() !== 'ready') {
    return { moderatedPostUris: new Set() };
  }

  try {
    const rules = await records.getModerationRules(agent);
    const moderatedPostUris = new Set<string>();

    // Split rules by type — only semantic rules need async LLM calls
    const fastRules = rules.filter((r) => r.ruleType !== 'semantic');
    const semanticRules = rules.filter((r) => r.ruleType === 'semantic');

    // Fast rules: synchronous check (cheap)
    for (const post of posts) {
      for (const rule of fastRules) {
        if (postMatchesFastRule(post, rule)) {
          moderatedPostUris.add(post.uri);
        }
      }
    }

    if (semanticRules.length === 0) {
      return { moderatedPostUris };
    }

    // Pre-compute rule embeddings in one batched call (one ONNX call, not N)
    const ruleEmbeddings: Array<Float32Array | null> = [];
    for (const rule of semanticRules) {
      try {
        const embedding = await llm.getEmbeddingForText(rule.value);
        ruleEmbeddings.push(embedding);
      } catch {
        ruleEmbeddings.push(null);
      }
    }

    // Batch all post embeddings into a single ONNX call — critical for CPU perf
    const postTexts = posts.map((p) => p.text);
    const postEmbeddings = await llm.getBatchEmbeddingsForTexts(postTexts);

    // Compute similarities using CPU-side cosine (no more ONNX calls)
    for (let i = 0; i < posts.length; i++) {
      const postEmbedding = postEmbeddings[i];
      if (!postEmbedding) continue;
      for (let j = 0; j < semanticRules.length; j++) {
        const ruleEmbedding = ruleEmbeddings[j];
        if (!ruleEmbedding) continue;
        const similarity = llm.cosineSimilarity(postEmbedding, ruleEmbedding);
        if (similarity > 0.6) {
          moderatedPostUris.add(posts[i].uri);
          break;
        }
      }
    }

    return { moderatedPostUris };
  } catch {
    return { moderatedPostUris: new Set() };
  }
}

function postMatchesFastRule(post: EnrichedPost, rule: { ruleType: string; value: string }): boolean {
  switch (rule.ruleType) {
    case 'keyword': {
      const keyword = rule.value.toLowerCase();
      return post.text.toLowerCase().includes(keyword);
    }
    case 'labeler': {
      return post.labels.some((label) => label.src === rule.value);
    }
    case 'mute': {
      return post.author.did === rule.value;
    }
    default:
      return false;
  }
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  posts: [],
  cursor: null,
  loading: false,
  error: null,
  sortMode: 'hot',
  hiddenPostUris: new Set(),
  upvotedPostUris: new Set(),
  moderatedPostUris: new Set(),
  displayCount: 15,

  loadFeed: async (skipLLMScoring = false) => {
    // Prevent concurrent loads — a second call while the first is still
    // in-flight would race on posts / loading / cursor, and the loser's
    // set(...) would overwrite the winner, producing a flash of stale data.
    if (get().loading) return;

    const { agent } = useAuthStore.getState();
    if (!agent) return;

    const followedIds = useTopicStore.getState().followedTopicIds;
    const topicFeedsState = useTopicFeedStore.getState();

    set({ loading: true, error: null });

    try {
      let allPosts: EnrichedPost[] = [];

      if (followedIds.size > 0) {
        const allTopics = useTopicStore.getState().topics;
        const followedTopics = allTopics.filter((t) => followedIds.has(t.id));
        const now = Date.now();

        // Collect all fetch tasks in parallel: feed generators + keyword search + hashtag search
        type FetchTask = () => Promise<{ topicId: string; posts: EnrichedPost[]; feedUri?: string }>;

        const fetchTasks: FetchTask[] = [];

        // Feed generator tasks
        for (const topicId of followedIds) {
          const topicFeedList = topicFeedsState.feedsByTopic[topicId];
          if (topicFeedList && topicFeedList.length > 0) {
            for (const feed of topicFeedList) {
              fetchTasks.push(async () => {
                const cached = feedCache.get(feed.uri);
                if (cached) return { topicId, posts: cached, feedUri: feed.uri };

                // Race against a timeout so a slow feed generator (e.g. a
                // cold-started skyfeed.me query) doesn't block the entire
                // initial feed load. The timeout resolves with empty posts
                // so the UI can render what it has while the slow feed is
                // fetched on a subsequent load.
                const timeoutResult: { posts: EnrichedPost[]; cursor?: string } = { posts: [] };
                const result = await Promise.race([
                  feeds.fetchCustomFeed(agent, feed.uri, { limit: 5 }),
                  new Promise<typeof timeoutResult>((resolve) =>
                    setTimeout(() => resolve(timeoutResult), FEED_FETCH_TIMEOUT_MS),
                  ),
                ]);

                if (result.posts.length > 0) {
                  setFeedCache(feed.uri, result.posts);
                  setCursorCache(feed.uri, result.cursor ?? null);
                }
                const postsWithTopic = result.posts.map((p) => ({
                  ...p,
                  matchedTopics: [{ topicId, score: 0.5 }],
                }));
                return { topicId, posts: postsWithTopic, feedUri: feed.uri };
              });
            }
          }
        }

        // Keyword search tasks (for seed terms, only if no feed generators
        // available — EXCEPT custom topics, where the auto-published Skyfeed
        // feed is supplemented with keyword search for more coverage).
        for (const topic of followedTopics) {
          const hasFeeds = (topicFeedsState.feedsByTopic[topic.id]?.length ?? 0) > 0;
          if (!hasFeeds || topic.isCustom) {
            for (const term of topic.seedTerms.slice(0, 3)) {
              fetchTasks.push(async () => {
                const result = await feeds.searchPosts(agent, term, { limit: 5 });
                setCursorCache(`search:${topic.id}:${term}`, result.cursor ?? null);
                const postsWithTopic = result.posts.map((p) => ({
                  ...p,
                  matchedTopics: [{ topicId: topic.id, score: skipLLMScoring ? llm.keywordMatchScore(p.text, topic) : 0.5 }],
                }));
                return { topicId: topic.id, posts: postsWithTopic };
              });
            }
          }
        }

        // Hashtag search tasks — limit to 1 per topic to avoid connection saturation
        for (const topic of followedTopics) {
          const hashtag = '#' + topic.seedTerms[0].trim().toLowerCase().replace(/\s+/g, '');
          if (hashtag.length > 1) {
            fetchTasks.push(async () => {
              const result = await feeds.searchPosts(agent, hashtag, { limit: 5 });
              const ONE_DAY_MS = 24 * 60 * 60 * 1000;
              const relevant = result.posts.filter((p) => {
                const postTime = new Date(p.indexedAt).getTime();
                return now - postTime < ONE_DAY_MS;
              });
              const postsWithTopic = relevant.map((p) => ({
                ...p,
                matchedTopics: [{ topicId: topic.id, score: 0.5 }],
              }));
              return { topicId: topic.id, posts: postsWithTopic };
            });
          }
        }

        // Execute all fetches in parallel, limited to 4 concurrent to leave
        // headroom in the browser's connection pool (6 per domain max)
        const fetchResults = await batchWithLimit(fetchTasks, (fn) => fn(), 4);

        // Count feed-generator tasks (they come first in the fetchTasks array)
        let feedGenTaskCount = 0;
        for (const topicId of followedIds) {
          const topicFeedList = topicFeedsState.feedsByTopic[topicId];
          if (topicFeedList && topicFeedList.length > 0) {
            feedGenTaskCount += topicFeedList.length;
          }
        }

        // Separate feed-generator posts (already curated by Bluesky) from
        // search/hashtag posts (uncurated). Bluesky feed generators intelligently
        // rank their output — we defer to their ordering instead of re-sorting.
        const feedGenPostsByFeed = new Map<string, EnrichedPost[]>();
        const otherPosts: EnrichedPost[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < fetchResults.length; i++) {
          const r = fetchResults[i];
          if (r.status === 'rejected') continue;
          const isFeedGen = i < feedGenTaskCount;

          for (const post of r.value.posts) {
            if (seen.has(post.uri)) continue;
            seen.add(post.uri);

            if (isFeedGen && r.value.feedUri) {
              let list = feedGenPostsByFeed.get(r.value.feedUri);
              if (!list) {
                list = [];
                feedGenPostsByFeed.set(r.value.feedUri, list);
              }
              list.push(post);
            } else {
              otherPosts.push(post);
            }
          }
        }

        // Round-robin interleave feed-generator posts so no single feed dominates
        const interleaved: EnrichedPost[] = [];
        const feedLists = Array.from(feedGenPostsByFeed.values());
        if (feedLists.length > 0) {
          let pos = 0;
          let added = true;
          while (added) {
            added = false;
            for (const list of feedLists) {
              if (pos < list.length) {
                interleaved.push(list[pos]);
                added = true;
              }
            }
            pos++;
          }
        }

        // Filter to last 24 hours
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const filteredFeedGen = interleaved.filter((p) => {
          const postTime = new Date(p.indexedAt).getTime();
          return now - postTime < ONE_DAY_MS;
        });

        // Sort search/hashtag posts by likeCount (they have no curation)
        otherPosts.sort((a, b) => b.likeCount - a.likeCount);
        const filteredOther = otherPosts.filter((p) => {
          const postTime = new Date(p.indexedAt).getTime();
          return now - postTime < ONE_DAY_MS;
        });

        // Combine: feed-generator posts first, then search/hashtag posts
        allPosts = [...filteredFeedGen, ...filteredOther];

        // Remove pinned posts
        allPosts = allPosts.filter((p) => !p.isPinned);

        // LLM scoring for topic matching (not used for ranking — Bluesky
        // feed generators already rank posts intelligently)
        if (!skipLLMScoring) {
          const postsByTopic = new Map<string, EnrichedPost[]>();
          for (const post of allPosts) {
            const topicId = post.matchedTopics[0]?.topicId;
            if (!topicId) continue;
            let list = postsByTopic.get(topicId);
            if (!list) {
              list = [];
              postsByTopic.set(topicId, list);
            }
            list.push(post);
          }

          for (const [topicId, topicPosts] of postsByTopic) {
            const topic = allTopics.find((t) => t.id === topicId);
            if (!topic) continue;
            const scores = await llm.batchScoreTopicMatch(
              topicPosts.map((p) => p.text),
              topic,
            );
            for (let i = 0; i < topicPosts.length; i++) {
              topicPosts[i].matchedTopics = [{ topicId, score: scores[i] }];
            }
          }
        }
      } else {
        try {
          const hotResult = await feeds.fetchPopularFeed(agent, { limit: 30 });
          allPosts = hotResult.posts.map((p) => ({
            ...p,
            matchedTopics: [{ topicId: 'trending', score: 0 }],
          }));
          setCursorCache('whats-hot', hotResult.cursor ?? null);
        } catch {
          const timelineResult = await feeds.fetchHomeFeed(agent, { limit: 30 });
          allPosts = timelineResult.posts.map((p) => ({
            ...p,
            matchedTopics: [{ topicId: 'trending', score: 0 }],
          }));
          setCursorCache('timeline', timelineResult.cursor ?? null);
        }

        const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
        const now = Date.now();
        allPosts = allPosts.filter((p) => {
          const postTime = new Date(p.indexedAt).getTime();
          return now - postTime < TWO_DAYS_MS;
        });
      }

      set({
        posts: allPosts,
        cursor: null,
        loading: false,
        displayCount: 15,
      });

      // Apply moderation rules during browser idle time so it doesn't
      // compete with rendering or other UI work right after the feed loads.
      if (allPosts.length > 0) {
        const runModeration = () => {
          applyModerationRules(agent, allPosts).then(({ moderatedPostUris }) => {
            if (moderatedPostUris.size > 0) {
              set({ moderatedPostUris });
            }
          }).catch(() => {});
        };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(runModeration, { timeout: 2000 });
        } else {
          setTimeout(runModeration, 100);
        }
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load feed',
      });
    }
  },

  loadMore: async () => {
    const { agent } = useAuthStore.getState();
    const { posts, displayCount } = get();

    // Show more of what we already have immediately — don't make the user
    // wait for network calls before seeing more posts.
    if (posts.length > displayCount) {
      set({ displayCount: displayCount + 15 });
    }

    // Try server-side pagination in the background
    if (agent) {
      const followedIds = useTopicStore.getState().followedTopicIds;

      if (followedIds.size > 0) {
        // Collect feed URIs with remaining cursors
        const feedsWithCursor: Array<{ topicId: string; feedUri: string }> = [];
        for (const topicId of followedIds) {
          const topicFeedList = useTopicFeedStore.getState().feedsByTopic[topicId];
          if (!topicFeedList) continue;
          for (const feed of topicFeedList) {
            const cursor = feedCursors.get(feed.uri);
            if (cursor) {
              feedsWithCursor.push({ topicId, feedUri: feed.uri });
            }
          }
        }
        // Also check search cursors
        const allTopics = useTopicStore.getState().topics;
        const followedTopics = allTopics.filter((t) => followedIds.has(t.id));
        for (const topic of followedTopics) {
          for (const term of topic.seedTerms.slice(0, 3)) {
            const cursor = feedCursors.get(`search:${topic.id}:${term}`);
            if (cursor) {
              feedsWithCursor.push({ topicId: topic.id, feedUri: `search:${topic.id}:${term}` });
            }
          }
        }

        if (feedsWithCursor.length > 0) {
          set({ loading: true });
          try {
            const seen = new Set(posts.map((p) => p.uri));
            const newPosts: EnrichedPost[] = [];

            const fetchResults = await batchWithLimit(
              feedsWithCursor,
              async ({ topicId, feedUri }) => {
                const cursor = feedCursors.get(feedUri);
                if (!cursor) return { topicId, posts: [] as EnrichedPost[] };

                if (feedUri.startsWith('search:')) {
                  const [, , term] = feedUri.split(':');
                  const result = await feeds.searchPosts(agent, term, { limit: 10, cursor });
                  setCursorCache(feedUri, result.cursor ?? null);
                  return { topicId, posts: result.posts };
                }

                const result = await feeds.fetchCustomFeed(agent, feedUri, { limit: 10, cursor });
                setCursorCache(feedUri, result.cursor ?? null);
                return { topicId, posts: result.posts };
              },
              4,
            );

            for (const r of fetchResults) {
              if (r.status === 'rejected') continue;
              for (const post of r.value.posts) {
                if (seen.has(post.uri)) continue;
                seen.add(post.uri);
                newPosts.push({
                  ...post,
                  matchedTopics: [{ topicId: r.value.topicId, score: 0.5 }],
                });
              }
            }

            if (newPosts.length > 0) {
              set({
                posts: [...posts, ...newPosts],
                loading: false,
              });
              return;
            }
          } catch {
            // Fall through to client-side pagination
          }
          set({ loading: false });
        }
      } else {
        // No topics — try What's Hot / timeline cursor
        const hotCursor = feedCursors.get('whats-hot');
        const timelineCursor = feedCursors.get('timeline');
        const cursor = hotCursor ?? timelineCursor;
        const source = hotCursor ? 'whats-hot' : 'timeline';

        if (cursor) {
          set({ loading: true });
          try {
            let result;
            if (source === 'whats-hot') {
              result = await feeds.fetchPopularFeed(agent, { limit: 15, cursor });
              setCursorCache('whats-hot', result.cursor ?? null);
            } else {
              result = await feeds.fetchHomeFeed(agent, { limit: 15, cursor });
              setCursorCache('timeline', result.cursor ?? null);
            }

            const seen = new Set(posts.map((p) => p.uri));
            const newPosts = result.posts
              .filter((p) => !seen.has(p.uri))
              .map((p) => ({
                ...p,
                matchedTopics: [{ topicId: 'trending', score: 0 }],
              }));

            if (newPosts.length > 0) {
              set({
                posts: [...posts, ...newPosts],
                loading: false,
              });
              return;
            }
          } catch {
            // Fall through
          }
          set({ loading: false });
        }
      }
    }
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

  reRankWithLLM: async () => {
    const posts = get().posts;
    if (posts.length === 0) return;

    const allTopics = useTopicStore.getState().topics;
    const followedIds = useTopicStore.getState().followedTopicIds;
    const followedTopics = allTopics.filter((t) => followedIds.has(t.id));

    if (followedTopics.length === 0) return;

    const topicMap = new Map(followedTopics.map((t) => [t.id, t]));
    const postsByTopic = new Map<string, string[]>();

    for (const post of posts) {
      for (const match of post.matchedTopics) {
        if (topicMap.has(match.topicId)) {
          let texts = postsByTopic.get(match.topicId);
          if (!texts) {
            texts = [];
            postsByTopic.set(match.topicId, texts);
          }
          texts.push(post.uri);
        }
      }
    }

    const postsByUri = new Map(posts.map((p) => [p.uri, p]));
    const updatedPosts = new Map(posts.map((p) => [p.uri, { ...p, matchedTopics: [...p.matchedTopics] }]));

    for (const [topicId, uris] of postsByTopic) {
      const topic = topicMap.get(topicId);
      if (!topic) continue;

      const texts = uris
        .map((uri) => postsByUri.get(uri)?.text ?? '')
        .filter((t) => t.trim());

      if (texts.length === 0) continue;

      const scores = await llm.batchScoreTopicMatch(texts, topic);

      for (let i = 0; i < uris.length && i < scores.length; i++) {
        const post = updatedPosts.get(uris[i]);
        if (!post) continue;
        const matchIndex = post.matchedTopics.findIndex((m) => m.topicId === topicId);
        if (matchIndex >= 0) {
          post.matchedTopics[matchIndex] = { topicId, score: scores[i] };
        }
      }
    }

    const reranked: EnrichedPost[] = Array.from(updatedPosts.values());
    reranked.sort((a, b) => {
      // Sort by likeCount primarily; Bluesky feeds already rank by engagement.
      // LLM topic-match score is used as tiebreaker, not primary ranking signal.
      const likeDiff = b.likeCount - a.likeCount;
      if (likeDiff !== 0) return likeDiff;
      const aBest = Math.max(0, ...a.matchedTopics.map((m) => m.score));
      const bBest = Math.max(0, ...b.matchedTopics.map((m) => m.score));
      return bBest - aBest;
    });

    set({ posts: reranked });
  },

  upvote: async (post) => {
    const { agent } = useAuthStore.getState();
    if (!agent) {
      console.warn('Cannot upvote: no agent (session not restored yet?)');
      return;
    }
    if (get().upvotedPostUris.has(post.uri)) return;

      try {
      await feeds.likePost(agent, post.uri, post.cid);
      const newUpvoted = new Set(get().upvotedPostUris);
      newUpvoted.add(post.uri);
      set({ upvotedPostUris: newUpvoted });
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  },

  downvote: async (post) => {
    const { agent } = useAuthStore.getState();
    if (!agent) {
      console.warn('Cannot downvote: no agent (session not restored yet?)');
      return;
    }

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
