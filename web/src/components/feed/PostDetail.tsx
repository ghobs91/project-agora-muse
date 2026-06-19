'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { PostThread, ThreadComment } from '@/types';
import TopicBadge from '@/components/topics/TopicBadge';
import CommentItem from '@/components/feed/CommentItem';
import VibeCheck from '@/components/feed/VibeCheck';
import { extractHashtags } from '@/lib/utils/text';

interface PostDetailProps {
  thread: PostThread;
  onUpvote: () => Promise<void>;
  onDownvote: () => Promise<void>;
  onReply: (text: string, parentUri: string, parentCid: string) => Promise<void>;
  onCommentUpvote: (comment: ThreadComment) => Promise<void>;
  upvotedUris?: Set<string>;
}

export default function PostDetail({
  thread,
  onUpvote,
  onDownvote,
  onReply,
  onCommentUpvote,
  upvotedUris,
}: PostDetailProps) {
  const { post, replies } = thread;
  const [replyText, setReplyText] = useState('');
  const [replyingToRoot, setReplyingToRoot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);

  const { cleanText } = useMemo(() => extractHashtags(post.text), [post.text]);

  const isUpvoted = upvotedUris?.has(post.uri) ?? false;

  const timeAgo = formatTimeAgo(post.indexedAt);
  const primaryTopic = post.matchedTopics[0];
  const hasExternalEmbed = post.embed?.type === 'external' && post.embed.external;
  const hasImageEmbed = post.embed?.type === 'image' && (post.embed.images?.length ?? 0) > 0;

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSubmitting(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      await onReply(replyText.trim(), post.uri, post.cid);
      setReplyText('');
      setReplyingToRoot(false);
      setReplySuccess(true);
      setTimeout(() => setReplySuccess(false), 3000);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-text-500 hover:text-text-300 transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to feed
      </Link>

      {/* Post card */}
      <article className="card mb-4">
        {/* Author row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-surface-lighter flex items-center justify-center shrink-0 overflow-hidden">
            {post.author.avatar ? (
              <img src={post.author.avatar} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <span className="text-sm font-bold text-text-400">
                {(post.author.displayName || post.author.handle)[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-text-200 truncate">
                {post.author.displayName || post.author.handle}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-500">
              <span className="truncate">{post.author.handle}</span>
              <span className="text-text-600">•</span>
              <span suppressHydrationWarning>{timeAgo}</span>
            </div>
          </div>
        </div>

        {/* Post text */}
        <p className="text-text-100 text-base leading-relaxed whitespace-pre-wrap mb-3">
          {cleanText}
        </p>

        {/* External embed */}
        {hasExternalEmbed && post.embed!.external && (
          <a
            href={post.embed!.external.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-3 rounded-lg border border-dark-700/50 overflow-hidden hover:border-dark-600/50 transition-colors"
          >
            {post.embed!.external.thumb && (
              <img
                src={post.embed!.external.thumb}
                alt=""
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-3 bg-surface-lighter">
              <p className="text-xs text-text-500 truncate">
                {new URL(post.embed!.external.uri).hostname}
              </p>
              <p className="text-sm font-medium text-text-200 mt-0.5 line-clamp-2">
                {post.embed!.external.title}
              </p>
              {post.embed!.external.description && (
                <p className="text-xs text-text-500 mt-1 line-clamp-2">
                  {post.embed!.external.description}
                </p>
              )}
            </div>
          </a>
        )}

        {/* Image embed */}
        {hasImageEmbed && post.embed!.images && (
          <div className="mb-3 rounded-lg overflow-hidden">
            <img
              src={post.embed!.images[0].fullsize}
              alt={post.embed!.images[0].alt}
              className="w-full max-h-96 object-cover"
            />
          </div>
        )}

        {/* Topic badges */}
        {post.matchedTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.matchedTopics.slice(0, 4).map((match) => (
              <TopicBadge key={match.topicId} topicId={match.topicId} score={match.score} />
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 pt-3 divider">
          <button
            onClick={onUpvote}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${
              isUpvoted
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-sky-400'
            }`}
            title={isUpvoted ? 'Upvoted' : 'Upvote'}
          >
            <svg className="w-4 h-4" fill={isUpvoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            {post.likeCount}
          </button>

          <button
            onClick={onDownvote}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-red-400 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-lighter text-text-500 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.replyCount}
          </span>

          <div className="flex-1" />

          <button
            onClick={() => setReplyingToRoot(!replyingToRoot)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-sky-400 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            Reply
          </button>

          {/* Vibe Check */}
          <button
            onClick={() => setVibeOpen((v) => !v)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${
              vibeOpen
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-surface-lighter text-text-500 hover:bg-surface-light hover:text-purple-400'
            }`}
            title="Analyze sentiment"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </button>
        </div>

        {/* Vibe check inline panel */}
        {vibeOpen && (
          <VibeCheck
            postUri={post.uri}
            postText={post.text}
            onClose={() => setVibeOpen(false)}
          />
        )}
      </article>

      {/* Reply form */}
      {replyingToRoot && (
        <form onSubmit={handleSubmitReply} className="card mb-4">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            rows={3}
            maxLength={3000}
            className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-text-600 text-text-200"
            autoFocus
          />
          <div className="flex items-center justify-between mt-2 pt-3 divider">
            <span className="text-xs text-text-500">{replyText.length}/3000</span>
            <div className="flex items-center gap-2">
              {replyError && (
                <span className="text-xs text-red-400">{replyError}</span>
              )}
              {replySuccess && (
                <span className="text-xs text-green-400">Reply posted!</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setReplyingToRoot(false);
                  setReplyText('');
                  setReplyError(null);
                }}
                className="btn-ghost text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !replyText.trim()}
                className="btn-primary text-sm"
              >
                {submitting ? 'Posting...' : 'Reply'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Comments section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-200">
            Comments
            <span className="text-text-500 font-normal ml-1.5 text-base">
              {replies.length}
            </span>
          </h2>
        </div>

        {replies.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-text-500">
              No comments yet. Be the first to reply!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {replies.map((comment) => (
              <CommentItem
                key={comment.uri}
                comment={comment}
                onReply={onReply}
                onUpvote={onCommentUpvote}
                rootUri={post.uri}
                rootCid={post.cid}
                upvotedUris={upvotedUris}
              />
            ))}
          </div>
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
