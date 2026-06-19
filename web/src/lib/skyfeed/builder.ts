/**
 * Skyfeed Builder feed-config construction.
 *
 * Given a topic and a regex pattern (LLM-generated or fallback), this
 * module assembles a `SkyfeedBuilderConfig` block pipeline that can be
 * embedded in an `app.bsky.feed.generator` record and served by
 * `did:web:skyfeed.me`.
 *
 * Pipeline design:
 *   1. Input the recent firehose (7 days).
 *   2. Regex-filter to posts matching the topic keywords.
 *   3. Drop replies (keeps the feed focused on top-level posts).
 *   4. Deduplicate.
 *   5. Cap per-author for diversity.
 *   6. Sort by Hacker-News score (popularity + recency).
 *   7. Limit to 50 posts.
 */

import type { SkyfeedBlock, SkyfeedBuilderConfig, Topic } from '@/types';

// ─── Fallback Regex ──────────────────────────────────────────────────

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

function escapeRegexTerm(term: string): string {
  return term.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

/**
 * Build a deterministic regex pattern from the topic name and seed terms
 * when the WebLLM is unavailable or its output failed validation.
 *
 * Produces `\\b(term1|term2|...)\\b` with up to 10 alternations.
 */
export function buildFallbackRegex(topic: Topic): string {
  const terms = [topic.name, ...topic.seedTerms]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .filter((t, i, arr) => arr.indexOf(t) === i) // dedupe, keep order
    .slice(0, 10)
    .map(escapeRegexTerm);

  if (terms.length === 0) {
    return '\\b()\\b';
  }
  return `\\b(${terms.join('|')})\\b`;
}

// ─── Config Builder ──────────────────────────────────────────────────

/** Firehose lookback window in seconds (7 days). */
const FIREHOSE_SECONDS = 7 * 24 * 60 * 60;
/** Maximum posts returned by the feed. */
const FEED_LIMIT = 50;
/** Max posts kept per author for diversity. */
const POSTS_PER_USER = 3;
/** Hacker-News sort gravity (lower = recent posts decay faster). */
const HN_GRAVITY = '1.8';

/**
 * Assemble a Skyfeed Builder config for a topic given a regex pattern.
 *
 * @param topic  The topic the feed is built around.
 * @param regexPattern  A validated regex string (LLM-generated or fallback).
 * @returns a `SkyfeedBuilderConfig` ready to embed in a feed-generator record.
 */
export function buildSkyfeedConfig(
  topic: Topic,
  regexPattern: string,
): SkyfeedBuilderConfig {
  const blocks: SkyfeedBlock[] = [
    // 1. Load recent posts from the firehose.
    {
      type: 'input',
      inputType: 'firehose',
      firehoseSeconds: FIREHOSE_SECONDS,
    },
    // 2. Keep only posts matching the topic keywords.
    {
      type: 'regex',
      value: regexPattern,
      target: 'text|alt_text|link',
      caseSensitive: false,
      invert: false,
    },
    // 3. Drop replies so the feed stays focused on top-level posts.
    {
      type: 'remove',
      subject: 'item',
      value: 'reply',
    },
    // 4. Deduplicate.
    {
      type: 'remove',
      subject: 'duplicates',
    },
    // 5. Cap posts per author so no single user dominates the feed.
    {
      type: 'limit',
      limitType: 'posts_per_user',
      count: POSTS_PER_USER,
    },
    // 6. Rank by Hacker-News score (engagement weighted by recency).
    {
      type: 'sort',
      sortType: 'hn',
      sortDirection: 'desc',
      gravity: HN_GRAVITY,
    },
    // 7. Final cap.
    {
      type: 'limit',
      limitType: 'default',
      count: FEED_LIMIT,
    },
  ];

  return {
    displayName: topic.name.slice(0, 24),
    blocks,
  };
}
