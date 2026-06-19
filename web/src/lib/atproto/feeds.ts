/**
 * AT Protocol feed fetching.
 */

import type { Agent } from '@atproto/api';
import type { EnrichedPost, PostAuthor, PostEmbed, PostLabel, FeedSortMode, FeedGenerator, ThreadPost, ThreadComment, PostThread } from '@/types';

// ─── Inline type helpers (avoiding import issues with namespace exports) ────

type PostView = {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  record: Record<string, unknown>;
  indexedAt: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  embed?: Record<string, unknown>;
  labels?: Array<{
    src: string;
    uri: string;
    val: string;
    neg?: boolean;
    cts: string;
  }>;
};

type FeedItem = {
  post: PostView;
  reason?: Record<string, unknown>;
};

type ThreadReplyItem = {
  post: PostView & { viewer?: { like?: string } };
  replies?: ThreadReplyItem[];
};

// ─── Feed Fetching ───────────────────────────────────────────────────

interface FetchFeedOptions {
  sort?: FeedSortMode;
  limit?: number;
  cursor?: string;
}

/**
 * Fetch the user's home timeline from Bluesky.
 */
export async function fetchHomeFeed(
  agent: Agent,
  options: FetchFeedOptions = {},
): Promise<{ posts: EnrichedPost[]; cursor?: string }> {
  const { limit = 30, cursor } = options;

  // Guard: the Agent instance may not have getTimeline if the underlying
  // XRPC client failed to initialize (e.g. stale OAuth session, missing
  // fetchHandler). Return empty data so the feed store can degrade gracefully.
  if (typeof (agent as any).getTimeline !== 'function') {
    return { posts: [], cursor: undefined };
  }

  const response = await agent.getTimeline({ limit, cursor });
  const data = response.data as { feed?: FeedItem[]; cursor?: string };

  const posts = (data.feed || []).map((item) =>
    mapFeedItemToPost(item),
  );

  return {
    posts,
    cursor: data.cursor,
  };
}

/**
 * Fetch posts from a specific Bluesky feed generator.
 */
export async function fetchCustomFeed(
  agent: Agent,
  feedUri: string,
  options: FetchFeedOptions = {},
): Promise<{ posts: EnrichedPost[]; cursor?: string }> {
  const { limit = 30, cursor } = options;

  if (typeof (agent as any).app?.bsky?.feed?.getFeed !== 'function') {
    return { posts: [], cursor: undefined };
  }

  const response = await agent.app.bsky.feed.getFeed({
    feed: feedUri,
    limit,
    cursor,
  });

  const data = response.data as { feed?: FeedItem[]; cursor?: string };
  const posts = (data.feed || []).map((item) =>
    mapFeedItemToPost(item),
  );

  return {
    posts,
    cursor: data.cursor,
  };
}

/**
 * Fetch recent posts matching search terms.
 */
export async function searchPosts(
  agent: Agent,
  query: string,
  options: FetchFeedOptions = {},
): Promise<{ posts: EnrichedPost[]; cursor?: string }> {
  const { limit = 30, cursor } = options;

  if (typeof (agent as any).app?.bsky?.feed?.searchPosts !== 'function') {
    return { posts: [], cursor: undefined };
  }

  const response = await agent.app.bsky.feed.searchPosts({
    q: query,
    limit,
    cursor,
  });

  const data = response.data as { posts?: PostView[]; cursor?: string };
  const posts = (data.posts || []).map(mapFeedViewToPost);

  return {
    posts,
    cursor: data.cursor,
  };
}

/**
 * Fetch trending/popular posts.
 */
export async function fetchPopularFeed(
  agent: Agent,
  options: FetchFeedOptions = {},
): Promise<{ posts: EnrichedPost[]; cursor?: string }> {
  const { limit = 30, cursor } = options;

  // Guard: the Agent's app.bsky.feed namespace may be missing if the XRPC
  // client failed to initialize (e.g. stale OAuth session).
  if (typeof (agent as any).app?.bsky?.feed?.getFeed !== 'function') {
    return { posts: [], cursor: undefined };
  }

  const response = await agent.app.bsky.feed.getFeed({
    feed: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
    limit,
    cursor,
  });

  const data = response.data as { feed?: FeedItem[]; cursor?: string };
  const posts = (data.feed || []).map((item) =>
    mapFeedItemToPost(item),
  );

  return {
    posts,
    cursor: data.cursor,
  };
}

// ─── Feed Generator Discovery ────────────────────────────────────────

/**
 * Search for popular Bluesky feed generators matching a query.
 * Used to discover curated feeds for topics.
 */
export async function searchFeedGenerators(
  agent: Agent,
  query: string,
  limit: number = 10,
): Promise<FeedGenerator[]> {
  // Try public Bluesky API endpoint first (no auth needed)
  try {
    const url = `https://api.bsky.app/xrpc/app.bsky.unspecced.getPopularFeedGenerators?query=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json() as {
        feeds?: Array<{
          uri: string;
          cid?: string;
          displayName: string;
          description?: string;
          avatar?: string;
          likeCount?: number;
          creator?: {
            did: string;
            handle: string;
            displayName?: string;
            avatar?: string;
          };
        }>;
      };
      return (data.feeds || []).map((f) => ({
        uri: f.uri,
        cid: f.cid,
        displayName: f.displayName,
        description: f.description,
        avatar: f.avatar,
        likeCount: f.likeCount,
        creator: f.creator ? {
          did: f.creator.did,
          handle: f.creator.handle,
          displayName: f.creator.displayName,
          avatar: f.creator.avatar,
        } : undefined,
      }));
    }
  } catch {
    // Fall through to XRPC call
  }

  // Fallback: use the agent's XRPC call
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (agent as any).api.xrpc.call(
      'app.bsky.unspecced.getPopularFeedGenerators',
      { params: { query, limit } },
    );
    const data = response?.data as {
      feeds?: Array<{
        uri: string;
        cid?: string;
        displayName: string;
        description?: string;
        avatar?: string;
        likeCount?: number;
        creator?: {
          did: string;
          handle: string;
          displayName?: string;
          avatar?: string;
        };
      }>;
    };
    return (data?.feeds || []).map((f) => ({
      uri: f.uri,
      cid: f.cid,
      displayName: f.displayName,
      description: f.description,
      avatar: f.avatar,
      likeCount: f.likeCount,
      creator: f.creator ? {
        did: f.creator.did,
        handle: f.creator.handle,
        displayName: f.creator.displayName,
        avatar: f.creator.avatar,
      } : undefined,
    }));
  } catch {
    // Both methods failed — return empty
    return [];
  }
}

// ─── Voting / Post Actions ────────────────────────────────────────────

export async function likePost(
  agent: Agent,
  postUri: string,
  postCid: string,
): Promise<void> {
  if (typeof (agent as any).like !== 'function') {
    throw new Error('Agent does not support like');
  }
  await agent.like(postUri, postCid);
}

export async function muteUser(agent: Agent, userDid: string): Promise<void> {
  if (typeof (agent as any).app?.bsky?.graph?.muteActor !== 'function') {
    throw new Error('Agent does not support muteActor');
  }
  await agent.app.bsky.graph.muteActor({ actor: userDid });
}

export async function unmuteUser(agent: Agent, userDid: string): Promise<void> {
  if (typeof (agent as any).app?.bsky?.graph?.unmuteActor !== 'function') {
    throw new Error('Agent does not support unmuteActor');
  }
  await agent.app.bsky.graph.unmuteActor({ actor: userDid });
}

export async function getPostThread(
  agent: Agent,
  postUri: string,
  depth: number = 6,
): Promise<PostThread> {
  if (typeof (agent as any).app?.bsky?.feed?.getPostThread !== 'function') {
    throw new Error('Agent does not support getPostThread');
  }

  const response = await agent.app.bsky.feed.getPostThread({
    uri: postUri,
    depth,
  });

  const thread = response.data.thread as {
    post: PostView & { viewer?: { like?: string } };
    replies?: Array<ThreadReplyItem>;
  };

  const rootPost = mapThreadPost(thread.post);
  const replies = (thread.replies || []).map((r) =>
    mapThreadComment(r, 0),
  );

  return { post: rootPost, replies };
}

export async function replyToPost(
  agent: Agent,
  parentUri: string,
  parentCid: string,
  rootUri: string,
  rootCid: string,
  text: string,
): Promise<void> {
  if (typeof (agent as any).post !== 'function') {
    throw new Error('Agent does not support post');
  }
  await agent.post({
    text,
    reply: {
      root: { uri: rootUri, cid: rootCid },
      parent: { uri: parentUri, cid: parentCid },
    },
  });
}

// ─── User Preferences ────────────────────────────────────────────────

/**
 * Fetch the user's content language preferences from Bluesky.
 * Returns the first explicitly preferred language code (from visibility 'show'),
 * or an empty string if no preference is set.
 */
export async function getUserPreferredLanguage(agent: Agent): Promise<string> {
  try {
    if (typeof (agent as any).app?.bsky?.actor?.getPreferences !== 'function') {
      return '';
    }
    const response = await agent.app.bsky.actor.getPreferences();
    const prefs = response.data.preferences as Array<{
      $type: string;
      label?: string;
      visibility?: string;
    }>;

    // Look for content language preferences with visibility 'show'
    for (const pref of prefs) {
      if (
        pref.$type === 'app.bsky.actor.defs#contentLabelPref' &&
        pref.label?.startsWith('lang:') &&
        pref.visibility === 'show'
      ) {
        return pref.label.replace('lang:', '');
      }
    }

    return '';
  } catch {
    return '';
  }
}

// ─── Mapping Helpers ─────────────────────────────────────────────────

function mapFeedItemToPost(item: FeedItem): EnrichedPost {
  const post = mapFeedViewToPost(item.post);
  if (item.reason?.$type === 'app.bsky.feed.defs#reasonPin') {
    post.isPinned = true;
  }
  return post;
}

function mapFeedViewToPost(view: PostView): EnrichedPost {
  const record = view.record as { text?: string; createdAt?: string; langs?: string[] };

  return {
    uri: view.uri,
    cid: view.cid,
    author: mapAuthor(view.author),
    text: record.text ?? '',
    createdAt: record.createdAt ?? view.indexedAt,
    indexedAt: view.indexedAt,
    likeCount: view.likeCount ?? 0,
    repostCount: view.repostCount ?? 0,
    replyCount: view.replyCount ?? 0,
    embed: view.embed ? mapEmbed(view.embed) : undefined,
    labels: (view.labels ?? []).map(mapLabel),
    langs: record.langs,
    matchedTopics: [],
  };
}

function mapAuthor(author: PostView['author']): PostAuthor {
  return {
    did: author.did,
    handle: author.handle,
    displayName: author.displayName,
    avatar: author.avatar,
  };
}

function mapEmbed(embed: Record<string, unknown>): PostEmbed | undefined {
  const type = embed.$type as string | undefined;
  if (!type) return undefined;

  if (type === 'app.bsky.embed.images#view') {
    const data = embed as {
      images?: Array<{ thumb: string; fullsize: string; alt?: string }>;
    };
    return {
      type: 'image',
      images: (data.images || []).map((img) => ({
        thumb: img.thumb,
        fullsize: img.fullsize,
        alt: img.alt ?? '',
      })),
    };
  }

  if (type === 'app.bsky.embed.external#view') {
    const data = embed as {
      external?: { uri: string; title: string; description: string; thumb?: string };
    };
    return {
      type: 'external',
      external: data.external
        ? {
            uri: data.external.uri,
            title: data.external.title,
            description: data.external.description,
            thumb: data.external.thumb,
          }
        : undefined,
    };
  }

  if (type === 'app.bsky.embed.record#view') {
    return { type: 'record' };
  }

  return undefined;
}

function mapLabel(label: {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
}): PostLabel {
  return {
    src: label.src,
    uri: label.uri,
    val: label.val,
    neg: label.neg,
    cts: label.cts,
  };
}

function mapThreadPost(view: PostView & { viewer?: { like?: string } }): ThreadPost {
  const base = mapFeedViewToPost(view);
  return {
    ...base,
    viewerLikeUri: view.viewer?.like ?? null,
  };
}

function mapThreadComment(
  item: ThreadReplyItem,
  depth: number,
): ThreadComment {
  const post = item.post;
  const record = post.record as { text?: string; createdAt?: string };

  return {
    uri: post.uri,
    cid: post.cid,
    author: mapAuthor(post.author),
    text: record.text ?? '',
    createdAt: record.createdAt ?? post.indexedAt,
    indexedAt: post.indexedAt,
    likeCount: post.likeCount ?? 0,
    replyCount: post.replyCount ?? 0,
    viewerLikeUri: post.viewer?.like ?? null,
    replies: (item.replies || []).map((r) => mapThreadComment(r, depth + 1)),
    depth,
  };
}
