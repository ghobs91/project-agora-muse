const NSFW_FILTER_KEY = "agora-muse-nsfw-filter";

const NSFWJS_CDN =
  "https://cdn.jsdelivr.net/npm/nsfwjs@4.3.0/dist/browser/nsfwjs.min.js";

const MODEL_URL = "/models/nsfw/model.json";

const MAX_CACHE_SIZE = 500;

interface NsfwPrediction {
  className: string;
  probability: number;
}

interface NsfwModel {
  classify(
    img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    topk?: number,
  ): Promise<NsfwPrediction[]>;
  dispose(): void;
}

interface NsfwModule {
  load(url: string): Promise<NsfwModel>;
}

declare global {
  interface Window {
    nsfwjs?: NsfwModule;
  }
}

let modelPromise: Promise<NsfwModel | null> | null = null;
let loadPromise: Promise<NsfwModule | null> | null = null;

const classificationCache = new Map<string, NsfwPrediction[]>();

export function isNsfwFilterEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NSFW_FILTER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNsfwFilterEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(NSFW_FILTER_KEY, "1");
    } else {
      localStorage.removeItem(NSFW_FILTER_KEY);
    }
  } catch {
    /* ignore */
  }
}

async function ensureNsfwjsLoaded(): Promise<NsfwModule | null> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    if (window.nsfwjs) {
      resolve(window.nsfwjs);
      return;
    }

    const script = document.createElement("script");
    script.src = NSFWJS_CDN;
    script.onload = () => resolve(window.nsfwjs ?? null);
    script.onerror = () => {
      console.warn("Failed to load NSFWJS from CDN");
      loadPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

async function getModel(): Promise<NsfwModel | null> {
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    const nsfwjs = await ensureNsfwjsLoaded();
    if (!nsfwjs) return null;
    return nsfwjs.load(MODEL_URL);
  })().catch((err) => {
    console.warn("Failed to load NSFWJS model:", err);
    modelPromise = null;
    return null;
  });

  return modelPromise;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timeout = setTimeout(() => {
      img.src = "";
      reject(new Error(`Timeout loading image: ${url}`));
    }, 10_000);
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

export async function classifyImageUrl(
  url: string,
): Promise<NsfwPrediction[] | null> {
  const cached = classificationCache.get(url);
  if (cached) return cached;

  const model = await getModel();
  if (!model) return null;

  try {
    const img = await loadImage(url);
    const predictions = await model.classify(img);

    if (classificationCache.size >= MAX_CACHE_SIZE) {
      classificationCache.delete(classificationCache.keys().next().value!);
    }
    classificationCache.set(url, predictions);
    return predictions;
  } catch (err) {
    console.warn("NSFW classification failed for", url, err);
    return null;
  }
}

export function isNsfwImage(predictions: NsfwPrediction[]): boolean {
  let porn = 0;
  let hentai = 0;
  let sexy = 0;

  for (const p of predictions) {
    if (p.className === "Porn") porn = p.probability;
    else if (p.className === "Hentai") hentai = p.probability;
    else if (p.className === "Sexy") sexy = p.probability;
  }

  return porn > 0.5 || hentai > 0.5 || sexy > 0.8;
}
