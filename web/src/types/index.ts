// ─── Bluesky / AT Protocol ───────────────────────────────────────────

/** A Bluesky post (feed item) enriched with Agora Muse metadata */
export interface EnrichedPost {
  uri: string;
  cid: string;
  author: PostAuthor;
  text: string;
  createdAt: string;
  indexedAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  // Embedded media
  embed?: PostEmbed;
  // Labels applied by Bluesky labelers
  labels: PostLabel[];
  // Whether this post is pinned by a feed generator
  isPinned?: boolean;
  // Topics matched by our LLM
  matchedTopics: TopicMatch[];
}

export interface PostAuthor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface PostEmbed {
  type: 'image' | 'external' | 'record' | 'video';
  images?: { thumb: string; fullsize: string; alt: string }[];
  external?: { uri: string; title: string; description: string; thumb?: string };
}

export interface PostLabel {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
}

// ─── Topics ──────────────────────────────────────────────────────────

/** A topic the user can follow */
export interface Topic {
  id: string;
  name: string;
  description: string;
  // Seed terms for initial matching (before LLM refinement)
  seedTerms: string[];
  // Number of users following this topic
  followerCount: number;
  // Whether this is a user-created custom topic
  isCustom?: boolean;
  // Avatar URL from the top matching Bluesky feed
  iconUrl?: string;
}

/** How well a post matches a topic (0-1) */
export interface TopicMatch {
  topicId: string;
  score: number;
}

/** A Bluesky feed generator (custom feed) */
export interface FeedGenerator {
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
}

/** A group of related feeds compiled into a "popular topic" */
export interface PopularTopicGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  seedTerms: string[];
  feeds: FeedGenerator[];
  totalLikeCount: number;
}

// ─── User Preferences (stored on PDS) ────────────────────────────────

/** Record: app.agora.muse.topicFollow */
export interface TopicFollowRecord {
  topicId: string;
  followedAt: string;
}

/** Record: app.agora.muse.moderationRule */
export interface ModerationRuleRecord {
  id: string;
  ruleType: 'keyword' | 'semantic' | 'labeler' | 'mute';
  value: string; // keyword, semantic prompt, labeler DID, or muted user DID
  createdAt: string;
}

/** Record: app.agora.muse.hiddenPost */
export interface HiddenPostRecord {
  postUri: string;
  hiddenAt: string;
  reason: 'downvote' | 'manual';
}

// ─── Auth ────────────────────────────────────────────────────────────

export interface AuthState {
  isAuthenticated: boolean;
  did: string;
  handle: string;
  session: unknown; // OAuth session object
}

// ─── Feed ────────────────────────────────────────────────────────────

export type FeedSortMode = 'hot' | 'top' | 'new';

export interface FeedState {
  posts: EnrichedPost[];
  cursor?: string;
  loading: boolean;
  error?: string;
  sortMode: FeedSortMode;
}

// ─── LLM ─────────────────────────────────────────────────────────────

export type LLMStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface LLMState {
  status: LLMStatus;
  progress: number;
  error?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  size: string;
  backend: 'embeddings' | 'webllm';
}

// ─── Thread / Comments ──────────────────────────────────────────────

export interface ThreadPost extends EnrichedPost {
  viewerLikeUri?: string | null;
}

export interface ThreadComment {
  uri: string;
  cid: string;
  author: PostAuthor;
  text: string;
  createdAt: string;
  indexedAt: string;
  likeCount: number;
  replyCount: number;
  viewerLikeUri?: string | null;
  replies: ThreadComment[];
  depth: number;
}

export interface PostThread {
  post: ThreadPost;
  replies: ThreadComment[];
}
