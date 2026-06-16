/**
 * Topic catalog — shared between server (generateStaticParams) and client (store).
 * This file must NOT import client-only modules (Zustand, React, etc.).
 */

export const TOPIC_IDS = [
  'technology',
  'science',
  'art',
  'music',
  'gaming',
  'politics',
  'cooking',
  'photography',
  'books',
  'fitness',
  'movies',
  'sports',
  'nature',
  'philosophy',
  'humor',
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export const TOPIC_ICONS: Record<string, string> = {
  technology: 'lucide:laptop',
  science: 'lucide:flask-conical',
  art: 'lucide:palette',
  music: 'lucide:music',
  gaming: 'lucide:gamepad-2',
  politics: 'lucide:landmark',
  cooking: 'lucide:utensils-crossed',
  photography: 'lucide:camera',
  books: 'lucide:book-open',
  fitness: 'lucide:dumbbell',
  movies: 'lucide:film',
  sports: 'lucide:trophy',
  nature: 'lucide:leaf',
  philosophy: 'lucide:lightbulb',
  humor: 'lucide:smile',
} as const;

export const TOPIC_COLORS: Record<string, string> = {
  technology: 'text-sky-400',
  science: 'text-emerald-400',
  art: 'text-pink-400',
  music: 'text-purple-400',
  gaming: 'text-green-400',
  politics: 'text-red-400',
  cooking: 'text-orange-400',
  photography: 'text-amber-400',
  books: 'text-yellow-400',
  fitness: 'text-lime-400',
  movies: 'text-rose-400',
  sports: 'text-blue-400',
  nature: 'text-emerald-500',
  philosophy: 'text-indigo-400',
  humor: 'text-teal-400',
} as const;

const BUILTIN_TOPIC_TERMS: Record<string, string[]> = {
  technology: ['tech', 'software', 'programming', 'ai', 'startup', 'code', 'github', 'computer', 'linux'],
  science: ['science', 'research', 'physics', 'biology', 'chemistry', 'space', 'nasa', 'astronomy', 'math'],
  art: ['art', 'drawing', 'painting', 'illustration', 'design', 'creative', 'sketch', 'artist'],
  music: ['music', 'song', 'album', 'band', 'artist', 'guitar', 'concert', 'vinyl', 'dj'],
  gaming: ['game', 'gaming', 'steam', 'playstation', 'xbox', 'nintendo', 'esports', 'twitch', 'retro'],
  politics: ['politics', 'policy', 'government', 'election', 'law', 'congress', 'vote', 'democracy'],
  cooking: ['cooking', 'recipe', 'food', 'baking', 'chef', 'kitchen', 'cuisine', 'dinner', 'grill'],
  photography: ['photography', 'photo', 'camera', 'lens', 'portrait', 'dslr', 'landscape', 'shoot', 'lightroom'],
  books: ['book', 'reading', 'novel', 'author', 'literature', 'fiction', 'writing', 'library'],
  fitness: ['fitness', 'exercise', 'workout', 'gym', 'health', 'nutrition', 'running', 'yoga', 'cycling'],
  movies: ['movie', 'film', 'cinema', 'director', 'actor', 'netflix', 'hollywood', 'screenplay'],
  sports: ['sports', 'football', 'basketball', 'soccer', 'baseball', 'nfl', 'nba', 'hockey', 'tennis', 'golf'],
  nature: ['nature', 'wildlife', 'hiking', 'environment', 'climate', 'ocean', 'forest', 'animals', 'camping'],
  philosophy: ['philosophy', 'ethics', 'consciousness', 'meaning', 'logic', 'stoicism', 'existentialism'],
  humor: ['funny', 'meme', 'joke', 'comedy', 'lol', 'humor', 'laugh', 'hilarious', 'satire'],
};

export function findBestMatchingTopicId(name: string, seedTerms: string[]): string | null {
  let bestId: string | null = null;
  let bestScore = 0;
  const nameLower = name.toLowerCase();
  const termsLower = seedTerms.map((t) => t.toLowerCase());

  for (const [topicId, builtinTerms] of Object.entries(BUILTIN_TOPIC_TERMS)) {
    let score = 0;
    for (const term of termsLower) {
      for (const builtin of builtinTerms) {
        if (builtin === term) {
          score += 3;
        } else if (builtin.includes(term) || term.includes(builtin)) {
          score += 1;
        }
      }
    }
    if (nameLower.includes(topicId) || topicId.includes(nameLower)) {
      score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = topicId;
    }
  }

  return bestScore >= 3 ? bestId : null;
}

export const TOPIC_HASHTAGS: Record<string, string[]> = {
  technology: ['tech', 'programming', 'coding'],
  science: ['science', 'research', 'stem'],
  art: ['art', 'digitalart', 'creative'],
  music: ['music', 'newmusic', 'nowplaying'],
  gaming: ['gaming', 'gamedev', 'indiegame'],
  politics: ['politics', 'news', 'currentevents'],
  cooking: ['cooking', 'food', 'foodie'],
  photography: ['photography', 'photooftheday', 'landscape'],
  books: ['books', 'reading', 'booktok'],
  fitness: ['fitness', 'workout', 'health'],
  movies: ['movies', 'film', 'cinema'],
  sports: ['sports', 'athlete', 'game'],
  nature: ['nature', 'outdoors', 'wildlife'],
  philosophy: ['philosophy', 'deepthoughts', 'wisdom'],
  humor: ['humor', 'funny', 'comedy'],
} as const;

/**
 * Check whether a topic ID has a statically-generated page at /topics/[id].
 * IDs not in TOPIC_IDS must use the /topics/custom?id=... route instead.
 */
export function isStaticTopicId(id: string): boolean {
  return (TOPIC_IDS as readonly string[]).includes(id as TopicId);
}
