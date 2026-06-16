'use client';

import { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';
import * as feeds from '@/lib/atproto/feeds';
import { batchScoreTopicMatch } from '@/lib/llm/topic-matcher';
import type { EnrichedPost, FeedGenerator } from '@/types';
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

export default function TopicFeedContent({ topicId }: TopicFeedContentProps) {
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();
  const { topics } = useTopicStore();
  const { getFeedsForTopic, discoverFeedsForTopic, discovering } = useTopicFeedStore();
  const topic = topics.find((t) => t.id === topicId);

  const [posts, setPosts] = useState<EnrichedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(15);
  const [mounted, setMounted] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);
  const cursorsRef = useRef<Map<string, string | null>>(new Map());
  const postsRef = useRef<EnrichedPost[]>([]);
  postsRef.current = posts;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isAuthenticated || !agent || !topic) return;

    const loadTopicFeed = async () => {
      setLoading(true);
      setError(null);
      setDisplayCount(15);

      try {
        // Ensure feed metadata is up to date (fetch if missing, update seed terms/icon regardless)
        await discoverFeedsForTopic(topicId);

        // Get associated feed generators for this topic
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

      const hashtagQueries = topic.seedTerms
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
      const searchResults = await batchWithLimit(
        topic.seedTerms.slice(0, 3),
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
  }, [isAuthenticated, agent, topic, topicId, getFeedsForTopic, discoverFeedsForTopic]);

  const loadMore = useCallback(async () => {
    const cursors = cursorsRef.current;
    const topicFeeds = getFeedsForTopic(topicId);
    if (!topic || !agent) return;

    // Try server-side pagination first
    const feedsWithCursor = topicFeeds.filter((f) => {
      const c = cursors.get(f.uri);
      return c && c !== null;
    });

    const searchCursors = topic.seedTerms.slice(0, 3).filter((term) => {
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

          setPosts((prev) => {
            const combined = [...prev, ...scoredNew];
            const scored = combined.map((p) => ({ post: p, score: scorePopularity(p) }));
            scored.sort((a, b) => b.score - a.score);
            return scored.map((s) => s.post);
          });
          setLoading(false);
          return;
        }
      } catch {
        // Fall through
      }
      setLoading(false);
    }

    // Server-side exhausted — fall back to client-side display
    setDisplayCount((prev) => prev + 15);
  }, [agent, topic, topicId, getFeedsForTopic]);

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

  const visiblePosts = useMemo(() => posts.slice(0, displayCount), [posts, displayCount]);
  const hasMore = displayCount < posts.length;

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
    estimateSize: () => 160,
    overscan: 5,
    scrollMargin: parentOffset,
  });
  const virtualItems = virtualizer.getVirtualItems();

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
          <p className="text-gray-500">Topic not found.</p>
        </main>
      </div>
    );
  }

  const topicFeeds = getFeedsForTopic(topicId);

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="card mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-100">{topic.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{topic.description}</p>
              {mounted && topicFeeds.length > 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  Aggregating {topicFeeds.length} curated Bluesky feed{topicFeeds.length !== 1 ? 's' : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-3">
                {topic.seedTerms.map((term) => (
                  <span
                    key={term}
                    className="px-2 py-0.5 rounded-full text-xs bg-surface-lighter text-gray-500"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
            <TopicFollowButton topicId={topic.id} />
          </div>
        </div>

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
            <p className="text-sm text-gray-500">
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
                      <PostCard post={post} />
                    </div>
                  </div>
                );
              })}
            </div>
            {hasMore && <div ref={observerRef} className="h-4" />}
            {!hasMore && posts.length > 0 && (
              <p className="text-center text-xs text-gray-600 py-4">
                — End of feed —
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
