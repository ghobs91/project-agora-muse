/**
 * Static catalog of predefined moderation filter categories.
 *
 * Each rule has a label-style `description` that is embedded offline with the
 * EmbeddingGemma 2 classification prefix (`task: classification | query: …`)
 * and shipped as a bundled vector in `rule-vectors.json`. Nothing here is
 * embedded at runtime, so toggling a rule only swaps rows in the active rule
 * matrix — no model inference required.
 *
 * The `description` strings are the exact text that was embedded to build the
 * bundled vectors; changing one requires re-running
 * `npx tsx scripts/build-rule-vectors.ts`.
 */

export type ModerationCategory =
  | 'harassment'
  | 'hate'
  | 'deception'
  | 'spam'
  | 'violence'
  | 'quality'
  | 'politics';

/**
 * Per-category default cosine-similarity decision boundaries.
 *
 * These are *calibrated*, not universal: EmbeddingGemma 2's classification
 * similarity space is compressed (unrelated text commonly sits around
 * 0.60–0.72), so a single global threshold is unusable. Values below were
 * derived from a small labelled probe set on the q4 text model and are
 * intentionally conservative for strict categories (hate/violence) and looser
 * for subjective ones. Re-tune against real traffic before trusting them.
 *
 * Vectors are L2-normalised, so cosine similarity == dot product.
 */
export const CATEGORY_THRESHOLDS: Record<ModerationCategory, number> = {
  hate: 0.74,
  harassment: 0.72,
  deception: 0.7,
  spam: 0.7,
  violence: 0.78,
  quality: 0.75,
  politics: 0.74,
};

/** Default threshold used for user-authored (runtime-embedded) rules. */
export const CUSTOM_RULE_THRESHOLD = 0.7;

export interface PredefinedRule {
  id: string;
  label: string;
  /** The exact text embedded offline. Label-style prose, not a keyword list. */
  description: string;
  category: ModerationCategory;
  /** Optional per-rule override of the category default. */
  threshold?: number;
}

export const PREDEFINED_RULES: PredefinedRule[] = [
  {
    id: 'ragebait',
    label: 'Ragebait',
    description: 'ragebait content that deliberately provokes outrage or anger',
    category: 'quality',
    threshold: 0.75,
  },
  {
    id: 'slurs',
    label: 'Slurs',
    description:
      'hate speech, slurs, or dehumanizing language targeting a group',
    category: 'hate',
    threshold: 0.735,
  },
  {
    id: 'identity_politics',
    label: 'Identity Politics',
    description:
      'tribal identity politics and us-versus-them political arguments',
    category: 'politics',
    threshold: 0.74,
  },
  {
    id: 'spam',
    label: 'Spam',
    description: 'spam, scams, or unsolicited commercial promotion',
    category: 'spam',
    threshold: 0.7,
  },
  {
    id: 'crypto_scams',
    label: 'Crypto Scams',
    description: 'cryptocurrency scams, pump-and-dump or NFT shilling',
    category: 'spam',
    threshold: 0.69,
  },
  {
    id: 'harassment',
    label: 'Harassment',
    description: 'harassment, doxxing, or targeted personal attacks on someone',
    category: 'harassment',
    // Calibration note: ragebait-style posts score as high on this rule as
    // genuine harassment does. Keeping the boundary at the category default
    // means ragebait can be caught by this rule too — acceptable, since both
    // are unwanted, but it makes this rule less precise than the others.
    // 0.68 is deliberately just below the ragebait cluster so genuine
    // targeted attacks are still caught.
    threshold: 0.68,
  },
  {
    id: 'disinformation',
    label: 'Disinformation',
    description: 'conspiracy theories, disinformation, or fake news',
    category: 'deception',
    threshold: 0.7,
  },
  {
    id: 'violence',
    label: 'Violence',
    description: 'excessively graphic violence, gore, or bloodshed',
    category: 'violence',
    threshold: 0.78,
  },
];

/** Effective decision boundary for a rule (per-rule override → category default). */
export function getRuleThreshold(rule: PredefinedRule): number {
  return rule.threshold ?? CATEGORY_THRESHOLDS[rule.category];
}

const RULES_BY_ID = new Map(PREDEFINED_RULES.map((r) => [r.id, r]));

export function getPredefinedRule(id: string): PredefinedRule | undefined {
  return RULES_BY_ID.get(id);
}
