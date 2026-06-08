/**
 * Zustand store for topic management.
 */

import { create } from 'zustand';
import type { Topic, TopicFollowRecord } from '@/types';
import { useAuthStore } from './auth-store';
import * as records from '@/lib/atproto/records';
import { generateSeedTerms } from '@/lib/llm/topic-matcher';
import { TOPIC_IDS } from '@/lib/data/topics';

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
  return `custom-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)}`;
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

interface TopicStore {
  topics: Topic[];
  followedTopicIds: Set<string>;
  loading: boolean;
  error: string | null;

  loadFollowedTopics: () => Promise<void>;
  followTopic: (topicId: string) => Promise<void>;
  unfollowTopic: (topicId: string) => Promise<void>;
  isFollowing: (topicId: string) => boolean;
  addCustomTopic: (name: string, description: string) => Promise<Topic>;
  removeCustomTopic: (topicId: string) => void;
}

export const useTopicStore = create<TopicStore>((set, get) => ({
  topics: [...DEFAULT_TOPICS, ...loadCustomTopicsFromStorage()],
  followedTopicIds: new Set(),
  loading: false,
  error: null,

  loadFollowedTopics: async () => {
    const { agent } = useAuthStore.getState();
    if (!agent) return;

    set({ loading: true });
    try {
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

    const remaining = currentTopics.filter((t) => t.id !== topicId);
    set({ topics: remaining });

    const customTopics = remaining.filter((t) => t.isCustom);
    saveCustomTopicsToStorage(customTopics);
  },
}));
