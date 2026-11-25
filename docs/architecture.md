# MiSub Architecture Guide

MiSub uses a `pnpm` monorepo structure designed to run seamlessly on **Cloudflare Workers** (with Static Assets & Cron Triggers) and **Cloudflare Pages Functions**, backed by **Cloudflare D1** and a **Vue 3** SPA frontend.

---

## 1. Workspace & Directory Structure

```text
MiSub/
├── packages/core/                  # @misub/core — environment-agnostic domain & protocol engine
│   └── src/
│       ├── domain/                 # Business rules (aliases, links, auto-update, reserved paths, rule catalog)
│       ├── ir/                     # Unified NodeIR parsers/serializers (url-ir, clash-ir)
│       ├── node/                   # Node parsing, cleaning, geo/region metadata, compatibility analysis
│       ├── operators/              # Stream pipeline (operator-runner, expression-dsl, node-transformer, legacy-adapter)
│       ├── protocols/              # SS/SS2022, VMess, VLESS, Trojan, HY2, TUIC, Snell, WireGuard, AnyTLS, QX, Surge, Sing-Box, Clash
│       ├── schemas/                # Zod v4 validation contracts (NodeIRSchema, Subscription, Profile, Settings, API payloads)
│       └── types.js                # Shared JSDoc @typedef contracts inferred from Zod schemas
├── functions/                      # Edge API & subscription runtime (Cloudflare Pages Functions / Worker core)
│   ├── app.js                      # Root Hono app (session renewal, CORS/CSRF, asset bypass, sub dispatch, SPA fallback)
│   ├── [[path]].js                 # Cloudflare Pages Functions catch-all entry adapter
│   ├── middleware/                 # Onion middlewares, Zod validators, and WeakMap request-context store
│   ├── modules/
│   │   ├── api-router.js           # Admin & public /api/* Hono sub-router with Zod validation
│   │   ├── external-api/           # Bearer-token /api/ext/v1/* Hono sub-router
│   │   ├── handlers/               # Feature handlers (nodes, preview, backup/WebDAV, Telegram Bot, guestbook, shortlinks)
│   │   └── subscription/           # Modular subscription generation pipeline
│   │       ├── core/               # Request orchestrator, UA format detection, engine options, rule builders
│   │       ├── adapters/           # ClientAdapter registry & lazy dynamic generators (`await import(...)`)
│   │       ├── templates/          # Lazy template renderers (Clash, Surge, Loon, QuanX, Sing-Box, Shadowrocket, Egern)
│   │       ├── cache/              # Edge cache manager & transform template cache
│   │       └── security/           # Fetch rate guard, SSRF safe-fetch/DNS, upstream fetcher
│   ├── repositories/               # Data access abstraction (Subscription, Node, Profile, Settings, AccessLog)
│   ├── services/                   # Application services (subscription refresh, processor, node cache, logs, notifications)
│   └── storage/                    # D1 8-table storage adapter, collection caches, noop fallback
├── src/                            # Vue 3 + Vite 8 + Tailwind CSS 4 SPA
│   ├── lib/                        # HTTP client, API wrappers, TanStack Query client & cache keys
│   ├── queries/                    # @tanstack/vue-query hooks (app data, public profiles, access logs)
│   ├── stores/                     # Canonical Pinia stores (`useXxxStore.js`) focused on client state & UI coordination
│   ├── composables/                # Feature composables (subscriptions, manual nodes, profiles, bulk import, forms)
│   ├── components/modals/          # Unified `ImportModal.vue` (`mode`: bulk / nodes / subscriptions) & domain modals
│   └── views/                      # Route views (Dashboard, SubscriptionGroups, ManualNodes, MySubscriptions, Settings, PublicProfiles)
├── worker.js                       # Cloudflare Worker entrypoint (fetch + native Cron triggers)
├── schema.sql                      # 8-table Cloudflare D1 schema
└── tests/
    ├── unit/                       # Vitest unit & integration suites
    └── e2e/                        # Playwright E2E smoke tests + isolated Worker/MemoryD1 harness
```

---

## 2. Key Architectural Layers

### A. `@misub/core` (`packages/core`) — Single Source of Truth
- Zero runtime dependencies on DOM (`window`, `document`), Node.js built-ins, or Cloudflare Worker globals.
- Shared directly by both Vite (`src/`) and Wrangler/Workers (`functions/`), ensuring identical URL parsing, SS2022 validation, operator DSL execution, and client compatibility checks on client and edge.
- `NodeIRSchema` acts as the canonical intermediate representation between inbound formats (URI links, Surge, Quantumult X, V2RayN, Clash YAML, Sing-Box JSON) and outbound generators.

### B. Hono Edge Router & Lazy Client Adapters (`functions/`)
- Requests pass through global onion middlewares in `functions/app.js`: `sessionRenewalMiddleware` -> `corsCsrfSecurityMiddleware` -> fast-path public asset bypass -> request context & subscription dispatcher -> `/api` (`apiApp`) / `/cron/*` / SPA fallback (`evaluatePageAccess`).
- `functions/modules/subscription/adapters/adapter-registry.js` lazily imports only the matched `ClientAdapter` generator and template renderer per request (`await import(...)`), minimizing Worker cold-start parsing and CPU time.

### C. Repository Pattern & 3-Tier Cache (`functions/repositories/`)
- Storage access goes through `SubscriptionRepository`, `NodeRepository`, `ProfileRepository`, `SettingsRepository`, and `AccessLogRepository`.
- `MultiTierCache` coordinates **In-Memory Map -> Cloudflare Cache API (`misub:repository`) -> D1 Database** with single-flight coalescing, negative-lookup sentinels, generation invalidation, and `db.batch([...])` write coalescing.
- Persistence uses Cloudflare D1 (`MISUB_DB`) across 8 row-level tables (`subscriptions`, `nodes`, `profiles`, `guestbook`, `settings`, `cache`, `access_logs`, `error_reports`) defined in `schema.sql`.

### D. Frontend State Governance (`src/queries/` + `src/stores/`)
- Server-state fetching and cache invalidation are managed by `@tanstack/vue-query` (`src/queries/useAppDataQueries.js`, `usePublicProfilesQuery.js`, `useAccessLogsQuery.js`).
- Pinia stores follow uniform `useXxxStore.js` naming (`useDataStore.js`, `useSessionStore.js`, `useSettingsStore.js`, `useThemeStore.js`, `useToastStore.js`, `useUiStore.js`, `useEditorStore.js`, `useVersionStore.js`).
- All subscription/node import entry points (`bulk`, `nodes`, `subscriptions`) converge into `src/components/modals/ImportModal.vue`.

---

## 3. Common Development & Verification Commands

```bash
# Install monorepo workspace dependencies
pnpm install

# Local D1 initialization / migration
npx wrangler d1 execute misub --file=schema.sql --local
npx wrangler d1 execute misub --file=schema.sql --remote

# Local frontend dev + Worker API proxy
pnpm dev:worker   # Terminal 1: Wrangler Worker + local D1 on port 8787
pnpm dev          # Terminal 2: Vite dev server (proxies /api and /sub/ to 8787)

# Preview built Pages Functions locally with D1
pnpm build
npx wrangler pages dev dist --d1 MISUB_DB=misub

# Static analysis, unit tests, and E2E tests
pnpm exec oxlint
pnpm test
pnpm run test:e2e
pnpm build
```
