/**
 * Popular Topics — dynamically compiled by fetching the most popular
 * Bluesky feeds from api.bsky.app and grouping them by topic category.
 *
 * This module must NOT import client-only modules (Zustand, React, etc.).
 */

import type { FeedGenerator, PopularTopicGroup } from '@/types';

// ─── Cache ────────────────────────────────────────────────────────────

const CACHE_KEY = 'agora-muse-popular-topics-v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  groups: PopularTopicGroup[];
  fetchedAt: number;
}

function loadCache(allowStale = false): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!allowStale && Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function saveCache(groups: PopularTopicGroup[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ groups, fetchedAt: Date.now() }),
    );
  } catch {
    // Storage full or unavailable
  }
}

// ─── Topic Category Definitions ───────────────────────────────────────

interface CategoryDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** Regex patterns that indicate a feed belongs to this category.
   *  Ordered by priority — first match wins. */
  patterns: RegExp[];
  /** Patterns that exclude a feed from this category even if it matches */
  exclude?: RegExp[];
  /** Seed terms for this topic category */
  seedTerms: string[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'art',
    name: 'Art',
    description: 'Visual art, digital art, and creative expression',
    icon: 'lucide:palette',
    color: 'text-pink-400',
    patterns: [/\bart(?:ists?|work)?s?\b/i, /\bdraw(?:ing)?\b/i, /\bpaint(?:ing)?\b/i, /\billustrat/i],
    seedTerms: ['art', 'artist', 'drawing', 'illustration', 'digital art', 'creative', 'design'],
  },
  {
    id: 'science',
    name: 'Science',
    description: 'Scientific discoveries, research, and discussion',
    icon: 'lucide:flask-conical',
    color: 'text-emerald-400',
    patterns: [/\bscience\b/i, /\bsci(?:entific)?\b/i, /\bastronomy\b/i, /\bphysics\b/i, /\bbiology\b/i, /\bchemistry\b/i, /\bresearch\b/i],
    seedTerms: ['science', 'research', 'astronomy', 'physics', 'biology', 'space', 'nasa'],
  },
  {
    id: 'technology',
    name: 'Technology',
    description: 'Software, hardware, AI, and the digital world',
    icon: 'lucide:laptop',
    color: 'text-sky-400',
    patterns: [/\btech(?:nology)?\b/i, /\bprogramming\b/i, /\bsoftware\b/i, /\bcoding\b/i, /\bgithub\b/i, /\bstartup\b/i],
    exclude: [/\bgamedev\b/i, /\bgame\s*dev\b/i],
    seedTerms: ['tech', 'technology', 'software', 'programming', 'ai', 'startup', 'code'],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'Video games, game development, and gaming culture',
    icon: 'lucide:gamepad-2',
    color: 'text-green-400',
    patterns: [/\bgamedev\b/i, /\bgame\s*dev\b/i, /\bgam(?:e|ing)\b/i, /\besports\b/i, /\btwitch\b/i, /\bsteam\b/i, /\bnintendo\b/i],
    seedTerms: ['gaming', 'game dev', 'video games', 'esports', 'twitch', 'steam'],
  },
  {
    id: 'music',
    name: 'Music',
    description: 'All genres, artists, instruments, and music discussion',
    icon: 'lucide:music',
    color: 'text-purple-400',
    patterns: [/\bmusic\b/i, /\bsong\b/i, /\balbum\b/i, /\bband\b/i, /\bvinyl\b/i, /\bdj\b/i, /\bconcert\b/i, /\bplaylist\b/i],
    seedTerms: ['music', 'song', 'album', 'band', 'artist', 'vinyl', 'concert'],
  },
  {
    id: 'books',
    name: 'Books',
    description: 'Literature, reading, writing, and book recommendations',
    icon: 'lucide:book-open',
    color: 'text-yellow-400',
    patterns: [/\bbooks?\b/i, /\breading\b/i, /\bnovel\b/i, /\bliterat/i, /\bauthor\b/i, /\bacademic/i, /\bwriting\b/i],
    seedTerms: ['books', 'reading', 'novel', 'literature', 'author', 'writing', 'library'],
  },
  {
    id: 'news',
    name: 'News',
    description: 'Current events, journalism, and media',
    icon: 'lucide:newspaper',
    color: 'text-red-400',
    patterns: [/\bnews\b/i, /\bnoticias\b/i, /\bjournalism\b/i, /\bheadlines?\b/i],
    seedTerms: ['news', 'journalism', 'current events', 'headlines', 'media'],
  },
  {
    id: 'movies',
    name: 'Film & TV',
    description: 'Film discussion, reviews, and cinema culture',
    icon: 'lucide:film',
    color: 'text-rose-400',
    patterns: [/\bfilm\b/i, /\bmovie\b/i, /\bcinema\b/i, /\bnetflix\b/i, /\bhollywood\b/i, /\bscreenplay\b/i],
    seedTerms: ['film', 'movie', 'cinema', 'director', 'review', 'netflix'],
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Outdoors, wildlife, gardening, and environment',
    icon: 'lucide:leaf',
    color: 'text-emerald-500',
    patterns: [/\bnature\b/i, /\bbirds?\b/i, /\bgarden(?:ing)?\b/i, /\bwildlife\b/i, /\benvironment\b/i, /\bclimate\b/i, /\bocean\b/i, /\bforest\b/i, /\bhiking\b/i],
    seedTerms: ['nature', 'wildlife', 'birds', 'gardening', 'environment', 'climate', 'outdoors'],
  },
  {
    id: 'cooking',
    name: 'Food',
    description: 'Recipes, cooking, and culinary culture',
    icon: 'lucide:utensils-crossed',
    color: 'text-orange-400',
    patterns: [/\bcook(?:ing)?\b/i, /\brecipes?\b/i, /\bfood\b/i, /\bbaking\b/i, /\bchef\b/i, /\bcuisine\b/i, /\bkitchen\b/i],
    seedTerms: ['cooking', 'food', 'recipe', 'baking', 'chef', 'cuisine'],
  },
  {
    id: 'photography',
    name: 'Photography',
    description: 'Cameras, techniques, photo sharing, and visual storytelling',
    icon: 'lucide:camera',
    color: 'text-amber-400',
    patterns: [/\bphotograph/i, /\bphotos?\b/i, /\bcamera\b/i, /\blens\b/i, /\bportrait\b/i, /\blandscape\b/i],
    seedTerms: ['photography', 'photo', 'camera', 'lens', 'portrait', 'landscape'],
  },
  {
    id: 'sports',
    name: 'Sports',
    description: 'All sports, teams, athletes, and game analysis',
    icon: 'lucide:trophy',
    color: 'text-blue-400',
    patterns: [/\bsports?\b/i, /\bfootball\b/i, /\bbasketball\b/i, /\bsoccer\b/i, /\bbaseball\b/i, /\bnfl\b/i, /\bnba\b/i, /\bhockey\b/i, /\btennis\b/i],
    seedTerms: ['sports', 'football', 'basketball', 'soccer', 'baseball', 'nfl', 'nba'],
  },
  {
    id: 'politics',
    name: 'Politics',
    description: 'Political discourse, policy, and current events',
    icon: 'lucide:landmark',
    color: 'text-red-400',
    patterns: [/\bpolitic/i, /\bpolicy\b/i, /\bgovernment\b/i, /\belection\b/i, /\bcongress\b/i, /\bdemocracy\b/i, /\bvote\b/i],
    seedTerms: ['politics', 'policy', 'government', 'election', 'law', 'democracy'],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    description: 'Exercise, health, nutrition, and wellness',
    icon: 'lucide:dumbbell',
    color: 'text-lime-400',
    patterns: [/\bfitness\b/i, /\bexercise\b/i, /\bworkout\b/i, /\bgym\b/i, /\byoga\b/i, /\brunning\b/i, /\bnutrition\b/i, /\bcycling\b/i],
    seedTerms: ['fitness', 'exercise', 'workout', 'gym', 'health', 'nutrition', 'yoga'],
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    description: 'Ideas, ethics, consciousness, and deep thinking',
    icon: 'lucide:lightbulb',
    color: 'text-indigo-400',
    patterns: [/\bphilosophy\b/i, /\bethics\b/i, /\bconsciousness\b/i, /\bmeaning\b/i, /\blogic\b/i, /\bstoicism\b/i, /\bexistential/i],
    seedTerms: ['philosophy', 'ethics', 'consciousness', 'meaning', 'logic', 'stoicism'],
  },
  {
    id: 'humor',
    name: 'Humor',
    description: 'Memes, jokes, comedy, and lighthearted content',
    icon: 'lucide:smile',
    color: 'text-teal-400',
    patterns: [/\bhumor\b/i, /\bfunny\b/i, /\bmeme\b/i, /\bjoke\b/i, /\bcomedy\b/i, /\bshitpost/i, /\blaugh\b/i, /\bsatire\b/i],
    seedTerms: ['humor', 'funny', 'meme', 'joke', 'comedy', 'satire'],
  },
  {
    id: 'fashion',
    name: 'Fashion',
    description: 'Style, streetwear, sneakers, and fashion culture',
    icon: 'lucide:shirt',
    color: 'text-fuchsia-400',
    patterns: [/\bfashion\b/i, /\bstyle\b/i, /\bstreetwear\b/i, /\bsneakers?\b/i, /\boutfit\b/i, /\bwardrobe\b/i, /\bcouture\b/i],
    seedTerms: ['fashion', 'style', 'streetwear', 'sneakers', 'outfit', 'couture'],
  },
  {
    id: 'anime',
    name: 'Anime & Manga',
    description: 'Japanese animation, manga, and otaku culture',
    icon: 'lucide:sparkles',
    color: 'text-pink-500',
    patterns: [/\banime\b/i, /\bmanga\b/i, /\bcosplay\b/i, /\botaku\b/i, /\bweeb\b/i, /\bjapanese\s*anim/i],
    seedTerms: ['anime', 'manga', 'cosplay', 'otaku', 'japan'],
  },
  {
    id: 'travel',
    name: 'Travel',
    description: 'Destinations, adventure, and travel culture',
    icon: 'lucide:map-pin',
    color: 'text-cyan-400',
    patterns: [/\btravel\b/i, /\btourism\b/i, /\bwanderlust\b/i, /\bbackpack/i, /\bexplore/i, /\bdestination\b/i, /\badventure/i],
    seedTerms: ['travel', 'adventure', 'explore', 'destination', 'wanderlust', 'tourism'],
  },
  {
    id: 'pets',
    name: 'Pets',
    description: 'Cats, dogs, and all things companion animals',
    icon: 'lucide:paw-print',
    color: 'text-amber-500',
    patterns: [/\bcats?\b/i, /\bdogs?\b/i, /\bpet\b/i, /\bpuppy\b/i, /\bkitten\b/i, /\bdoggo\b/i, /\bmeow\b/i, /\bwoof\b/i],
    exclude: [/\bcattle\b/i, /\blivestock\b/i],
    seedTerms: ['cats', 'dogs', 'pets', 'animals', 'puppy', 'kitten'],
  },
  {
    id: 'history',
    name: 'History',
    description: 'Historical events, archaeology, and the past',
    icon: 'lucide:scroll-text',
    color: 'text-stone-400',
    patterns: [/\bhistory\b/i, /\barchaeolog/i, /\bhistorical\b/i, /\bancient\b/i, /\bcivilization\b/i, /\bmedieval\b/i, /\bww[12]\b/i],
    seedTerms: ['history', 'archaeology', 'ancient', 'historical', 'civilization'],
  },
  {
    id: 'design',
    name: 'Design',
    description: 'Graphic design, UI/UX, typography, and visual craft',
    icon: 'lucide:pen-tool',
    color: 'text-violet-400',
    patterns: [/\bdesign\b/i, /\bui\b/i, /\bux\b/i, /\btypography\b/i, /\bgraphic\b/i, /\bfigma\b/i, /\bbranding\b/i],
    exclude: [/\bgame\s*design\b/i, /\binterior\s*design\b/i],
    seedTerms: ['design', 'graphic design', 'ui', 'ux', 'typography', 'branding'],
  },
  {
    id: 'crypto',
    name: 'Crypto',
    description: 'Cryptocurrency, blockchain, web3, and decentralized tech',
    icon: 'lucide:bitcoin',
    color: 'text-orange-500',
    patterns: [/\bcrypto\b/i, /\bblockchain\b/i, /\bweb3\b/i, /\bbitcoin\b/i, /\bethereum\b/i, /\bdefi\b/i, /\bnft\b/i],
    seedTerms: ['crypto', 'bitcoin', 'blockchain', 'web3', 'ethereum', 'defi'],
  },
  {
    id: 'education',
    name: 'Education',
    description: 'Teaching, learning, academia, and knowledge sharing',
    icon: 'lucide:graduation-cap',
    color: 'text-sky-500',
    patterns: [/\beducation\b/i, /\bteaching\b/i, /\blearning\b/i, /\bacademi/i, /\bschool\b/i, /\buniversity\b/i, /\bstudent\b/i, /\bcollege\b/i],
    seedTerms: ['education', 'learning', 'teaching', 'academia', 'university', 'school'],
  },
];

// ─── General / non-topical feeds to exclude ───────────────────────────

const EXCLUDE_FEED_PATTERNS = [
  /\bdiscover\b/i,
  /\bpopular\swith\sfriends\b/i,
  /\bfor\syou\b/i,
  /\bwhat'?s\shot\sclassic\b/i,
  /\bwhat'?s\shot\b/i,
  /\bmutuals\b/i,
  /\bonly\s?posts\b/i,
  /\bnewskies\b/i,
  /\bmentions\b/i,
  /\bbluesky\steam\b/i,
  /\bmy\spins?\b/i,
];

function isGeneralFeed(feed: FeedGenerator): boolean {
  const text = `${feed.displayName} ${feed.description || ''}`;
  return EXCLUDE_FEED_PATTERNS.some((p) => p.test(text));
}

// ─── Feed-to-Category Matching ────────────────────────────────────────

function classifyFeed(feed: FeedGenerator, categories: CategoryDef[]): CategoryDef | null {
  const text = `${feed.displayName} ${feed.description || ''}`;

  for (const cat of categories) {
    // Check exclusion patterns first
    if (cat.exclude?.some((p) => p.test(text))) continue;
    // Check inclusion patterns
    if (cat.patterns.some((p) => p.test(text))) return cat;
  }

  return null;
}

// ─── Grouping ─────────────────────────────────────────────────────────

function groupFeedsByCategory(feeds: FeedGenerator[]): PopularTopicGroup[] {
  // Filter out general/non-topical feeds
  const topical = feeds.filter((f) => !isGeneralFeed(f));

  // Classify each feed
  const byCategory = new Map<string, { def: CategoryDef; feeds: FeedGenerator[] }>();

  for (const feed of topical) {
    const cat = classifyFeed(feed, CATEGORIES);
    if (!cat) continue;

    let entry = byCategory.get(cat.id);
    if (!entry) {
      entry = { def: cat, feeds: [] };
      byCategory.set(cat.id, entry);
    }
    entry.feeds.push(feed);
  }

  // Convert to PopularTopicGroup[], sorted by total likeCount
  const groups: PopularTopicGroup[] = [];

  for (const [, entry] of byCategory) {
    const { def, feeds: groupFeeds } = entry;
    // Sort feeds within group by likeCount descending
    groupFeeds.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));

    const totalLikeCount = groupFeeds.reduce((sum, f) => sum + (f.likeCount ?? 0), 0);

    groups.push({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      color: def.color,
      seedTerms: def.seedTerms,
      feeds: groupFeeds,
      totalLikeCount,
    });
  }

  // Sort groups by total likeCount descending (most popular first)
  groups.sort((a, b) => b.totalLikeCount - a.totalLikeCount);

  return groups;
}

// ─── API Fetch ────────────────────────────────────────────────────────

const API_URL =
  'https://api.bsky.app/xrpc/app.bsky.unspecced.getPopularFeedGenerators';

async function fetchPopularFeeds(): Promise<FeedGenerator[]> {
  const allFeeds: FeedGenerator[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  const MAX_PAGES = 3;
  const LIMIT = 100;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(LIMIT) });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${API_URL}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch popular feeds: ${res.status}`);
    }

    const data = (await res.json()) as {
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
      cursor?: string;
    };

    const feeds = (data.feeds || []).map((f) => ({
      uri: f.uri,
      cid: f.cid,
      displayName: f.displayName,
      description: f.description,
      avatar: f.avatar,
      likeCount: f.likeCount,
      creator: f.creator
        ? {
            did: f.creator.did,
            handle: f.creator.handle,
            displayName: f.creator.displayName,
            avatar: f.creator.avatar,
          }
        : undefined,
    }));

    for (const feed of feeds) {
      if (seen.has(feed.uri)) continue;
      seen.add(feed.uri);
      allFeeds.push(feed);
    }

    cursor = data.cursor;
    if (!cursor || feeds.length < LIMIT) break;
  }

  return allFeeds;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Get popular topics by fetching the most popular Bluesky feeds
 * and grouping them into topic categories.
 *
 * Results are cached in localStorage for 24 hours.
 * Falls back to an empty array on network errors.
 */
export async function getPopularTopics(): Promise<PopularTopicGroup[]> {
  // Return from cache if fresh
  const cached = loadCache();
  if (cached) {
    return cached.groups;
  }

  try {
    const feeds = await fetchPopularFeeds();
    const groups = groupFeedsByCategory(feeds);
    saveCache(groups);
    return groups;
  } catch {
    // Network error — return cached data even if stale, or empty
    const stale = loadCache(true);
    if (stale) return stale.groups;
    return [];
  }
}

/**
 * Invalidate the cache so the next call to getPopularTopics() re-fetches.
 */
export function invalidatePopularTopicsCache(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
