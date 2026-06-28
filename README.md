# Agora

**Topic-based content discovery over Bluesky.** Follow topics instead of accounts. All AI runs in your browser.

Agora aggregates posts from across the Bluesky network — custom feeds, keyword search, hashtag search — and semantically matches them to topics you care about using in-browser machine learning. No backend, no servers storing your data. Your preferences live on your own Bluesky PDS via custom AT Protocol records.

## How It Works

```
You follow topics   →   Agora fetches posts from Bluesky   →   In-browser AI scores relevance   →   Curated feed
```

### Feed Pipeline

1. **Source Discovery** — For each topic you follow, Agora pulls posts from three sources in parallel:
   - Bluesky custom feed generators associated with the topic
   - Keyword search against the topic's seed terms
   - Hashtag search on the primary seed term

2. **Deduplication & Interleaving** — Posts are deduplicated by URI, filtered to the last 24 hours, and interleaved round-robin across feed generators so no single source dominates.

3. **Semantic Topic Matching** — An embedding model ([all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), ~23MB) runs locally via ONNX Runtime WASM. It computes cosine similarity between post text and topic descriptions, scoring relevance. Falls back to keyword matching if the model isn't loaded yet.

4. **AI Re-ranking** (optional) — If a larger [WebLLM](https://github.com/mlc-ai/web-llm) model is loaded (Gemma 2 2B, Gemma 3 1B, or SmolLM2 360M via WebGPU), it provides higher-quality scores used as tiebreakers.

5. **Moderation** — Keyword rules, semantic rules (embedding-based), labeler rules, and mute rules are applied asynchronously in the browser, using batches and `requestIdleCallback` to avoid blocking rendering.

6. **Sorting** — Posts are ordered by engagement (like count from Bluesky curation), with AI scores as a secondary signal.

### Data Ownership

Your preferences — which topics you follow, moderation rules, hidden posts, custom topics — are stored as AT Protocol records on **your own PDS** under custom lexicons (`app.agora.*` NSID prefix). This means:

- No Agora backend holding your data
- Preferences sync across devices when you log in with the same Bluesky account
- Your data leaves when you delete the records

### Feed Publishing

When you create a custom topic, Agora can publish a real Bluesky feed generator so others can follow it. It builds a [Skyfeed Builder](https://skyfeed.me) pipeline DSL (firehose → regex filter → dedup → HN sort → per-author cap) and writes an `app.bsky.feed.generator` record to your repo.

## Architecture

```
┌────────────────────────────────────────────────────┐
│                    Browser                          │
│                                                     │
│  Next.js 14 (static export)    Zustand stores       │
│  Tailwind CSS                  6 stores             │
│  React 18                                           │
│                                                     │
│  ┌─────────────────┐  ┌──────────────────────┐      │
│  │ Embedding Model   │  │ WebLLM (WebGPU)       │      │
│  │ all-MiniLM-L6-v2 │  │ Gemma / SmolLM2       │      │
│  │ ~23MB, ONNX WASM │  │ 400MB–2GB, optional   │      │
│  │ Always available │  │ Seed terms, regex     │      │
│  └─────────────────┘  └──────────────────────┘      │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ AT Protocol Client (@atproto/api)              │   │
│  │ OAuth 2.0 (DPoP tokens, localhost loopback)   │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────┬───────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌───────────┐
│ Bluesky │   │ api.bsky  │   │ skyfeed   │
│ PDS     │   │ .app      │   │ .me       │
│ (your   │   │ (popular  │   │ (feed     │
│  data)  │   │  feeds)   │   │  query    │
│         │   │           │   │  engine)  │
└─────────┘   └───────────┘   └───────────┘
```

A static-export Next.js app. No API server. The entire application runs in the browser, with Bluesky's infrastructure as the only external dependency.

### Key Modules

| `web/src/lib/atproto/` | OAuth auth, feed fetching, PDS record CRUD, feed publisher |
|---|---|
| `web/src/lib/llm/` | Embedding-based topic matching, WebLLM model loading |
| `web/src/lib/store/` | Zustand stores: auth, topics, feed, topic-feed mapping, LLM, moderation |
| `web/src/lib/lexicon/` | Custom AT Protocol record types (`app.agora.*`) |
| `web/src/lib/skyfeed/` | Skyfeed pipeline DSL builder |
| `web/src/components/` | React components: feed, posts, topics, auth, moderation, layout |
| `web/src/app/` | Next.js App Router pages |

## Development

Requires Node.js 18+ and npm.

```bash
cd web
cp .env.example .env.local   # fill in OAuth values
npm install
npm run dev                   # starts at http://localhost:3000
```

### OAuth Setup

Register a Bluesky OAuth client at the [Bluesky Developer Portal](https://bsky.app/settings/app-passwords). On localhost the app uses the AT Protocol loopback OAuth flow (`application_type: native`), so set your redirect URI to `http://localhost:3000/oauth/callback`. In production it reads from `public/client-metadata.json`.

### Build & Export

```bash
npm run build    # generates icons + static export to web/out/
```

### Testing

```bash
npx tsx test.ts              # seed-term generation & feed matching
npx tsx test-agent.ts        # AT Protocol agent
npx tsx test-topic.ts        # topic store integration
npx playwright test          # E2E (topic creation flow)
```

### Model Selection

The embedding model downloads on first use and caches via the browser's standard cache. The WebLLM model is selected automatically based on device capability:

| Device | Model | Size |
|---|---|---|
| Desktop (WebGPU, >8GB RAM) | Gemma 2 2B IT | ~1.9 GB |
| Mobile (WebGPU) | Gemma 3 1B IT | ~0.7 GB |
| Fallback (low RAM) | SmolLM2 360M | ~0.4 GB |

All AI is optional. The app works with keyword-only matching if no model is loaded.

### PWA

The app is a fully offline-capable Progressive Web App. The service worker (`public/sw.js`) uses cache-first for static assets and network-first for API calls, bypassing the OAuth callback path to avoid iOS PWA redirect issues.

## License

[GPL v3](LICENSE)
