/**
 * Zero-shot sentiment / vibe classification using the EmbeddingGemma 2
 * embedding model.
 *
 * Posts and a small set of "vibe" anchor descriptions are embedded with the
 * classification prefix; the nearest anchor determines the sentiment and
 * supplies a short, general explanation. No generative model is involved.
 *
 * Anchor vectors are computed once and cached in memory. Sarcasm and other
 * figurative language remain hard for a single nearest-neighbour decision —
 * treat the result as a hint, not ground truth.
 */

import { embedForClassification, cosineSimilarity } from './embeddings';

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  sentiment: Sentiment;
  /** Short, general vibe descriptor (the nearest anchor's label). */
  explanation: string;
  /** Cosine similarity to the matched anchor. */
  score: number;
}

interface SentimentAnchor {
  sentiment: Sentiment;
  label: string;
  text: string;
}

const ANCHORS: SentimentAnchor[] = [
  { sentiment: 'positive', label: 'optimistic tech enthusiasm', text: 'optimistic excitement about technology and progress' },
  { sentiment: 'positive', label: 'cheerful life update', text: 'a happy, cheerful personal life update' },
  { sentiment: 'positive', label: 'warm appreciation', text: 'warm gratitude and appreciation' },
  { sentiment: 'negative', label: 'cynical political commentary', text: 'cynical angry political complaint' },
  { sentiment: 'negative', label: 'doom-scrolling anxiety', text: 'anxious doom and dread about the future' },
  { sentiment: 'negative', label: 'heated angry rant', text: 'a heated angry rant' },
  { sentiment: 'neutral', label: 'neutral news sharing', text: 'neutral sharing of a news item' },
  { sentiment: 'neutral', label: 'matter-of-fact update', text: 'a plain matter-of-fact status update' },
];

let anchorVectors: Float32Array[] | null = null;

async function getAnchorVectors(): Promise<Float32Array[] | null> {
  if (anchorVectors) return anchorVectors;
  const vectors = await embedForClassification(ANCHORS.map((a) => a.text));
  if (vectors.length !== ANCHORS.length || vectors.some((v) => !v)) {
    return null;
  }
  anchorVectors = vectors as Float32Array[];
  return anchorVectors;
}

/**
 * Classify the emotional tone of a post. Returns null when the embedding
 * model is unavailable or the text is empty.
 */
export async function analyzeSentiment(
  text: string,
): Promise<SentimentResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const [embedding] = await embedForClassification([trimmed.slice(0, 500)]);
  if (!embedding) return null;

  const anchors = await getAnchorVectors();
  if (!anchors) return null;

  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const score = cosineSimilarity(embedding, anchors[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const anchor = ANCHORS[bestIndex];
  return {
    sentiment: anchor.sentiment,
    explanation: anchor.label,
    score: bestScore,
  };
}
