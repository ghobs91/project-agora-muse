/**
 * Shared configuration for the in-browser EmbeddingGemma 2 runtime.
 *
 * Kept dependency-free so it can be imported both by browser code
 * (`lib/llm/embeddings.ts`) and by the offline rule-vector build script
 * (`scripts/build-rule-vectors.ts`) running in Node.
 */

/** Hugging Face repo for the Transformers.js export of Google's EmbeddingGemma 2. */
export const EMBEDDING_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';

/**
 * Output dimensionality after Matryoshka Representation Learning (MRL)
 * truncation. EmbeddingGemma 2 natively emits 768-d vectors and supports
 * truncation to 512/256/128. 256-d is close to lossless (see model card's
 * truncation table) while cutting vector storage ~3x.
 */
export const EMBEDDING_DIM = 256;

/**
 * Weight precision. q4 is the model card's browser recommendation for WebGPU:
 * ~175MB for the text backbone ("a sixth of the full-precision download").
 * On WASM the loader retries with q8 if q4 fails to initialise.
 */
export const EMBEDDING_DTYPE = 'q4';

/**
 * Task instruction prefixes. EmbeddingGemma 2 is trained with short prefixes;
 * omitting them still works but reduces precision. Classification is a
 * "symmetric" task, so the same prefix is used for both rules and content.
 *
 * Format: `task: classification | query: {content}`
 * (the spec's shorthand `task: classification | {content}` maps to this.)
 */
export const CLASSIFICATION_PREFIX = 'task: classification | query: ';

/** Symmetric prefix used for topic / sentence similarity comparisons. */
export const SIMILARITY_PREFIX = 'task: sentence similarity | query: ';

/** Prefix a piece of content with the classification task instruction. */
export function formatClassificationInput(text: string): string {
  return `${CLASSIFICATION_PREFIX}${text}`;
}

/** Prefix a piece of content with the sentence-similarity task instruction. */
export function formatSimilarityInput(text: string): string {
  return `${SIMILARITY_PREFIX}${text}`;
}
