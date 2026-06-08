'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';
import * as feeds from '@/lib/atproto/feeds';
import { scoreTopicMatch } from '@/lib/llm/topic-matcher';
import type { EnrichedPost, FeedGenerator } from '@/types';
import Header from '@/components/layout/Header';
import PostCard from '@/components/feed/PostCard';
import TopicFollowButton from '@/components/topics/TopicFollowButton';

interface TopicFeedContentProps {
  topicId: string;
}

export default function TopicFeedContent({ topicId }: TopicFeedContentProps) {
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();
  const { topics } = useTopicStore();
  const { getFeedsForTopic, discoverFeedsForTopic, discovering } = useTopicFeedStore();
  const topic = topics.find((t) => t.id === topicId);

  const [posts, setPosts] = useState<EnrichedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (!isAuthenticated || !agent || !topic) return;

    const loadTopicFeed = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get associated feed generators for this topic
        let topicFeeds = getFeedsForTopic(topicId);

        // If no feeds discovered yet, try to discover them
        if (topicFeeds.length === 0) {
          await discoverFeedsForTopic(topicId);
          topicFeeds = getFeedsForTopic(topicId);
        }

        // If we have feed URIs, aggregate posts from them
        if (topicFeeds.length > 0) {
          await loadFromFeeds(topicFeeds);
        } else {
          // Fallback: seed term search (original approach)
          await loadFromSearch();
        }
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

      for (const feed of topicFeeds) {
        try {
          const result = await feeds.fetchCustomFeed(agent, feed.uri, { limit: 15 });
          for (const post of result.posts) {
            if (seen.has(post.uri)) continue;
            seen.add(post.uri);
            // Tag with this topic
            allPosts.push({
              ...post,
              matchedTopics: [{ topicId: topic.id, score: 0.5 }],
            });
          }
        } catch {
          // Skip failed feed fetches
        }
      }

      // Optionally score posts if LLM is available
      if (topicFeeds.length > 0) {
        try {
          const scored = await Promise.all(
            allPosts.map(async (p) => {
              const score = await scoreTopicMatch(p.text, topic);
              return { ...p, matchedTopics: [{ topicId: topic.id, score }] };
            }),
          );
          allPosts = scored;
        } catch {
          // Keep default scores if LLM fails
        }
      }

      allPosts.sort((a, b) => b.likeCount - a.likeCount);
      setPosts(allPosts);
    };

    // Fallback: search by seed terms
    const loadFromSearch = async () => {
      let allPosts: EnrichedPost[] = [];
      for (const term of topic.seedTerms.slice(0, 3)) {
        const result = await feeds.searchPosts(agent, term, { limit: 20 });
        allPosts = [...allPosts, ...result.posts];
      }

      const seen = new Set<string>();
      const unique = allPosts.filter((p) => {
        if (seen.has(p.uri)) return false;
        seen.add(p.uri);
        return true;
      });

      const scored = await Promise.all(
        unique.map(async (p) => {
          const score = await scoreTopicMatch(p.text, topic);
          return { ...p, matchedTopics: [{ topicId: topic.id, score }] };
        }),
      );

      scored.sort((a, b) => {
        const scoreDiff = (b.matchedTopics[0]?.score ?? 0) - (a.matchedTopics[0]?.score ?? 0);
        if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
        return b.likeCount - a.likeCount;
      });

      setPosts(scored);
    };

    loadTopicFeed();
  }, [isAuthenticated, agent, topic, topicId, getFeedsForTopic, discoverFeedsForTopic]);

  const isLoading = loading || discovering;

  if (authLoading) {
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
              {topicFeeds.length > 0 && (
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
          <div className="space-y-2">
            {posts.map((post) => (
              <PostCard key={post.uri} post={post} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
