'use client';

import { useEffect, useCallback, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useFeedStore } from '@/lib/store/feed-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import PostCard from './PostCard';

type LocationFilter = 'all' | 'subscribed' | 'local';
type SortFilter = 'active' | 'hot' | 'top' | 'new';
type ViewFilter = 'compact' | 'expanded';

export default function FeedList() {
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const error = useFeedStore((s) => s.error);
  const hiddenPostUris = useFeedStore((s) => s.hiddenPostUris);
  const displayCount = useFeedStore((s) => s.displayCount);
  const moderatedPostUris = useFeedStore((s) => s.moderatedPostUris);
  const loadFeed = useFeedStore((s) => s.loadFeed);
  const loadMore = useFeedStore((s) => s.loadMore);
  const loadHiddenPosts = useFeedStore((s) => s.loadHiddenPosts);
  const upvote = useFeedStore((s) => s.upvote);
  const downvote = useFeedStore((s) => s.downvote);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const parentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const didInitialLoad = useRef(false);

  const [location, setLocation] = useState<LocationFilter>('all');
  const [sort, setSort] = useState<SortFilter>('active');
  const [view, setView] = useState<ViewFilter>('compact');

  // Visible posts (filter out hidden, moderated, and posts without topic matches), sliced to current display count
  const visiblePosts = useMemo(
    () =>
      posts
        .filter((p) => !hiddenPostUris.has(p.uri) && !moderatedPostUris.has(p.uri) && p.matchedTopics.length > 0)
        .slice(0, displayCount),
    [posts, hiddenPostUris, moderatedPostUris, displayCount],
  );

  const allVisible = posts.filter((p) => !hiddenPostUris.has(p.uri) && !moderatedPostUris.has(p.uri) && p.matchedTopics.length > 0).length;
  const hasMore = displayCount < allVisible;

  // Virtualized list for window scroll
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

  // Initial load — reactive to auth + topic loading status via Zustand subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = useTopicStore.subscribe((state) => {
      if (!state.loading && !didInitialLoad.current && isAuthenticated) {
        didInitialLoad.current = true;
        loadFeed(true); // skip LLM scoring for fast initial render
        loadHiddenPosts();
      }
    });

    // If topics are already loaded, fire immediately
    if (!useTopicStore.getState().loading && !didInitialLoad.current) {
      didInitialLoad.current = true;
      loadFeed(true);
      loadHiddenPosts();
    }

    return () => unsub();
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
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver, hasMore]);

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
        <button onClick={() => loadFeed(true)} className="btn-primary text-sm">
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

  const virtualItems = virtualizer.getVirtualItems();

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

      {/* Virtualized post list */}
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
                <div className={view === 'compact' ? 'mb-2' : 'mb-4'}>
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
      </div>

      {/* Sentinel for infinite scroll (outside virtualizer so always rendered) */}
      {hasMore && <div ref={observerRef} className="h-4" />}

      {/* Loading more indicator */}
      {loading && posts.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        </div>
      )}

      {/* End of feed */}
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-xs text-gray-600 py-4">
          — End of feed —
        </p>
      )}
    </div>
  );
}
