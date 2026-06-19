/**
 * AT Protocol OAuth client for Agora Muse.
 *
 * Handles Bluesky OAuth login/logout and session persistence.
 * Session is stored in localStorage for static-export compatibility.
 *
 * NOTE: This module uses dynamic imports and 'as any' casts to work
 * with the evolving @atproto/* library types. Runtime behavior is verified
 * against the documented OAuth flow:
 *   1. BrowserOAuthClient.signInRedirect(handle) → redirects to Bluesky
 *   2. Bluesky redirects back to /oauth/callback
 *   3. BrowserOAuthClient.signInCallback() → returns OAuthSession
 *   4. OAuthSession + AtpAgent for authenticated API calls
 */

import type { Agent } from '@atproto/api';

// ─── Environment ─────────────────────────────────────────────────────

const isBrowser = () => typeof window !== 'undefined';

// ─── Session Storage ─────────────────────────────────────────────────

const SESSION_KEY = 'agora-muse-session';

interface StoredSession {
  did: string;
  handle: string;
  avatar?: string;
  active: boolean;
}

function saveSession(session: StoredSession): void {
  if (!isBrowser()) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function loadSession(): StoredSession | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
}

// ─── Client Metadata ─────────────────────────────────────────────────

/**
 * Check if the current origin is a loopback address (localhost, 127.0.0.1, ::1).
 *
 * On loopback origins, the AT Protocol OAuth spec requires:
 * - client_id must be `http://localhost` with NO path, NO port
 * - redirect_uri must use a loopback IP (127.0.0.1 or [::1])
 * - application_type must be "native"
 *
 * Violating these rules triggers: "Loopback ClientID must not contain a path component"
 */
function isLoopbackOrigin(): boolean {
  if (!isBrowser()) return false;
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * Build client metadata for the OAuth client.
 *
 * Localhost: constructs a valid loopback client_id with the redirect_uri
 *   pointing to our /oauth/callback page on a loopback IP.
 *
 * Production: uses NEXT_PUBLIC_OAUTH_* env vars (inlined at build time).
 */
function buildClientMetadata(): Record<string, unknown> | undefined {
  // ── Production (non-loopback) ──────────────────────────────────
  if (!isLoopbackOrigin()) {
    const origin = window.location.origin;
    const clientId = process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID ||
      `${origin}/client-metadata.json`;
    return {
      client_id: clientId,
      client_name: 'Agora Muse',
      client_uri: process.env.NEXT_PUBLIC_OAUTH_CLIENT_URI || origin,
      redirect_uris: [
        process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI ||
        `${origin}/oauth/callback`,
      ],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    };
  }

  // ── Localhost (loopback) ───────────────────────────────────────
  if (isLoopbackOrigin()) {
    const port = window.location.port;
    const portSuffix = port ? `:${port}` : '';

    // The AT Protocol loopback spec requires redirect_uri to use a loopback
    // IP (127.0.0.1 or [::1]), NOT "localhost".  Bluesky's OAuth server
    // enforces this.
    //
    // But IndexedDB is origin-scoped: localhost:3000 ≠ 127.0.0.1:3000.
    // The BrowserOAuthClient.fixLocation() function solves this by redirecting
    // the browser from localhost → 127.0.0.1, but ONLY when:
    //   redirect_uri.pathname === window.location.pathname
    //
    // So we use the root path "/" (homepage) as the redirect_uri path.
    // This means OAuth callbacks land on the homepage, and fixLocation can
    // successfully migrate the app from localhost to 127.0.0.1 before any
    // state is stored.
    const redirectUri = `http://127.0.0.1${portSuffix}/`;

    // client_id format: http://localhost?redirect_uri=...&scope=...
    // MUST NOT contain a path or port component (validated by parseOAuthLoopbackClientId)
    const loopbackClientId =
      `http://localhost?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('atproto transition:generic')}`;

    return {
      client_id: loopbackClientId,
      client_name: 'Agora Muse',
      redirect_uris: [redirectUri],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
      dpop_bound_access_tokens: true,
    };
  }

  return undefined;
}

// ─── OAuth Client Singleton ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any> {
  if (!isBrowser()) {
    throw new Error('OAuth client requires browser environment');
  }
  if (_client) return _client;

  const mod = await import('@atproto/oauth-client-browser');
  const metadata = buildClientMetadata();

  const config: Record<string, unknown> = {
    handleResolver: 'https://bsky.social',
  };

  // Only pass clientMetadata on non-loopback origins or when explicitly configured
  if (metadata) {
    config.clientMetadata = metadata;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _client = new mod.BrowserOAuthClient(config as any);
  return _client;
}

// ─── Agent Creation ──────────────────────────────────────────────────

/**
 * Build an Agent backed by an OAuthSession.
 *
 * Uses Agent (the parent class) directly instead of AtpAgent because
 * AtpAgent's constructor creates its own CredentialSession from
 * options.service, which would ignore our OAuth-backed session manager.
 *
 * Agent accepts a SessionManager directly via its constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createAgentFromOAuthSession(oauthSession: any): Promise<Agent> {
  const { Agent: AtpBase } = await import('@atproto/api');

  const sessionManager = {
    did: oauthSession.did,
    hasSession: true,
    get session() {
      return { did: oauthSession.did };
    },
    get serviceUrl() {
      return new URL('https://bsky.social');
    },
    get pdsUrl() {
      return undefined;
    },
    get dispatchUrl() {
      return new URL('https://bsky.social');
    },
    fetchHandler: async (url: string, init?: RequestInit) => {
      // XRPC passes relative URLs like /xrpc/app.bsky.feed.getTimeline
      const urlObj = new URL(url, 'https://bsky.social');
      const pathname = urlObj.pathname + urlObj.search;
      return oauthSession.fetchHandler(pathname, init);
    },
    // Session management — not used for OAuth flows but required by Agent
    resumeSession: async () => {
      throw new Error('resumeSession not supported with OAuth');
    },
    createAccount: async () => {
      throw new Error('createAccount not supported with OAuth');
    },
    login: async () => {
      throw new Error('login not supported with OAuth');
    },
    logout: async () => {
      await oauthSession.signOut();
    },
  };

  return new AtpBase(sessionManager) as unknown as Agent;
}

// ─── Auth Actions ────────────────────────────────────────────────────

export async function login(): Promise<void> {
  const client = await getClient();
  // Pass the Bluesky service URL instead of a handle. The AT Protocol OAuth
  // client treats https:// URLs as service endpoints, which lets the Bluesky
  // OAuth server present its own handle-entry page.
  await client.signInRedirect('https://bsky.social');
}

export async function handleCallback(): Promise<{
  did: string;
  handle: string;
  avatar?: string;
  agent: Agent;
}> {
  const client = await getClient();
  const result = await client.signInCallback();
  if (!result || !result.session) {
    throw new Error('OAuth callback failed — no session returned');
  }

  const oauthSession = result.session;
  const did: string = oauthSession.did;

  const agent = await createAgentFromOAuthSession(oauthSession);

  // Fetch profile to get the handle and avatar
  let handle = '';
  let avatar: string | undefined;
  try {
    const profile = await agent.getProfile({ actor: did });
    handle = profile.data.handle;
    avatar = profile.data.avatar;
  } catch {
    handle = did;
  }

  saveSession({ did, handle, avatar, active: true });
  return { did, handle, avatar, agent };
}

export async function restoreSession(): Promise<{
  did: string;
  handle: string;
  avatar?: string;
  agent: Agent;
} | null> {
  const stored = loadSession();
  if (!stored?.active) return null;

  try {
    const client = await getClient();
    const oauthSession = await client.restore(stored.did);
    if (!oauthSession) return null;

    const agent = await createAgentFromOAuthSession(oauthSession);
    return { did: stored.did, handle: stored.handle || stored.did, avatar: stored.avatar, agent };
  } catch {
    clearSession();
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    const client = await getClient();
    const stored = loadSession();
    if (stored) {
      await client.revoke(stored.did);
    }
  } catch {
    // Ignore cleanup errors
  }
  clearSession();
}

export function getStoredDid(): string | null {
  return loadSession()?.did ?? null;
}
