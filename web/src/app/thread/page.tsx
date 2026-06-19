'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import * as feeds from '@/lib/atproto/feeds';
import * as records from '@/lib/atproto/records';
import type { PostThread, ThreadComment } from '@/types';
import Header from '@/components/layout/Header';
import PostDetail from '@/components/feed/PostDetail';

function ThreadContent() {
  const searchParams = useSearchParams();
  const postUri = searchParams.get('uri') ?? '';
  const { isAuthenticated, agent, restoreSession, loading: authLoading } = useAuthStore();

  const [thread, setThread] = useState<PostThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upvotedUris, setUpvotedUris] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      restoreSession();
    }
  }, [isAuthenticated, restoreSession]);

  useEffect(() => {
    if (!isAuthenticated || !agent || !postUri) return;

    const loadThread = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await feeds.getPostThread(agent, postUri);
        setThread(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load post');
      } finally {
        setLoading(false);
      }
    };

    loadThread();
  }, [isAuthenticated, agent, postUri]);

  const handleUpvote = async () => {
    if (!agent) { console.warn('Cannot upvote on thread page: no agent'); return; }
    if (!thread) return;
    if (upvotedUris.has(thread.post.uri)) return;
    try {
      await feeds.likePost(agent, thread.post.uri, thread.post.cid);
      setUpvotedUris((prev) => new Set(prev).add(thread.post.uri));
      setThread((prev) =>
        prev
          ? {
              ...prev,
              post: { ...prev.post, likeCount: prev.post.likeCount + 1 },
            }
          : prev,
      );
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  };

  const handleDownvote = async () => {
    if (!agent) { console.warn('Cannot downvote on thread page: no agent'); return; }
    if (!thread) return;
    try {
      await records.hidePost(agent, thread.post.uri, 'downvote');
      await feeds.muteUser(agent, thread.post.author.did);
    } catch (err) {
      console.error('Failed to downvote:', err);
    }
  };

  const handleReply = async (text: string, parentUri: string, parentCid: string) => {
    if (!agent || !thread) return;
    try {
      await feeds.replyToPost(
        agent,
        parentUri,
        parentCid,
        thread.post.uri,
        thread.post.cid,
        text,
      );
      const updated = await feeds.getPostThread(agent, postUri);
      setThread(updated);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to post reply');
    }
  };

  const handleCommentUpvote = async (comment: ThreadComment) => {
    if (!agent) return;
    if (upvotedUris.has(comment.uri)) return;
    try {
      await feeds.likePost(agent, comment.uri, comment.cid);
      setUpvotedUris((prev) => new Set(prev).add(comment.uri));
      setThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          replies: updateCommentLikeCount(prev.replies, comment.uri, 1),
        };
      });
    } catch (err) {
      console.error('Failed to like comment:', err);
    }
  };

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
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">Sign in to view posts.</p>
        </main>
      </div>
    );
  }

  if (!postUri) {
    return (
      <div className="min-h-screen bg-surface-dark">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-12 text-center">
          <p className="text-text-500">No post specified.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading && !thread ? (
          <div className="space-y-4">
            <div className="card animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-lighter" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 bg-surface-lighter rounded" />
                  <div className="h-5 w-full bg-surface-lighter rounded" />
                  <div className="h-5 w-3/4 bg-surface-lighter rounded" />
                </div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="card text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary text-sm"
            >
              Try Again
            </button>
          </div>
        ) : thread ? (
          <PostDetail
            thread={thread}
            onUpvote={handleUpvote}
            onDownvote={handleDownvote}
            onReply={handleReply}
            onCommentUpvote={handleCommentUpvote}
            upvotedUris={upvotedUris}
          />
        ) : null}
      </main>
    </div>
  );
}

export default function ThreadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-dark">
          <Header />
          <main className="flex items-center justify-center h-[60vh]">
            <div className="w-8 h-8 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
          </main>
        </div>
      }
    >
      <ThreadContent />
    </Suspense>
  );
}

function updateCommentLikeCount(
  comments: ThreadComment[],
  uri: string,
  delta: number,
): ThreadComment[] {
  return comments.map((c) => {
    if (c.uri === uri) {
      return { ...c, likeCount: c.likeCount + delta };
    }
    return { ...c, replies: updateCommentLikeCount(c.replies, uri, delta) };
  });
}
