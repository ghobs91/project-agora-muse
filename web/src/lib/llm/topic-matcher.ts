/**
 * In-browser topic matching and semantic scoring.
 *
 * Embeddings come from the shared EmbeddingGemma 2 runtime
 * (`lib/llm/embeddings.ts`); this module builds topic-level scoring, feed
 * ranking, and seed-term generation on top of it.
 */

import type { Topic, TopicMatch, FeedGenerator } from '@/types';
import { EMBEDDING_MODEL_ID } from '@/lib/llm/embedding-config';
import {
  getEmbeddingStatus,
  getEmbeddingProgress,
  onEmbeddingStatusChange,
  loadEmbeddingModel,
  ensureEmbeddingModel,
  unloadEmbeddingModel,
  isEmbeddingModelLoaded,
  cosineSimilarity,
  embedForSimilarity,
  embedForSimilarityChunked,
  embedTextForSimilarity,
} from '@/lib/llm/embeddings';

// ─── Model Management (thin re-exports for existing callers) ─────────

export const getLLMStatus = getEmbeddingStatus;
export const getLLMProgress = getEmbeddingProgress;
export const onLLMStatusChange = onEmbeddingStatusChange;
export const loadModel = loadEmbeddingModel;
export const unloadModel = unloadEmbeddingModel;
export { ensureEmbeddingModel, cosineSimilarity };

/** The embedding model is fixed app-wide; retained for API compatibility. */
export function getCurrentModelName(): string {
  return EMBEDDING_MODEL_ID;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setCurrentModelName(_name: string): void {
  /* no-op: EmbeddingGemma 2 is the single app-wide embedding model */
}

// ─── Embedding Utilities ─────────────────────────────────────────────

async function getEmbedding(text: string): Promise<Float32Array | null> {
  return embedTextForSimilarity(text);
}

export function getBatchEmbeddingsForTexts(
  texts: string[],
): Promise<Array<Float32Array | null>> {
  return embedForSimilarity(texts);
}

/**
 * Chunked variant of getBatchEmbeddingsForTexts that yields to the event
 * loop between chunks so the main thread can keep painting.
 */
export function getBatchEmbeddingsChunked(
  texts: string[],
  chunkSize = 32,
): Promise<Array<Float32Array | null>> {
  return embedForSimilarityChunked(texts, chunkSize);
}

/**
 * Public wrapper — compute embedding for arbitrary text.
 * Returns null if the model is not loaded.
 */
export async function getEmbeddingForText(
  text: string,
): Promise<Float32Array | null> {
  return getEmbedding(text);
}

// ─── Seed Terms (Embeddings for topic seed terms) ────────────────────

const seedEmbeddingsCache = new Map<string, Float32Array>();
const MAX_SEED_EMBEDDINGS_CACHE = 200;

async function getSeedTermEmbedding(term: string): Promise<Float32Array | null> {
  const cached = seedEmbeddingsCache.get(term);
  if (cached) return cached;

  const embedding = await getEmbedding(term);
  if (embedding) {
    if (seedEmbeddingsCache.size >= MAX_SEED_EMBEDDINGS_CACHE) {
      seedEmbeddingsCache.delete(seedEmbeddingsCache.keys().next().value!);
    }
    seedEmbeddingsCache.set(term, embedding);
  }
  return embedding;
}

// ─── Topic Matching ──────────────────────────────────────────────────

/**
 * Score how well a post matches a topic.
 * Combines LLM semantic similarity with keyword matching for robustness.
 * Returns a score from 0 to 1.
 */
export async function scoreTopicMatch(
  postText: string,
  topic: Topic,
): Promise<number> {
  if (!postText.trim()) return 0;

  const scores: number[] = [];

  // 1. Keyword matching (fast, always works)
  const keywordScore = keywordMatchScore(postText, topic);
  scores.push(keywordScore);

  // 2. LLM semantic similarity (if model is loaded)
  const postEmbedding = await getEmbedding(postText);
  if (postEmbedding) {
    // Build topic embedding from name + description + seed terms
    const topicText = `${topic.name}. ${topic.description}. ${topic.seedTerms.join(' ')}`;
    const topicEmbedding = await getEmbedding(topicText);

    if (topicEmbedding) {
      const semanticScore = cosineSimilarity(postEmbedding, topicEmbedding);
      // Normalize: typical cosine similarity ranges from 0-1 for related text
      scores.push(semanticScore);
    }
  }

  // 3. Per-seed-term matching (more granular)
  for (const term of topic.seedTerms) {
    const termEmbedding = await getSeedTermEmbedding(term);
    if (postEmbedding && termEmbedding) {
      scores.push(cosineSimilarity(postEmbedding, termEmbedding));
    }
  }

  if (scores.length === 0) return 0;

  // Weighted average: semantic and per-term scores get more weight
  // because keyword matching is just a baseline — the LLM is more accurate
  const weighted = scores[0] * 0.3 + scores.slice(1).reduce((a, b) => a + b, 0) / Math.max(scores.length - 1, 1) * 0.7;
  return Math.min(1, Math.max(0, weighted));
}

/**
 * Score multiple posts against a single topic, computing topic-level
 * embeddings once and reusing them across all posts.
 *
 * @param postTexts - The text content of each post to score.
 * @param topic - The topic to match against.
 * @param precomputedEmbeddings - Optional pre-computed embeddings for
 *   each post text (same order as postTexts). When provided, the ONNX
 *   call for post embedding is skipped entirely — the caller batches
 *   embeddings across multiple topics for a single ONNX call instead
 *   of N per-topic calls.
 */
export async function batchScoreTopicMatch(
  postTexts: string[],
  topic: Topic,
  precomputedEmbeddings?: Array<Float32Array | null>,
): Promise<number[]> {
  if (postTexts.length === 0) return [];

  // 1. Compute keyword scores for all posts (fast, synchronous)
  const keywordScores = postTexts.map((text) => keywordMatchScore(text, topic));

  // 2. Pre-compute topic-level embeddings once
  const topicText = `${topic.name}. ${topic.description}. ${topic.seedTerms.join(' ')}`;
  const topicEmbedding = await getEmbedding(topicText);

  // Batch all term embeddings in a single ONNX call — critical for CPU perf.
  // (was: N sequential calls, which dominated the post-load block time)
  const termEmbeddings: Array<Float32Array | null> = new Array(topic.seedTerms.length).fill(null);
  if (topicEmbedding) {
    const uncachedIndices: number[] = [];
    const uncachedTerms: string[] = [];
    for (let i = 0; i < topic.seedTerms.length; i++) {
      const term = topic.seedTerms[i];
      const cached = seedEmbeddingsCache.get(term);
      if (cached) {
        termEmbeddings[i] = cached;
      } else {
        uncachedIndices.push(i);
        uncachedTerms.push(term);
      }
    }
    if (uncachedTerms.length > 0) {
      const batched = await getBatchEmbeddingsForTexts(uncachedTerms);
      for (let i = 0; i < uncachedIndices.length; i++) {
        const embedding = batched[i];
        termEmbeddings[uncachedIndices[i]] = embedding;
        if (embedding) {
          seedEmbeddingsCache.set(uncachedTerms[i], embedding);
        }
      }
    }
  }

  // 3. Compute all post embeddings in one batch call (or reuse pre-computed)
  let postEmbeddings: Array<Float32Array | null> = precomputedEmbeddings ?? [];
  if (!precomputedEmbeddings && topicEmbedding) {
    postEmbeddings = await getBatchEmbeddingsForTexts(postTexts);
  }

  // 4. Score each post, reusing topic/term embeddings
  const scores: number[] = [];
  for (let i = 0; i < postTexts.length; i++) {
    const postScores: number[] = [keywordScores[i]];

    if (topicEmbedding && postEmbeddings[i]) {
      const semanticScore = cosineSimilarity(postEmbeddings[i]!, topicEmbedding);
      postScores.push(semanticScore);

      for (const termEmbedding of termEmbeddings) {
        if (termEmbedding) {
          postScores.push(cosineSimilarity(postEmbeddings[i]!, termEmbedding));
        }
      }
    }

    if (postScores.length === 1) {
      scores.push(postScores[0]);
    } else {
      const weighted =
        postScores[0] * 0.3 +
        (postScores.slice(1).reduce((a, b) => a + b, 0) / Math.max(postScores.length - 1, 1)) * 0.7;
      scores.push(Math.min(1, Math.max(0, weighted)));
    }
  }

  return scores;
}

/**
 * Simple keyword-based matching as a baseline.
 */
export function keywordMatchScore(postText: string, topic: Topic): number {
  const lower = postText.toLowerCase();
  let matchCount = 0;

  // Check topic name
  if (lower.includes(topic.name.toLowerCase())) {
    matchCount += 2;
  }

  // Check seed terms
  for (const term of topic.seedTerms) {
    if (lower.includes(term.toLowerCase())) {
      matchCount += 1;
    }
  }

  // Normalize to 0-1
  const maxMatches = topic.seedTerms.length + 2;
  return Math.min(1, matchCount / Math.max(maxMatches, 1));
}

/**
 * Match a post against all available topics and return top matches.
 */
export async function matchPostToTopics(
  postText: string,
  topics: Topic[],
  maxResults: number = 3,
): Promise<TopicMatch[]> {
  const scores = await Promise.all(
    topics.map(async (topic) => ({
      topicId: topic.id,
      score: await scoreTopicMatch(postText, topic),
    })),
  );

  return scores
    .filter((s) => s.score > 0.05) // Minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ─── Feed Generator Matching ─────────────────────────────────────────

/**
 * Check whether a feed's name or description contains any of the topic's
 * identifying terms.  Short terms (≤3 chars) require a word boundary so "AI"
 * doesn't match "pain"; longer terms use substring matching so "tech" matches
 * "technology" and "tech news".
 */
function hasKeywordMatch(feed: FeedGenerator, topic: Topic): boolean {
  const text = `${feed.displayName} ${feed.description || ''}`.toLowerCase();
  const terms = [...new Set([topic.name.toLowerCase(), ...topic.seedTerms.map((s) => s.toLowerCase())])]
    .filter((t) => t.length > 1);

  return terms.some((term) => {
    if (term.length <= 3) {
      // Whole-word match for short terms
      return new RegExp(`\\b${term}\\b`, 'i').test(text);
    }
    return text.includes(term);
  });
}

/**
 * Combine semantic relevance, keyword matching, and popularity (likeCount)
 * for feed ranking.
 *
 * Pure semantic scoring was missing obvious matches like "Tech by Flipboard"
 * because the embedding model focused on the literal topic text.  Keyword
 * matches get a strong multiplicative boost, and likes provide a secondary
 * multiplier so popular, relevant feeds rise to the top.
 */
function scoreFeed(
  semanticScore: number,
  feed: FeedGenerator,
  topic: Topic,
): { score: number; hasKeyword: boolean } {
  const hasKeyword = hasKeywordMatch(feed, topic);
  const keywordBoost = hasKeyword ? 1.5 : 1.0;
  const likes = Math.max(0, feed.likeCount ?? 0);
  // Cap the popularity boost so a very popular but semantically unrelated
  // feed cannot dominate the results. 100+ likes gives a 1.5x boost.
  const popularityBoost = 1 + Math.min(Math.log10(likes + 1), 2.0) * 0.25;
  return { score: semanticScore * keywordBoost * popularityBoost, hasKeyword };
}

/**
 * Match feed generators to a topic using LLM semantic similarity.
 * Returns feeds that are relevant to the topic, sorted by relevance.
 */
export async function matchFeedsToTopic(
  feeds: FeedGenerator[],
  topic: Topic,
): Promise<FeedGenerator[]> {
  if (!isEmbeddingModelLoaded() || feeds.length === 0) {
    // No LLM available — do keyword matching as fallback.
    // Sort by popularity (descending) so popular feeds come first.
    const matched = feeds.filter((f) => hasKeywordMatch(f, topic));
    matched.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    return matched.slice(0, 5);
  }

  const topicText = `${topic.name}. ${topic.description}. ${topic.seedTerms.join(' ')}`;
  const topicEmbedding = await getEmbedding(topicText);
  if (!topicEmbedding) {
    // Embedding failed — fall through to popularity sort
    const sorted = [...feeds].sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    return sorted.slice(0, 5);
  }

  const scored = await Promise.all(
    feeds.map(async (f) => {
      const feedText = `${f.displayName}. ${f.description || ''}`;
      const feedEmbedding = await getEmbedding(feedText);
      if (!feedEmbedding) return { feed: f, score: 0, semanticScore: 0, hasKeyword: false };

      const semanticScore = cosineSimilarity(topicEmbedding!, feedEmbedding);
      const { score, hasKeyword } = scoreFeed(semanticScore, f, topic);
      return { feed: f, score, semanticScore, hasKeyword };
    }),
  );

  return scored
    .filter(
      (s) =>
        // Require a real semantic match. Keyword matches can pass with a
        // lower floor, but purely popular-yet-unrelated feeds must not.
        (s.hasKeyword && s.semanticScore > 0.15) ||
        (!s.hasKeyword && s.semanticScore > 0.35),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.feed);
}

// ─── Seed Term Generation for Custom Topics ──────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'about', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'you', 'your',
  'my', 'me', 'i', 'we', 'our', 'us', 'they', 'them', 'their', 'its',
  'it', 'that', 'this', 'these', 'those', 'all', 'some', 'any', 'no',
  'not', 'only', 'just', 'very', 'too', 'also', 'how', 'what', 'when',
  'where', 'who', 'why', 'which', 'more', 'most', 'other', 'new',
  'good', 'great', 'best', 'top', 'like', 'than', 'then', 'now',
  'here', 'there', 'one', 'two', 'as', 'if', 'so', 'by', 'from',
  'okay', 'ok',
  'up', 'out', 'into', 'over', 'into', 'during', 'before', 'after',
  'above', 'below', 'between', 'through',
]);

/** Overly broad terms that should not be borrowed from default topics */
const BROAD_CATEGORY_TERMS = new Set([
  'tech', 'technology', 'software', 'programming', 'code', 'coding',
  'science', 'research', 'art', 'music', 'game', 'gaming', 'politics',
  'policy', 'cooking', 'food', 'photography', 'photo', 'book', 'reading',
  'fitness', 'exercise', 'health', 'movie', 'film', 'sports', 'nature',
  'philosophy', 'humor', 'funny', 'comedy', 'design', 'creative',
  'writing', 'study', 'review', 'general', 'misc', 'other', 'discussion',
  'culture', 'world', 'news', 'media', 'entertainment', 'lifestyle',
  // Avoid borrowing generic AI/ML terms for unrelated tech topics; they
  // surface extremely popular feeds that swamp more specific matches.
  'ai', 'artificial intelligence', 'ml', 'machine learning',
]);

/**
 * Generate seed terms for a custom topic based on its name and description.
 * Blends keyword extraction with semantically similar terms borrowed from the
 * default topics (via the embedding model), filtered to avoid overly broad
 * category terms.
 */
export async function generateSeedTerms(
  topicName: string,
  description: string,
  existingTopics: Topic[],
): Promise<string[]> {
  const normalizedName = topicName.toLowerCase().trim();

  // 1. Extract keywords from the user's input.
  // Always keep the full topic name as a phrase so multi-word topics
  // (e.g. "open source") are not split into overly broad single words.
  const inputTerms: string[] = [];
  if (normalizedName.length > 0) {
    inputTerms.push(normalizedName);
  }

  const nameWords = new Set(normalizedName.split(/\s+/).filter((w) => w.length > 0));

  // Only extract additional words from a custom description.
  // The auto-generated description is just "{name} discussion", so
  // without this guard it would re-add the same broad single words.
  const descText = description.trim();
  const inputText = `${topicName}. ${description}`;
  if (descText) {
    const descWords = descText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !BROAD_CATEGORY_TERMS.has(w));

    for (const word of [...new Set(descWords)]) {
      // Skip individual words that are already covered by the full topic name phrase
      if (nameWords.size > 1 && nameWords.has(word)) continue;
      if (!inputTerms.includes(word)) {
        inputTerms.push(word);
      }
    }
  }

  // 3. Ensure embedding model is loaded for similarity matching
  await ensureEmbeddingModel();

  // 4. Borrow relevant terms from similar default topics
  let borrowedTerms: string[] = [];
  if (isEmbeddingModelLoaded() && existingTopics.length > 0) {
    const inputEmbedding = await getEmbedding(inputText);
    if (inputEmbedding) {
      const defaultTopics = existingTopics.filter((t) => !t.isCustom);

      const scored = await Promise.all(
        defaultTopics.map(async (t) => {
          const topicText = `${t.name}. ${t.description}`;
          const topicEmbedding = await getEmbedding(topicText);
          if (!topicEmbedding) return { topic: t, score: 0 };
          return {
            topic: t,
            score: cosineSimilarity(inputEmbedding, topicEmbedding),
          };
        }),
      );

      const similar = scored
        .filter((s) => s.score > 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const candidates: Array<{ term: string; score: number }> = [];
      for (const { topic } of similar) {
        for (const term of topic.seedTerms) {
          const termLower = term.toLowerCase();

          // Skip if already present
          if (inputTerms.includes(termLower)) continue;
          if (BROAD_CATEGORY_TERMS.has(termLower)) continue;
          if (candidates.some((c) => c.term === termLower)) continue;

          // Only borrow if the term is actually semantically related to the input
          const termEmbedding = await getEmbedding(term);
          if (termEmbedding) {
            const similarity = cosineSimilarity(inputEmbedding, termEmbedding);
            if (similarity > 0.4) {
              candidates.push({ term: termLower, score: similarity });
            }
          }
        }
      }

      // Rank borrowed terms by semantic similarity to the input topic.
      candidates.sort((a, b) => b.score - a.score);
      borrowedTerms = candidates.map((c) => c.term);
    }
  }

  // 5. Combine: input terms first, then ranked borrowed terms, deduplicate, top 8
  const combined = [...inputTerms, ...borrowedTerms];
  return [...new Set(combined)].slice(0, 8);
}

// ─── Topic Suggestions for Posting ───────────────────────────────────

/**
 * Given post content, suggest up to 3 relevant topics.
 * Used in the post creation flow.
 */
export async function suggestTopics(
  content: string,
  availableTopics: Topic[],
): Promise<Array<{ topic: Topic; score: number }>> {
  const matches = await matchPostToTopics(content, availableTopics, 5);

  return matches
    .map((match) => ({
      topic: availableTopics.find((t) => t.id === match.topicId)!,
      score: match.score,
    }))
    .filter((s) => s.topic)
    .slice(0, 3);
}
