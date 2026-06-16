'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import type { Topic } from '@/types';
import { TOPIC_HASHTAGS } from '@/lib/data/topics';
import Header from '@/components/layout/Header';
import TopicSuggestions from '@/components/topics/TopicSuggestions';

function getHashtags(topicId: string): string[] {
  return TOPIC_HASHTAGS[topicId] || [topicId];
}

export default function PostPage() {
  const router = useRouter();
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();

  const [text, setText] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const handleTopicSelect = (topic: Topic) => {
    setSelectedTopic(topic);
  };

  const handleRemoveTopic = () => {
    setSelectedTopic(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !agent) return;

    setSubmitting(true);
    setError(null);

    try {
      let postText = text.trim();
      if (selectedTopic) {
        const tags = getHashtags(selectedTopic.id)
          .map((t) => `#${t}`)
          .join(' ');
        postText = `${postText}\n\n${tags}`;
      }

      await agent.post({ text: postText });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSubmitting(false);
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
          <p className="text-gray-500">Sign in to create posts.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-100 mb-6">New Post</h1>

        <form onSubmit={handleSubmit} className="card">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            rows={6}
            maxLength={3000}
            className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-gray-600 text-gray-200"
          />

          <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
            <span>{text.length}/3000</span>
            {text.length >= 2800 && (
              <span className="text-amber-400">Approaching limit</span>
            )}
          </div>

          {selectedTopic && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={handleRemoveTopic}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-600/20 text-sky-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                >
                  {selectedTopic.name} ×
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {getHashtags(selectedTopic.id).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-lighter text-gray-400"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <TopicSuggestions
            content={text}
            onSelect={handleTopicSelect}
            selectedTopics={selectedTopic ? [selectedTopic] : []}
          />

          {error && (
            <p className="text-sm text-red-400 mt-3">{error}</p>
          )}

          <div className="flex justify-end mt-4 pt-4 divider">
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="btn-primary"
            >
              {submitting ? 'Posting...' : 'Post to Bluesky'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
