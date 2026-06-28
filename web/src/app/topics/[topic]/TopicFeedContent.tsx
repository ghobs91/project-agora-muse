'use client';

import { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Icon } from '@iconify/react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore, DEFAULT_TOPICS } from '@/lib/store/topic-store';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';
import { useFeedStore } from '@/lib/store/feed-store';
import * as feeds from '@/lib/atproto/feeds';
import { batchScoreTopicMatch } from '@/lib/llm/topic-matcher';
import type { EnrichedPost, FeedGenerator, TopicCustomizationRecord } from '@/types';
import Header from '@/components/layout/Header';
import PostCard from '@/components/feed/PostCard';
import TopicFollowButton from '@/components/topics/TopicFollowButton';

interface TopicFeedContentProps {
  topicId: string;
}

function scorePopularity(post: EnrichedPost): number {
  const ageHours = Math.max(
    0,
    (Date.now() - new Date(post.indexedAt).getTime()) / (1000 * 60 * 60),
  );
  const engagement = post.likeCount + post.repostCount + post.replyCount;
  return engagement / Math.pow(ageHours + 2, 1.5);
}

async function batchWithLimit<T>(items: T[], fn: (item: T) => Promise<any>, limit: number = 4) {
  const results: PromiseSettledResult<any>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/** Convert an `at://` feed-generator URI to a bsky.app web URL. */
function feedUriToBlueskyUrl(uri: string): string {
  const match = uri.match(/^at:\/\/(.+)\/app\.bsky\.feed\.generator\/(.+)$/);
  if (!match) return 'https://bsky.app';
  const [, did, rkey] = match;
  return `https://bsky.app/profile/${did}/feed/${rkey}`;
}

export default function TopicFeedContent({ topicId }: TopicFeedContentProps) {
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();
  const { topics } = useTopicStore();
  const { getFeedsForTopic, discoverFeedsForTopic, discovering, getCustomizationForTopic, loadTopicCustomizations, saveTopicCustomization } = useTopicFeedStore();
  const upvote = useFeedStore((s) => s.upvote);
  const downvote = useFeedStore((s) => s.downvote);
  const hiddenPostUris = useFeedStore((s) => s.hiddenPostUris);
  const moderatedPostUris = useFeedStore((s) => s.moderatedPostUris);
  // Fall back to DEFAULT_TOPICS if the store's topic list has been
  // replaced (e.g. by loadPopularTopics on another page) and no longer
  // includes this topic.  This also handles server-rendered refreshes
  // where the store hasn't hydrated custom/dynamic topics yet.
  const topic = topics.find((t) => t.id === topicId) ?? DEFAULT_TOPICS.find((t) => t.id === topicId);
  const customization = getCustomizationForTopic(topicId);

  const [posts, setPosts] = useState<EnrichedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(15);
  const [mounted, setMounted] = useState(false);
  const [removedTerms, setRemovedTerms] = useState<Set<string>>(new Set(customization?.removedSeedTerms ?? []));
  const [addedTerms, setAddedTerms] = useState<string[]>(customization?.addedSeedTerms ?? []);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [pendingAdditions, setPendingAdditions] = useState<string[]>([]);
  const [showAddTerm, setShowAddTerm] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  // Feed curation state
  const [removedFeedUris, setRemovedFeedUris] = useState<Set<string>>(new Set(customization?.removedFeedUris ?? []));
  const [addedFeeds, setAddedFeeds] = useState<FeedGenerator[]>(customization?.addedFeeds ?? []);
  const [pendingFeedRemovals, setPendingFeedRemovals] = useState<Set<string>>(new Set());
  const [pendingFeedAdditions, setPendingFeedAdditions] = useState<FeedGenerator[]>([]);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');
  const [feedSearchResults, setFeedSearchResults] = useState<FeedGenerator[]>([]);
  const [feedSearchLoading, setFeedSearchLoading] = useState(false);
  const [feedsExpanded, setFeedsExpanded] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);

  const hasPendingChanges = pendingRemovals.size > 0 || pendingAdditions.length > 0
    || pendingFeedRemovals.size > 0 || pendingFeedAdditions.length > 0;
  const observerRef = useRef<HTMLDivElement>(null);
  const cursorsRef = useRef<Map<string, string | null>>(new Map());
  const loadingMoreRef = useRef(false);
  const postsRef = useRef<EnrichedPost[]>([]);
  const loadedTopicIdRef = useRef<string | null>(null);
  const loadedTermsKeyRef = useRef<string>('');
  const loadedFeedsKeyRef = useRef<string>('');
  const loadingRef = useRef(false);
  postsRef.current = posts;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isAuthenticated || !agent) return;
    loadTopicCustomizations();
  }, [isAuthenticated, agent, loadTopicCustomizations]);

  useEffect(() => {
    setRemovedTerms(new Set(customization?.removedSeedTerms ?? []));
    setAddedTerms(customization?.addedSeedTerms ?? []);
    setRemovedFeedUris(new Set(customization?.removedFeedUris ?? []));
    setAddedFeeds(customization?.addedFeeds ?? []);
    setPendingRemovals(new Set());
    setPendingAdditions([]);
    setPendingFeedRemovals(new Set());
    setPendingFeedAdditions([]);
  }, [customization]);

  useEffect(() => {
    if (!isAuthenticated || !agent || !topic) return;

    // Build a key representing the current term selection. If it matches what
    // we already loaded for this topic, skip — the effect would otherwise
    // re-run every time `topic`'s object reference changes (e.g. when
    // discoverFeedsForTopic calls setTopicIcon), which would reset `posts`
    // and appear to "reload" the initial feed.
    const termsKey = [...removedTerms].sort().join(',') + '|' + [...addedTerms].sort().join(',');
    const topicFeeds = getFeedsForTopic(topicId);
    const feedsKey = topicFeeds.map(f => f.uri).sort().join(',');
    if (
      loadedTopicIdRef.current === topicId &&
      loadedTermsKeyRef.current === termsKey &&
      loadedFeedsKeyRef.current === feedsKey &&
      (loadingRef.current || postsRef.current.length > 0)
    ) {
      return;
    }

    // Record what we're about to load BEFORE the async work starts.
    // discoverFeedsForTopic calls setTopicIcon below, which updates the
    // topic store and triggers a re-render with a new `topic` reference.
    // Without these early assignments the effect would re-run (because
    // `topic` changed), the guard would fail (because the refs were still
    // null), and a second loadTopicFeed instance would start.  Two
    // concurrent instances race: the second one's setPosts(allPosts)
    // overwrites the first one's results, and resets any posts that
    // loadMore appended in between — the user sees the feed reload from
    // scratch instead of paginating.
    loadedTopicIdRef.current = topicId;
    loadedTermsKeyRef.current = termsKey;
    loadedFeedsKeyRef.current = feedsKey;
    loadingRef.current = true;

    const loadTopicFeed = async () => {
      setLoading(true);
      setError(null);
      setDisplayCount(15);
      // Reset server cursors so pagination starts fresh on reload
      cursorsRef.current.clear();

      try {
        // Ensure feed metadata is up to date (fetch if missing, update seed terms/icon regardless)
        await discoverFeedsForTopic(topicId);

        // Get associated feed generators for this topic, respecting removals/additions
        const topicFeeds = getFeedsForTopic(topicId);

        // Aggregate posts from discovered feeds, seed-term search, and hashtags.
        // Using multiple sources gives a broader sample so the popularity ranking
        // actually reflects the most engaging posts rather than whatever a single
        // feed generator happens to return.
        let allPosts: EnrichedPost[] = [];
        const seen = new Set<string>();

        if (topicFeeds.length > 0) {
          const feedPosts = await loadFromFeeds(topicFeeds);
          for (const post of feedPosts) {
            if (seen.has(post.uri)) continue;
            seen.add(post.uri);
            allPosts.push(post);
          }
        }

        const searchPosts = await loadFromSearch();
        for (const post of searchPosts) {
          if (seen.has(post.uri)) continue;
          seen.add(post.uri);
          allPosts.push(post);
        }

        allPosts = await loadFromHashtags(allPosts);

        // Rank by popularity within the last 24 hours
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const now = Date.now();
        allPosts = allPosts.filter((p) => {
          const postTime = new Date(p.indexedAt).getTime();
          return now - postTime < ONE_DAY_MS;
        });

        const scoredPosts = allPosts.map((p) => ({ post: p, score: scorePopularity(p) }));
        scoredPosts.sort((a, b) => b.score - a.score);
        allPosts = scoredPosts.map((s) => s.post);
        setPosts(allPosts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };

    // Load posts from associated feed generators
    const loadFromFeeds = async (topicFeeds: FeedGenerator[]) => {
      let allPosts: EnrichedPost[] = [];
      const seen = new Set<string>();
      const cursors = cursorsRef.current;

      const fetchResults = await batchWithLimit(
        topicFeeds.slice(0, 6),
        (feed) =>
          feeds.fetchCustomFeed(agent, feed.uri, { limit: 10 }).then((r) => {
            cursors.set(feed.uri, r.cursor ?? null);
            return r;
          }),
        6,
      );

      for (const result of fetchResults) {
        if (result.status === 'rejected') continue;
        for (const post of result.value.posts) {
          if (seen.has(post.uri)) continue;
          seen.add(post.uri);
          allPosts.push({
            ...post,
            matchedTopics: [{ topicId: topic.id, score: 0.5 }],
          });
        }
      }

      // Use batch scoring for the topic
      if (allPosts.length > 0) {
        try {
          const texts = allPosts.map((p) => p.text);
          const scores = await batchScoreTopicMatch(texts, topic);
          allPosts = allPosts.map((p, i) => ({
            ...p,
            matchedTopics: [{ topicId: topic.id, score: scores[i] }],
          }));
        } catch {
          // Keep default scores if LLM fails
        }
      }

      return allPosts;
    };

    // Pull top posts from hashtag feeds for each seed term (<= 1 day old)
    const loadFromHashtags = async (currentPosts: EnrichedPost[]) => {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const activeTerms = topic.seedTerms.filter((t) => !removedTerms.has(t));
      const allTerms = [...activeTerms, ...addedTerms];
      const hashtagQueries = allTerms
        .slice(0, 3)
        .map((term) => term.trim().toLowerCase().replace(/\s+/g, ''))
        .filter((term) => term.length > 0)
        .map((term) => `#${term}`);

      if (hashtagQueries.length === 0) return currentPosts;

      const searchResults = await batchWithLimit(
        hashtagQueries,
        (q) => feeds.searchPosts(agent, q, { limit: 15 }),
        3,
      );

      const seen = new Set(currentPosts.map((p) => p.uri));
      const newPosts: EnrichedPost[] = [];

      for (const result of searchResults) {
        if (result.status === 'rejected') continue;
        for (const post of result.value.posts) {
          if (seen.has(post.uri)) continue;
          const postTime = new Date(post.indexedAt).getTime();
          if (now - postTime > ONE_DAY_MS) continue;
          seen.add(post.uri);
          newPosts.push({
            ...post,
            matchedTopics: [{ topicId: topic.id, score: 0.5 }],
          });
        }
      }

      return [...currentPosts, ...newPosts];
    };

    // Search by seed terms for a broader sample than feed generators alone provide
    const loadFromSearch = async () => {
      const cursors = cursorsRef.current;
      const activeTerms = topic.seedTerms.filter((t) => !removedTerms.has(t));
      const allTerms = [...activeTerms, ...addedTerms].slice(0, 5);
      const searchResults = await batchWithLimit(
        allTerms.slice(0, 3),
        (term) =>
          feeds.searchPosts(agent, term, { limit: 20 }).then((r) => {
            cursors.set(`search:${term}`, r.cursor ?? null);
            return r;
          }),
        3,
      );

      const seen = new Set<string>();
      const allPosts: EnrichedPost[] = [];
      for (const result of searchResults) {
        if (result.status === 'rejected') continue;
        for (const post of result.value.posts) {
          if (seen.has(post.uri)) continue;
          seen.add(post.uri);
          allPosts.push(post);
        }
      }

      // Batch score with LLM
      let scored: EnrichedPost[] = [];
      if (allPosts.length > 0) {
        try {
          const texts = allPosts.map((p) => p.text);
          const scores = await batchScoreTopicMatch(texts, topic);
          scored = allPosts.map((p, i) => ({
            ...p,
            matchedTopics: [{ topicId: topic.id, score: scores[i] }],
          }));
        } catch {
          scored = allPosts.map((p) => ({
            ...p,
            matchedTopics: [{ topicId: topic.id, score: 0.5 }],
          }));
        }
      }

      return scored;
    };

    loadTopicFeed();
  }, [isAuthenticated, agent, topic, topicId, getFeedsForTopic, discoverFeedsForTopic, removedTerms, addedTerms]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !topic || !agent) return;
    loadingMoreRef.current = true;

    const cursors = cursorsRef.current;
    const topicFeeds = getFeedsForTopic(topicId);

    // Try server-side pagination first
    const feedsWithCursor = topicFeeds.filter((f) => {
      const c = cursors.get(f.uri);
      return c && c !== null;
    });

    const activeTerms = topic.seedTerms.filter((t) => !removedTerms.has(t));
    const allTerms = [...activeTerms, ...addedTerms].slice(0, 5);
    const searchCursors = allTerms
      .slice(0, 3)
      .filter((term) => {
        const c = cursors.get(`search:${term}`);
        return c && c !== null;
      });

    if (feedsWithCursor.length > 0 || searchCursors.length > 0) {
      setLoading(true);
      try {
        const seen = new Set(postsRef.current.map((p) => p.uri));
        const newPosts: EnrichedPost[] = [];

        // Fetch next page from feed generators
        const feedResults = await batchWithLimit(
          feedsWithCursor,
          async (f) => {
            const cursor = cursors.get(f.uri)!;
            const result = await feeds.fetchCustomFeed(agent, f.uri, { limit: 5, cursor });
            cursors.set(f.uri, result.cursor ?? null);
            return { posts: result.posts, feedUri: f.uri };
          },
          4,
        );

        for (const r of feedResults) {
          if (r.status === 'rejected') continue;
          for (const post of r.value.posts) {
            if (seen.has(post.uri)) continue;
            seen.add(post.uri);
            newPosts.push(post);
          }
        }

        // Fetch next page from search terms
        const searchResults = await batchWithLimit(
          searchCursors,
          async (term) => {
            const cursor = cursors.get(`search:${term}`)!;
            const result = await feeds.searchPosts(agent, term, { limit: 5, cursor });
            cursors.set(`search:${term}`, result.cursor ?? null);
            return result.posts;
          },
          2,
        );

        for (const r of searchResults) {
          if (r.status === 'rejected') continue;
          for (const post of r.value) {
            if (seen.has(post.uri)) continue;
            seen.add(post.uri);
            newPosts.push(post);
          }
        }

        if (newPosts.length > 0) {
          // Score new posts
          let scoredNew = newPosts;
          try {
            const texts = newPosts.map((p) => p.text);
            const scores = await batchScoreTopicMatch(texts, topic);
            scoredNew = newPosts.map((p, i) => ({
              ...p,
              matchedTopics: [{ topicId: topic.id, score: scores[i] }],
            }));
          } catch {
            scoredNew = newPosts.map((p) => ({
              ...p,
              matchedTopics: [{ topicId: topic.id, score: 0.5 }],
            }));
          }

          setPosts((prev) => [...prev, ...scoredNew]);
          setLoading(false);
          loadingMoreRef.current = false;
          return;
        }

        // Server returned no new posts even with valid cursors — mark
        // server-side pagination as exhausted by clearing cursors. Without
        // this, hasServerCursors stays true and the observer keeps firing
        // loadMore in a tight loop, each call refetching the same page.
        for (const f of feedsWithCursor) cursors.delete(f.uri);
        for (const term of searchCursors) cursors.delete(`search:${term}`);
      } catch {
        // Fall through
      }
      setLoading(false);
    }

    // Server-side exhausted — fall back to client-side display
    setDisplayCount((prev) => prev + 15);
    loadingMoreRef.current = false;
  }, [agent, topic, topicId, getFeedsForTopic, removedTerms, addedTerms]);

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadMore]);

  const isLoading = loading || discovering;

  const visiblePosts = useMemo(
    () =>
      posts
        .filter((p) => !hiddenPostUris.has(p.uri) && !moderatedPostUris.has(p.uri))
        .slice(0, displayCount),
    [posts, displayCount, hiddenPostUris, moderatedPostUris],
  );

  const hasServerCursors = useMemo(() => {
    if (!topic) return false;
    const cursors = cursorsRef.current;
    const topicFeeds = getFeedsForTopic(topicId);
    const activeTerms = topic.seedTerms.filter((t) => !removedTerms.has(t));
    const allTerms = [...activeTerms, ...addedTerms].slice(0, 5);

    const hasFeedCursor = topicFeeds.some((f) => {
      const c = cursors.get(f.uri);
      return c && c !== null;
    });
    const hasSearchCursor = allTerms.slice(0, 3).some((term) => {
      const c = cursors.get(`search:${term}`);
      return c && c !== null;
    });
    return hasFeedCursor || hasSearchCursor;
  }, [topic, topicId, getFeedsForTopic, removedTerms, addedTerms]);

  const hasMore = displayCount < posts.length || hasServerCursors;

  const parentRef = useRef<HTMLDivElement>(null);
  const [parentOffset, setParentOffset] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (!parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      setParentOffset(rect.top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: visiblePosts.length,
    getItemKey: (index) => visiblePosts[index].uri,
    estimateSize: (index) => {
      const post = visiblePosts[index];
      const hasImage = post.embed?.type === 'image' && (post.embed.images?.length ?? 0) > 0;
      const hasExternal = post.embed?.type === 'external' && post.embed.external;
      // Posts with media/embeds are taller; over-estimate to prevent overlap
      // before the ResizeObserver measurement kicks in.
      return hasImage || hasExternal ? 520 : 340;
    },
    overscan: 5,
    scrollMargin: parentOffset,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Compute active feed generators for this topic (store feeds minus removals plus additions)
  const topicFeeds = getFeedsForTopic(topicId);
  const activeFeeds = useMemo(() => {
    return topicFeeds;
  }, [topicFeeds]);

  // Feed search debounce
  useEffect(() => {
    if (!showAddFeed || !feedSearchQuery.trim() || !agent) {
      setFeedSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setFeedSearchLoading(true);
      try {
        const results = await feeds.searchFeedGenerators(agent, feedSearchQuery.trim(), 10);
        const topicFeedsUris = new Set(getFeedsForTopic(topicId).map(f => f.uri));
        const pendingUris = new Set(pendingFeedAdditions.map(f => f.uri));
        const filtered = results.filter(f =>
          !topicFeedsUris.has(f.uri) &&
          !pendingUris.has(f.uri)
        );
        setFeedSearchResults(filtered);
      } catch {
        setFeedSearchResults([]);
      } finally {
        setFeedSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [feedSearchQuery, showAddFeed, agent, topicId, getFeedsForTopic, pendingFeedAdditions]);

  if (authLoading || !mounted) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="flex items-center justify-center h-[60vh]">
          <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">Topic not found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Feed column — second on mobile, first (left) on desktop */}
          <div className="flex-1 min-w-0 max-w-3xl order-2 lg:order-1">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-lighter" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-32 bg-surface-lighter rounded" />
                        <div className="h-4 w-full bg-surface-lighter rounded" />
                        <div className="h-4 w-3/4 bg-surface-lighter rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="card text-center">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-sm text-text-500">
                  No posts found for this topic yet.
                </p>
              </div>
            ) : (
              <div ref={parentRef}>
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const post = visiblePosts[virtualRow.index];
                    return (
                      <div
                        key={post.uri}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div className="mb-2">
                          <PostCard
                            post={post}
                            onUpvote={upvote}
                            onDownvote={downvote}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasMore && <div ref={observerRef} className="h-4" />}
                {!hasMore && posts.length > 0 && (
                  <p className="text-center text-xs text-text-600 py-4">
                    — End of feed —
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Topic info card — first on mobile (above feed), right side on desktop */}
          <aside className="w-full lg:w-80 lg:shrink-0 order-1 lg:order-2">
            <div className="lg:sticky lg:top-16">
              <div className="card mb-4 lg:mb-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-100 truncate">{topic.name}</h1>
                {mounted && activeFeeds.some((f) => f.avatar) && (
                  <div className="flex -space-x-1.5 shrink-0">
                    {activeFeeds.filter((f) => f.avatar).slice(0, 3).map((feed) => (
                      <img
                        key={feed.uri}
                        src={feed.avatar}
                        alt=""
                        className="w-4 h-4 rounded-full ring-1 ring-surface"
                        title={feed.displayName}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-text-500 mt-1">{topic.description}</p>
              {mounted && (
                <div className="mt-3 pt-3 border-t border-dark-700">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-text-600">
                      {activeFeeds.length > 0
                        ? `Curated feeds (${activeFeeds.length})`
                        : 'No curated feeds configured. Search to add one:'}
                    </p>
                    {activeFeeds.length > 3 && (
                      <button
                        onClick={() => setFeedsExpanded(!feedsExpanded)}
                        className="text-xs text-text-500 hover:text-sky-400 transition-colors flex items-center gap-0.5 shrink-0 whitespace-nowrap"
                      >
                        {feedsExpanded ? 'Show less' : `Show all`}
                        <Icon icon={feedsExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className={`flex flex-wrap gap-1.5${!feedsExpanded ? ' max-h-[28px] overflow-hidden' : ''}`}>
                    {activeFeeds.map((feed) => {
                      const isPendingRemove = pendingFeedRemovals.has(feed.uri);
                      const isAdded = addedFeeds.some(f => f.uri === feed.uri);
                      return (
                        <span
                          key={feed.uri}
                          className={`inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full text-xs group ${
                            isPendingRemove
                              ? 'bg-surface-lighter/50 text-text-600 line-through'
                              : isAdded
                                ? 'bg-sky-600/20 text-sky-400'
                                : 'bg-surface-lighter text-sky-400 hover:bg-sky-600/20 transition-colors'
                          }`}
                        >
                          {feed.avatar && (
                            <img
                              src={feed.avatar}
                              alt=""
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                            />
                          )}
                          <a
                            href={feedUriToBlueskyUrl(feed.uri)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open ${feed.displayName} on Bluesky`}
                            className="truncate min-w-0"
                          >
                            {feed.displayName}
                          </a>
                          {feed.autoPublished && (
                            <span className="text-[10px] text-sky-500/60 shrink-0">(auto)</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPendingRemove) {
                                setPendingFeedRemovals((prev) => {
                                  const next = new Set(prev);
                                  next.delete(feed.uri);
                                  return next;
                                });
                              } else {
                                setPendingFeedRemovals((prev) => new Set(prev).add(feed.uri));
                              }
                            }}
                            className={`shrink-0 ${
                              isPendingRemove
                                ? 'text-sky-400 hover:text-sky-300'
                                : 'text-text-600 hover:text-red-400'
                            } transition-colors`}
                            title={isPendingRemove ? `Undo remove ${feed.displayName}` : `Remove ${feed.displayName}`}
                          >
                            <Icon icon="lucide:x" className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}

                    {/* Pending feed additions */}
                    {pendingFeedAdditions.map((feed) => (
                      <span
                        key={`pending-feed-${feed.uri}`}
                        className="inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 group"
                      >
                        {feed.avatar && (
                          <img src={feed.avatar} alt="" className="w-3.5 h-3.5 rounded-full shrink-0" />
                        )}
                        <span className="truncate min-w-0">{feed.displayName}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingFeedAdditions((prev) => prev.filter((f) => f.uri !== feed.uri));
                          }}
                          className="shrink-0 text-sky-400/70 hover:text-red-400 transition-colors"
                          title={`Remove ${feed.displayName}`}
                        >
                          <Icon icon="lucide:x" className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {/* Add feed search button / input */}
                    {showAddFeed ? (
                      <div className="relative inline-flex flex-col">
                        <form
                          onSubmit={(e) => e.preventDefault()}
                          className="inline-flex"
                        >
                          <input
                            type="text"
                            value={feedSearchQuery}
                            onChange={(e) => setFeedSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setShowAddFeed(false);
                                setFeedSearchQuery('');
                                setFeedSearchResults([]);
                              }
                            }}
                            placeholder="Search feeds..."
                            className="w-40 px-2.5 py-1 rounded text-sm input-dark"
                            autoFocus
                          />
                        </form>
                        {/* Search results dropdown */}
                        {(feedSearchResults.length > 0 || feedSearchLoading) && (
                          <div className="absolute top-full mt-1 left-0 w-72 max-h-60 overflow-y-auto rounded bg-surface border border-dark-700 shadow-lg z-50">
                            {feedSearchLoading ? (
                              <div className="flex items-center justify-center py-4">
                                <div className="w-5 h-5 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
                              </div>
                            ) : (
                              feedSearchResults.map((result) => (
                                <button
                                  key={result.uri}
                                  onClick={() => {
                                    const alreadyPending = pendingFeedAdditions.some(f => f.uri === result.uri);
                                    if (!alreadyPending) {
                                      setPendingFeedAdditions((prev) => [...prev, result]);
                                    }
                                    setFeedSearchQuery('');
                                    setFeedSearchResults([]);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-lighter transition-colors"
                                >
                                  {result.avatar ? (
                                    <img src={result.avatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-surface-lighter shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-text-200 truncate">{result.displayName}</div>
                                    {result.description && (
                                      <div className="text-text-600 text-xs truncate">{result.description}</div>
                                    )}
                                  </div>
                                  {result.likeCount != null && (
                                    <span className="text-text-600 text-xs shrink-0">
                                      {result.likeCount} ♥
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddFeed(true)}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-lighter text-text-500 hover:bg-surface-light hover:text-sky-400 transition-colors"
                        title="Add curated feed"
                      >
                        <Icon icon="lucide:plus" className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-dark-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-text-600">Related topics</p>
                  {topic.seedTerms.length > 5 && (
                    <button
                      onClick={() => setTermsExpanded(!termsExpanded)}
                      className="text-xs text-text-500 hover:text-sky-400 transition-colors flex items-center gap-0.5 shrink-0 whitespace-nowrap"
                    >
                      {termsExpanded ? 'Show less' : `Show all`}
                      <Icon icon={termsExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'} className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className={`flex flex-wrap gap-1.5${!termsExpanded ? ' max-h-[28px] overflow-hidden' : ''}`}>
                  {/* Original seed terms */}
                  {topic.seedTerms
                    .filter((term) => !removedTerms.has(term))
                    .map((term) => {
                      const isPendingRemove = pendingRemovals.has(term);
                      return (
                        <span
                          key={term}
                          className={`inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full text-xs group ${
                            isPendingRemove
                              ? 'bg-surface-lighter/50 text-text-600 line-through'
                              : 'bg-surface-lighter text-text-500'
                          }`}
                        >
                          <span className="truncate min-w-0">{term}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPendingRemove) {
                                setPendingRemovals((prev) => {
                                  const next = new Set(prev);
                                  next.delete(term);
                                  return next;
                                });
                              } else {
                                setPendingRemovals((prev) => new Set(prev).add(term));
                              }
                            }}
                            className={`shrink-0 ${
                              isPendingRemove
                                ? 'text-sky-400 hover:text-sky-300'
                                : 'text-text-600 hover:text-red-400'
                            } transition-colors`}
                            title={isPendingRemove ? `Undo remove ${term}` : `Remove ${term}`}
                          >
                            <Icon icon="lucide:x" className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}

                  {/* Committed added terms */}
                  {addedTerms
                    .filter((term) => !pendingRemovals.has(term) && !topic.seedTerms.includes(term))
                    .map((term) => (
                      <span
                        key={`added-${term}`}
                        className="inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full text-xs bg-sky-600/20 text-sky-400 group"
                      >
                        <span className="truncate min-w-0">{term}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingRemovals((prev) => new Set(prev).add(term));
                          }}
                          className="shrink-0 text-sky-500/70 hover:text-red-400 transition-colors"
                          title={`Remove ${term}`}
                        >
                          <Icon icon="lucide:x" className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                  {/* Pending additions */}
                  {pendingAdditions.map((term) => (
                    <span
                      key={`pending-${term}`}
                      className="inline-flex items-center gap-1 max-w-full px-2.5 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 group"
                    >
                      <span className="truncate min-w-0">{term}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingAdditions((prev) => prev.filter((t) => t !== term));
                        }}
                        className="shrink-0 text-sky-400/70 hover:text-red-400 transition-colors"
                        title={`Remove ${term}`}
                      >
                        <Icon icon="lucide:x" className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  {showAddTerm ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const term = newTerm.trim().toLowerCase();
                        if (
                          term &&
                          !topic.seedTerms.includes(term) &&
                          !addedTerms.includes(term) &&
                          !pendingAdditions.includes(term) &&
                          !pendingRemovals.has(term)
                        ) {
                          setPendingAdditions((prev) => [...prev, term]);
                        }
                        setNewTerm('');
                      }}
                      className="inline-flex"
                    >
                      <input
                        type="text"
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setShowAddTerm(false);
                            setNewTerm('');
                          }
                        }}
                        placeholder="Add term..."
                        className="w-24 px-2.5 py-0.5 rounded-full text-xs input-dark"
                        autoFocus
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowAddTerm(true)}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-lighter text-text-500 hover:bg-surface-light hover:text-sky-400 transition-colors"
                      title="Add seed term"
                    >
                      <Icon icon="lucide:plus" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {hasPendingChanges && (
                  <button
                    onClick={async () => {
                      if (!topic) return;

                      // Merge pending changes into committed state
                      const nextRemovedTerms = new Set([...removedTerms, ...pendingRemovals]);
                      const nextAddedTerms = [...addedTerms.filter((t) => !pendingRemovals.has(t)), ...pendingAdditions];
                      const nextRemovedFeedUris = new Set([...removedFeedUris, ...pendingFeedRemovals]);
                      const nextAddedFeeds = [...addedFeeds.filter((f) => !pendingFeedRemovals.has(f.uri)), ...pendingFeedAdditions];

                      setRemovedTerms(nextRemovedTerms);
                      setAddedTerms(nextAddedTerms);
                      setRemovedFeedUris(nextRemovedFeedUris);
                      setAddedFeeds(nextAddedFeeds);
                      setPendingRemovals(new Set());
                      setPendingAdditions([]);
                      setPendingFeedRemovals(new Set());
                      setPendingFeedAdditions([]);

                      const nextCustomization: TopicCustomizationRecord = {
                        topicId,
                        removedSeedTerms: [...nextRemovedTerms],
                        addedSeedTerms: nextAddedTerms,
                        removedFeedUris: [...nextRemovedFeedUris],
                        addedFeeds: nextAddedFeeds,
                        updatedAt: new Date().toISOString(),
                      };
                      await saveTopicCustomization(topicId, nextCustomization);
                    }}
                    className="mt-3 text-xs font-medium px-3 py-1.5 rounded-full bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 transition-colors"
                  >
                    Save changes
                  </button>
                )}
              </div>
            </div>
            <TopicFollowButton topicId={topic.id} />
          </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
    </div>
  );
}
