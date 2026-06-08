'use client';

import Link from 'next/link';
import type { EnrichedPost } from '@/types';
import TopicBadge from '@/components/topics/TopicBadge';

interface PostCardProps {
  post: EnrichedPost;
  isHidden?: boolean;
  onUpvote?: (post: EnrichedPost) => void;
  onDownvote?: (post: EnrichedPost) => void;
}

function TopicIcon({ topicId }: { topicId: string }) {
  const icons: Record<string, string> = {
    technology: '💻',
    science: '',
    art: '🎨',
    music: '',
    gaming: '',
    politics: '️',
    cooking: '🍳',
    photography: '',
    books: '📚',
    fitness: '💪',
    movies: '🎬',
    sports: '',
    nature: '🌿',
    philosophy: '🤔',
    humor: '',
  };
  return <span className="text-lg">{icons[topicId] || '📌'}</span>;
}

export default function PostCard({ post, isHidden, onUpvote, onDownvote }: PostCardProps) {
  if (isHidden) {
    return (
      <div className="card opacity-50">
        <p className="text-sm text-gray-500 italic">
          Post hidden by your moderation preferences
        </p>
      </div>
    );
  }

  const timeAgo = formatTimeAgo(post.indexedAt);
  const primaryTopic = post.matchedTopics[0];
  const hasThumbnail = post.embed?.type === 'image' && (post.embed.images?.length ?? 0) > 0;
  const hasExternalEmbed = post.embed?.type === 'external' && post.embed.external;

  return (
    <Link href={`/thread?uri=${encodeURIComponent(post.uri)}`} className="block">
      <article className="card-hover group">
        <div className="flex gap-3">
          {/* Topic icon */}
          <div className="shrink-0 pt-0.5">
            {primaryTopic ? (
              <TopicIcon topicId={primaryTopic.topicId} />
            ) : (
              <div className="w-8 h-8 rounded-full bg-surface-lighter flex items-center justify-center">
                {post.author.avatar ? (
                  <img src={post.author.avatar} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <span className="text-sm font-bold text-gray-400">
                    {(post.author.displayName || post.author.handle)[0].toUpperCase()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Meta row */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5 flex-wrap">
              {primaryTopic && (
                <span className="text-sky-400 font-medium">
                  {getTopicName(primaryTopic.topicId)}
                </span>
              )}
              <span className="text-gray-600">•</span>
              <span>{post.author.displayName || post.author.handle}</span>
              <span className="text-gray-600">•</span>
              <span>{timeAgo}</span>
            </div>

            {/* Title / text */}
            <h3 className="text-base font-medium text-gray-100 leading-snug mb-2 group-hover:text-white transition-colors">
              {post.text}
            </h3>

            {/* External embed link */}
            {hasExternalEmbed && post.embed!.external && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {new URL(post.embed!.external.uri).hostname}
              </div>
            )}

            {/* Matched topics */}
            {post.matchedTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {post.matchedTopics.slice(0, 4).map((match) => (
                  <TopicBadge
                    key={match.topicId}
                    topicId={match.topicId}
                    score={match.score}
                  />
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-2">
              {/* Upvote */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpvote?.(post); }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-lighter text-gray-400 hover:bg-surface-light hover:text-sky-400 transition-colors text-xs font-medium"
                title="Upvote"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                {post.likeCount}
              </button>

              {/* Downvote */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownvote?.(post); }}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-surface-lighter text-gray-400 hover:bg-surface-light hover:text-red-400 transition-colors text-xs font-medium"
                title="Downvote"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Reply count */}
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-lighter text-gray-500 text-xs font-medium">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {post.replyCount}
              </span>
            </div>
          </div>

          {/* Thumbnail */}
          {(hasThumbnail || hasExternalEmbed) && (
            <div className="shrink-0 hidden sm:block">
              {hasThumbnail && post.embed!.images && (
                <img
                  src={post.embed!.images[0].thumb}
                  alt={post.embed!.images[0].alt}
                  className="w-24 h-24 rounded-lg object-cover bg-surface-lighter"
                  loading="lazy"
                />
              )}
              {hasExternalEmbed && post.embed!.external?.thumb && (
                <img
                  src={post.embed!.external.thumb}
                  alt=""
                  className="w-24 h-24 rounded-lg object-cover bg-surface-lighter"
                  loading="lazy"
                />
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

function getTopicName(topicId: string): string {
  const names: Record<string, string> = {
    technology: 'Technology',
    science: 'Science',
    art: 'Art',
    music: 'Music',
    gaming: 'Gaming',
    politics: 'Politics',
    cooking: 'Cooking',
    photography: 'Photography',
    books: 'Books',
    fitness: 'Fitness',
    movies: 'Movies',
    sports: 'Sports',
    nature: 'Nature',
    philosophy: 'Philosophy',
    humor: 'Humor',
  };
  return names[topicId] || topicId;
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
