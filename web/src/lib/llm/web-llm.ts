/**
 * WebLLM integration for in-browser LLM inference.
 *
 * Uses @mlc-ai/web-llm with WebGPU to run larger models
 * (e.g., Gemma 3 4B IT) for high-quality inference tasks
 * like seed term generation and semantic analysis.
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
 * Pick the best WebLLM model for the current device.
 * - Desktop: Gemma 2 2B (~1.9GB) — best quality
 * - Mobile: Llama 3.2 1B (~0.9GB) — lighter, fits mobile memory limits
 */
export function getDefaultModelForDevice(): string {
  if (isMobileDevice()) {
    return 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
  }
  return 'gemma-2-2b-it-q4f16_1-MLC';
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
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        setWebLLMStatus('loading', Math.round(progress.progress * 100));
      },
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
