'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';
import { useLLMStore } from '@/lib/store/llm-store';
import * as feeds from '@/lib/atproto/feeds';
import Header from '@/components/layout/Header';
import TopicFollowButton from '@/components/topics/TopicFollowButton';
import TopicIcon from '@/components/topics/TopicIcon';
import { isStaticTopicId } from '@/lib/data/topics';
import { matchFeedsToTopic } from '@/lib/llm/topic-matcher';
import type { Topic, FeedGenerator } from '@/types';

export default function TopicsPage() {
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();
  const { topics, followedTopicIds, loadFollowedTopics, loadPopularTopics, hydrateCustomTopics, addCustomTopic, removeCustomTopic } = useTopicStore();
  const { addFeedForTopic } = useTopicFeedStore();
  const { status: llmStatus } = useLLMStore();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [feedSuggestions, setFeedSuggestions] = useState<FeedGenerator[]>([]);
  const [feedSuggestLoading, setFeedSuggestLoading] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<FeedGenerator | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (isAuthenticated) {
      hydrateCustomTopics();
      loadFollowedTopics();
      loadPopularTopics();
    }
  }, [isAuthenticated, hydrateCustomTopics, loadFollowedTopics, loadPopularTopics]);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const query = newName.trim();
    if (!query || !agent || query.length < 2) {
      setFeedSuggestions([]);
      setFeedSuggestLoading(false);
      return;
    }
    // Don't show suggestions when a feed has already been selected
    if (selectedFeed) return;

    setFeedSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await feeds.searchFeedGenerators(agent, query, 7);
        setFeedSuggestions(results);
      } catch {
        setFeedSuggestions([]);
      } finally {
        setFeedSuggestLoading(false);
      }
    }, 300);
    debounceRef.current = timer;
    return () => clearTimeout(timer);
  }, [newName, agent, selectedFeed]);

  const selectSuggestedFeed = useCallback((feed: FeedGenerator) => {
    setSelectedFeed(feed);
    setNewName(feed.displayName);
    setFeedSuggestions([]);
    setShowSuggestions(false);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setCreateError(null);
    try {
      const topic = await addCustomTopic(name, newDesc.trim());
      if (topic && selectedFeed && agent) {
        addFeedForTopic(topic.id, selectedFeed);
        try {
          const queries = [topic.name, ...topic.seedTerms.slice(0, 3)]
            .map((q) => q.trim())
            .filter((q) => q.length > 0);
          const uniqueQueries = [...new Set(queries)];
          const resultsPerQuery = await Promise.all(
            uniqueQueries.map((q) =>
              feeds.searchFeedGenerators(agent, q, 20).catch(() => [] as FeedGenerator[]),
            ),
          );
          const seen = new Set<string>([selectedFeed.uri]);
          const candidates: FeedGenerator[] = [];
          for (const batch of resultsPerQuery) {
            for (const f of batch) {
              if (!seen.has(f.uri)) {
                seen.add(f.uri);
                candidates.push(f);
              }
            }
          }
          const matched = await matchFeedsToTopic(candidates, topic);
          for (const f of matched.slice(0, 4)) {
            addFeedForTopic(topic.id, f);
          }
        } catch {
          // Non-critical: feed discovery is best-effort
        }
      }
      setNewName('');
      setNewDesc('');
      setSelectedFeed(null);
      setFeedSuggestions([]);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to follow topic');
    } finally {
      setCreating(false);
    }
  };

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">Sign in to browse topics.</p>
        </main>
      </div>
    );
  }

  const followed = topics.filter((t) => followedTopicIds.has(t.id));
  const available = topics.filter((t) => !followedTopicIds.has(t.id));
  const popularTopics = topics.filter((t) => !t.isCustom);

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-text-100 mb-6">Topics</h1>

        {/* Follow a topic */}
        <section className="card mb-8 overflow-visible">
          <h2 className="section-label mb-3">Follow a Topic</h2>
          {llmStatus === 'loading' ? (
            <p className="text-xs text-sky-400 mb-3 animate-pulse">
              Loading AI engine for seed term generation...
            </p>
          ) : llmStatus === 'error' ? (
            <p className="text-xs text-amber-400 mb-3">
              AI engine unavailable. Topics will be created with basic keyword matching.
            </p>
          ) : (
            <p className="text-xs text-text-500 mb-3">
              Name a topic and we&apos;ll find related terms and the best Bluesky feeds.
              {agent && ' Select a suggested feed from the dropdown for instant curation.'}
            </p>
          )}
          <form ref={formRef} onSubmit={handleCreate} className="space-y-3">
            <div className="relative flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setSelectedFeed(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => {
                    if (feedSuggestions.length > 0) setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="Topic name (e.g. 'Sailing')"
                  className="w-full input-dark"
                  maxLength={60}
                  required
                />
                {selectedFeed && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFeed(null);
                        setFeedSuggestions([]);
                      }}
                      className="text-text-600 hover:text-red-400 transition-colors"
                      title="Clear selected feed"
                    >
                      <Icon icon="lucide:x" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* Feed suggestion dropdown */}
                {showSuggestions && (feedSuggestions.length > 0 || feedSuggestLoading) && (
                  <div className="absolute top-full mt-1 left-0 w-full max-h-60 overflow-y-auto rounded bg-surface border border-dark-700 shadow-lg z-[60]">
                    {feedSuggestLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="w-5 h-5 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
                      </div>
                    ) : (
                      feedSuggestions.map((result) => (
                        <button
                          key={result.uri}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectSuggestedFeed(result);
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
                          {result.likeCount != null && result.likeCount > 0 && (
                            <span className="text-text-600 text-xs shrink-0">
                              {result.likeCount.toLocaleString()} likes
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50 shrink-0"
              >
                {creating ? 'Following...' : 'Follow'}
              </button>
            </div>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional, helps find better feeds)"
              className="input-dark w-full"
              maxLength={200}
            />
            {selectedFeed && (
              <div className="flex items-center gap-2 text-xs text-sky-400">
                <Icon icon="lucide:check-circle" className="w-3.5 h-3.5" />
                <span>Using <strong>{selectedFeed.displayName}</strong> as the primary feed for this topic.</span>
              </div>
            )}
            {createError && (
              <p className="text-xs text-red-400">{createError}</p>
            )}
          </form>
        </section>

        {followed.length > 0 && (
          <section className="mb-8">
            <h2 className="section-label mb-3">
              Following ({followed.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {followed.map((topic) => (
                <TopicCard key={topic.id} topic={topic} linkable />
              ))}
            </div>
          </section>
        )}

        {popularTopics.length > 0 && (
          <section className="mb-8">
            <h2 className="section-label mb-3">
              Popular Topics ({popularTopics.length})
            </h2>
            <p className="text-xs text-text-500 mb-3">
              Compiled from the most popular feeds on Bluesky — each topic
              aggregates multiple curated feeds about the same subject.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {popularTopics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} linkable />
              ))}
            </div>
          </section>
        )}

        {available.filter((t) => t.isCustom).length > 0 && (
          <section>
            <h2 className="section-label mb-3">
              Your Custom Topics ({available.filter((t) => t.isCustom).length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {available.filter((t) => t.isCustom).map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  linkable
                  onRemove={() => removeCustomTopic(topic.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TopicCard({
  topic,
  linkable,
  onRemove,
}: {
  topic: Topic;
  linkable?: boolean;
  onRemove?: () => void;
}) {
  const isCustom = topic.isCustom;
  const usesStaticRoute = !isCustom && isStaticTopicId(topic.id);
  const href = usesStaticRoute
    ? `/topics/${topic.id}`
    : `/topics/custom?id=${encodeURIComponent(topic.id)}`;

  return (
    <div className="card flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <TopicIcon topicId={topic.id} className="text-[2rem] shrink-0" seedTerms={topic.seedTerms} iconUrl={topic.iconUrl} />
          {linkable ? (
            <Link href={href} className="font-medium text-sm text-text-200 hover:text-sky-400 transition-colors">
              {topic.name}
            </Link>
          ) : (
            <h3 className="font-medium text-sm text-text-200">{topic.name}</h3>
          )}
        </div>
        <p className="text-xs text-text-500 mt-0.5 line-clamp-2">
          {isCustom && <span className="text-sky-500/70 mr-1">Custom</span>}
          {topic.description}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {topic.seedTerms.slice(0, 3).map((term) => (
            <span
              key={term}
              className="px-1.5 py-0.5 rounded text-xs bg-surface-lighter text-text-500"
            >
              {term}
            </span>
          ))}
          {topic.seedTerms.length > 3 && (
            <span className="text-xs text-text-600">
              +{topic.seedTerms.length - 3}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TopicFollowButton topicId={topic.id} />
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-xs text-text-600 hover:text-red-400 transition-colors"
            title="Remove custom topic"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
