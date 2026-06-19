'use client';

import type { Agent } from '@atproto/api';

export interface PendingImage {
  file: File;
  preview: string;
  alt: string;
  width: number;
  height: number;
}

export interface LinkCard {
  uri: string;
  title: string;
  description: string;
  thumbUrl?: string;
  thumbFile?: File;
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>)"'`]+/gi;
  return Array.from(text.matchAll(urlRegex)).map((m) => m[0]);
}

export function getLastUrl(text: string): string | null {
  const urls = extractUrls(text);
  return urls.length > 0 ? urls[urls.length - 1] : null;
}

export async function loadImageInfo(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: 0, height: 0 });
    };
    img.src = objectUrl;
  });
}

export async function fetchLinkCard(uri: string): Promise<LinkCard | null> {
  try {
    const encoded = encodeURIComponent(uri);
    const res = await fetch(`https://cardyb.bsky.app/v1/extract?url=${encoded}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      url?: string;
      title?: string;
      description?: string;
      image?: string;
      error?: string;
    };
    if (data.error) return null;
    if (!data.title && !data.description) return null;
    return {
      uri: data.url || uri,
      title: data.title || '',
      description: data.description || '',
      thumbUrl: data.image || undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchThumbAsFile(thumbUrl: string): Promise<File | null> {
  try {
    const res = await fetch(thumbUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const ext = blob.type.split('/')[1] || 'jpg';
    return new File([blob], `thumb.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

export async function uploadImageBlobs(
  agent: Agent,
  images: PendingImage[],
): Promise<{ blob: unknown; alt: string; aspectRatio?: { width: number; height: number } }[]> {
  const results: { blob: unknown; alt: string; aspectRatio?: { width: number; height: number } }[] = [];
  for (const img of images) {
    const uploaded = await agent.uploadBlob(img.file, { encoding: img.file.type });
    const item: { blob: unknown; alt: string; aspectRatio?: { width: number; height: number } } = {
      blob: uploaded.data.blob,
      alt: img.alt,
    };
    if (img.width && img.height) {
      item.aspectRatio = { width: img.width, height: img.height };
    }
    results.push(item);
  }
  return results;
}

export function buildEmbed(
  images: PendingImage[],
  uploadedImageBlobs: { blob: unknown; alt: string; aspectRatio?: { width: number; height: number } }[] | null,
  linkCard: LinkCard | null,
  uploadedThumbBlob: unknown | null,
): Record<string, unknown> | undefined {
  if (uploadedImageBlobs && uploadedImageBlobs.length > 0) {
    return {
      $type: 'app.bsky.embed.images',
      images: uploadedImageBlobs.map((u) => ({
        alt: u.alt,
        image: u.blob,
        aspectRatio: u.aspectRatio,
      })),
    };
  }

  if (linkCard) {
    const external: Record<string, unknown> = {
      uri: linkCard.uri,
      title: linkCard.title,
      description: linkCard.description,
    };
    if (uploadedThumbBlob) {
      external.thumb = uploadedThumbBlob;
    }
    return {
      $type: 'app.bsky.embed.external',
      external,
    };
  }

  return undefined;
}
