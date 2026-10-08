/**
 * Calibration harness for the bundled moderation rule vectors.
 *
 *   cd web && npx tsx scripts/verify-rule-vectors.ts
 *
 * Embeds a small labelled probe set with the same model / prefix / dimension
 * used by `build-rule-vectors.ts`, then reports which rules flag each post
 * under the thresholds in `rules.ts`. Use it when tuning thresholds: neutral
 * rows should show `flagged=[]`, and each adversarial row should name its
 * target rule. Requires the model (downloads once, CPU).
 */
import { AutoConfig, AutoModel, AutoTokenizer } from '@huggingface/transformers';
import { PREDEFINED_RULES, getRuleThreshold } from '../src/lib/moderation/rules';
import {
  EMBEDDING_MODEL_ID,
  EMBEDDING_DIM,
  CLASSIFICATION_PREFIX,
} from '../src/lib/llm/embedding-config';
import vectors from '../src/lib/moderation/rule-vectors.json';

const posts: Record<string, string> = {
  neutral_food: 'Made a lovely sourdough loaf today, the crust turned out perfect.',
  neutral_tech: 'Just shipped a new release of my open source CLI tool, feedback welcome.',
  ragebait: 'Unbelievable that these people are allowed to ruin everything for hardworking families. Wake up!!',
  slur: 'Those people are all subhuman vermin and should be driven out of our country.',
  idpol: 'Men and women can never understand each other, it is always a war between the sexes.',
  spam: 'Get 5000 real followers fast! Click the link in my bio for instant results, limited offer!!!',
  crypto: 'Join my pump group, this token is going 100x next week, guaranteed returns, DM me to ape in!',
  harassment: 'You are a pathetic loser and I know where you live, I will make your life hell.',
  disinfo: 'The government is hiding the truth, vaccines are a secret depopulation plot by the elites.',
  violence: 'The video shows them beating him to a bloody pulp, guts and blood everywhere.',
  fitness: 'Morning run done, 10k in under an hour. Feeling great and ready for the day.',
};

async function main() {
  const config = await AutoConfig.from_pretrained(EMBEDDING_MODEL_ID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).vision_config = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).audio_config = null;
  const tokenizer = await AutoTokenizer.from_pretrained(EMBEDDING_MODEL_ID);
  const model = await AutoModel.from_pretrained(EMBEDDING_MODEL_ID, {
    config,
    device: 'cpu',
    dtype: 'q4',
  });

  const ruleVecs = PREDEFINED_RULES.map((r) => ({
    id: r.id,
    threshold: getRuleThreshold(r),
    vec: Float32Array.from((vectors.vectors as Record<string, number[]>)[r.id]),
  }));

  const inputs = await tokenizer(
    Object.values(posts).map((t) => CLASSIFICATION_PREFIX + t),
    { padding: true, truncation: true },
  );
  const out = await model(inputs);
  const { data, dims } = out.sentence_embedding as {
    data: Float32Array;
    dims: number[];
  };
  const [n, d] = dims;

  const trunc = (vec: Float32Array) => {
    const o = new Float32Array(EMBEDDING_DIM);
    let norm = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      o[i] = vec[i];
      norm += o[i] * o[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < EMBEDDING_DIM; i++) o[i] /= norm;
    return o;
  };
  const dot = (a: Float32Array, b: Float32Array) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  };

  const postIds = Object.keys(posts);
  for (let i = 0; i < n; i++) {
    const emb = trunc(data.subarray(i * d, i * d + d));
    const flags = ruleVecs
      .map((r) => ({ id: r.id, score: dot(emb, r.vec), threshold: r.threshold }))
      .filter((r) => r.score >= r.threshold)
      .sort((a, b) => b.score - a.score);
    const top = ruleVecs
      .map((r) => ({ id: r.id, score: dot(emb, r.vec) }))
      .sort((a, b) => b.score - a.score)[0];
    console.log(
      postIds[i].padEnd(14),
      'top=' + top.id.padEnd(18),
      'flagged=[' +
        flags.map((f) => `${f.id}:${f.score.toFixed(3)}/${f.threshold}`).join(', ') +
        ']',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
