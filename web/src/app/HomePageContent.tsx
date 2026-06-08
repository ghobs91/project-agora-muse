'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLLMStore } from '@/lib/store/llm-store';
import { useTopicStore } from '@/lib/store/topic-store';
import * as auth from '@/lib/atproto/auth';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import FeedList from '@/components/feed/FeedList';

export default function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, restoreSession, setAgent, loading: authLoading } = useAuthStore();
  const { loadModel } = useLLMStore();
  const { loadFollowedTopics } = useTopicStore();

  const [processingCallback, setProcessingCallback] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  const didRestore = useRef(false);

  const code =
    searchParams.get('code') ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.slice(1)).get('code')
      : null);
  const state =
    searchParams.get('state') ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.slice(1)).get('state')
      : null);
  const isCallback = !!(code && state);

  const handleOAuthCallback = useCallback(async () => {
    setProcessingCallback(true);
    setCallbackError(null);
    try {
      const { did, handle, agent } = await auth.handleCallback();
      setAgent(agent, did, handle);
      router.replace('/');
      setProcessingCallback(false);
    } catch (err) {
      setCallbackError(
        err instanceof Error ? err.message : 'OAuth callback failed',
      );
      setProcessingCallback(false);
    }
  }, [router, setAgent]);

  useEffect(() => {
    if (isCallback) {
      handleOAuthCallback();
    } else if (!didRestore.current && !isAuthenticated) {
      didRestore.current = true;
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallback, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadModel();
      loadFollowedTopics();
    }
  }, [isAuthenticated, loadModel, loadFollowedTopics]);

  // Authenticated — main feed
  if (isAuthenticated) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex gap-4">
          <Sidebar />
          <main className="flex-1 min-w-0">
            <FeedList />
          </main>
        </div>
      </div>
    );
  }

  // Callback in progress
  if (processingCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Completing sign in...</p>
        </div>
      </div>
    );
  }

  // Callback error
  if (callbackError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center">
          <p className="text-red-400 mb-4">{callbackError}</p>
          <a href="/" className="btn-primary text-sm">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // Not authenticated — landing page
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-bold text-gray-100 mb-4">
            Reddit over Bluesky
          </h1>
          <p className="text-lg text-gray-400 mb-8 max-w-md mx-auto">
            Follow topics, not accounts. See the best posts from across the
            entire Bluesky network — intelligently matched to your interests
            by in-browser AI.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto mb-10">
            <FeatureCard
              title="Follow Topics"
              description="AI matches Bluesky posts to your interests"
              icon=""
            />
            <FeatureCard
              title="Your Rules"
              description="Per-user moderation with semantic filters"
              icon="🛡️"
            />
            <FeatureCard
              title="Post Freely"
              description="Auto-suggested topic tags for your posts"
              icon="️"
            />
          </div>

          <p className="text-sm text-gray-600">
            Sign in with your Bluesky account to get started.
          </p>
        </main>
      </div>
    );
  }

  // Loading session
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

  return null;
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="card text-center">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="text-sm font-semibold text-gray-200 mb-1">{title}</h3>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
}
