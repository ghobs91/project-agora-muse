'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useDebugStore } from '@/lib/store/debug-store';
import LoginButton from '@/components/auth/LoginButton';
import LLMStatusIndicator from '@/components/moderation/LLMStatusIndicator';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { isAuthenticated } = useAuthStore();
  const panelOpen = useDebugStore((s) => s.panelOpen);
  const togglePanel = useDebugStore((s) => s.togglePanel);

  return (
    <header className="sticky top-0 z-50 bg-surface-dark border-b border-dark-700/50">
      <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
        {/* Left: hamburger (mobile sidebar toggle) */}
        <div className="flex items-center gap-3">
          {isAuthenticated && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="lg:hidden btn-ghost p-1"
              aria-label="Toggle topics sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
        </div>

        {/* Right: nav + actions */}
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <nav className="flex items-center gap-1">
              <Link href="/topics" className="btn-ghost text-sm flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden sm:inline">Explore</span>
              </Link>
            </nav>
          )}
          {isAuthenticated && <LLMStatusIndicator compact />}
          {isAuthenticated && (
            <button
              type="button"
              onClick={togglePanel}
              className={`btn-ghost p-1 transition-colors ${
                panelOpen ? 'text-sky-400' : 'text-text-500 hover:text-text-300'
              }`}
              aria-label="Toggle moderation debug panel"
              title="Moderation debug panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 2l1.5 2M16 2l-1.5 2M9 7h6a3 3 0 013 3v4a6 6 0 01-12 0v-4a3 3 0 013-3zM3 10h3M18 10h3M4 16l2.5-1M20 16l-2.5-1M6 20l2-1.5M18 20l-2-1.5" />
              </svg>
            </button>
          )}
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
