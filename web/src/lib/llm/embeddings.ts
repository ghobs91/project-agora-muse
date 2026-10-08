/**
 * Shared in-browser EmbeddingGemma 2 runtime.
 *
 * Loads the text-only EmbeddingGemma 2 backbone via Transformers.js
 * (ONNX Runtime WebGPU, falling back to WASM), and exposes batched embedding
 * helpers that truncate to the Matryoshka dimension and re-normalise, so the
 * returned vectors can be compared with a plain dot product.
 *
 * Both the topic matcher and the moderation decision engine use this runtime;
 * anything that needs raw text embeddings should go through here.
 */

import type { LLMStatus } from '@/types';
import {
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIM,
  EMBEDDING_DTYPE,
  CLASSIFICATION_PREFIX,
  SIMILARITY_PREFIX,
} from './embedding-config';

// The Transformers.js model/tokenizer types are opaque; `any` is confined to
// this integration boundary (same convention as the old topic-matcher).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTokenizer = any;

export type EmbeddingDevice = 'webgpu' | 'wasm' | 'cpu';

let model: AnyModel | null = null;
let tokenizer: AnyTokenizer | null = null;
let status: LLMStatus = 'unloaded';
let progress = 0;
let device: EmbeddingDevice = 'wasm';
let listeners: Array<(status: LLMStatus, progress: number) => void> = [];

export function getEmbeddingStatus(): LLMStatus {
  return status;
}

export function getEmbeddingProgress(): number {
  return progress;
}

export function getEmbeddingDevice(): EmbeddingDevice {
  return device;
}

export function isEmbeddingModelLoaded(): boolean {
  return status === 'ready' && model !== null && tokenizer !== null;
}

export function onEmbeddingStatusChange(
  listener: (status: LLMStatus, progress: number) => void,
): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function setStatus(next: LLMStatus, nextProgress: number = progress): void {
  status = next;
  progress = nextProgress;
  listeners.forEach((l) => l(status, progress));
}

function isWebGPUSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}

/** Device preference order. WebGPU when available, else WASM. */
function deviceAttempts(): EmbeddingDevice[] {
  return isWebGPUSupported() ? ['webgpu', 'wasm'] : ['wasm'];
}

export function unloadEmbeddingModel(): void {
  model = null;
  tokenizer = null;
  setStatus('unloaded', 0);
}

/**
 * Load the embedding model. Safe to call repeatedly; concurrent callers share
 * the single in-flight attempt. Tries WebGPU first, then falls back to WASM.
 * Throws only when every device fails (callers degrade to keyword matching).
 */
let inFlight: Promise<void> | null = null;

export function loadEmbeddingModel(): Promise<void> {
  if (isEmbeddingModelLoaded()) return Promise.resolve();
  if (inFlight) return inFlight;

  setStatus('loading', 0);

  inFlight = (async () => {
    const { AutoConfig, AutoModel, AutoTokenizer, env } = await import(
      '@huggingface/transformers'
    );

    // Match the previous runtime's conservative browser config: never look
    // for local model files, use the HTTP cache, and keep ONNX WASM to a
    // single thread so it doesn't compete with rendering on the WASM path.
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }

    let lastError: unknown = null;
    for (const candidate of deviceAttempts()) {
      try {
        const config = await AutoConfig.from_pretrained(EMBEDDING_MODEL_ID);
        // Text-only: strip the vision/audio encoders so only the 270M text
        // backbone is downloaded/loaded (~175MB at q4) instead of the full
        // 740M multimodal model.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config as any).vision_config = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (config as any).audio_config = null;

        const onProgress = (p: unknown) => {
          const pct = Math.round(
            ((p as { progress?: number } | null)?.progress ?? 0) * 100,
          );
          setStatus('loading', Math.min(99, Math.max(0, pct)));
        };

        const [tok, mdl] = await Promise.all([
          AutoTokenizer.from_pretrained(EMBEDDING_MODEL_ID, {
            progress_callback: onProgress,
          }),
          AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
            config,
            device: candidate,
            dtype: EMBEDDING_DTYPE,
            progress_callback: onProgress,
          }),
        ]);

        tokenizer = tok;
        model = mdl;
        device = candidate;
        setStatus('ready', 100);
        return;
      } catch (err) {
        lastError = err;
        console.warn(
          `[EmbeddingGemma2] failed to initialise on ${candidate}:`,
          err,
        );
      }
    }

    setStatus('error', 0);
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to load EmbeddingGemma 2');
  })();

  // Reset the in-flight latch so a failed load can be retried.
  inFlight.catch(() => {}).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Auto-load the model if it is not already ready. Never throws. */
export async function ensureEmbeddingModel(): Promise<void> {
  if (isEmbeddingModelLoaded()) return;
  // After a hard failure, require an explicit loadEmbeddingModel() retry
  // (e.g. the UI "Retry" button) instead of re-downloading on every call.
  if (status === 'error') return;
  if (status === 'loading') {
    // Wait out any in-flight attempt rather than starting a second one.
    try {
      await inFlight;
    } catch {
      /* handled below */
    }
    return;
  }
  try {
    await loadEmbeddingModel();
  } catch {
    // Callers fall back to keyword matching.
  }
}

// ─── Embedding primitives ────────────────────────────────────────────

/**
 * Truncate a native (768-d) embedding to `dim` leading dimensions and
 * L2-normalise the result. Truncation does not preserve unit length, so the
 * re-normalisation step is required for dot-product == cosine similarity.
 */
export function truncateAndNormalize(
  vec: Float32Array,
  dim: number = EMBEDDING_DIM,
): Float32Array {
  const out = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim && i < vec.length; i++) {
    out[i] = vec[i];
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) out[i] /= norm;
  return out;
}

/** Batched embedding with a pre-formatted prefix. Returns one entry per input. */
async function embedWithPrefix(
  texts: string[],
  prefix: string,
): Promise<Array<Float32Array | null>> {
  if (texts.length === 0) return [];
  await ensureEmbeddingModel();
  if (!model || !tokenizer) return texts.map(() => null);

  try {
    const inputs = texts.map((t) => prefix + t);
    const tokenized = await tokenizer(inputs, {
      padding: true,
      truncation: true,
    });
    const output = await model(tokenized);
    // The model mean-pools and projects to `sentence_embedding`.
    const tensor = output.sentence_embedding as {
      data: Float32Array;
      dims: number[];
    };
    const [n, nativeDim] = tensor.dims;
    const results: Array<Float32Array | null> = new Array(texts.length).fill(null);
    for (let i = 0; i < n && i < texts.length; i++) {
      const raw = tensor.data.subarray(i * nativeDim, i * nativeDim + nativeDim);
      results[i] = truncateAndNormalize(raw);
    }
    return results;
  } catch (err) {
    console.warn('[EmbeddingGemma2] embed failed:', err);
    return texts.map(() => null);
  }
}

/** Embed content for classification / moderation decisions. */
export function embedForClassification(
  texts: string[],
): Promise<Array<Float32Array | null>> {
  return embedWithPrefix(texts, CLASSIFICATION_PREFIX);
}

/** Embed content for sentence/topic similarity. */
export function embedForSimilarity(
  texts: string[],
): Promise<Array<Float32Array | null>> {
  return embedWithPrefix(texts, SIMILARITY_PREFIX);
}

/** Convenience single-text variant of {@link embedForSimilarity}. */
export async function embedTextForSimilarity(
  text: string,
): Promise<Float32Array | null> {
  const [embedding] = await embedForSimilarity([text]);
  return embedding ?? null;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Chunked batched embedding. A single large ONNX call blocks the main thread
 * for seconds; chunking turns that into short bursts the browser can paint
 * between, keeping scroll/input responsive.
 */
async function embedChunked(
  texts: string[],
  prefix: string,
  chunkSize: number,
): Promise<Array<Float32Array | null>> {
  const results: Array<Float32Array | null> = new Array(texts.length).fill(null);
  for (let start = 0; start < texts.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, texts.length);
    const chunk = await embedWithPrefix(texts.slice(start, end), prefix);
    for (let i = 0; i < chunk.length; i++) results[start + i] = chunk[i];
    if (end < texts.length) await yieldToEventLoop();
  }
  return results;
}

export function embedForSimilarityChunked(
  texts: string[],
  chunkSize = 32,
): Promise<Array<Float32Array | null>> {
  return embedChunked(texts, SIMILARITY_PREFIX, chunkSize);
}

/** Cosine similarity. Embeddings are L2-normalised, so this is a dot product. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}
