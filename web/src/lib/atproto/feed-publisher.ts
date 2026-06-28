/**
 * Publish and unpublish Skyfeed Builder feed-generator records.
 *
 * A Skyfeed Builder feed is an `app.bsky.feed.generator` record stored in
 * the user's Bluesky repo. The record points at `did:web:skyfeed.me` as
 * its service DID and carries a `skyfeedBuilder` field with the block
 * pipeline that `skyfeed.me` executes on each request.
 *
 * Publishing is done with the user's OAuth agent (the same one used for
 * topic-follow records), so no separate backend credentials are required.
 */

import type { Agent } from '@atproto/api';
import type { FeedGenerator, Topic } from '@/types';
import { buildSkyfeedConfig, buildFallbackRegex } from '@/lib/skyfeed/builder';

// ─── Constants ───────────────────────────────────────────────────────

/** Skyfeed Builder service DID — serves the feed via skyfeed.me. */
export const SKYFEED_SERVICE_DID = 'did:web:skyfeed.me';
/** Bluesky collection for feed-generator records. */
const FEED_GENERATOR_COLLECTION = 'app.bsky.feed.generator';
/** Max lengths enforced by Bluesky's feed-generator lexicon. */
const MAX_DISPLAY_NAME = 24;
const MAX_DESCRIPTION = 300;

// ─── Record Key ──────────────────────────────────────────────────────

/**
 * Deterministic record key for a topic's Skyfeed feed.
 * Using a stable rkey means re-publishing updates the same record instead
 * of creating duplicates.
 */
export function skyfeedRecordKey(topicId: string): string {
  return `skyfeed-${topicId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}

/** Build the `at://` URI for a topic's published feed. */
export function skyfeedFeedUri(did: string, topicId: string): string {
  return `at://${did}/${FEED_GENERATOR_COLLECTION}/${skyfeedRecordKey(topicId)}`;
}

// ─── Publish ─────────────────────────────────────────────────────────

/**
 * Publish (or update) a Skyfeed Builder feed generator for a topic.
 *
 * Builds the block pipeline, writes an `app.bsky.feed.generator` record
 * to the user's repo via `com.atproto.repo.putRecord`, and returns the
 * feed metadata so it can be stored in the topic-feed-store.
 *
 * @param agent  The user's Bluesky OAuth agent.
 * @param topic  The topic to build the feed around.
 * @param regexPattern  A validated regex string for keyword matching.
 *                       If empty, a fallback pattern is derived from
 *                       the topic's seed terms.
 * @returns the published feed generator, or null if the agent is missing.
 */
export async function publishSkyfeedForTopic(
  agent: Agent,
  topic: Topic,
  regexPattern: string,
): Promise<FeedGenerator | null> {
  const did = (agent as any).assertDid ?? null;
  if (!did) return null;

  const pattern = regexPattern || buildFallbackRegex(topic);
  const config = buildSkyfeedConfig(topic, pattern);

  const record: Record<string, unknown> = {
    $type: FEED_GENERATOR_COLLECTION,
    did: SKYFEED_SERVICE_DID,
    displayName: topic.name.slice(0, MAX_DISPLAY_NAME),
    description: (topic.description || `${topic.name} discussion`).slice(0, MAX_DESCRIPTION),
    createdAt: new Date().toISOString(),
    // Skyfeed-specific extension: the query-engine reads this field to
    // generate the feed skeleton. Not part of the official Bluesky lexicon
    // but accepted by the PDS (records allow extra fields).
    skyfeedBuilder: config,
  };

  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: FEED_GENERATOR_COLLECTION,
    rkey: skyfeedRecordKey(topic.id),
    record,
  });

  const feedUri = skyfeedFeedUri(did, topic.id);

  return {
    uri: feedUri,
    displayName: topic.name.slice(0, MAX_DISPLAY_NAME),
    description: record.description as string,
    creator: {
      did,
      handle: '',
    },
    autoPublished: true,
  };
}

// ─── Unpublish ───────────────────────────────────────────────────────

/**
 * Delete the Skyfeed feed-generator record for a topic.
 *
 * Called when a user removes a custom topic so the Bluesky feed they
 * created through Agora is cleaned up. Failures are non-fatal — the
 * topic is already being removed locally.
 */
export async function unpublishSkyfeedForTopic(
  agent: Agent,
  topicId: string,
): Promise<void> {
  const did = (agent as any).assertDid ?? null;
  if (!did) return;

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: FEED_GENERATOR_COLLECTION,
    rkey: skyfeedRecordKey(topicId),
  });
}

/**
 * Check whether a feed-generator record already exists for a topic.
 * Used to decide whether to publish (create) or just adopt (reuse) the
 * existing record after a page reload.
 */
export async function getPublishedSkyfeedForTopic(
  agent: Agent,
  topicId: string,
): Promise<FeedGenerator | null> {
  const did = (agent as any).assertDid ?? null;
  if (!did) return null;

  try {
    const response = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: FEED_GENERATOR_COLLECTION,
      rkey: skyfeedRecordKey(topicId),
    });
    const value = response.data.value as Record<string, unknown>;
    return {
      uri: skyfeedFeedUri(did, topicId),
      displayName: (value.displayName as string) ?? '',
      description: (value.description as string) ?? undefined,
      creator: { did, handle: '' },
      autoPublished: true,
    };
  } catch {
    return null;
  }
}
