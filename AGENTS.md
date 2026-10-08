# AGENTS.md

## Project Purpose

**Agora** is a topic-based content discovery app over Bluesky. Users follow topics instead of accounts. All AI runs in-browser: an EmbeddingGemma 2 text model (ONNX Runtime via WebGPU, WASM fallback) powers topic matching and moderation, and WebLLM/WebGPU provides optional generative features. User preferences are stored on the user's own Bluesky PDS using custom AT Protocol records (`app.agora.*` NSID). No backend server.

## Repo Map

```
web/                         # The entire application (monorepo root)
├── src/app/                 # Next.js 14 App Router pages (static export)
├── src/components/          # React components (feed, auth, topics, moderation, layout, PWA)
├── src/lib/atproto/         # OAuth auth, feed fetching, PDS record CRUD, Skyfeed publishing
├── src/lib/llm/             # EmbeddingGemma 2 embedding runtime + WebLLM model loading/inference
├── src/lib/moderation/      # Predefined rule catalog, bundle vectors, zero-shot decision engine
├── src/lib/store/           # 8 Zustand stores (auth, topics, feed, topic-feed, LLM, moderation, compact-view, PWA)
├── src/lib/lexicon/         # Custom AT Protocol lexicon record types
├── src/lib/skyfeed/         # Skyfeed Builder pipeline DSL construction
├── src/lib/data/            # Static topic catalog + popular feed fetching
├── src/lib/post/            # Post composer (image upload, link cards, embeds)
├── src/lib/utils/           # Text utilities (hashtag extraction)
├── src/types/index.ts       # All TypeScript interfaces/types
├── public/                  # Static assets (PWA manifest, SW, icons, OAuth metadata)
└── scripts/                 # Icon generation (Sharp) + rule-vector build/calibration (tsx)
```

## Developer Workflow

```bash
cd web
cp .env.example .env.local   # fill in OAuth client ID/secret
npm install
npm run dev                   # starts at http://localhost:3000
npm run build                 # generates icons + static export to web/out/
npm run lint                  # next lint
```

Tests (ad-hoc, no test runner framework):
```bash
npx tsx test.ts               # seed-term generation & feed matching
npx tsx test-agent.ts         # AT Protocol agent
npx tsx test-topic.ts         # topic store integration
npx playwright test           # E2E (topic creation flow)
```

Moderation rule vectors (precomputed offline, committed):
```bash
npm run build-rule-vectors    # re-embed PREDEFINED_RULES after editing rules.ts
npm run verify-rule-vectors   # calibration check: neutrals pass, targets flag
```

## Architecture Rules

1. **No backend.** Static-export Next.js (`next.config.js → output: 'export'`). Everything runs in the browser.
2. **No server-side data.** All user preferences (topic follows, moderation rules, hidden posts, custom topics) are stored as AT Protocol records on the user's PDS. Read/write via `@atproto/api` XRPC agent through the OAuth session.
3. **Embedding + optional generative AI.** The EmbeddingGemma 2 text model (MRL-truncated to 256d, ~175MB q4) always loads for topic scoring and moderation. WebLLM models (Gemma/SmolLM2 via WebGPU) are optional and power language detection, VibeCheck sentiment, seed terms, and Skyfeed regex. Keyword matching is the fallback when models aren't ready.
4. **OAuth flow.** AT Protocol OAuth with dynamic client metadata (local loopback in dev, production JSON in public/). Session persisted in `localStorage` key `agora-muse-session`.
5. **State management.** Zustand stores. Two stores use `persist` middleware (topic-feed, compact-view, PWA-overlay). Others manually read/write `localStorage` or PDS. Stores include concurrency guards (`if (get().loading) return`).
6. **Feed aggregation.** Round-robin interleaving of multiple feed generators + keyword/hashtag search. Posts deduplicated by URI, filtered to 24h window, moderated asynchronously via `requestIdleCallback`.

## Coding Conventions

- **TypeScript strict.** Target ES2017. Path alias `@/*` → `./src/*`. Module resolution: bundler.
- **React.** Function components with `memo()`, hooks, Next.js 14 App Router. Client components marked with `'use client'`.
- **Styling.** Tailwind CSS 3 utility classes. Custom color scales in `tailwind.config.ts`. Reusable patterns in `globals.css` `@layer components`.
- **Naming.** camelCase variables/functions, PascalCase components/types, kebab-case page file names.
- **State.** Zustand stores in `src/lib/store/`. Import from `@/lib/store/<name>-store`. Use selectors for granular subscriptions.
- **Error handling.** Try/catch with graceful degradation — return empty arrays, fall back to keyword-only matching, skip items that fail to process.
- **Types.** Central types in `src/types/index.ts`. AT Protocol record types in `src/lib/lexicon/types.ts`. Inline type definitions in `feeds.ts` to work around namespace-export issues with `@atproto/api`.
- **Lexicon records.** Use the key-generation helpers from `src/lib/lexicon/types.ts` for deterministic rkeys. NSID prefix is `app.agora.*`.

## Start Here (Common Tasks)

| Task | Read First |
|------|-----------|
| Understand the data model | `web/src/types/index.ts`, `web/src/lib/lexicon/types.ts` |
| Understand auth flow | `web/src/lib/atproto/auth.ts`, `web/src/app/oauth/callback/page.tsx` |
| Understand feed pipeline | `web/src/lib/atproto/feeds.ts`, `web/src/lib/llm/topic-matcher.ts` |
| Understand moderation | `web/src/lib/moderation/` (rules → engine → `applyModerationRules` in `store/feed-store.ts`) |
| Understand state management | `web/src/lib/store/` (pick the store matching the domain) |
| Add a page | Look at existing pages in `web/src/app/`, follow App Router conventions |
| Add a component | Look at `web/src/components/` for patterns, note `memo()` and `'use client'` |
| Modify AT Protocol records | `web/src/lib/lexicon/types.ts` + `web/src/lib/atproto/records.ts` |
| Modify AI behavior | `web/src/lib/llm/` (embedding runtime vs. WebLLM) + `web/src/lib/moderation/` |

## Sharp Edges

- **`.next/`, `out/`, `node_modules/`** are gitignored and are build artifacts. Never edit them.
- **No formal test framework.** Tests are standalone `.ts` scripts run via `npx tsx`. No Jest/Vitest config.
- **`eslint-disable` for `any`.** ~15+ locations use `@typescript-eslint/no-explicit-any` due to opaque types from `@atproto/api`, `@huggingface/transformers`, and `@mlc-ai/web-llm`. Acceptable for these library boundaries.
- **Manual session stub in `auth.ts`.** The `sessionManager` object manually stubs methods that `@atproto/api` expects but the browser OAuth client doesn't provide (`resumeSession`, `createAccount`, `login`). Fragile against library updates.
- **XRPC method-existence guards.** Feed fetching checks `typeof agent.app.bsky.feed.getFeed !== 'function'` before calling — the XRPC client initialization can be race-prone.
- **localStorage migration path.** Custom topics migrated from `localStorage` to PDS on first login after migration was deployed. The `localStorage` key is cleared after migration. Verify in `topic-store.ts` if you see unexpected behavior.
- **Webpack + Transformers.js bundling.** `next.config.js` aliases `@huggingface/transformers` to its browser bundle (its `node` export pulls unresolvable onnxruntime-node wasm files), stubs `onnxruntime-node`, suppresses Node polyfills, and sets `swcMinify: false` (the SWC minifier can't parse onnxruntime-web's minified bundle; Terser handles it). Changes here break the embedding model.
- **Bundled rule vectors.** `src/lib/moderation/rule-vectors.json` is generated offline by `scripts/build-rule-vectors.ts` and committed. If you edit a `description` in `moderation/rules.ts`, re-run `npm run build-rule-vectors` or the vectors and text will drift. Thresholds are calibrated via `scripts/verify-rule-vectors.ts`, not derived at runtime.
- **Service worker.** `public/sw.js` bypasses OAuth callback path — critical for iOS PWA redirect behavior. Changes to the SW route matching must preserve this.
- **No CI/CD in repo.** Deployed to Netlify but config managed in Netlify UI, not in-repo.

## Agent Guidance

- **Always `cd web`** before running npm commands. The repo root has no build tooling.
- **Check Zustand stores** for cross-references — stores import from each other dynamically (`useAuthStore.getState()`) and this is intentional.
- **Validate changes** with `npm run build` (ensures static export succeeds, icons generate, webpack WASM config works) and `npm run lint`.
- **Do not touch `public/sw.js`** without confirming behavior on iOS Safari PWA mode (OAuth callback bypass is load-bearing).
- **Do not modify `next.config.js` webpack overrides** without testing that the embedding model loads correctly in the browser.
- **Do not rename NSID lexicons** (`app.agora.*`) — these are the record format on users' PDS and backward compatibility matters.
- **Before adding npm dependencies:** the app must remain fully static-exportable and browser-only. No Node.js server-side APIs. No native Node modules.
- **When changing AI model code:** the EmbeddingGemma 2 text model (~175MB q4) downloads on first use and caches via the browser HTTP cache; the tokenizer/config are much smaller. The WebLLM models use ModelCache from `@mlc-ai/web-llm`. All are sensitive to URL/path changes. The model id and prefix/dimension live in `src/lib/llm/embedding-config.ts`.
