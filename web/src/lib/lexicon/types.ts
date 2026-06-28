/**
 * Custom AT Protocol Lexicon definitions for Agora.
 *
 * These records are stored on the user's PDS using com.atproto.repo.*
 * endpoints. The NSID prefix is app.agora.*
 */

// ─── Lexicon NSIDs ───────────────────────────────────────────────────

export const LEXICONS = {
  topicFollow: 'app.agora.topicFollow',
  moderationRule: 'app.agora.moderationRule',
  hiddenPost: 'app.agora.hiddenPost',
  customTopic: 'app.agora.customTopic',
} as const;

// ─── Record Types ────────────────────────────────────────────────────

export interface TopicFollowRecord {
  $type: 'app.agora.topicFollow';
  topicId: string;
  followedAt: string; // ISO date
}

export interface ModerationRuleRecord {
  $type: 'app.agora.moderationRule';
  id: string;
  ruleType: 'semantic';
  value: string;
  createdAt: string; // ISO date
}

export interface HiddenPostRecord {
  $type: 'app.agora.hiddenPost';
  postUri: string;
  hiddenAt: string; // ISO date
  reason: 'downvote' | 'manual';
}

export interface CustomTopicRecord {
  $type: 'app.agora.customTopic';
  topicId: string;
  name: string;
  description: string;
  seedTerms: string[];
  iconUrl?: string;
  createdAt: string; // ISO date
}

/** Union of all Agora record types */
export type AgoraMuseRecord =
  | TopicFollowRecord
  | ModerationRuleRecord
  | HiddenPostRecord
  | CustomTopicRecord;

// ─── Record Keys (used for com.atproto.repo.putRecord rkey) ──────────

/** Generate a deterministic record key for a topic follow */
export function topicFollowKey(topicId: string): string {
  return `topic-${topicId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

/** Generate a record key for a moderation rule */
export function moderationRuleKey(ruleId: string): string {
  return `modrule-${ruleId}`;
}

/** Generate a record key for a hidden post */
export function hiddenPostKey(postUri: string): string {
  // Use a hash of the URI to avoid encoding issues in rkeys
  const hash = simpleHash(postUri);
  return `hidden-${hash}`;
}

/** Generate a record key for a custom topic */
export function customTopicKey(topicId: string): string {
  return `custom-${topicId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
