'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';
import { useModerationStore } from '@/lib/store/moderation-store';
import * as auth from '@/lib/atproto/auth';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import FeedList from '@/components/feed/FeedList';
import OnboardingWizard, { isOnboardingComplete } from '@/components/onboarding/OnboardingWizard';

export default function HomePageContent() {
  const { isAuthenticated, restoreSession, setAgent, loading: authLoading } = useAuthStore();
  const { loadFollowedTopics, hydrateCustomTopics, popularTopicsLoaded } = useTopicStore();
  const { loadTopicCustomizations } = useTopicFeedStore();
  const { loadRules } = useModerationStore();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [processingCallback, setProcessingCallback] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const didRestore = useRef(false);

  // Read OAuth callback params from URL (search + hash).
  // Uses typeof window guard for SSR compatibility.
  const getParam = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return search.get(key) ?? hash.get(key);
  };
  const code = getParam('code');
  const state = getParam('state');
  const isCallback = !!(code && state);

  const handleOAuthCallback = useCallback(async () => {
    setProcessingCallback(true);
    setCallbackError(null);
    try {
      const { did, handle, avatar, agent } = await auth.handleCallback();
      setAgent(agent, did, handle, avatar);
      // Full page navigation instead of client-side routing — same as the
      // dedicated /oauth/callback page.  Client-side router.replace('/')
      // after setAgent can race with the RSC hydration and trigger a
      // hydration mismatch error (server rendered landing page, client
      // switching to authenticated layout mid-flight).
      window.location.replace('/');
      setProcessingCallback(false);
    } catch (err) {
      setCallbackError(
        err instanceof Error ? err.message : 'OAuth callback failed',
      );
      setProcessingCallback(false);
    }
  }, [setAgent]);

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
      hydrateCustomTopics();
      loadTopicCustomizations();
      loadRules();
      // loadFollowedTopics internally awaits loadPopularTopics before
      // setting loading=false, so the feed-store sees complete topic &
      // feed-generator data on its first load.
      loadFollowedTopics();
    }
  }, [isAuthenticated, hydrateCustomTopics, loadTopicCustomizations, loadFollowedTopics, loadRules]);

  // Show onboarding after first sign-in (once popular topics are ready)
  useEffect(() => {
    if (isAuthenticated && popularTopicsLoaded && !isOnboardingComplete()) {
      setShowOnboarding(true);
    }
  }, [isAuthenticated, popularTopicsLoaded]);

  // Callback in progress — must be checked BEFORE isAuthenticated so the
  // spinner stays visible during the entire OAuth handshake.  Otherwise
  // setAgent(authenticated=true) triggers a render of the authenticated
  // layout, then window.location.replace('/') navigates away, causing a
  // flash and potential hydration mismatch.
  if (processingCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-text-500">Completing sign in...</p>
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

  // Authenticated — main feed
  if (isAuthenticated) {
    return (
      <div className="min-h-screen">
        <Header onToggleSidebar={() => setMobileSidebarOpen((v) => !v)} />
        <Sidebar
          drawerOpen={mobileSidebarOpen}
          onDrawerClose={() => setMobileSidebarOpen(false)}
        />
        <main className="max-w-3xl mx-auto px-4 py-4">
          <FeedList />
        </main>

        {showOnboarding && (
          <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
        )}
      </div>
    );
  }

  // Not authenticated — landing page
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl font-bold text-text-100 mb-4">
            Follow topics, not accounts
          </h1>
          <p className="text-lg text-text-400 mb-8 max-w-md mx-auto">
            Follow topics, not accounts. See the best posts from across the
            entire Bluesky network — intelligently matched to your interests
            by in-browser AI.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto mb-10">
            <FeatureCard
              title="Follow Topics"
              description="AI matches Bluesky posts to your interests"
              icon={<Icon icon="lucide:target" className="w-8 h-8" />}
            />
            <FeatureCard
              title="Your Rules"
              description="Per-user moderation with semantic filters"
              icon={<Icon icon="lucide:shield" className="w-8 h-8" />}
            />
            <FeatureCard
              title="Post Freely"
              description="Auto-suggested topic tags for your posts"
              icon={<Icon icon="lucide:message-square" className="w-8 h-8" />}
            />
          </div>

          <p className="text-sm text-text-600">
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
  icon: ReactNode;
}) {
  return (
    <div className="card text-center">
      <div className="text-sky-400 mb-2 flex justify-center">{icon}</div>
      <h3 className="text-sm font-semibold text-text-200 mb-1">{title}</h3>
      <p className="text-xs text-text-500">{description}</p>
    </div>
  );
}
