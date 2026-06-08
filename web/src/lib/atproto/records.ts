/**
 * PDS record CRUD operations for Agora Muse user preferences.
 *
 * Stores topic follows, moderation rules, and hidden posts as
 * AT Protocol records on the user's PDS.
 */

import type { Agent } from '@atproto/api';
import type {
  TopicFollowRecord as UITopicFollowRecord,
  ModerationRuleRecord as UIModerationRuleRecord,
  HiddenPostRecord as UIHiddenPostRecord,
} from '@/types';
import {
  LEXICONS,
  type TopicFollowRecord,
  type ModerationRuleRecord,
  type HiddenPostRecord,
  topicFollowKey,
  moderationRuleKey,
  hiddenPostKey,
} from '@/lib/lexicon/types';

// ─── Topic Follows ───────────────────────────────────────────────────

export async function getTopicFollows(
  agent: Agent,
): Promise<UITopicFollowRecord[]> {
  try {
    const response = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid ?? '',
      collection: LEXICONS.topicFollow,
    });
    return (response.data.records || []).map(
      (r) => ({ topicId: (r.value as TopicFollowRecord).topicId, followedAt: (r.value as TopicFollowRecord).followedAt }),
    );
  } catch {
    return [];
  }
}

export async function followTopic(
  agent: Agent,
  topicId: string,
): Promise<void> {
  const record: TopicFollowRecord = {
    $type: LEXICONS.topicFollow,
    topicId,
    followedAt: new Date().toISOString(),
  };

  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.topicFollow,
    rkey: topicFollowKey(topicId),
    record: record as unknown as Record<string, unknown>,
  });
}

export async function unfollowTopic(
  agent: Agent,
  topicId: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.topicFollow,
    rkey: topicFollowKey(topicId),
  });
}

// ─── Moderation Rules ────────────────────────────────────────────────

export async function getModerationRules(
  agent: Agent,
): Promise<UIModerationRuleRecord[]> {
  try {
    const response = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid ?? '',
      collection: LEXICONS.moderationRule,
    });
    return (response.data.records || []).map((r) => {
      const v = r.value as ModerationRuleRecord;
      return { id: v.id, ruleType: v.ruleType, value: v.value, createdAt: v.createdAt };
    });
  } catch {
    return [];
  }
}

export async function addModerationRule(
  agent: Agent,
  rule: Omit<ModerationRuleRecord, '$type' | 'createdAt'>,
): Promise<void> {
  const record: ModerationRuleRecord = {
    $type: LEXICONS.moderationRule,
    ...rule,
    createdAt: new Date().toISOString(),
  };

  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.moderationRule,
    rkey: moderationRuleKey(rule.id),
    record: record as unknown as Record<string, unknown>,
  });
}

export async function removeModerationRule(
  agent: Agent,
  ruleId: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.moderationRule,
    rkey: moderationRuleKey(ruleId),
  });
}

// ─── Hidden Posts ────────────────────────────────────────────────────

export async function getHiddenPosts(
  agent: Agent,
): Promise<UIHiddenPostRecord[]> {
  try {
    const response = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid ?? '',
      collection: LEXICONS.hiddenPost,
    });
    return (response.data.records || []).map((r) => {
      const v = r.value as HiddenPostRecord;
      return { postUri: v.postUri, hiddenAt: v.hiddenAt, reason: v.reason };
    });
  } catch {
    return [];
  }
}

export async function hidePost(
  agent: Agent,
  postUri: string,
  reason: 'downvote' | 'manual' = 'downvote',
): Promise<void> {
  const record: HiddenPostRecord = {
    $type: LEXICONS.hiddenPost,
    postUri,
    hiddenAt: new Date().toISOString(),
    reason,
  };

  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.hiddenPost,
    rkey: hiddenPostKey(postUri),
    record: record as unknown as Record<string, unknown>,
  });
}

export async function unhidePost(
  agent: Agent,
  postUri: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.assertDid ?? '',
    collection: LEXICONS.hiddenPost,
    rkey: hiddenPostKey(postUri),
  });
}

// ─── Bulk Load ───────────────────────────────────────────────────────

/** Load all user preferences from PDS in one call. */
export async function loadAllPreferences(agent: Agent): Promise<{
  topicFollows: UITopicFollowRecord[];
  moderationRules: UIModerationRuleRecord[];
  hiddenPosts: UIHiddenPostRecord[];
}> {
  const [topicFollows, moderationRules, hiddenPosts] = await Promise.all([
    getTopicFollows(agent),
    getModerationRules(agent),
    getHiddenPosts(agent),
  ]);

  return { topicFollows, moderationRules, hiddenPosts };
}
