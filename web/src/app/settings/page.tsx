'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useModerationStore } from '@/lib/store/moderation-store';
import Header from '@/components/layout/Header';
import ModerationRuleEditor from '@/components/moderation/ModerationRuleEditor';
import LLMStatusIndicator from '@/components/moderation/LLMStatusIndicator';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { isNsfwFilterEnabled, setNsfwFilterEnabled } from '@/lib/nsfw/detector';

export default function ModerationPage() {
  const { isAuthenticated, restoreSession, loading: authLoading } = useAuthStore();
  const { rules, loadRules } = useModerationStore();
  const [nsfwEnabled, setNsfwEnabled] = useState(false);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (isAuthenticated) {
      loadRules();
    }
  }, [isAuthenticated, loadRules]);

  useEffect(() => {
    setNsfwEnabled(isNsfwFilterEnabled());
  }, []);

  const toggleNsfw = useCallback(() => {
    const next = !nsfwEnabled;
    setNsfwFilterEnabled(next);
    setNsfwEnabled(next);
  }, [nsfwEnabled]);

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
          <p className="text-text-500">Sign in to manage moderation.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-text-100 mb-2">Settings</h1>
        <p className="text-base text-text-500 mb-6">
          In-browser AI model, moderation rules, and appearance.
        </p>

        <div className="space-y-6">
          <LLMStatusIndicator />

          <div>
            <h2 className="text-lg font-semibold text-text-100 mb-3">Appearance</h2>
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-base font-medium text-text-200">Color theme</p>
                <p className="text-sm text-text-500">Switch between dark and light mode</p>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-text-100 mb-3">Content Filtering</h2>
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-base font-medium text-text-200">Filter nudity</p>
                <p className="text-sm text-text-500">Automatically hide posts containing nudity or explicit content</p>
              </div>
              <button
                type="button"
                onClick={toggleNsfw}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  nsfwEnabled ? 'bg-sky-500' : 'bg-dark-600'
                }`}
                role="switch"
                aria-checked={nsfwEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    nsfwEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <ModerationRuleEditor />
        </div>
      </main>
    </div>
  );
}
