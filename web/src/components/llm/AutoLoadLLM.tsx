'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLLMStore } from '@/lib/store/llm-store';

/**
 * Auto-start loading the selected in-browser LLM once the user is authenticated.
 * Lives in the root layout so it runs on every page.
 */
export default function AutoLoadLLM() {
  const { isAuthenticated } = useAuthStore();
  const { status, loadModel } = useLLMStore();

  useEffect(() => {
    if (isAuthenticated && status === 'unloaded') {
      loadModel();
    }
  }, [isAuthenticated, status, loadModel]);

  return null;
}
