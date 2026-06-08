'use client';

import { useState } from 'react';
import type { ThreadComment } from '@/types';

interface CommentItemProps {
  comment: ThreadComment;
  onReply: (text: string, parentUri: string, parentCid: string) => Promise<void>;
  onUpvote: (comment: ThreadComment) => Promise<void>;
  rootUri: string;
  rootCid: string;
}

export default function CommentItem({
  comment,
  onReply,
  onUpvote,
  rootUri,
  rootCid,
}: CommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const timeAgo = formatTimeAgo(comment.indexedAt);
  const isDeep = comment.depth >= 5;

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      await onReply(replyText.trim(), comment.uri, comment.cid);
      setReplyText('');
      setReplying(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={comment.depth > 0 ? 'ml-4 sm:ml-6 border-l-2 border-dark-700/30 pl-3 sm:pl-4' : ''}>
      <div className="py-3">
        {/* Comment header */}
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 w-5 h-5 rounded-full bg-surface-lighter flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg
              className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="w-6 h-6 rounded-full bg-surface-lighter flex items-center justify-center shrink-0 overflow-hidden">
            {comment.author.avatar ? (
              <img src={comment.author.avatar} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <span className="text-xs font-bold text-gray-400">
                {(comment.author.displayName || comment.author.handle)[0].toUpperCase()}
              </span>
            )}
          </div>

          <span className="text-sm font-medium text-gray-300 truncate">
            {comment.author.displayName || comment.author.handle}
          </span>
          <span className="text-xs text-gray-600 truncate">
            {comment.author.handle}
          </span>
          <span className="text-gray-600">•</span>
          <span className="text-xs text-gray-500">{timeAgo}</span>
        </div>

        {/* Comment body */}
        {!collapsed && (
          <>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap ml-7 mb-2">
              {comment.text}
            </p>

            {/* Comment actions */}
            <div className="flex items-center gap-1.5 ml-7">
              <button
                onClick={() => onUpvote(comment)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-lighter text-gray-500 hover:text-sky-400 transition-colors text-xs font-medium"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                {comment.likeCount}
              </button>

              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-lighter text-gray-600 text-xs">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                0
              </span>

              {!isDeep && (
                <button
                  onClick={() => setReplying(!replying)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-gray-500 hover:text-sky-400 transition-colors text-xs font-medium"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reply
                </button>
              )}
            </div>

            {/* Inline reply form */}
            {replying && (
              <form onSubmit={handleSubmitReply} className="ml-7 mt-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  rows={2}
                  maxLength={3000}
                  className="w-full text-sm bg-surface-lighter rounded-lg px-3 py-2 border border-dark-700/50 resize-none focus:outline-none focus:border-sky-500 placeholder:text-gray-600 text-gray-200"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  {error && <span className="text-xs text-red-400">{error}</span>}
                  {success && <span className="text-xs text-green-400">Reply posted!</span>}
                  <button
                    type="button"
                    onClick={() => {
                      setReplying(false);
                      setReplyText('');
                      setError(null);
                    }}
                    className="btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !replyText.trim()}
                    className="btn-primary text-xs"
                  >
                    {submitting ? 'Posting...' : 'Reply'}
                  </button>
                </div>
              </form>
            )}

            {/* Nested replies */}
            {comment.replies.length > 0 && (
              <div className="mt-1">
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.uri}
                    comment={reply}
                    onReply={onReply}
                    onUpvote={onUpvote}
                    rootUri={rootUri}
                    rootCid={rootCid}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
