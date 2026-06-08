'use client';

import Link from 'next/link';
import { useTopicStore } from '@/lib/store/topic-store';
import { useAuthStore } from '@/lib/store/auth-store';

function TopicIcon({ topicId }: { topicId: string }) {
  const icons: Record<string, string> = {
    technology: '💻',
    science: '',
    art: '🎨',
    music: '',
    gaming: '🎮',
    politics: '️',
    cooking: '',
    photography: '📷',
    books: '📚',
    fitness: '💪',
    movies: '',
    sports: '⚽',
    nature: '🌿',
    philosophy: '🤔',
    humor: '',
  };
  return <span className="text-base">{icons[topicId] || '📌'}</span>;
}

export default function Sidebar() {
  const { topics, followedTopicIds } = useTopicStore();
  const { handle } = useAuthStore();

  const followedTopics = topics.filter((t) => followedTopicIds.has(t.id));

  return (
    <aside className="w-60 shrink-0 hidden lg:block">
      <div className="sticky top-16 space-y-4">
        {/* User profile section */}
        {handle && (
          <div className="card p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-white text-sm font-bold">
                {handle[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-200 truncate">{handle}</p>
                <p className="text-xs text-gray-500">Agora Muse</p>
              </div>
            </div>
          </div>
        )}

        {/* Topics */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="section-label">Topics</p>
            <span className="text-xs text-gray-500">{followedTopics.length}</span>
          </div>
          {followedTopics.length === 0 ? (
            <div>
              <p className="text-sm text-gray-500 mb-3">Follow topics to see them here.</p>
              <Link href="/topics" className="btn-primary text-xs w-full text-center block">
                Browse Topics
              </Link>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {followedTopics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={
                      topic.isCustom
                        ? `/topics/custom?id=${encodeURIComponent(topic.id)}`
                        : `/topics/${topic.id}`
                    }
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-surface-lighter hover:text-gray-100 transition-colors"
                  >
                    <TopicIcon topicId={topic.id} />
                    <span className="truncate">{topic.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/topics"
            className="block mt-3 text-xs text-sky-500 hover:text-sky-400 transition-colors"
          >
            + Browse more topics
          </Link>
        </div>
      </div>
    </aside>
  );
}
