'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import TopicIcon from '@/components/topics/TopicIcon';
import { isStaticTopicId } from '@/lib/data/topics';

export default function DesktopSidebar() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const avatar = useAuthStore((s) => s.avatar);
  const topics = useTopicStore((s) => s.topics);
  const followedTopicIds = useTopicStore((s) => s.followedTopicIds);

  if (!isAuthenticated) return null;

  const followedTopics = topics
    .filter((t) => followedTopicIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const isHome = pathname === '/';

  function handleHomeClick(e: React.MouseEvent) {
    if (isHome) {
      e.preventDefault();
      window.location.reload();
    }
  }

  const navItem = (href: string, active: boolean, label: string, icon: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      onClick={href === '/' ? handleHomeClick : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-sky-600/10 text-sky-400'
          : 'text-text-400 hover:bg-surface-lighter hover:text-text-200'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );

  return (
    <aside className="w-60 shrink-0 hidden lg:flex flex-col border-r border-dark-700/50 bg-surface-dark">
      {/* Logo — pinned at top, aligned with header */}
      <div className="h-12 flex items-center px-3 border-b border-dark-700/50 shrink-0">
        <Link href="/" className="flex items-center gap-2">
          <img src="/favicon-32x32.png" alt="Agora" className="w-6 h-6 rounded-lg" />
          <span className="text-sm font-semibold text-text-200">Agora</span>
        </Link>
      </div>

      {/* Scrollable nav + topics */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Navigation */}
        <div className="space-y-0.5 mb-4">
          {navItem(
            '/',
            isHome,
            'Home',
            avatar ? (
              <img src={avatar} alt="" className="w-5 h-5 rounded-full ring-1 ring-sky-500/30" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            ),
          )}
          {navItem(
            '/post',
            pathname === '/post',
            'Create Post',
            <div className="w-5 h-5 rounded-full bg-sky-600 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>,
          )}
          {navItem(
            '/topics',
            pathname.startsWith('/topics'),
            'Explore',
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>,
          )}
          {navItem(
            '/settings',
            pathname === '/settings',
            'Settings',
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>,
          )}
        </div>

        <div className="border-t border-dark-700/50 pt-4" />

        {/* Followed topics */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="section-label">Topics</p>
            <span className="text-xs text-text-500">{followedTopics.length}</span>
          </div>
          <Link
            href="/topics"
            className="block mb-3 btn-ghost text-sm font-medium w-full text-center flex items-center justify-center gap-1.5 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Browse more topics
          </Link>
          {followedTopics.length === 0 ? (
            <div className="px-1">
              <p className="text-sm text-text-500">Follow topics to see them here.</p>
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
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-text-300 hover:bg-surface-lighter hover:text-text-100 transition-colors"
                  >
                    <TopicIcon topicId={topic.id} className="text-[2rem]" seedTerms={topic.seedTerms} iconUrl={topic.iconUrl} />
                    <span className="truncate">{topic.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
