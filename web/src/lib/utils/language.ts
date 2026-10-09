/**
 * Deterministic language detection for feed filtering.
 *
 * Uses `franc-min` (an n-gram identifier, no model download) rather than the
 * embedding model: EmbeddingGemma 2's representations do not separate closely
 * related languages reliably enough to gate content (measured margins of
 * ~0.001 between Spanish/Italian and Russian/Bulgarian).
 *
 * Detection is restricted to the languages the feed filter offers, which
 * resolves short posts to the intended language instead of a close relative.
 * Returns null when the text is too short or ambiguous, in which case the
 * caller keeps the post.
 */

import { franc } from 'franc-min';

/** ISO 639-3 (franc) codes for the languages the feed filter offers. */
const SUPPORTED_ISO3: string[] = [
  'eng',
  'spa',
  'por',
  'deu',
  'fra',
  'jpn',
  'kor',
  'cmn',
  'rus',
];

/** franc (ISO 639-3) → app / ISO 639-1 codes. */
const ISO3_TO_ISO1: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  por: 'pt',
  deu: 'de',
  fra: 'fr',
  jpn: 'ja',
  kor: 'ko',
  cmn: 'zh',
  zho: 'zh',
  rus: 'ru',
};

/**
 * Detect the language of a post as an ISO 639-1 code, or null when it cannot
 * be determined confidently.
 */
export function detectLanguage(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 2) return null;
  const code = franc(trimmed, { only: SUPPORTED_ISO3 });
  if (code === 'und') return null;
  return ISO3_TO_ISO1[code] ?? null;
}
