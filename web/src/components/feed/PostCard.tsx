"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import type { EnrichedPost } from "@/types";
import TopicBadge from "@/components/topics/TopicBadge";
import TopicIcon from "@/components/topics/TopicIcon";
import { useTopicStore } from "@/lib/store/topic-store";
import { useFeedStore } from "@/lib/store/feed-store";
import { extractHashtags } from "@/lib/utils/text";
import { useCompactViewStore } from "@/lib/store/compact-view-store";

interface PostCardProps {
  post: EnrichedPost;
  isHidden?: boolean;
  onUpvote?: (post: EnrichedPost) => void;
  onDownvote?: (post: EnrichedPost) => void;
}

const PostCard = memo(function PostCard({
  post,
  isHidden,
  onUpvote,
  onDownvote,
}: PostCardProps) {
  const isUpvoted = useFeedStore((s) => s.upvotedPostUris.has(post.uri));
  const topic = useTopicStore((s) => {
    const primaryTopic = post.matchedTopics[0];
    if (!primaryTopic) return null;
    return s.topics.find((t) => t.id === primaryTopic.topicId) ?? null;
  });
  const { cleanText } = useMemo(() => extractHashtags(post.text), [post.text]);
  const compact = useCompactViewStore((s) => s.compact);

  if (isHidden) {
    return (
      <div className="card opacity-50">
        <p className="text-sm text-text-500 italic">
          Post hidden by your moderation preferences
        </p>
      </div>
    );
  }

  const timeAgo = formatTimeAgo(post.indexedAt);
  const primaryTopic = post.matchedTopics[0];
  const isTrending = primaryTopic?.topicId === "trending";
  const hasThumbnail =
    post.embed?.type === "image" && (post.embed.images?.length ?? 0) > 0;
  const hasExternalEmbed =
    post.embed?.type === "external" && post.embed.external;
  const displayLikeCount = post.likeCount + (isUpvoted ? 1 : 0);

  return (
    <Link
      href={`/thread?uri=${encodeURIComponent(post.uri)}`}
      className="block"
    >
      <article className="card-hover group">
        <div className={`flex gap-3 ${compact ? "flex-row" : "flex-col"}`}>
          {/* Thumbnail — above text (card view), left side (compact view) */}
          {(hasThumbnail || hasExternalEmbed) && (
            <div className={`shrink-0 ${compact ? "w-20" : "w-full"}`}>
              {hasThumbnail && post.embed!.images && (
                <img
                  src={post.embed!.images[0].thumb}
                  alt={post.embed!.images[0].alt}
                  className={`rounded-lg bg-surface-lighter ${compact ? "w-20 h-20 object-cover" : "w-full aspect-[4/3] object-cover"}`}
                  loading="lazy"
                />
              )}
              {hasExternalEmbed && post.embed!.external?.thumb && (
                <img
                  src={post.embed!.external.thumb}
                  alt=""
                  className={`rounded-lg bg-surface-lighter ${compact ? "w-20 h-20 object-cover" : "w-full aspect-[4/3] object-cover"}`}
                  loading="lazy"
                />
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Meta row — topic icon + pill replaces the blue text label */}
            <div className="flex items-center gap-2 text-sm text-text-500 mb-1.5 flex-wrap">
              {topic && (
                <>
                  <TopicIcon
                    topicId={primaryTopic.topicId}
                    className="text-sm"
                    seedTerms={topic.seedTerms}
                    iconUrl={topic.iconUrl}
                  />
                  <TopicBadge
                    topicId={primaryTopic.topicId}
                    className="text-sky-400 font-medium hover:underline"
                  />
                  <span className="text-text-600">&bull;</span>
                </>
              )}
              {isTrending && (
                <>
                  <span className="text-sky-400 font-medium">Trending</span>
                  <span className="text-text-600">&bull;</span>
                </>
              )}
              {post.author.avatar && (
                <img
                  src={post.author.avatar}
                  alt=""
                  className="w-5 h-5 rounded-full"
                  loading="lazy"
                />
              )}
              <span className="max-w-[140px] truncate">
                {post.author.displayName || post.author.handle}
              </span>
              <span className="text-text-600">&bull;</span>
              <span suppressHydrationWarning>{timeAgo}</span>
            </div>

            {/* Title / text */}
            <h3 className="text-base font-medium text-text-100 leading-snug mb-2 group-hover:text-white transition-colors break-words">
              {cleanText}
            </h3>

            {/* External embed link */}
            {hasExternalEmbed && post.embed!.external && (
              <div className="flex items-center gap-1.5 text-xs text-text-500 mb-2">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span className="truncate min-w-0">
                  {new URL(post.embed!.external.uri).hostname}
                </span>
              </div>
            )}

            {/* Secondary matched topics (exclude primary to avoid redundancy) */}
            {post.matchedTopics.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {post.matchedTopics.slice(1, 4).map((match) => (
                  <TopicBadge
                    key={match.topicId}
                    topicId={match.topicId}
                    score={match.score}
                  />
                ))}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Upvote */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUpvote?.(post);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors text-sm font-medium ${
                  isUpvoted
                    ? "bg-sky-500/20 text-sky-400"
                    : "bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-sky-400"
                }`}
                title={isUpvoted ? "Upvoted" : "Upvote"}
              >
                <svg
                  className="w-4 h-4"
                  fill={isUpvoted ? "currentColor" : "none"}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 15l7-7 7 7"
                  />
                </svg>
                {displayLikeCount}
              </button>

              {/* Downvote */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDownvote?.(post);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-lighter text-text-400 hover:bg-surface-light hover:text-red-400 transition-colors text-sm font-medium"
                title="Downvote"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Reply count */}
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-lighter text-text-500 text-sm font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                {post.replyCount}
              </span>

              <div className="flex-1" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
});

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default PostCard;
