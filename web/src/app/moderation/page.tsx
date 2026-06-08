'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useModerationStore } from '@/lib/store/moderation-store';
import Header from '@/components/layout/Header';
import ModerationRuleEditor from '@/components/moderation/ModerationRuleEditor';
import LLMStatusIndicator from '@/components/moderation/LLMStatusIndicator';

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
          <p className="text-gray-500">Sign in to manage moderation.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">Moderation</h1>
        <p className="text-sm text-gray-500 mb-6">
          Control what you see. Rules are stored on your Bluesky PDS and apply
          only to your feed.
        </p>

        <div className="space-y-6">
          <LLMStatusIndicator />
          <ModerationRuleEditor />
        </div>
      </main>
    </div>
  );
}
