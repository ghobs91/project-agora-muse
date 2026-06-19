'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useLLMStore } from '@/lib/store/llm-store';
import Header from '@/components/layout/Header';
import TopicFollowButton from '@/components/topics/TopicFollowButton';
import TopicIcon from '@/components/topics/TopicIcon';
import { isStaticTopicId } from '@/lib/data/topics';
import type { Topic } from '@/types';

export default function TopicsPage() {
  const { isAuthenticated, restoreSession, loading: authLoading } = useAuthStore();
  const { topics, followedTopicIds, loadFollowedTopics, loadPopularTopics, hydrateCustomTopics, addCustomTopic, removeCustomTopic } = useTopicStore();
  const { status: llmStatus } = useLLMStore();

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setCreateError(null);
    try {
      await addCustomTopic(name, newDesc.trim());
      setNewName('');
      setNewDesc('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create topic');
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

        {/* Custom topic creation */}
        <section className="card mb-8">
          <h2 className="section-label mb-3">Create Custom Topic</h2>
          {llmStatus === 'loading' ? (
            <p className="text-xs text-sky-400 mb-3 animate-pulse">
              Loading AI engine for seed term generation...
            </p>
          ) : llmStatus === 'error' ? (
            <p className="text-xs text-red-400 mb-3">
              AI engine failed to load. Try refreshing.
            </p>
          ) : (
            <p className="text-xs text-text-500 mb-3">
              Name a topic and we&apos;ll use AI to find related terms and the best Bluesky feeds for it.
            </p>
          )}
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Topic name (e.g. 'Sailing')"
                className="flex-1 input-dark"
                maxLength={60}
                required
              />
              <button
                type="submit"
                disabled={creating || !newName.trim() || llmStatus !== 'ready'}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
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
          <TopicIcon topicId={topic.id} className="text-base shrink-0" seedTerms={topic.seedTerms} iconUrl={topic.iconUrl} />
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
