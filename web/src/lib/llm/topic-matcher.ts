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

// ─── Types ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmbeddingModel = any;

// ─── Model Management ────────────────────────────────────────────────

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

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
export async function loadModel(): Promise<void> {
  if (embeddingPipeline) return;
  if (modelStatus === 'loading') return;

  setStatus('loading', 0);

  try {
    const { pipeline, env } = await import('@xenova/transformers');

    // Configure for browser WASM (not Node.js native)
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // Explicitly configure the ONNX WASM backend to prevent the library
    // from trying to load onnxruntime-node (which is excluded from bundle)
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.proxy = false;
    }

    embeddingPipeline = await pipeline(
      'feature-extraction',
      MODEL_NAME,
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

// ─── Embedding Utilities ─────────────────────────────────────────────

/**
 * Compute cosine similarity between two embeddings.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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
  if (!embeddingPipeline) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await embeddingPipeline([text]);
    return result.data as Float32Array;
  } catch {
    return null;
  }
}

// ─── Seed Terms (Embeddings for topic seed terms) ────────────────────

const seedEmbeddingsCache = new Map<string, Float32Array>();

async function getSeedTermEmbedding(term: string): Promise<Float32Array | null> {
  const cached = seedEmbeddingsCache.get(term);
  if (cached) return cached;

  const embedding = await getEmbedding(term);
  if (embedding) {
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
 * Simple keyword-based matching as a baseline.
 */
function keywordMatchScore(postText: string, topic: Topic): number {
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
      const topicText = `${topic.name} ${topic.description} ${topic.seedTerms.join(' ')}`.toLowerCase();
      // Simple keyword overlap
      const topicWords = topicText.split(/\s+/);
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

/**
 * Generate seed terms for a custom topic based on its name and description.
 * Uses semantic similarity to borrow relevant terms from default topics
 * if the LLM is available, then blends them with keyword extraction.
 */
export async function generateSeedTerms(
  topicName: string,
  description: string,
  existingTopics: Topic[],
): Promise<string[]> {
  // 1. Extract keywords from the user's input
  const rawWords = `${topicName} ${description}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const inputTerms = [...new Set(rawWords)];

  // 2. If LLM is available, find semantically similar default topics
  let borrowedTerms: string[] = [];
  if (embeddingPipeline && existingTopics.length > 0) {
    const inputEmbedding = await getEmbedding(
      `${topicName}. ${description}`,
    );
    if (inputEmbedding) {
      const scored = await Promise.all(
        existingTopics
          .filter((t) => !t.isCustom)
          .map(async (t) => {
            const topicText = `${t.name}. ${t.description}`;
            const topicEmbedding = await getEmbedding(topicText);
            if (!topicEmbedding) return { topic: t, score: 0 };
            return {
              topic: t,
              score: cosineSimilarity(inputEmbedding!, topicEmbedding),
            };
          }),
      );

      const similar = scored
        .filter((s) => s.score > 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      for (const { topic } of similar) {
        for (const term of topic.seedTerms) {
          if (
            !inputTerms.includes(term.toLowerCase()) &&
            !borrowedTerms.includes(term.toLowerCase())
          ) {
            borrowedTerms.push(term);
          }
        }
      }
    }
  }

  // 3. Combine: input terms first, then borrowed, deduplicate, take top 8
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
