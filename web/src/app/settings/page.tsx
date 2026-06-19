'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useModerationStore } from '@/lib/store/moderation-store';
import Header from '@/components/layout/Header';
import ModerationRuleEditor from '@/components/moderation/ModerationRuleEditor';
import LLMStatusIndicator from '@/components/moderation/LLMStatusIndicator';
import ThemeToggle from '@/components/theme/ThemeToggle';

export default function ModerationPage() {
  const { isAuthenticated, restoreSession, loading: authLoading } = useAuthStore();
  const { rules, loadRules } = useModerationStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    if (isAuthenticated) {
      loadRules();
    }
  }, [isAuthenticated, loadRules]);

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
        <p className="text-sm text-text-500 mb-6">
          In-browser AI model, moderation rules, and appearance.
        </p>

        <div className="space-y-6">
          <LLMStatusIndicator />

          <div>
            <h2 className="text-lg font-semibold text-text-100 mb-3">Appearance</h2>
            <div className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-200">Color theme</p>
                <p className="text-xs text-text-500">Switch between dark and light mode</p>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <ModerationRuleEditor />
        </div>
      </main>
    </div>
  );
}
