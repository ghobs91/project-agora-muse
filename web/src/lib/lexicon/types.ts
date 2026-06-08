/**
 * Custom AT Protocol Lexicon definitions for Agora Muse.
 *
 * These records are stored on the user's PDS using com.atproto.repo.*
 * endpoints. The NSID prefix is app.agora.muse.*
 */

// ─── Lexicon NSIDs ───────────────────────────────────────────────────

export const LEXICONS = {
  topicFollow: 'app.agora.muse.topicFollow',
  moderationRule: 'app.agora.muse.moderationRule',
  hiddenPost: 'app.agora.muse.hiddenPost',
} as const;

// ─── Record Types ────────────────────────────────────────────────────

export interface TopicFollowRecord {
  $type: 'app.agora.muse.topicFollow';
  topicId: string;
  followedAt: string; // ISO date
}

export interface ModerationRuleRecord {
  $type: 'app.agora.muse.moderationRule';
  id: string;
  ruleType: 'keyword' | 'semantic' | 'labeler' | 'mute';
  value: string;
  createdAt: string; // ISO date
}

export interface HiddenPostRecord {
  $type: 'app.agora.muse.hiddenPost';
  postUri: string;
  hiddenAt: string; // ISO date
  reason: 'downvote' | 'manual';
}

/** Union of all Agora Muse record types */
export type AgoraMuseRecord =
  | TopicFollowRecord
  | ModerationRuleRecord
  | HiddenPostRecord;

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
