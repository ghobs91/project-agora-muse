/**
 * Zustand store for feed state and post interactions.
 */

import { create } from 'zustand';
import type { EnrichedPost, FeedSortMode, Topic, TopicCustomizationRecord } from '@/types';
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

/** Max time (ms) to wait for a feed-generator fetch before timing out.
 *  Dead/cold generators return empty here so they don't block first paint.
 *  Feed generators that haven't responded in 3s are skipped this load and
 *  retried (cache miss) on the next. */
const FEED_FETCH_TIMEOUT_MS = 3_000;

/** Concurrency for fetch tasks. Feed generators live on diverse hosts
 *  (skyfeed.me, bsky.app, etc.), so we can safely exceed the per-host
 *  6-connection limit. Higher concurrency prevents one slow chunk from
 *  serializing behind another. */
const FETCH_CONCURRENCY = 8;

/** First-paint deadline (ms). Posts are rendered as soon as the fast
 *  fetch tasks finish OR this deadline elapses — whichever comes first.
 *  Stragglers (slow/dead generators) append afterwards instead of
 *  blocking the entire first paint. */
const FIRST_PAINT_DEADLINE_MS = 1_500;

function setFeedCache(key: string, posts: EnrichedPost[]) {
  if (feedCache.size >= MAX_FEED_CACHE) feedCache.clear();
  feedCache.set(key, posts);
}

function setCursorCache(key: string, cursor: string | null) {
  if (feedCursors.size >= MAX_CURSOR_CACHE) feedCursors.clear();
  feedCursors.set(key, cursor);
}

function getEffectiveSeedTerms(
  topic: Topic,
  customizationsByTopic: Record<string, TopicCustomizationRecord>,
): string[] {
  const customization = customizationsByTopic[topic.id];
  if (!customization) return topic.seedTerms;
  const removed = new Set(customization.removedSeedTerms);
  return [
    ...topic.seedTerms.filter((t) => !removed.has(t)),
    ...customization.addedSeedTerms,
  ];
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

function interleaveFeeds(feedPostsByFeed: Map<string, EnrichedPost[]>): EnrichedPost[] {
  const result: EnrichedPost[] = [];
  const feedLists = Array.from(feedPostsByFeed.values());
  let pos = 0;
  let added = true;
  while (added) {
    added = false;
    for (const list of feedLists) {
      if (pos < list.length) {
        result.push(list[pos]);
        added = true;
      }
    }
    pos++;
  }
  return result;
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

/** Number of posts embedded per ONNX inference call during moderation.
 *  Each chunk is a synchronous main-thread burst (~46ms/post on WASM), so
 *  smaller chunks mean shorter bursts with paint opportunities between
 *  them. 8 keeps per-chunk overhead low while bounding jank to ~370ms. */
const MODERATION_CHUNK_SIZE = 8;

/** Yield to the event loop so the browser can paint / handle input between
 *  synchronous ONNX inference chunks. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function applyModerationRules(
  agent: any,
  posts: EnrichedPost[],
  onProgress?: (moderatedPostUris: Set<string>) => void,
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

    if (rules.length === 0) {
      return { moderatedPostUris };
    }

    // Pre-compute rule embeddings in one batched ONNX call (was N sequential)
    const ruleEmbeddings = await llm.getBatchEmbeddingsForTexts(
      rules.map((r) => r.value),
    );

    // Embed posts in chunks, yielding to the event loop between each chunk.
    // A single 218-text ONNX call blocks the main thread for ~10s straight;
    // chunking turns that continuous freeze into short bursts the browser
    // can paint between, keeping scroll/click input responsive.
    for (let start = 0; start < posts.length; start += MODERATION_CHUNK_SIZE) {
      const chunk = posts.slice(start, start + MODERATION_CHUNK_SIZE);
      const chunkEmbeddings = await llm.getBatchEmbeddingsForTexts(
        chunk.map((p) => p.text),
      );

      let addedInChunk = false;
      for (let i = 0; i < chunk.length; i++) {
        const postEmbedding = chunkEmbeddings[i];
        if (!postEmbedding) continue;
        for (let j = 0; j < rules.length; j++) {
          const ruleEmbedding = ruleEmbeddings[j];
          if (!ruleEmbedding) continue;
          const similarity = llm.cosineSimilarity(postEmbedding, ruleEmbedding);
          if (similarity > 0.6) {
            moderatedPostUris.add(chunk[i].uri);
            addedInChunk = true;
            break;
          }
        }
      }

      // Progressive update so rule-matching posts disappear as each chunk
      // resolves, instead of all at once after the full sweep.
      if (addedInChunk && onProgress) {
        onProgress(new Set(moderatedPostUris));
      }

      // Yield between chunks (skip after the last one — nothing to wait for).
      if (start + MODERATION_CHUNK_SIZE < posts.length) {
        await yieldToEventLoop();
      }
    }

    return { moderatedPostUris };
  } catch {
    return { moderatedPostUris: new Set() };
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
          const topicFeedList = topicFeedsState.getFeedsForTopic(topicId);
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
          const hasFeeds = topicFeedsState.getFeedsForTopic(topic.id).length > 0;
          const effectiveSeedTerms = getEffectiveSeedTerms(topic, topicFeedsState.customizationsByTopic);
          if (!hasFeeds || topic.isCustom) {
            for (const term of effectiveSeedTerms.slice(0, 3)) {
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
          const effectiveSeedTerms = getEffectiveSeedTerms(topic, topicFeedsState.customizationsByTopic);
          const hashtag = '#' + effectiveSeedTerms[0].trim().toLowerCase().replace(/\s+/g, '');
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

        // Count feed-generator tasks (they come first in the fetchTasks array)
        let feedGenTaskCount = 0;
        for (const topicId of followedIds) {
          const topicFeedList = topicFeedsState.getFeedsForTopic(topicId);
          if (topicFeedList && topicFeedList.length > 0) {
            feedGenTaskCount += topicFeedList.length;
          }
        }

        // ─── Incremental first paint ───────────────────────────────────
        // Run all fetch tasks concurrently, but render as soon as the fast
        // ones finish (or FIRST_PAINT_DEADLINE_MS elapses) instead of
        // awaiting the full batch. Dead/cold feed generators that hit the
        // timeout would otherwise block 200+ ready posts behind a blank
        // skeleton for tens of seconds.
        //
        // Shared accumulators mutated as tasks complete:
        const feedGenPostsByFeed = new Map<string, EnrichedPost[]>();
        const otherPosts: EnrichedPost[] = [];
        const seen = new Set<string>();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const isRecent = (p: EnrichedPost) => now - new Date(p.indexedAt).getTime() < ONE_DAY_MS;

        function ingestPosts(posts: EnrichedPost[], isFeedGen: boolean, feedUri?: string) {
          for (const post of posts) {
            if (seen.has(post.uri)) continue;
            if (!isRecent(post)) continue;
            seen.add(post.uri);
            if (isFeedGen && feedUri) {
              let list = feedGenPostsByFeed.get(feedUri);
              if (!list) { list = []; feedGenPostsByFeed.set(feedUri, list); }
              list.push(post);
            } else {
              otherPosts.push(post);
            }
          }
        }

        function buildOrderedPosts(): EnrichedPost[] {
          // Round-robin interleave feed-gen posts so no single feed dominates;
          // sort search/hashtag posts by likeCount (no curation). Feed-gen
          // first, then search/hashtag. Pinned posts removed.
          const interleaved = interleaveFeeds(feedGenPostsByFeed);
          const sortedOther = [...otherPosts].sort((a, b) => b.likeCount - a.likeCount);
          return [...interleaved, ...sortedOther].filter((p) => !p.isPinned);
        }

        // Run tasks with a concurrency cap. Each completed task ingests its
        // posts into the shared accumulators; we render once the first-paint
        // deadline passes (or all tasks settle, whichever is first), then
        // again after any stragglers finish.
        let nextTaskIdx = 0;
        let activeCount = 0;
        let allDone = fetchTasks.length === 0;
        let firstPainted = false;
        let resolveAllDone: () => void = () => {};
        const allDonePromise = new Promise<void>((resolve) => { resolveAllDone = resolve; });
        if (allDone) resolveAllDone();

        function startNext(): void {
          while (activeCount < FETCH_CONCURRENCY && nextTaskIdx < fetchTasks.length) {
            const i = nextTaskIdx++;
            const isFeedGen = i < feedGenTaskCount;
            const task = fetchTasks[i];
            activeCount++;
            task()
              .then((r) => { ingestPosts(r.posts, isFeedGen, r.feedUri); })
              .catch(() => { /* one feed failing shouldn't block the rest */ })
              .finally(() => {
                activeCount--;
                if (nextTaskIdx >= fetchTasks.length && activeCount === 0) {
                  allDone = true;
                  resolveAllDone();
                } else {
                  startNext();
                }
              });
          }
        }
        startNext();

        // Wait for either the first-paint deadline or full completion.
        await Promise.race([
          allDonePromise,
          new Promise<void>((resolve) => setTimeout(resolve, FIRST_PAINT_DEADLINE_MS)),
        ]);

        // First paint: render whatever has arrived. Skip the LLM-scoring
        // block below for the early subset (it runs once on the final set).
        if (!firstPainted) {
          firstPainted = true;
          const earlyPosts = buildOrderedPosts();
          if (earlyPosts.length > 0) {
            set({ posts: earlyPosts, loading: false, displayCount: 15 });
          }
        }

        // Wait for any remaining stragglers (slow/dead generators).
        if (!allDone) await allDonePromise;

        // Final ordering with the complete dataset. If stragglers added new
        // posts, this re-sets the store (posts may shift order as the
        // round-robin interleave rebalances — acceptable vs a 40s blank
        // skeleton). If everything finished before the deadline, this is a
        // no-op identical set.
        allPosts = buildOrderedPosts();

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

          // Compute all post embeddings in a single ONNX batch call —
          // avoids redundant per-topic calls that re-embed the same posts
          // N times for N topics. This was the dominant UI-freeze source.
          const postIndexMap = new Map<EnrichedPost, number>();
          for (let i = 0; i < allPosts.length; i++) {
            postIndexMap.set(allPosts[i], i);
          }
          const allPostEmbeddings = await llm.getBatchEmbeddingsForTexts(
            allPosts.map((p) => p.text),
          );

          for (const [topicId, topicPosts] of postsByTopic) {
            const topic = allTopics.find((t) => t.id === topicId);
            if (!topic) continue;
            const topicEmbeddings = topicPosts.map(
              (p) => allPostEmbeddings[postIndexMap.get(p) ?? -1] ?? null,
            );
            const scores = await llm.batchScoreTopicMatch(
              topicPosts.map((p) => p.text),
              topic,
              topicEmbeddings,
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
      // The embedding work itself is chunked inside applyModerationRules
      // with event-loop yields, so it can't freeze the UI even after the
      // idle deadline fires.
      if (allPosts.length > 0) {
        const runModeration = () => {
          applyModerationRules(agent, allPosts, (progress) => {
            // Progressive update: hide rule-matching posts as each chunk
            // resolves instead of waiting for the full sweep.
            set({ moderatedPostUris: progress });
          }).then(({ moderatedPostUris }) => {
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
        const topicFeedsState = useTopicFeedStore.getState();
        for (const topicId of followedIds) {
          const topicFeedList = topicFeedsState.getFeedsForTopic(topicId);
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
          const effectiveSeedTerms = getEffectiveSeedTerms(topic, topicFeedsState.customizationsByTopic);
          for (const term of effectiveSeedTerms.slice(0, 3)) {
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
                if (!cursor) return { topicId, feedUri, posts: [] as EnrichedPost[] };

                if (feedUri.startsWith('search:')) {
                  const [, , term] = feedUri.split(':');
                  const result = await feeds.searchPosts(agent, term, { limit: 10, cursor });
                  setCursorCache(feedUri, result.cursor ?? null);
                  return { topicId, feedUri, posts: result.posts };
                }

                const result = await feeds.fetchCustomFeed(agent, feedUri, { limit: 10, cursor });
                setCursorCache(feedUri, result.cursor ?? null);
                return { topicId, feedUri, posts: result.posts };
              },
              4,
            );

            // Separate feed-gen posts from search/hashtag posts
            const feedGenPostsByFeed = new Map<string, EnrichedPost[]>();
            const otherNewPosts: EnrichedPost[] = [];

            for (const r of fetchResults) {
              if (r.status === 'rejected') continue;
              const { topicId, feedUri, posts: resultPosts } = r.value;

              for (const post of resultPosts) {
                if (seen.has(post.uri)) continue;
                seen.add(post.uri);
                const enriched = {
                  ...post,
                  matchedTopics: [{ topicId, score: 0.5 }],
                };

                // Feed generator posts: group by feedUri for interleaving.
                // Search/hashtag posts: collect separately.
                if (feedUri && !feedUri.startsWith('search:')) {
                  let list = feedGenPostsByFeed.get(feedUri);
                  if (!list) {
                    list = [];
                    feedGenPostsByFeed.set(feedUri, list);
                  }
                  list.push(enriched);
                } else {
                  otherNewPosts.push(enriched);
                }
              }
            }

            // Round-robin interleave feed-generator posts so no single
            // feed dominates the paginated results.
            const interleavedNew = interleaveFeeds(feedGenPostsByFeed);

            newPosts.push(...interleavedNew, ...otherNewPosts);

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
