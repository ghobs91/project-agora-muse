/**
 * Zero-shot vector decision engine for content moderation.
 *
 * Decisions are a batch dot product between a post embedding and the active
 * rule vectors, compared against per-category calibrated thresholds. Rule
 * vectors for predefined categories are precomputed at build time and bundled
 * here; user-authored rules are embedded once at runtime and cached.
 *
 * No generative model and no per-item token generation is involved.
 */

import type { ModerationRuleRecord } from '@/types';
import {
  PREDEFINED_RULES,
  getPredefinedRule,
  getRuleThreshold,
  CUSTOM_RULE_THRESHOLD,
} from './rules';
import { embedForClassification } from '@/lib/llm/embeddings';
import { EMBEDDING_DIM } from '@/lib/llm/embedding-config';
import ruleVectorsFile from './rule-vectors.json';

export interface ActiveRule {
  id: string;
  label: string;
  threshold: number;
  vector: Float32Array;
  source: 'predefined' | 'custom';
}

export interface RuleMatch {
  ruleId: string;
  label: string;
  score: number;
  threshold: number;
}

interface RuleVectorsFile {
  model: string;
  dim: number;
  dtype: string;
  prefix: string;
  generatedAt: string;
  ruleCount: number;
  vectors: Record<string, number[]>;
}

const BUNDLED = ruleVectorsFile as RuleVectorsFile;

/** Precomputed rule vectors, parsed once at module load. */
const BUNDLED_VECTORS: Record<string, Float32Array> = Object.fromEntries(
  Object.entries(BUNDLED.vectors).map(([id, vec]) => [id, Float32Array.from(vec)]),
);

if (BUNDLED.dim !== EMBEDDING_DIM) {
  // Fail loudly in dev rather than silently mixing dimensions.
  console.error(
    `[moderation] bundled rule vectors are ${BUNDLED.dim}d but the runtime embeds ${EMBEDDING_DIM}d`,
  );
}

/** Rule IDs that have a bundled precomputed vector. */
export function getBundledRuleIds(): string[] {
  return PREDEFINED_RULES.filter((r) => BUNDLED_VECTORS[r.id]).map((r) => r.id);
}

/**
 * Build the active rule matrix from the user's enabled predefined filters.
 * Pure in-memory: swapping rules never runs model inference.
 */
export function buildPredefinedRules(enabledRuleIds: string[]): ActiveRule[] {
  const enabled = new Set(enabledRuleIds);
  const rules: ActiveRule[] = [];
  for (const rule of PREDEFINED_RULES) {
    if (!enabled.has(rule.id)) continue;
    const vector = BUNDLED_VECTORS[rule.id];
    if (!vector) continue;
    rules.push({
      id: rule.id,
      label: rule.label,
      threshold: getRuleThreshold(rule),
      vector,
      source: 'predefined',
    });
  }
  return rules;
}

// ─── Custom (user-authored) rules ────────────────────────────────────

const customRuleCache = new Map<string, Float32Array>();

function getCustomRuleVector(text: string): Float32Array | null {
  return customRuleCache.get(text) ?? null;
}

/**
 * Embed user-authored rule text once and cache it. Returns only the rules
 * whose embedding succeeded. Custom rules are the one path that still embeds
 * rule text at runtime, because they are not known at build time.
 */
export async function buildCustomRules(
  rules: Pick<ModerationRuleRecord, 'id' | 'value'>[],
): Promise<ActiveRule[]> {
  if (rules.length === 0) return [];

  const missing = rules.filter((r) => !getCustomRuleVector(r.value));
  if (missing.length > 0) {
    const embeddings = await embedForClassification(missing.map((r) => r.value));
    for (let i = 0; i < missing.length; i++) {
      const embedding = embeddings[i];
      if (embedding) customRuleCache.set(missing[i].value, embedding);
    }
  }

  const active: ActiveRule[] = [];
  for (const rule of rules) {
    const vector = getCustomRuleVector(rule.value);
    if (!vector) continue;
    active.push({
      id: rule.id,
      label: rule.value,
      threshold: CUSTOM_RULE_THRESHOLD,
      vector,
      source: 'custom',
    });
  }
  return active;
}

// ─── Classification ──────────────────────────────────────────────────

/**
 * Score one post embedding against the active rules.
 * Returns every rule whose calibrated threshold the post meets/exceeds.
 */
export function classifyEmbedding(
  embedding: Float32Array,
  activeRules: ActiveRule[],
): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of activeRules) {
    const score = dot(embedding, rule.vector);
    if (score >= rule.threshold) {
      matches.push({
        ruleId: rule.id,
        label: rule.label,
        score,
        threshold: rule.threshold,
      });
    }
  }
  return matches;
}

/** Dot product of two L2-normalised vectors == cosine similarity. */
function dot(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}
