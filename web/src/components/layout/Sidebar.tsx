'use client';

import Link from 'next/link';
import { useTopicStore } from '@/lib/store/topic-store';
import { useAuthStore } from '@/lib/store/auth-store';
import TopicIcon from '@/components/topics/TopicIcon';
import { isStaticTopicId } from '@/lib/data/topics';

interface SidebarProps {
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

function SidebarContent() {
  const topics = useTopicStore((s) => s.topics);
  const followedTopicIds = useTopicStore((s) => s.followedTopicIds);
  const handle = useAuthStore((s) => s.handle);

  const followedTopics = topics
    .filter((t) => followedTopicIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
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
                    topic.isCustom || !isStaticTopicId(topic.id)
                      ? `/topics/custom?id=${encodeURIComponent(topic.id)}`
                      : `/topics/${topic.id}`
                  }
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-surface-lighter hover:text-gray-100 transition-colors"
                >
                  <TopicIcon topicId={topic.id} className="text-[2rem]" seedTerms={topic.seedTerms} iconUrl={topic.iconUrl} />
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
  );
}

export default function Sidebar({ drawerOpen, onDrawerClose }: SidebarProps) {
  return (
    <>
      {/* Inline for desktop */}
      <aside className="w-60 shrink-0 hidden lg:block">
        <div className="sticky top-16">
          <SidebarContent />
        </div>
      </aside>

      {/* Drawer for mobile */}
      {drawerOpen !== undefined && (
        <>
          {drawerOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={onDrawerClose}
            />
          )}
          <aside
            className={`fixed top-0 left-0 h-full w-64 bg-surface-dark z-50 lg:hidden transition-transform duration-200 overflow-y-auto ${
              drawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="sticky top-0 bg-surface-dark p-3 flex justify-between items-center border-b border-dark-700/50">
              <p className="text-sm font-semibold text-gray-300">Topics</p>
              <button onClick={onDrawerClose} className="btn-ghost text-sm px-2 py-1">
                ✕
              </button>
            </div>
            <div className="p-4">
              <SidebarContent />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
