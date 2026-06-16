/**
 * In-browser LLM for topic matching and semantic moderation.
 *
 * Uses Transformers.js with a lightweight embedding model
 * (Xenova/all-MiniLM-L6-v2) to compute semantic similarity between
 * post text and topic descriptions / moderation rules.
 *
 * The model runs entirely in the browser via ONNX Runtime WASM backend.
 */

import type { Topic, TopicMatch, LLMStatus, FeedGenerator } from '@/types';
import { isWebLLMLoaded, generateSeedTermsWithLLM } from '@/lib/llm/web-llm';

// ─── Types ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbeddingModel = any;

// ─── Model Management ────────────────────────────────────────────────

let currentModelName = 'Xenova/all-MiniLM-L6-v2';

let embeddingPipeline: EmbeddingModel | null = null;
let modelStatus: LLMStatus = 'unloaded';
let modelProgress = 0;
let statusListeners: Array<(status: LLMStatus, progress: number) => void> = [];

export function getLLMStatus(): LLMStatus {
  return modelStatus;
}

export function getLLMProgress(): number {
  return modelProgress;
}

export function getCurrentModelName(): string {
  return currentModelName;
}

export function setCurrentModelName(name: string): void {
  currentModelName = name;
}

export function unloadModel(): void {
  embeddingPipeline = null;
  modelStatus = 'unloaded';
  modelProgress = 0;
  seedEmbeddingsCache.clear();
  setStatus('unloaded', 0);
}

export function onLLMStatusChange(
  listener: (status: LLMStatus, progress: number) => void,
): () => void {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

function setStatus(status: LLMStatus, progress: number = modelProgress): void {
  modelStatus = status;
  modelProgress = progress;
  statusListeners.forEach((l) => l(status, progress));
}

/**
 * Load the embedding model. Call once when the app starts.
 * The model is ~23MB quantized and will be cached by the browser.
 */
export async function loadModel(modelName?: string): Promise<void> {
  if (modelName) {
    currentModelName = modelName;
  }
  if (embeddingPipeline) return;
  if (modelStatus === 'loading') return;

  setStatus('loading', 0);

  try {
    const { pipeline, env } = await import('@xenova/transformers');

    // Configure for browser WASM (not Node.js native)
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    embeddingPipeline = await pipeline(
      'feature-extraction',
      currentModelName,
      {
        progress_callback: (progress: number) => {
          setStatus('loading', Math.round(progress * 100));
        },
      },
    );

    setStatus('ready', 100);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load AI model';
    setStatus('error', 0);
    // Allow fallback: set model to null but mark as ready for keyword matching
    console.error('LLM model load failed, using keyword fallback:', message);
    setStatus('ready', 100);
  }
}

/**
 * Ensure the embedding model is loaded. Call before any embedding operation.
 * Auto-loads the model if not already loaded.
 */
export async function ensureEmbeddingModel(): Promise<void> {
  if (embeddingPipeline) return;
  if (modelStatus === 'loading') return;
  if (modelStatus === 'ready') return;

  try {
    await loadModel();
  } catch {
    // Silently fail — keyword matching works as fallback
  }
}

// ─── Embedding Utilities ─────────────────────────────────────────────

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text: string): Promise<Float32Array | null> {
  await ensureEmbeddingModel();
  if (!embeddingPipeline) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await embeddingPipeline([text]);
    return result.data as Float32Array;
  } catch {
    return null;
  }
}

export async function getBatchEmbeddingsForTexts(texts: string[]): Promise<Array<Float32Array | null>> {
  await ensureEmbeddingModel();
  if (!embeddingPipeline || texts.length === 0) return texts.map(() => null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: any[] = await embeddingPipeline(texts, { pooling: 'mean', normalize: true });
    return results.map((r: any) => r?.data as Float32Array | null ?? null);
  } catch {
    return texts.map(() => null);
  }
}

/**
 * Public wrapper — compute embedding for arbitrary text.
 * Returns null if the model is not loaded.
 */
export async function getEmbeddingForText(text: string): Promise<Float32Array | null> {
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
    if (seedEmbeddingsCache.size >= MAX_SEED_EMBEDDINGS_CACHE) seedEmbeddingsCache.clear();
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
 */
export async function batchScoreTopicMatch(
  postTexts: string[],
  topic: Topic,
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

  // 3. Compute all post embeddings in one batch call
  let postEmbeddings: Array<Float32Array | null> = [];
  if (topicEmbedding) {
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

// ─── Semantic Moderation ─────────────────────────────────────────────

/**
 * Check if a post matches a semantic moderation rule.
 * Uses the LLM to determine if the post content violates the rule.
 */
export async function checkSemanticRule(
  postText: string,
  ruleDescription: string,
): Promise<boolean> {
  if (!embeddingPipeline) {
    // Fallback: basic keyword matching
    return keywordMatch(postText, ruleDescription);
  }

  const postEmbedding = await getEmbedding(postText);
  const ruleEmbedding = await getEmbedding(ruleDescription);

  if (!postEmbedding || !ruleEmbedding) {
    return keywordMatch(postText, ruleDescription);
  }

  const similarity = cosineSimilarity(postEmbedding, ruleEmbedding);
  return similarity > 0.6; // Threshold for semantic match
}

function keywordMatch(text: string, rule: string): boolean {
  const lower = text.toLowerCase();
  const words = rule.toLowerCase().split(/\s+/);
  return words.some((word) => lower.includes(word));
}

// ─── Feed Generator Matching ─────────────────────────────────────────

/**
 * Match feed generators to a topic using LLM semantic similarity.
 * Returns feeds that are relevant to the topic, sorted by relevance.
 */
export async function matchFeedsToTopic(
  feeds: FeedGenerator[],
  topic: Topic,
): Promise<FeedGenerator[]> {
  if (!embeddingPipeline || feeds.length === 0) {
    // No LLM available — do keyword matching as fallback
    return feeds.filter((f) => {
      const text = `${f.displayName} ${f.description || ''}`.toLowerCase();
      // Match against the topic name and seed terms as phrases rather than
      // splitting them into individual words. This prevents broad matches like
      // "open" or "source" for the "open source" topic.
      const topicWords = [...new Set([
        topic.name.toLowerCase(),
        ...topic.seedTerms.map((s) => s.toLowerCase()),
      ])];
      return topicWords.some((w) => w.length > 2 && text.includes(w));
    }).slice(0, 5);
  }

  const topicText = `${topic.name}. ${topic.description}. ${topic.seedTerms.join(' ')}`;
  const topicEmbedding = await getEmbedding(topicText);
  if (!topicEmbedding) return feeds.slice(0, 5);

  const scored = await Promise.all(
    feeds.map(async (f) => {
      const feedText = `${f.displayName}. ${f.description || ''}`;
      const feedEmbedding = await getEmbedding(feedText);
      if (!feedEmbedding) return { feed: f, score: 0 };

      const score = cosineSimilarity(topicEmbedding!, feedEmbedding);
      return { feed: f, score };
    }),
  );

  return scored
    .filter((s) => s.score > 0.15) // Minimum semantic relevance
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
]);

/**
 * Generate seed terms for a custom topic based on its name and description.
 * Uses semantic similarity to borrow relevant terms from default topics
 * if the LLM is available, then blends them with keyword extraction.
 * 
 * Borrowed terms are filtered to avoid overly broad category terms and
 * must be semantically related to the input topic.
 */
export async function generateSeedTerms(
  topicName: string,
  description: string,
  existingTopics: Topic[],
): Promise<string[]> {
  // 1. Try WebLLM first for high-quality, specific seed terms
  if (isWebLLMLoaded()) {
    const llmTerms = await generateSeedTermsWithLLM(topicName, description);
    if (llmTerms && llmTerms.length > 0) {
      return llmTerms.slice(0, 8);
    }
  }

  const normalizedName = topicName.toLowerCase().trim();

  // 2. Extract keywords from the user's input.
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

  // 4. If LLM is available, borrow relevant terms from similar default topics
  let borrowedTerms: string[] = [];
  if (embeddingPipeline && existingTopics.length > 0) {
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
        .slice(0, 2);

      for (const { topic } of similar) {
        for (const term of topic.seedTerms) {
          const termLower = term.toLowerCase();

          // Skip if already present
          if (inputTerms.includes(termLower)) continue;
          if (borrowedTerms.includes(termLower)) continue;

          // Skip overly broad category terms
          if (BROAD_CATEGORY_TERMS.has(termLower)) continue;

          // Only borrow if the term is actually semantically related to the input
          const termEmbedding = await getEmbedding(term);
          if (termEmbedding) {
            const similarity = cosineSimilarity(inputEmbedding, termEmbedding);
            if (similarity > 0.4) {
              borrowedTerms.push(termLower);
            }
          }
        }
      }
    }
  }

  // 5. Combine: input terms first, then borrowed, deduplicate, take top 8
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
