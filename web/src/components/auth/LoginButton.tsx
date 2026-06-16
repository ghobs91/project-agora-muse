'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';

export default function LoginButton() {
  const { isAuthenticated, loading, login, logout, handle, error } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLocalError(null);
    try {
      await login();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-5 h-5 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        <span className="text-sm">Signing in...</span>
      </div>
    );
  }

  if (isAuthenticated && handle) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-white text-xs font-bold">
          {handle[0].toUpperCase()}
        </div>
        <button onClick={logout} className="btn-ghost text-sm">
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={handleSignIn} className="btn-primary text-sm">
        Sign in
      </button>
      {(localError || error) && (
        <p className="text-xs text-red-400">{localError || error}</p>
      )}
    </div>
  );
}
