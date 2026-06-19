/**
 * Zustand store for topic management.
 */

import { create } from 'zustand';
import type { Topic, TopicFollowRecord } from '@/types';
import { useAuthStore } from './auth-store';
import * as records from '@/lib/atproto/records';
import { publishSkyfeedForTopic, unpublishSkyfeedForTopic } from '@/lib/atproto/feed-publisher';
import { generateSeedTerms } from '@/lib/llm/topic-matcher';
import { generateSkyfeedRegexWithLLM } from '@/lib/llm/web-llm';
import { buildFallbackRegex } from '@/lib/skyfeed/builder';
import { getPopularTopics } from '@/lib/data/popular-topics';

const CUSTOM_TOPICS_KEY = 'agora-muse-custom-topics';

function loadCustomTopicsFromStorage(): Topic[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TOPICS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Topic[];
  } catch {
    return [];
  }
}

function saveCustomTopicsToStorage(topics: Topic[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_TOPICS_KEY, JSON.stringify(topics));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ─── Default Topics (seed catalog) ───────────────────────────────────

export const DEFAULT_TOPICS: Topic[] = [
  {
    id: 'technology',
    name: 'Technology',
    description: 'Software, hardware, AI, and the digital world',
    seedTerms: ['tech', 'software', 'programming', 'AI', 'startup', 'code', 'github', 'open source'],
    followerCount: 0,
  },
  {
    id: 'science',
    name: 'Science',
    description: 'Discoveries, research, and scientific discussion',
    seedTerms: ['science', 'research', 'physics', 'biology', 'chemistry', 'space', 'NASA', 'study'],
    followerCount: 0,
  },
  {
    id: 'art',
    name: 'Art',
    description: 'Visual art, digital art, painting, and creative expression',
    seedTerms: ['art', 'drawing', 'painting', 'illustration', 'digital art', 'design', 'creative', 'photography'],
    followerCount: 0,
  },
  {
    id: 'music',
    name: 'Music',
    description: 'All genres, artists, instruments, and music discussion',
    seedTerms: ['music', 'song', 'album', 'band', 'artist', 'guitar', 'concert', 'spotify'],
    followerCount: 0,
  },
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'Video games, tabletop, gaming culture, and industry news',
    seedTerms: ['game', 'gaming', 'steam', 'playstation', 'xbox', 'nintendo', 'esports', 'twitch'],
    followerCount: 0,
  },
  {
    id: 'politics',
    name: 'Politics',
    description: 'Political discourse, policy, and current events',
    seedTerms: ['politics', 'policy', 'government', 'election', 'law', 'congress', 'vote'],
    followerCount: 0,
  },
  {
    id: 'cooking',
    name: 'Cooking',
    description: 'Recipes, techniques, food culture, and culinary arts',
    seedTerms: ['cooking', 'recipe', 'food', 'baking', 'chef', 'kitchen', 'dinner', 'cuisine'],
    followerCount: 0,
  },
  {
    id: 'photography',
    name: 'Photography',
    description: 'Cameras, techniques, photo sharing, and visual storytelling',
    seedTerms: ['photography', 'photo', 'camera', 'lens', 'DSLR', 'landscape', 'portrait', 'street photography'],
    followerCount: 0,
  },
  {
    id: 'books',
    name: 'Books',
    description: 'Literature, reading, writing, and book recommendations',
    seedTerms: ['book', 'reading', 'novel', 'author', 'literature', 'fiction', 'library', 'writing'],
    followerCount: 0,
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Exercise, health, nutrition, and wellness',
    seedTerms: ['fitness', 'exercise', 'workout', 'gym', 'health', 'nutrition', 'running', 'yoga'],
    followerCount: 0,
  },
  {
    id: 'movies',
    name: 'Movies',
    description: 'Film discussion, reviews, and cinema culture',
    seedTerms: ['movie', 'film', 'cinema', 'director', 'actor', 'netflix', 'hollywood', 'review'],
    followerCount: 0,
  },
  {
    id: 'sports',
    name: 'Sports',
    description: 'All sports, teams, athletes, and game analysis',
    seedTerms: ['sports', 'football', 'basketball', 'soccer', 'baseball', 'NFL', 'NBA', 'game'],
    followerCount: 0,
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Outdoors, wildlife, environment, and conservation',
    seedTerms: ['nature', 'wildlife', 'hiking', 'environment', 'climate', 'ocean', 'forest', 'animals'],
    followerCount: 0,
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    description: 'Ideas, ethics, consciousness, and deep thinking',
    seedTerms: ['philosophy', 'ethics', 'consciousness', 'meaning', 'logic', 'stoicism', 'existentialism'],
    followerCount: 0,
  },
  {
    id: 'humor',
    name: 'Humor',
    description: 'Memes, jokes, comedy, and lighthearted content',
    seedTerms: ['funny', 'meme', 'joke', 'comedy', 'lol', 'humor', 'laugh', 'hilarious'],
    followerCount: 0,
  },
];

// ─── Store ────────────────────────────────────────────────────────────

/** In-flight promise so concurrent callers can await the same fetch. */
let _popularTopicsPromise: Promise<void> | null = null;

interface TopicStore {
  topics: Topic[];
  followedTopicIds: Set<string>;
  loading: boolean;
  error: string | null;
  /** true once loadPopularTopics() has completed at least once */
  popularTopicsLoaded: boolean;
  /** true while loadPopularTopics() is fetching (prevents concurrent calls) */
  popularTopicsLoading: boolean;

  hydrateCustomTopics: () => void;
  loadPopularTopics: () => Promise<void>;
  loadFollowedTopics: () => Promise<void>;
  followTopic: (topicId: string) => Promise<void>;
  unfollowTopic: (topicId: string) => Promise<void>;
  isFollowing: (topicId: string) => boolean;
  addCustomTopic: (name: string, description: string) => Promise<Topic>;
  removeCustomTopic: (topicId: string) => void;
  setTopicIcon: (topicId: string, iconUrl: string) => void;
}

export const useTopicStore = create<TopicStore>((set, get) => ({
  topics: [...DEFAULT_TOPICS],
  followedTopicIds: new Set(),
  loading: true,
  error: null,
  popularTopicsLoaded: false,
  popularTopicsLoading: false,

  hydrateCustomTopics: () => {
    const customTopics = loadCustomTopicsFromStorage();
    if (customTopics.length === 0) return;
    const currentTopics = get().topics;
    const newTopics = customTopics.filter(
      (ct) => !currentTopics.some((t) => t.id === ct.id),
    );
    if (newTopics.length > 0) {
      set({ topics: [...currentTopics, ...newTopics] });
    }
  },

  loadPopularTopics: async () => {
    // Idempotent + concurrent-safe: only one in-flight call at a time.
    // The feed generators written to topic-feed-store are the important
    // output for loadFeed; re-running would replace the topics array
    // with new object refs, causing every rendered PostCard to re-render.
    if (get().popularTopicsLoaded) return;

    // If another caller already started the fetch, await its promise
    // instead of returning immediately — loadFollowedTopics depends on
    // the feed generators being populated before it sets loading=false.
    if (_popularTopicsPromise) {
      await _popularTopicsPromise;
      return;
    }

    set({ popularTopicsLoading: true });

    // Capture the promise so concurrent callers (e.g. loadFollowedTopics
    // on the home page + loadPopularTopics on the topics page during a
    // client-side navigation) await the same fetch.
    _popularTopicsPromise = (async () => {
      try {
        const groups = await getPopularTopics();
        if (groups.length === 0) {
          set({ popularTopicsLoaded: true, popularTopicsLoading: false });
          return; // keep current topics (defaults or previous)
        }

        // Convert PopularTopicGroups to Topic objects
        const popularTopics: Topic[] = groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          seedTerms: g.seedTerms,
          followerCount: g.totalLikeCount,
          iconUrl: g.feeds[0]?.avatar,
        }));

        // Store feed associations in topic-feed-store for each group
        const { useTopicFeedStore } = await import('./topic-feed-store');
        for (const group of groups) {
          useTopicFeedStore.getState().setFeedsForTopic(group.id, group.feeds);
        }

        // Popular topics fully replace built-in defaults, keep custom topics
        const currentTopics = get().topics;
        const customTopics = currentTopics.filter((t) => t.isCustom);

        set({
          topics: [...popularTopics, ...customTopics],
          popularTopicsLoaded: true,
          popularTopicsLoading: false,
        });
      } catch {
        // Keep current topics on failure — but still mark as loaded so
        // loadFollowedTopics isn't blocked indefinitely.
        set({ popularTopicsLoaded: true, popularTopicsLoading: false });
      } finally {
        _popularTopicsPromise = null;
      }
    })();

    await _popularTopicsPromise;
  },

  loadFollowedTopics: async () => {
    const { agent } = useAuthStore.getState();
    if (!agent) {
      set({ loading: false });
      return;
    }

    set({ loading: true });
    try {
      // Hydrate popular-topics feed-generator associations before we
      // release the loading lock. Without this, loadFeed (triggered by
      // loading→false) would only have keyword/hashtag results. When
      // loadPopularTopics completes a moment later and replaces the
      // topics array, every rendered PostCard re-renders — the frame
      // drop users perceive as a "hang."
      await get().loadPopularTopics().catch(() => {});

      const follows = await records.getTopicFollows(agent);
      const ids = new Set(follows.map((f) => f.topicId));
      set({ followedTopicIds: ids, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load topics',
      });
    }
  },

  followTopic: async (topicId: string) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      await records.followTopic(agent, topicId);
      const { followedTopicIds } = get();
      const newSet = new Set(followedTopicIds);
      newSet.add(topicId);
      set({ followedTopicIds: newSet });

      // Trigger feed discovery for this topic (fire-and-forget)
      // For popular topics, feeds are already set by loadPopularTopics;
      // this handles custom topics and any topics missing feeds
      import('./topic-feed-store').then(({ useTopicFeedStore }) => {
        useTopicFeedStore.getState().discoverFeedsForTopic(topicId);
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to follow topic',
      });
    }
  },

  unfollowTopic: async (topicId: string) => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    try {
      await records.unfollowTopic(agent, topicId);
      const { followedTopicIds } = get();
      const newSet = new Set(followedTopicIds);
      newSet.delete(topicId);
      set({ followedTopicIds: newSet });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to unfollow topic',
      });
    }
  },

  isFollowing: (topicId: string) => {
    return get().followedTopicIds.has(topicId);
  },

  addCustomTopic: async (name: string, description: string) => {
    const id = slugify(name);
    const seedTerms = await generateSeedTerms(name, description, DEFAULT_TOPICS);

    const topic: Topic = {
      id,
      name,
      description: description || `${name} discussion`,
      seedTerms: seedTerms.length > 0 ? seedTerms : [name.toLowerCase()],
      followerCount: 0,
      isCustom: true,
    };

    const currentTopics = get().topics;
    const existing = currentTopics.find((t) => t.id === topic.id);
    if (existing) return existing;

    set({ topics: [...currentTopics, topic] });

    const customTopics = currentTopics
      .filter((t) => t.isCustom)
      .concat(topic);
    saveCustomTopicsToStorage(customTopics);

    // Auto-follow the newly created custom topic
    try {
      await get().followTopic(topic.id);
    } catch {
      // Silently ignore — topic was created, follow is optional
    }

    // Publish a Skyfeed Builder feed for this topic so it has a real,
    // followable Bluesky feed. Non-fatal: the topic is usable without it,
    // and the feed-store falls back to keyword/hashtag search.
    const agent = useAuthStore.getState().agent;
    if (agent) {
      try {
        // Generate the regex with the WebLLM (already loaded for seed-term
        // generation), falling back to a deterministic keyword pattern.
        const llmRegex = await generateSkyfeedRegexWithLLM(
          topic.name,
          topic.description,
          topic.seedTerms,
        );
        const regexPattern =
          llmRegex && llmRegex.length > 0 && llmRegex.length < 500
            ? llmRegex
            : buildFallbackRegex(topic);

        const feed = await publishSkyfeedForTopic(agent, topic, regexPattern);
        if (feed) {
          const { useTopicFeedStore } = await import('./topic-feed-store');
          useTopicFeedStore.getState().addFeedForTopic(topic.id, feed);
        }
      } catch (err) {
        console.warn('Skyfeed publish failed for topic', topic.id, err);
      }
    }

    return topic;
  },

  removeCustomTopic: (topicId: string) => {
    const currentTopics = get().topics;
    const topic = currentTopics.find((t) => t.id === topicId);
    if (!topic?.isCustom) return;

    // Unfollow if currently following
    const { followedTopicIds } = get();
    if (followedTopicIds.has(topicId)) {
      get().unfollowTopic(topicId);
    }

    // Delete the auto-published Skyfeed feed generator record from the
    // user's Bluesky repo. Fire-and-forget — the topic is being removed
    // locally regardless, and a stray record is non-critical.
    const agent = useAuthStore.getState().agent;
    if (agent) {
      unpublishSkyfeedForTopic(agent, topicId).catch((err) => {
        console.warn('Skyfeed unpublish failed for topic', topicId, err);
      });
    }

    // Drop any cached feed associations for this topic.
    import('./topic-feed-store').then(({ useTopicFeedStore }) => {
      useTopicFeedStore.getState().clearFeedsForTopic(topicId);
    });

    const remaining = currentTopics.filter((t) => t.id !== topicId);
    set({ topics: remaining });

    const customTopics = remaining.filter((t) => t.isCustom);
    saveCustomTopicsToStorage(customTopics);
  },

  setTopicIcon: (topicId: string, iconUrl: string) => {
    const existing = get().topics.find((t) => t.id === topicId);
    if (existing?.iconUrl === iconUrl) return; // unchanged — avoid re-render loop
    set({
      topics: get().topics.map((t) =>
        t.id === topicId ? { ...t, iconUrl } : t,
      ),
    });
    // Persist to localStorage if this is a custom topic
    const customTopics = get().topics.filter((t) => t.isCustom);
    saveCustomTopicsToStorage(customTopics);
  },
}));
