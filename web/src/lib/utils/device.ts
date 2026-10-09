/**
 * Small device-detection helpers (UI tuning only).
 */

/**
 * Detect mobile devices (phones and tablets) regardless of OS.
 * Used to tune mobile-specific UI (e.g. the PWA install overlay).
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone/i.test(ua);
  const hasTouch = navigator.maxTouchPoints > 1;
  return isMobileUA || hasTouch;
}
