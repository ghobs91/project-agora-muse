'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useFeedStore } from '@/lib/store/feed-store';
import { useDebugStore } from '@/lib/store/debug-store';
import {
  getEmbeddingDevice,
  getEmbeddingStatus,
  onEmbeddingStatusChange,
} from '@/lib/llm/embeddings';
import type { LLMStatus, EnrichedPost } from '@/types';
import type { RuleMatch } from '@/lib/moderation/engine';

type Reason = 'semantic' | 'nsfw' | 'hidden' | 'no-topic' | 'language';

const REASON_META: Record<Reason, { label: string; className: string }> = {
  semantic: { label: 'AI filter', className: 'bg-red-500/15 text-red-300' },
  nsfw: { label: 'NSFW', className: 'bg-pink-500/15 text-pink-300' },
  hidden: { label: 'Hidden', className: 'bg-amber-500/15 text-amber-300' },
  'no-topic': { label: 'No topic', className: 'bg-slate-500/20 text-slate-300' },
  language: { label: 'Language', className: 'bg-sky-500/15 text-sky-300' },
};

const MAX_ROWS = 150;

interface DebugRow {
  post: EnrichedPost;
  reasons: Reason[];
  matches: RuleMatch[];
  maxScore: number;
}

/**
 * Floating transparency panel for the moderation pipeline.
 *
 * Reports every reason a post was dropped from the feed (semantic filter with
 * per-rule scores, NSFW, hidden/downvoted, no-topic-match, language mismatch)
 * plus totals and per-rule hit counts. Opened via the header button or by
 * appending `?debug=1` to the URL; visibility persists in localStorage.
 *
 * This outer component is a cheap gate: the data-heavy body only mounts while
 * the panel is open, so a closed panel adds no per-render feed-store work.
 */
export default function ModerationDebugPanel() {
  const panelOpen = useDebugStore((s) => s.panelOpen);
  const hydrateOpen = useDebugStore((s) => s.hydrateOpen);
  const setPanelOpen = useDebugStore((s) => s.setPanelOpen);

  // Restore the persisted open state, and force it open with ?debug=1.
  useEffect(() => {
    hydrateOpen();
    try {
      const flag = new URLSearchParams(window.location.search).get('debug');
      if (flag === '1' || flag === 'true') setPanelOpen(true);
    } catch {
      /* non-browser */
    }
  }, [hydrateOpen, setPanelOpen]);

  if (!panelOpen) return null;
  return <PanelBody onClose={() => setPanelOpen(false)} />;
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const languageFilteredUris = useDebugStore((s) => s.languageFilteredUris);

  const posts = useFeedStore((s) => s.posts);
  const moderatedPostUris = useFeedStore((s) => s.moderatedPostUris);
  const nsfwPostUris = useFeedStore((s) => s.nsfwPostUris);
  const hiddenPostUris = useFeedStore((s) => s.hiddenPostUris);
  const moderationMatches = useFeedStore((s) => s.moderationMatches);

  // Live embedding-runtime status (not exposed through a store).
  const [embedStatus, setEmbedStatus] = useState<LLMStatus>(getEmbeddingStatus());
  useEffect(() => onEmbeddingStatusChange((next) => setEmbedStatus(next)), []);

  const { rows, totals, reasonCounts, ruleCounts } = useMemo(() => {
    const reasons: Record<Reason, number> = {
      semantic: 0,
      nsfw: 0,
      hidden: 0,
      'no-topic': 0,
      language: 0,
    };
    const rules = new Map<string, { label: string; count: number }>();
    const out: DebugRow[] = [];

    for (const post of posts) {
      const postReasons: Reason[] = [];
      const matches = moderationMatches.get(post.uri) ?? [];
      if (moderatedPostUris.has(post.uri)) postReasons.push('semantic');
      if (nsfwPostUris.has(post.uri)) postReasons.push('nsfw');
      if (hiddenPostUris.has(post.uri)) postReasons.push('hidden');
      if (languageFilteredUris.has(post.uri)) postReasons.push('language');
      if ((post.matchedTopics?.length ?? 0) === 0) postReasons.push('no-topic');

      if (postReasons.length === 0) continue;

      for (const r of postReasons) reasons[r]++;
      for (const m of matches) {
        const entry = rules.get(m.ruleId) ?? { label: m.label, count: 0 };
        entry.count++;
        rules.set(m.ruleId, entry);
      }
      out.push({
        post,
        reasons: postReasons,
        matches,
        maxScore: matches.reduce((mx, m) => Math.max(mx, m.score), 0),
      });
    }

    out.sort((a, b) => b.maxScore - a.maxScore || b.reasons.length - a.reasons.length);

    return {
      rows: out,
      totals: { scanned: posts.length, filtered: out.length, visible: posts.length - out.length },
      reasonCounts: reasons,
      ruleCounts: Array.from(rules.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.count - a.count),
    };
  }, [
    posts,
    moderatedPostUris,
    nsfwPostUris,
    hiddenPostUris,
    languageFilteredUris,
    moderationMatches,
  ]);

  const statusDot =
    embedStatus === 'ready'
      ? 'bg-emerald-400'
      : embedStatus === 'loading'
        ? 'bg-amber-400 animate-pulse'
        : embedStatus === 'error'
          ? 'bg-red-400'
          : 'bg-gray-500';

  const visibleRows = rows.slice(0, MAX_ROWS);

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(380px,calc(100vw-2rem))] max-h-[75vh] flex flex-col rounded-xl bg-surface border border-dark-700/60 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700/50 bg-surface-lighter/40">
        <div className="flex items-center gap-2 min-w-0">
          <Icon icon="lucide:bug" className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-sm font-semibold text-text-200 truncate">
            Moderation debug
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${statusDot}`}
            title={`Embedding model: ${embedStatus} (${getEmbeddingDevice()})`}
          />
          <button
            type="button"
            onClick={onClose}
            className="text-text-500 hover:text-text-300 transition-colors"
            aria-label="Close debug panel"
          >
            <Icon icon="lucide:x" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-dark-700/40">
        <Stat label="Scanned" value={totals.scanned} />
        <Stat label="Filtered" value={totals.filtered} accent="text-red-300" />
        <Stat label="Shown" value={totals.visible} accent="text-emerald-300" />
      </div>

      {/* Body */}
      <div className="overflow-y-auto px-3 py-3 space-y-3 text-xs">
        {/* Reason breakdown */}
        <section>
          <SectionTitle>By reason</SectionTitle>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {(Object.keys(reasonCounts) as Reason[]).map((reason) => (
              <span
                key={reason}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${REASON_META[reason].className}`}
              >
                {REASON_META[reason].label}
                <span className="font-semibold">{reasonCounts[reason]}</span>
              </span>
            ))}
          </div>
        </section>

        {/* Rule hits */}
        {ruleCounts.length > 0 && (
          <section>
            <SectionTitle>Rules triggered</SectionTitle>
            <ul className="mt-1.5 space-y-1">
              {ruleCounts.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="text-text-300 truncate">{r.label}</span>
                  <span className="text-text-500 shrink-0 tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Per-post drill-down */}
        <section>
          <SectionTitle>
            Filtered posts{' '}
            <span className="text-text-600 font-normal">({rows.length})</span>
          </SectionTitle>
          {rows.length === 0 ? (
            <p className="text-text-500 mt-1.5">
              Nothing filtered from the current feed.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-2">
              {visibleRows.map(({ post, reasons, matches }) => (
                <li
                  key={post.uri}
                  className="rounded-lg border border-dark-700/40 bg-surface-dark/40 p-2"
                >
                  <div className="flex flex-wrap gap-1 mb-1">
                    {reasons.map((reason) => (
                      <span
                        key={reason}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${REASON_META[reason].className}`}
                      >
                        {REASON_META[reason].label}
                      </span>
                    ))}
                  </div>
                  <p className="text-text-400 line-clamp-2 break-words">
                    {post.text?.trim() || '(no text)'}
                  </p>
                  {matches.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {matches
                        .slice()
                        .sort((a, b) => b.score - a.score)
                        .map((m) => (
                          <li
                            key={m.ruleId}
                            className="flex items-center justify-between gap-2 text-[10px]"
                          >
                            <span className="text-text-500 truncate">{m.label}</span>
                            <span className="text-text-600 shrink-0 tabular-nums">
                              {m.score.toFixed(3)} / {m.threshold}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {rows.length > MAX_ROWS && (
            <p className="text-text-600 mt-1.5">
              +{rows.length - MAX_ROWS} more not shown
            </p>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-dark-700/40 text-[10px] text-text-600 flex items-center justify-between">
        <span>
          Embedding: {embedStatus} ({getEmbeddingDevice()})
        </span>
        <span>Home feed · live</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'text-text-200',
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-dark/50 px-2 py-1.5 text-center">
      <div className={`text-base font-semibold tabular-nums ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-text-600">{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-500">
      {children}
    </h4>
  );
}
