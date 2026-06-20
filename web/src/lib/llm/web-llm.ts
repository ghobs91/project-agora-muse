/**
 * WebLLM integration for in-browser LLM inference.
 *
 * Uses @mlc-ai/web-llm with WebGPU to run models for seed term
 * generation and language detection. Model auto-selected by device:
 * - Desktop:       Gemma 2 2B  (~1.9GB)
 * - Phone/tablet:  Gemma 3 1B  (~0.7GB)
 * - Low-RAM phone: SmolLM2 360M (~0.4GB)
 *
 * The embedding model (all-MiniLM-L6-v2) remains loaded
 * separately for fast real-time topic matching.
 */

import type { LLMStatus } from '@/types';

// ─── State ─────────────────────────────────────────────────────────────

let engine: any | null = null;
let webLLMStatus: LLMStatus = 'unloaded';
let webLLMProgress = 0;
let webLLMListeners: Array<(status: LLMStatus, progress: number) => void> = [];
let currentWebLLMModel = 'gemma-2-2b-it-q4f16_1-MLC';

// ─── Device Detection ──────────────────────────────────────────────────

/**
 * Check if the browser supports WebGPU.
 * iOS 26+ Safari and all recent Chromium browsers support WebGPU.
 * iOS < 26 has WebGPU disabled with no way to enable it.
 */
export function isWebGPUSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}

/**
 * Detect mobile devices (phones and tablets) regardless of OS.
 * Used to select a smaller default model that fits within mobile memory limits.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone/i.test(ua);
  const hasTouch = navigator.maxTouchPoints > 1;
  return isMobileUA || hasTouch;
}

/**
 * Detect devices with low RAM (4GB or less).
 * Uses navigator.deviceMemory when available (Chromium-based browsers).
 * Falls back to false when unavailable (Safari, Firefox) — those devices
 * get the mid-tier model by default.
 */
export function isLowMemoryDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const dm = (navigator as any).deviceMemory;
  if (dm === undefined) return false;
  return dm <= 4;
}

/**
 * Pick the best WebLLM model for the current device.
 * - Desktop / laptop:     Gemma 2 2B   (~1.9GB) — best quality
 * - Phone / tablet:        Gemma 3 1B   (~0.7GB) — fits mobile memory
 * - Low-RAM phone (<=4GB): SmolLM2 360M (~0.4GB) — ultra-light
 */
export function getDefaultModelForDevice(): string {
  if (!isMobileDevice()) {
    return 'gemma-2-2b-it-q4f16_1-MLC';
  }
  if (isLowMemoryDevice()) {
    return 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  }
  return 'gemma3-1b-it-q4f16_1-MLC';
}

// ─── Status Management ─────────────────────────────────────────────────

export function getWebLLMStatus(): LLMStatus {
  return webLLMStatus;
}

export function getWebLLMProgress(): number {
  return webLLMProgress;
}

export function getCurrentWebLLMModel(): string {
  return currentWebLLMModel;
}

export function onWebLLMStatusChange(
  listener: (status: LLMStatus, progress: number) => void,
): () => void {
  webLLMListeners.push(listener);
  return () => {
    webLLMListeners = webLLMListeners.filter((l) => l !== listener);
  };
}

function setWebLLMStatus(status: LLMStatus, progress: number = webLLMProgress): void {
  webLLMStatus = status;
  webLLMProgress = progress;
  webLLMListeners.forEach((l) => l(status, progress));
}

// ─── Model Loading ───────────────────────────────────────────────────

/**
 * Load a WebLLM model via MLC Engine.
 * @param modelId WebLLM model ID (e.g., "gemma-2-2b-it-q4f16_1-MLC")
 */
export async function loadWebLLM(modelId: string = 'gemma-2-2b-it-q4f16_1-MLC'): Promise<void> {
  if (engine) return;
  if (webLLMStatus === 'loading') return;

  if (!isWebGPUSupported()) {
    const message =
      'WebLLM requires WebGPU, which is not supported in this browser.';
    console.warn('[WebLLM]', message);
    setWebLLMStatus('error', 0);
    throw new Error(message);
  }

  currentWebLLMModel = modelId;
  setWebLLMStatus('loading', 0);

  try {
    const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');

    const appConfig = {
      ...prebuiltAppConfig,
      model_list: prebuiltAppConfig.model_list.map((record) =>
          record.model_id === modelId
          ? { ...record, overrides: { ...record.overrides, context_window_size: -1, attention_sink_size: 0 } }
          : record,
      ),
    };

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        setWebLLMStatus('loading', Math.round(progress.progress * 100));
      },
      appConfig,
    });

    setWebLLMStatus('ready', 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load WebLLM model';
    console.error('WebLLM load failed:', message);
    setWebLLMStatus('error', 0);
    throw error;
  }
}

/**
 * Unload the WebLLM engine and free GPU memory.
 */
export function unloadWebLLM(): void {
  engine = null;
  webLLMStatus = 'unloaded';
  webLLMProgress = 0;
  setWebLLMStatus('unloaded', 0);
}

export function isWebLLMLoaded(): boolean {
  return webLLMStatus === 'ready' && engine !== null;
}

// ─── Language Detection ──────────────────────────────────────────────────

const LANG_CODE_TO_NAME: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  es: 'Spanish',
  pt: 'Portuguese',
  de: 'German',
  fr: 'French',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
};

/**
 * Use the WebLLM to detect whether each text in a batch is primarily in the
 * target language. Returns a boolean array (true = matches target language).
 *
 * Batches texts into a single LLM call for efficiency.  Falls back to passing
 * all texts if the engine is not loaded or inference fails.
 *
 * @param texts  Post texts to check (max ~20 per batch recommended)
 * @param targetLang  ISO 639-1 language code (e.g. 'en', 'ja')
 * @returns boolean array parallel to `texts`
 */
export async function detectLanguageInBatch(
  texts: string[],
  targetLang: string,
): Promise<boolean[]> {
  if (!engine || webLLMStatus !== 'ready') return texts.map(() => true);

  const languageName = LANG_CODE_TO_NAME[targetLang];
  if (!languageName) return texts.map(() => true); // unknown language code — don't filter

  // Limit batch size to keep inference time reasonable
  const MAX_BATCH = 20;
  const results: boolean[] = new Array(texts.length).fill(true);

  for (let offset = 0; offset < texts.length; offset += MAX_BATCH) {
    const batch = texts.slice(offset, offset + MAX_BATCH);
    const items = batch
      .map((t, i) => `${i + 1}: "${t.slice(0, 280)}"`)
      .join('\n');

    const prompt = `For each text below, reply with just "yes" if it is primarily written in ${languageName}, or "no" if it is not. Reply for each text on a separate line in the same order. Do not add any extra commentary.

${items}`;

    try {
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 80,
      });

      const content: string = reply.choices[0]?.message?.content ?? '';
      const lines = content
        .split('\n')
        .map((l: string) => l.trim().toLowerCase())
        .filter((l: string) => l.length > 0);

      for (let i = 0; i < batch.length; i++) {
        const line = lines[i] ?? '';
        // Accept explicit "no" or "non" — anything else defaults to pass (yes)
        const isNo = line.startsWith('no') || line === 'non';
        results[offset + i] = !isNo;
      }
    } catch (error) {
      console.error('[WebLLM] Language detection failed for batch:', error);
      // Leave results as true for this batch (pass-through)
    }
  }

  return results;
}

// ─── Inference Utilities ───────────────────────────────────────────────

/**
 * Generate seed terms for a custom topic using the LLM.
 * Returns null if the engine is not loaded or inference fails.
 */
export async function generateSeedTermsWithLLM(
  topicName: string,
  description: string,
): Promise<string[] | null> {
  if (!engine || webLLMStatus !== 'ready') return null;

  const prompt = `Generate 5-8 specific, relevant search terms for a topic called "${topicName}".
${description ? `Description: ${description}` : ''}

Rules:
- Terms must be specific and relevant to this exact topic
- Keep meaningful multi-word phrases together (e.g. "open source", "machine learning")
- Avoid generic, broad terms like "technology", "software", "tech", "news", "media", "general", "culture", "discussion", "world"
- Return ONLY a comma-separated list of lowercase terms, no other text
- Example for "Android": "android, google pixel, aosp, apk, mobile os, android studio, smartphone, google play"
- Example for "Sailing": "sailing, yacht, sailboat, regatta, wind, navigation, knots, offshore"
- Example for "Open Source": "open source, github, foss, open source software, gpl, mit license, source code`;

  try {
    const reply = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 100,
    });

    const content = reply.choices[0].message.content;
    return content
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length > 0 && t.length < 30);
  } catch (error) {
    console.error('WebLLM seed term generation failed:', error);
    return null;
  }
}

// ─── Skyfeed Regex Generation ─────────────────────────────────────────

/**
 * Generate a Skyfeed Builder regex pattern for a topic using the LLM.
 *
 * The pattern uses word boundaries (\\b) and alternation (|) so the
 * Skyfeed query-engine (Rust regex crate) can match posts about the topic
 * across text, alt text, and links.
 *
 * Returns null if the engine is not loaded or inference fails. The caller
 * should fall back to `buildFallbackRegex` from `skyfeed/builder.ts`.
 *
 * @param topicName  Display name of the topic (e.g. "Sailing")
 * @param description  Optional topic description
 * @param seedTerms  AI-generated seed terms for the topic
 * @returns a regex string (e.g. "\\b(sailing|sailboat|yacht|regatta)\\b") or null
 */
export async function generateSkyfeedRegexWithLLM(
  topicName: string,
  description: string,
  seedTerms: string[],
): Promise<string | null> {
  if (!engine || webLLMStatus !== 'ready') return null;

  const termsList = seedTerms.length > 0 ? seedTerms.join(', ') : topicName;

  const prompt = `You are designing a Bluesky feed regex filter for the topic "${topicName}".
${description ? `Description: ${description}` : ''}
Candidate terms: ${termsList}

Produce a SINGLE regex pattern that matches social media posts about this topic.
Rules:
- Use word boundaries: \\b on both sides of each alternation group
- Use alternation (|) to combine terms into one group: \\b(term1|term2|term3)\\b
- Include relevant morphological variants (e.g. "sail", "sailing", "sails")
- Escape regex special characters in terms (e.g. C++, .NET)
- Keep the pattern concise and specific — avoid overly broad words
- Do NOT use lookbehind/lookahead; the Rust regex crate does not support them
- Return ONLY the regex pattern, no explanation, no code fences
- Example for "Sailing": \\b(sailing|sailboat|yacht|regatta|sail|racing)\\b
- Example for "C++": \\b(c\\+\\+|cpp|stl|boost)\\b`;

  try {
    const reply = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 150,
    });

    const content: string = (reply.choices[0]?.message?.content ?? '').trim();

    // Strip accidental code fences or surrounding slashes
    const cleaned = content
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/\n?```$/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .trim();

    if (!cleaned) return null;

    // Validate that it compiles as a regex. We use the JS engine for a
    // syntax check; the Rust regex crate is a subset of JS regex, so a
    // passing JS compile is a necessary (not sufficient) sanity check.
    // Strip the (?i) prefix if present (case-insensitivity is handled by
    // the query-engine via the caseSensitive:false flag instead).
    const testPattern = cleaned.replace(/^\(\?i\)/, '');
    try {
      // eslint-disable-next-line no-new
      new RegExp(testPattern);
    } catch {
      console.warn('[WebLLM] Generated regex failed validation:', cleaned);
      return null;
    }

    return cleaned;
  } catch (error) {
    console.error('WebLLM skyfeed regex generation failed:', error);
    return null;
  }
}

// ─── Sentiment Analysis ──────────────────────────────────────────────

export async function analyzeSentiment(
  text: string,
): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; explanation: string } | null> {
  if (!engine || webLLMStatus !== 'ready') return null;

  const truncated = text.length > 500 ? text.slice(0, 500) : text;

  const systemPrompt = `You classify the general emotional tone (vibe) of social media posts.

Rules:
- The SENTIMENT must be exactly one of: positive, negative, neutral.
- The EXPLANATION must be a SHORT, GENERAL vibe descriptor (3-6 words), NOT a summary of the specific post.
- Do NOT quote the post, name specific people, places, events, or describe the specific topic.
- Use broad labels that could describe many similar posts, e.g.:
  - "cynical political commentary"
  - "optimistic tech enthusiasm"
  - "doom-scrolling anxiety"
  - "cheerful life update"
  - "heated gaming debate"
  - "neutral news sharing"
  - "sarcastic social commentary"`;

  const userPrompt = `Analyze the sentiment of this text. Reply with EXACTLY this format:
SENTIMENT: positive|negative|neutral
EXPLANATION: a brief general vibe descriptor (3-6 words)

Text: "${truncated}"`;

  try {
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 40,
    });

    const content: string = reply.choices[0].message.content;
    const sentimentMatch = content.match(/SENTIMENT:\s*(positive|negative|neutral)/i);
    const explanationMatch = content.match(/EXPLANATION:\s*(.+?)(?:\n|$)/i);

    return {
      sentiment: (sentimentMatch?.[1]?.toLowerCase() as any) || 'neutral',
      explanation: explanationMatch?.[1]?.trim() || 'Mixed tone',
    };
  } catch {
    return null;
  }
}
