'use client';

import { useEffect, useCallback, useRef, useState, useMemo, useLayoutEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useFeedStore } from '@/lib/store/feed-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useTopicStore } from '@/lib/store/topic-store';
import { useLLMStore } from '@/lib/store/llm-store';
import { useCompactViewStore } from '@/lib/store/compact-view-store';
import * as feeds from '@/lib/atproto/feeds';
import { isWebLLMLoaded, detectLanguageInBatch } from '@/lib/llm/web-llm';
import PostCard from './PostCard';

/** Latin-script languages that benefit from a non-Latin script heuristic fallback */
const LATIN_LANGS = new Set(['en', 'es', 'pt', 'de', 'fr']);

/**
 * Quick heuristic: returns true if >25% of script-identifiable characters
 * fall outside Latin-script ranges. Used as a fallback when Bluesky's
 * `langs` field is absent and WebLLM isn't loaded. Catches CJK, Cyrillic,
 * Arabic, Devanagari, Thai, Greek, Hebrew, etc.
 */
function isNonLatinScript(text: string): boolean {
  if (!text) return false;
  let latin = 0;
  let foreign = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Skip whitespace
    if (c === 0x0020 || c === 0x0009 || c === 0x000A || c === 0x000D) continue;
    // Skip ASCII digits
    if (c >= 0x0030 && c <= 0x0039) continue;
    // Skip ASCII punctuation and symbols
    if ((c >= 0x0021 && c <= 0x002F) || (c >= 0x003A && c <= 0x0040) ||
        (c >= 0x005B && c <= 0x0060) || (c >= 0x007B && c <= 0x007E)) continue;
    // Skip common Unicode punctuation ranges (General Punctuation, CJK punctuation)
    if ((c >= 0x2000 && c <= 0x206F) || (c >= 0x3000 && c <= 0x303F) ||
        (c >= 0xFF00 && c <= 0xFF0F) || (c >= 0xFF1A && c <= 0xFF20) ||
        (c >= 0xFF3B && c <= 0xFF40) || (c >= 0xFF5B && c <= 0xFF65)) continue;

    // ── Latin script ranges ────────────────────────────────────
    if (
      (c >= 0x0041 && c <= 0x005A) || // A-Z
      (c >= 0x0061 && c <= 0x007A) || // a-z
      (c >= 0x00C0 && c <= 0x00FF) || // Latin-1 Supplement letters
      (c >= 0x0100 && c <= 0x024F) || // Latin Extended-A/B
      (c >= 0x1E00 && c <= 0x1EFF)    // Latin Extended Additional
    ) { latin++; continue; }

    // ── Definitely non-Latin script ranges ─────────────────────
    if (
      (c >= 0x4E00 && c <= 0x9FFF) || // CJK Unified Ideographs
      (c >= 0x3400 && c <= 0x4DBF) || // CJK Extension A
      (c >= 0x3040 && c <= 0x309F) || // Hiragana
      (c >= 0x30A0 && c <= 0x30FF) || // Katakana
      (c >= 0xAC00 && c <= 0xD7AF) || // Hangul Syllables
      (c >= 0x0400 && c <= 0x04FF) || // Cyrillic
      (c >= 0x0600 && c <= 0x06FF) || // Arabic
      (c >= 0x0750 && c <= 0x077F) || // Arabic Supplement
      (c >= 0x0900 && c <= 0x097F) || // Devanagari
      (c >= 0x0E00 && c <= 0x0E7F) || // Thai
      (c >= 0x0370 && c <= 0x03FF) || // Greek
      (c >= 0x0590 && c <= 0x05FF)    // Hebrew
    ) { foreign++; continue; }

    // Everything else: emoji, symbols, math — skip (script-neutral)
  }
  const total = latin + foreign;
  if (total === 0) return false;
  return foreign / total >= 0.25;
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'All languages' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ru', label: 'Русский' },
];

const LANG_PREF_KEY = 'agora-muse-lang';

function getStoredLang(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LANG_PREF_KEY) ?? '';
}

function setStoredLang(code: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LANG_PREF_KEY, code);
}

export default function FeedList() {
  const posts = useFeedStore((s) => s.posts);
  const loading = useFeedStore((s) => s.loading);
  const error = useFeedStore((s) => s.error);
  const hiddenPostUris = useFeedStore((s) => s.hiddenPostUris);
  const displayCount = useFeedStore((s) => s.displayCount);
  const moderatedPostUris = useFeedStore((s) => s.moderatedPostUris);
  const loadFeed = useFeedStore((s) => s.loadFeed);
  const loadMore = useFeedStore((s) => s.loadMore);
  const loadHiddenPosts = useFeedStore((s) => s.loadHiddenPosts);
  const upvote = useFeedStore((s) => s.upvote);
  const downvote = useFeedStore((s) => s.downvote);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const agent = useAuthStore((s) => s.agent);
  const parentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const didInitialLoad = useRef(false);

  const [lang, setLang] = useState<string>(getStoredLang);

  // ─── Compact/card view toggle ───────────────────────────────────
  const compact = useCompactViewStore((s) => s.compact);
  const setCompact = useCompactViewStore((s) => s.set);

  // ─── LLM-powered language detection ────────────────────────────────
  const llmStatus = useLLMStore((s) => s.status);
  const [llmLangMismatchUris, setLlmLangMismatchUris] = useState<Set<string>>(new Set());
  const [llmLangKick, setLlmLangKick] = useState(0);
  const llmLangProcessingRef = useRef(false);
  const lastLangRef = useRef<string>('');
  const checkedUrisRef = useRef<Set<string>>(new Set());

  // Keep a ref synced with current lang so async callbacks can read it
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  });

  // Run LLM language detection in background when posts, language, or LLM readiness changes
  useEffect(() => {
    if (!lang || posts.length === 0) return;
    // Only run when the WebLLM engine (Gemma/Llama) is loaded — the embedding
    // model can't do language classification
    if (!isWebLLMLoaded()) return;

    // Always sync language changes (reset state) even if we can't process right now
    if (lastLangRef.current !== lang) {
      lastLangRef.current = lang;
      checkedUrisRef.current = new Set();
      setLlmLangMismatchUris(new Set());
    }

    // If another check is in flight, skip — llmLangKick will re-trigger us after
    if (llmLangProcessingRef.current) return;

    const postsToCheck = posts.filter((p) => !checkedUrisRef.current.has(p.uri));
    if (postsToCheck.length === 0) return;

    llmLangProcessingRef.current = true;
    const requestedLang = lang;

    detectLanguageInBatch(
      postsToCheck.map((p) => p.text),
      requestedLang,
    )
      .then((results) => {
        // Discard if language changed while the LLM was processing
        if (requestedLang !== langRef.current) return;

        const mismatched = new Set<string>();
        for (let i = 0; i < postsToCheck.length; i++) {
          checkedUrisRef.current.add(postsToCheck[i].uri);
          if (!results[i]) {
            mismatched.add(postsToCheck[i].uri);
          }
        }

        setLlmLangMismatchUris((prev) => {
          const next = new Set(prev);
          for (const p of postsToCheck) {
            if (mismatched.has(p.uri)) {
              next.add(p.uri);
            } else {
              next.delete(p.uri);
            }
          }
          return next;
        });
      })
      .catch(() => {
        // Silently fail — the langs-field filter is still active
      })
      .finally(() => {
        llmLangProcessingRef.current = false;
        // Kick another effect run in case we skipped a language change
        setLlmLangKick((k) => k + 1);
      });
  }, [lang, posts, llmStatus, llmLangKick]);

  // Visible posts (filter out hidden, moderated, posts without topic matches, by language, and LLM-detected language mismatches), sliced to current display count
  // Shared language filter: explicit langs match > explicit mismatch > heuristic
  const langFilter = useMemo(() => {
    if (!lang) return () => true;
    // For all languages: if the post declares any language at all, use it.
    // If the post didn't declare a language, apply the non-Latin script
    // heuristic for Latin-script targets (catches CJK/Cyrillic/Arabic/etc).
    const isLatinLang = LATIN_LANGS.has(lang);
    return (p: typeof posts[number]) => {
      // Explicit match — post declares our language
      if (p.langs?.includes(lang)) return true;
      // Explicit mismatch — post declares other languages
      if ((p.langs?.length ?? 0) > 0) return false;
      // No langs field — apply heuristic for Latin-script languages
      if (isLatinLang && isNonLatinScript(p.text)) return false;
      return true;
    };
  }, [lang]);

  const visiblePosts = useMemo(
    () =>
      posts
        .filter((p) => !hiddenPostUris.has(p.uri) && !moderatedPostUris.has(p.uri) && p.matchedTopics.length > 0 && !llmLangMismatchUris.has(p.uri))
        .filter(langFilter)
        .slice(0, displayCount),
    [posts, hiddenPostUris, moderatedPostUris, displayCount, langFilter, llmLangMismatchUris],
  );

  const allVisible = useMemo(
    () =>
      posts
        .filter((p) => !hiddenPostUris.has(p.uri) && !moderatedPostUris.has(p.uri) && p.matchedTopics.length > 0 && !llmLangMismatchUris.has(p.uri))
        .filter(langFilter).length,
    [posts, hiddenPostUris, moderatedPostUris, langFilter, llmLangMismatchUris],
  );
  const hasMore = displayCount < allVisible;

  // Virtualized list for window scroll
  const [parentOffset, setParentOffset] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (!parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      setParentOffset(rect.top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: visiblePosts.length,
    getItemKey: (index) => visiblePosts[index].uri,
    estimateSize: (index) => {
      const post = visiblePosts[index];
      const hasImage = post.embed?.type === 'image' && (post.embed.images?.length ?? 0) > 0;
      const hasExternal = post.embed?.type === 'external' && post.embed.external;
      // Posts with media/embeds are taller; over-estimate to prevent overlap
      // before the ResizeObserver measurement kicks in.
      return hasImage || hasExternal ? 520 : 340;
    },
    overscan: 5,
    scrollMargin: parentOffset,
  });

  // Initial load — reactive to auth + topic loading status via Zustand subscription
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsub = useTopicStore.subscribe((state) => {
      if (!state.loading && !didInitialLoad.current && isAuthenticated) {
        didInitialLoad.current = true;
        loadFeed(true); // skip LLM scoring for fast initial render
        loadHiddenPosts();
      }
    });

    // If topics are already loaded, fire immediately
    if (!useTopicStore.getState().loading && !didInitialLoad.current) {
      didInitialLoad.current = true;
      loadFeed(true);
      loadHiddenPosts();
    }

    return () => unsub();
  }, [isAuthenticated, loadFeed, loadHiddenPosts]);

  // Sync language preference from Bluesky on first load
  useEffect(() => {
    if (!isAuthenticated || !agent) return;
    const stored = getStoredLang();
    if (stored) return; // user already set a preference

    feeds.getUserPreferredLanguage(agent).then((prefLang) => {
      if (prefLang) {
        setLang(prefLang);
        setStoredLang(prefLang);
      }
    }).catch(() => {});
  }, [isAuthenticated, agent]);

  // Infinite scroll with IntersectionObserver
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loading) {
        loadMore();
      }
    },
    [loading, loadMore],
  );

  useEffect(() => {
    const el = observerRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver, hasMore]);

  // Loading state
  if (loading && posts.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-lighter" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 bg-surface-lighter rounded" />
                <div className="h-4 w-full bg-surface-lighter rounded" />
                <div className="h-4 w-3/4 bg-surface-lighter rounded" />
                <div className="flex gap-2 mt-2">
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                  <div className="h-6 w-14 bg-surface-lighter rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button onClick={() => loadFeed(true)} className="btn-primary text-sm">
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (posts.length === 0 && !loading) {
    const { followedTopicIds } = useTopicStore.getState();
    const hasFollowedTopics = followedTopicIds.size > 0;

    return (
      <div className="card text-center py-12">
        {hasFollowedTopics ? (
          <>
            <h3 className="text-lg font-semibold text-text-300 mb-2">
              No posts found
            </h3>
            <p className="text-sm text-text-500 mb-4">
              No posts from the Bluesky network matched your followed topics.
              Try following broader topics or refreshing.
            </p>
            <a href="/topics" className="btn-primary text-sm">
              Browse Topics
            </a>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-text-300 mb-2">
              Discover topics
            </h3>
            <p className="text-sm text-text-500 mb-4">
              Follow topics to see relevant posts from across the Bluesky
              network — not just people you follow.
            </p>
            <a href="/topics" className="btn-primary text-sm">
              Browse Topics
            </a>
          </>
        )}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div>
      {/* Language + header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-100">Frontpage</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-500 font-medium">View</span>
              <select
                value={compact ? 'compact' : 'card'}
                onChange={(e) => setCompact(e.target.value === 'compact')}
                className="select-dark text-xs"
              >
                <option value="card">Card View</option>
                <option value="compact">Compact View</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-500 font-medium">Language</span>
              <select
                value={lang}
                onChange={(e) => {
                  const code = e.target.value;
                  setLang(code);
                  setStoredLang(code);
                  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
                }}
                className="select-dark text-xs"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Virtualized post list — keyed by lang to reset measurements on filter change */}
      <div ref={parentRef} key={lang}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const post = visiblePosts[virtualRow.index];
            return (
              <div
                key={post.uri}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="mb-2">
      <PostCard
        post={post}
        onUpvote={upvote}
        onDownvote={downvote}
      />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sentinel for infinite scroll (outside virtualizer so always rendered) */}
      {hasMore && <div ref={observerRef} className="h-4" />}

      {/* Loading more indicator */}
      {loading && posts.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-dark-700 border-t-sky-500 rounded-full animate-spin" />
        </div>
      )}

      {/* End of feed */}
      {!hasMore && posts.length > 0 && (
        <p className="text-center text-xs text-text-600 py-4">
          — End of feed —
        </p>
      )}
    </div>
  );
}
