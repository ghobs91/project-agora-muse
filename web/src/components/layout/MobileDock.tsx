'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';

export default function MobileDock() {
  const pathname = usePathname();
  const avatar = useAuthStore((s) => s.avatar);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) return null;

  const isHome = pathname === '/';

  function handleHomeClick(e: React.MouseEvent) {
    if (isHome) {
      e.preventDefault();
      window.location.reload();
    }
  }

  const btn = (href: string, active: boolean, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      onClick={href === '/' ? handleHomeClick : undefined}
      className={`mobile-dock-btn${active ? ' mobile-dock-btn-active' : ''}`}
    >
      {icon}
      <span className="mobile-dock-label">{label}</span>
    </Link>
  );

  return (
    <nav className="mobile-dock lg:hidden">
      {/* Home — shows user avatar when available */}
      {btn(
        '/',
        isHome,
        avatar ? (
          <img src={avatar} alt="" className="w-6 h-6 rounded-full ring-1 ring-sky-500/30" />
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
        'Home',
      )}

      {/* Create post */}
      {btn(
        '/post',
        pathname === '/post',
        <div className="w-6 h-6 rounded-full bg-sky-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>,
        'Create Post',
      )}

      {/* Search — browse / create topics */}
      {btn(
        '/topics',
        pathname.startsWith('/topics'),
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>,
        'Search',
      )}

      {/* Settings — LLM model + moderation */}
      {btn(
        '/settings',
        pathname === '/settings',
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>,
        'Settings',
      )}
    </nav>
  );
}
