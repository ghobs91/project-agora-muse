'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import LoginButton from '@/components/auth/LoginButton';
import LLMStatusIndicator from '@/components/moderation/LLMStatusIndicator';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { isAuthenticated } = useAuthStore();

  return (
    <header className="sticky top-0 z-50 bg-surface-dark border-b border-dark-700/50">
      <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center justify-between">
        {/* Left: hamburger + logo */}
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
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </Link>
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
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
