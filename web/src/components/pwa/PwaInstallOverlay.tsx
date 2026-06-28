'use client';

import { useEffect, useState } from 'react';
import { usePwaInstallOverlayStore } from '@/lib/store/pwa-install-overlay-store';
import { isMobileDevice } from '@/lib/llm/web-llm';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) return true;
  return false;
}

function getPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export default function PwaInstallOverlay() {
  const dismissed = usePwaInstallOverlayStore((s) => s.dismissed);
  const dismiss = usePwaInstallOverlayStore((s) => s.dismiss);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobileDevice()) return;
    if (isStandalone()) return;
    if (dismissed) return;
    setVisible(true);
  }, [dismissed]);

  if (!visible) return null;

  const platform = getPlatform();

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
        onClick={dismiss}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-6 space-y-4 animate-in"
          style={{
            background: `rgb(var(--surface))`,
            border: `1px solid rgb(var(--border-color))`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-100">Install Agora</p>
                <p className="text-xs text-text-400 mt-0.5">Add to your home screen for quick access</p>
              </div>
            </div>
            <button onClick={dismiss} className="btn-ghost text-sm px-2 py-1 -mr-1 -mt-1">
              ✕
            </button>
          </div>

          <div className="space-y-3 bg-surface-light rounded-xl p-4">
            {platform === 'ios' ? (
              <>
                <Step
                  number={1}
                  text="Tap the"
                  action={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      Share
                    </span>
                  }
                  textAfter="button in Safari"
                />
                <Step
                  number={2}
                  text="Scroll down and tap"
                  action={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Add to Home Screen
                    </span>
                  }
                />
              </>
            ) : (
              <>
                <Step
                  number={1}
                  text="Tap the"
                  action={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 text-xs font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                      ⋮
                    </span>
                  }
                  textAfter="menu in your browser"
                />
                <Step
                  number={2}
                  text="Tap"
                  action={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 text-xs font-medium">
                      Install app
                    </span>
                  }
                  textAfter="or"
                  action2={
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 text-xs font-medium">
                      Add to Home Screen
                    </span>
                  }
                />
              </>
            )}
          </div>

          <button onClick={dismiss} className="btn-primary w-full text-sm py-2.5">
            Got it
          </button>
        </div>
      </div>
    </>
  );
}

function Step({
  number,
  text,
  action,
  textAfter,
  action2,
}: {
  number: number;
  text: string;
  action: React.ReactNode;
  textAfter?: string;
  action2?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-sky-600/20 text-sky-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {number}
      </div>
      <p className="text-sm text-text-300 leading-relaxed">
        {text}{' '}
        {action}
        {textAfter && (
          <>
            {' '}
            {textAfter}
          </>
        )}
        {action2 && (
          <>
            {' '}
            {action2}
          </>
        )}
      </p>
    </div>
  );
}
