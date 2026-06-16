'use client';

import { useState, useEffect } from 'react';
import { Icon, addCollection, listIcons } from '@iconify/react';
import lucideIcons from '@iconify-json/lucide/icons.json';
import { TOPIC_ICONS, TOPIC_COLORS, findBestMatchingTopicId } from '@/lib/data/topics';
import { useTopicFeedStore } from '@/lib/store/topic-feed-store';

// Pre-load the entire Lucide set (1,774 icons) so the CDN is only a backup
addCollection(lucideIcons);

// ─── Local Lucide search (synchronous, instant) ───────────────────────

const lucideCache = new Map<string, string | null>();
const MAX_LUCIDE_CACHE = 200;

/**
 * Search through pre-loaded Lucide icons for a match.
 * Returns the icon name (e.g., 'lucide:smartphone') or null.
 */
function findBestLucideIcon(topicName: string, seedTerms?: string[]): string | null {
  const cacheKey = `${topicName}|${(seedTerms ?? []).join(',')}`;
  const cached = lucideCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const nameLower = topicName.toLowerCase();
  const allIcons = listIcons(undefined, 'lucide');
  let bestIcon: string | null = null;
  let bestScore = 0;

  const searchTermsSet = new Set([nameLower]);
  if (seedTerms) {
    for (const t of seedTerms) {
      searchTermsSet.add(t.toLowerCase());
    }
  }
  const searchTerms = Array.from(searchTermsSet);
  // Add singular forms
  for (const term of searchTerms) {
    if (term.endsWith('s') && term.length > 3) {
      searchTerms.push(term.slice(0, -1));
    }
  }

  for (const iconName of allIcons) {
    const iconLower = iconName.toLowerCase();
    const iconWords = iconLower.split(/[\s_-]+/);
    let score = 0;

    for (const term of searchTerms) {
      const termWords = term.split(/[\s_-]+/);

      if (iconLower === term) {
        score += 100;
      } else if (iconLower.includes(term) && term.length >= 3) {
        score += 40;
      } else if (term.includes(iconLower) && iconLower.length >= 3) {
        score += 20;
      } else {
        for (const termWord of termWords) {
          if (termWord.length < 3) continue;
          for (const iconWord of iconWords) {
            if (iconWord.length < 3) continue;
            if (termWord === iconWord) {
              score += 15;
            } else if (termWord.includes(iconWord) || iconWord.includes(termWord)) {
              score += 8;
            }
          }
        }
      }
    }

    if (score > bestScore && score >= 25) {
      bestScore = score;
      bestIcon = `lucide:${iconName}`;
    }
  }

  const result = bestIcon;
  if (lucideCache.size >= MAX_LUCIDE_CACHE) {
    lucideCache.clear();
  }
  lucideCache.set(cacheKey, result);
  return result;
}

// ─── API search: across ALL Iconify sets ──────────────────────────────

const apiSearchCache = new Map<string, string | null>();
const pendingSearches = new Map<string, Promise<string | null>>();

/**
 * Search ALL Iconify icon sets via the API.
 * Returns an icon name (e.g., 'mdi:home-automation') or null.
 * Caches results so each topic is only searched once.
 */
async function findIconViaApi(topicName: string): Promise<string | null> {
  const cacheKey = topicName.toLowerCase();
  const cached = apiSearchCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Dedup concurrent calls for the same topic
  const pending = pendingSearches.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    try {
      const query = topicName.trim().replace(/\s+/g, '+');
      const resp = await fetch(
        `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=1`,
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const icon = data.icons?.[0] ?? null;
      apiSearchCache.set(cacheKey, icon);
      return icon;
    } catch {
      apiSearchCache.set(cacheKey, null);
      return null;
    } finally {
      pendingSearches.delete(cacheKey);
    }
  })();

  pendingSearches.set(cacheKey, request);
  return request;
}

// ─── Component ────────────────────────────────────────────────────────

export default function TopicIcon({
  topicId,
  className,
  seedTerms,
  iconUrl,
}: {
  topicId: string;
  className?: string;
  seedTerms?: string[];
  iconUrl?: string;
}) {
  // Fall back to the top associated Bluesky feed's avatar if no iconUrl provided
  const feedAvatar = useTopicFeedStore(
    (state) => state.feedsByTopic[topicId]?.[0]?.avatar,
  );
  const finalIconUrl = iconUrl || feedAvatar;

  // If we have a feed avatar, use it directly
  if (finalIconUrl) {
    return (
      <img
        src={finalIconUrl}
        alt=""
        className={`w-[1em] h-[1em] rounded ${className || ''}`}
      />
    );
  }
  let iconName: string | undefined = TOPIC_ICONS[topicId];
  let colorId = topicId;

  if (!iconName && seedTerms) {
    const matchedId = findBestMatchingTopicId(topicId, seedTerms);
    if (matchedId) {
      iconName = TOPIC_ICONS[matchedId];
      colorId = matchedId;
    }
  }

  // For custom topics without a built-in match, resolve the icon
  const needsSearch = !iconName && !!seedTerms;
  const [apiIcon, setApiIcon] = useState<string | null>(
    needsSearch ? findBestLucideIcon(topicId, seedTerms) : null,
  );

  useEffect(() => {
    if (!needsSearch) return;
    const lucideMatch = findBestLucideIcon(topicId, seedTerms);
    if (lucideMatch) {
      setApiIcon(lucideMatch);
      return;
    }
    // No local match — search all sets via the API
    let cancelled = false;
    findIconViaApi(topicId).then((icon) => {
      if (!cancelled && icon) setApiIcon(icon);
    });
    return () => {
      cancelled = true;
    };
  }, [topicId, seedTerms, needsSearch]);

  const finalIcon = iconName || apiIcon || 'lucide:tag';
  const colorClass = TOPIC_COLORS[colorId] || '';

  return (
    <Icon
      icon={finalIcon}
      className={[className, colorClass].filter(Boolean).join(' ')}
    />
  );
}
