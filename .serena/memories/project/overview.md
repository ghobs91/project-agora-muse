# Agora Muse Project Overview

**Purpose:** A PWA that lets users follow topics (not accounts) over Bluesky. It aggregates Bluesky content and uses in-browser AI for topic matching, semantic moderation, and custom topic seed-term generation.

**Live URL:** https://agora-muse.netlify.app

**Tech Stack (web app):**
- Next.js 14.2 with static export (`output: 'export'`)
- React 18 + TypeScript
- Tailwind CSS
- Zustand for state management
- @atproto/api + @atproto/oauth-client-browser for Bluesky auth
- @mlc-ai/web-llm for in-browser LLM (WebGPU)
- @xenova/transformers for embeddings (ONNX Runtime WASM)
- Dexie for IndexedDB storage
- Service Worker in `public/sw.js` for PWA offline support
- Playwright for manual browser tests

**Project Structure:**
- `/web/` — Next.js application
  - `src/app/` — App router pages
  - `src/components/` — React components
  - `src/lib/store/` — Zustand stores
  - `src/lib/llm/` — WebLLM and embedding model logic
  - `src/lib/atproto/` — Bluesky auth and records
  - `public/` — static assets, manifest, service worker

**Important Files:**
- `web/next.config.js` — static export + webpack config for WASM/native deps
- `web/public/manifest.json` — PWA manifest (start_url includes `?utm_source=pwa`)
- `web/public/sw.js` — custom service worker
- `web/src/lib/store/auth-store.ts` — auth state (currently defaults to authenticated mock agent)
- `web/src/lib/llm/web-llm.ts` — WebLLM model loading
- `web/src/app/HomePageContent.tsx` — auto-loads LLM on authentication
