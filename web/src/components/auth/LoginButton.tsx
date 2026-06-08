'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';

export default function LoginButton() {
  const { isAuthenticated, loading, login, logout, handle, error } = useAuthStore();
  const [showForm, setShowForm] = useState(false);
  const [inputHandle, setInputHandle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputHandle.trim();
    if (!trimmed) {
      setLocalError('Please enter your Bluesky handle');
      return;
    }
    const cleanHandle = trimmed
      .replace(/^@/, '')
      .replace(/^https?:\/\/bsky\.app\/profile\//, '')
      .replace(/\/$/, '');
    if (!cleanHandle.includes('.') && !cleanHandle.startsWith('did:')) {
      setLocalError('Enter a valid Bluesky handle (e.g. user.bsky.social) or DID');
      return;
    }
    setLocalError(null);
    try {
      await login(cleanHandle);
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

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="btn-primary text-sm"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={inputHandle}
          onChange={(e) => {
            setInputHandle(e.target.value);
            setLocalError(null);
          }}
          placeholder="handle.bsky.social"
          className="input-dark text-sm w-48"
          autoFocus
        />
        <button type="submit" className="btn-primary text-sm" disabled={loading}>
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setShowForm(false);
            setLocalError(null);
            setInputHandle('');
          }}
          className="btn-ghost text-sm"
        >
          Cancel
        </button>
      </form>
      {(localError || error) && (
        <p className="text-xs text-red-400">{localError || error}</p>
      )}
    </div>
  );
}
