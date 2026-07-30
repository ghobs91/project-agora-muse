/**
 * Tiny storage helpers for onboarding completion.
 * Kept separate from OnboardingWizard so HomePageContent can read the flag
 * without statically importing the heavy wizard (which is dynamically loaded).
 */

export const ONBOARDING_KEY = 'agora-muse-onboarded';

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingComplete(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* ignore */
  }
}
