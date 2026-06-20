# Suggested Commands for Agora Muse

## Development
- `cd web && npm run dev` — Start Next.js dev server
- `cd web && npm run build` — Build production static site
- `cd web && npm run lint` — Run ESLint
- `cd web && npm start` — Start production server (after build)

## Manual Testing
- `cd web && node test-playwright.js` — Playwright script for topics page
- `cd web && npx ts-node test-topic.ts` — Test topic store manually
- `cd web && npx ts-node test-agent.ts` — Test AT Protocol agent manually

## Deployment
- Static site is deployed to Netlify (live at https://agora-muse.netlify.app)
- `npm run build` generates the `web/dist` (or `web/out`) directory for deployment
