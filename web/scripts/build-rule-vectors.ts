/**
 * Build-time / offline generator for the bundled predefined-rule vectors.
 *
 *   cd web && npx tsx scripts/build-rule-vectors.ts
 *
 * Runs EmbeddingGemma 2 on CPU, embeds every `PREDEFINED_RULES[].description`
 * with the classification prefix, truncates to the MRL dimension and
 * L2-normalises, then writes `src/lib/moderation/rule-vectors.json`.
 *
 * The output is committed, so client devices never embed rule text at runtime.
 * Re-run this whenever a rule description or the model/dimension changes.
 *
 * Not run during `npm run build` — the model download is large and the vectors
 * are deterministic, so they are generated on demand and checked in.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoConfig, AutoModel, AutoTokenizer } from '@huggingface/transformers';

import { PREDEFINED_RULES } from '../src/lib/moderation/rules';
import {
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIM,
  EMBEDDING_DTYPE,
  CLASSIFICATION_PREFIX,
} from '../src/lib/llm/embedding-config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/lib/moderation/rule-vectors.json');

function truncateAndNormalize(vec: Float32Array, dim: number): number[] {
  const out = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim && i < vec.length; i++) {
    out[i] = vec[i];
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm) || 1;
  // Round to 6 decimals — beyond float32 precision and keeps the file small.
  const rounded: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) rounded[i] = Number((out[i] / norm).toFixed(6));
  return rounded;
}

async function main() {
  console.log(`[rule-vectors] model=${EMBEDDING_MODEL_ID} dim=${EMBEDDING_DIM} dtype=${EMBEDDING_DTYPE}`);

  const config = await AutoConfig.from_pretrained(EMBEDDING_MODEL_ID);
  // Text-only: drop the vision/audio encoders so only the 270M text backbone loads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).vision_config = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).audio_config = null;

  const tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_MODEL_ID);
  const model = await AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
    config,
    device: 'cpu',
    dtype: EMBEDDING_DTYPE,
  });

  const inputs = PREDEFINED_RULES.map((r) => `${CLASSIFICATION_PREFIX}${r.description}`);
  const tokenized = await tokenizer(inputs, { padding: true, truncation: true });
  const { sentence_embedding } = await model(tokenized);
  const { data, dims } = sentence_embedding as { data: Float32Array; dims: number[] };
  const [n, nativeDim] = dims;

  if (n !== PREDEFINED_RULES.length) {
    throw new Error(`Expected ${PREDEFINED_RULES.length} embeddings, got ${n}`);
  }
  if (EMBEDDING_DIM > nativeDim) {
    throw new Error(`EMBEDDING_DIM (${EMBEDDING_DIM}) exceeds native dim (${nativeDim})`);
  }

  const vectors: Record<string, number[]> = {};
  for (let i = 0; i < n; i++) {
    const rule = PREDEFINED_RULES[i];
    const raw = data.subarray(i * nativeDim, i * nativeDim + nativeDim);
    vectors[rule.id] = truncateAndNormalize(raw, EMBEDDING_DIM);
  }

  const output = {
    model: EMBEDDING_MODEL_ID,
    dim: EMBEDDING_DIM,
    dtype: EMBEDDING_DTYPE,
    prefix: CLASSIFICATION_PREFIX,
    generatedAt: new Date().toISOString(),
    ruleCount: PREDEFINED_RULES.length,
    vectors,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`[rule-vectors] wrote ${PREDEFINED_RULES.length} vectors → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[rule-vectors] generation failed:', err);
  process.exit(1);
});
