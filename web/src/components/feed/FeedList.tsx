'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useFeedStore } from '@/lib/store/feed-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import * as llm from '@/lib/llm/topic-matcher';
import PostCard from './PostCard';

type LocationFilter = 'all' | 'subscribed' | 'local';
type SortFilter = 'active' | 'hot' | 'top' | 'new';
type ViewFilter = 'compact' | 'expanded';

export default function FeedList() {
  const { posts, loading, error, hiddenPostUris, loadFeed, loadMore, loadHiddenPosts, upvote, downvote } =
    useFeedStore();
  const { isAuthenticated } = useAuthStore();
  const observerRef = useRef<HTMLDivElement>(null);

  const [location, setLocation] = useState<LocationFilter>('all');
  const [sort, setSort] = useState<SortFilter>('active');
  const [view, setView] = useState<ViewFilter>('compact');

  // Load feed on mount - wait for topics and LLM model first
  useEffect(() => {
    if (isAuthenticated) {
      const load = async () => {
        // Wait for topics to be loaded before fetching feed
        while (useTopicStore.getState().loading) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Wait for LLM model to be ready (up to 10 seconds)
        let attempts = 0;
        while (llm.getLLMStatus() !== 'ready' && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        await loadFeed();
        await loadHiddenPosts();
      };
      load();
    }
  }, [isAuthenticated, loadFeed, loadHiddenPosts]);

  // Infinite scroll with IntersectionObserver
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loading) {
        loadMore();
      }
    },
    [loading, loadMore],
  );

  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Loading state
  if (loading && posts.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-lighter" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-surface-lighter rounded" />
                <div className="h-4 w-full bg-surface-lighter rounded" />
                <div className="h-4 w-3/4 bg-surface-lighter rounded" />
                <div className="flex gap-2 mt-2">
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button onClick={loadFeed} className="btn-primary text-sm">
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (posts.length === 0 && !loading) {
    const { followedTopicIds } = useTopicStore.getState();
    const hasFollowedTopics = followedTopicIds.size > 0;

    return (
      <div className="card text-center py-12">
        {hasFollowedTopics ? (
          <>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">
              No posts found
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              No posts from the Bluesky network matched your followed topics.
              Try following broader topics or refreshing.
            </p>
            <a href="/topics" className="btn-primary text-sm">
              Browse Topics
            </a>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">
              Discover topics
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Follow topics to see relevant posts from across the Bluesky
              network — not just people you follow.
            </p>
            <a href="/topics" className="btn-primary text-sm">
              Browse Topics
            </a>
          </>
        )}
      </div>
    );
  }

  // Visible posts (filter out hidden ones and posts without topic matches)
  const visiblePosts = posts.filter((p) => !hiddenPostUris.has(p.uri) && p.matchedTopics.length > 0);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-100 mb-3">Frontpage</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Location */}
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs text-gray-500 font-medium">Location</span>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as LocationFilter)}
              className="select-dark"
            >
              <option value="all">All</option>
              <option value="subscribed">Subscribed</option>
              <option value="local">Local</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            <span className="text-xs text-gray-500 font-medium">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortFilter)}
              className="select-dark"
            >
              <option value="active">Active</option>
              <option value="hot">Hot</option>
              <option value="top">Top</option>
              <option value="new">New</option>
            </select>
          </div>

          {/* View */}
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="text-xs text-gray-500 font-medium">View</span>
            <select
              value={view}
              onChange={(e) => setView(e.target.value as ViewFilter)}
              className="select-dark"
            >
              <option value="compact">Compact</option>
              <option value="expanded">Expanded</option>
            </select>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className={`space-y-${view === 'compact' ? '2' : '4'}`}>
        {visiblePosts.map((post) => (
          <PostCard
            key={post.uri}
            post={post}
            onUpvote={upvote}
            onDownvote={downvote}
          />
        ))}

        {/* Sentinel for infinite scroll */}
        <div ref={observerRef} className="h-4" />

        {/* Loading more indicator */}
        {loading && posts.length > 0 && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
          </div>
        )}

        {/* End of feed */}
        {!loading && posts.length > 0 && (
          <p className="text-center text-xs text-gray-600 py-4">
            — End of feed —
          </p>
        )}
      </div>
    </div>
  );
}
