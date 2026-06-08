'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import * as auth from '@/lib/atproto/auth';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { setAgent } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const completeOAuth = async () => {
      try {
        const { did, handle, agent } = await auth.handleCallback();
        setAgent(agent, did, handle);
        router.push('/');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'OAuth callback failed',
        );
      }
    };

    completeOAuth();
  }, [router, setAgent]);

  if (error) {
    return (
      <div className="min-h-screen bg-surface-dark flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/" className="btn-primary text-sm">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Completing sign in...</p>
      </div>
    </div>
  );
}
