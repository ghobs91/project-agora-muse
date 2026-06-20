# Style and Conventions

- TypeScript with explicit types on store interfaces and public functions
- Functional React components, `'use client'` for client components
- Tailwind CSS utility classes
- Zustand stores created with `create<StoreType>((set, get) => ({...}))`
- LLM modules use module-level singletons (engine, pipeline, listeners)
- Comments use `// ─── Section ─────────────────────────────────────` dividers in some modules
- Error handling: catch errors, log to console, set status to 'error'
- Client-side guards: `typeof window === 'undefined'` checks for SSR safety
