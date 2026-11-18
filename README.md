# 나건렙 — 나답게 건강 레벨업

Mobile-first personal health-record app built with pnpm, TanStack Start, React, TanStack Query/Form, and Cloudflare Workers/D1. UI copy is Korean; body-weight and workout loads are stored canonically in kilograms, with profile-wide display units and recording timezone.

## Current slice

- Home shows an interactive body scan with muscle progression and navigation. Body-weight registration, record history and latest-record undo, goal view/registration, profile settings, weight progression, XP progression, and strength workouts have separate pages.
- Confirmed `Strength Training` records support ordered exercises, sets, exact-name custom picker history, editing, deletion, and per-muscle progression. Qualifying Machine and Free Weight items award muscle XP; Bodyweight items do not.
- Avatar XP includes body-metric and muscle-group awards. Supplement XP is not connected; Cardio/Endurance, Sport, Mobility/Recovery, Other, Program, Plan linking/completion, AI workout suggestions, and the broader Wake-up flow remain out of this slice.
- Body-metric undo removes its source measurement and award, then recomputes its historical progression. Workout creation and editing reject future recording instants. Workout XP cancellations are reflected on the canceled award's original registered date, regardless of later timezone changes; historical progression is recomputed. Newly qualifying awards from edits use their own registered edit date. No initial records or XP are fabricated or backfilled.
- TanStack Query is the single server-state cache. UI displays concise loading, error, empty, and save-result states without visible policy, phase, or disclaimer prose.

## Local D1 setup

Apply the checked-in migrations to the example local database before starting the app:

```sh
pnpm exec wrangler d1 migrations apply health-leveling-local-example --local --persist-to ./.wrangler/state
```

This uses the local `DB` binding in `wrangler.jsonc`; it does not create or modify a remote database. Migrations are additive. Keep existing local D1 state. For synthetic browser QA, use a temporary config and a separate disposable `--persist-to` directory; never clear or reuse `./.wrangler/state`, and never seed QA fixtures with personal health records.

## Local development

Requirements: Node.js 24+, pnpm 10.28.2, and Cloudflare `cf` CLI v1.0.0-beta.18.

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs Vite with the official Cloudflare Vite plugin and Workers runtime. `pnpm dev:cf` invokes `cf dev`, which selects the framework's local development command when available. Use `pnpm build` for the production Worker build, `pnpm typecheck` for Cloudflare binding type generation plus TypeScript, and `pnpm test` for the Node 24 TypeScript tests under `src/domain`, `src/server`, `src/lib`, and `bridge`.

Cloudflare's current TanStack Start integration requires Wrangler as the Vite plugin's peer dependency and uses `wrangler types` to generate binding types. `cf` remains the primary Cloudflare operations CLI. `cf dev` and `cf build` are the preferred local Cloudflare workflows; Wrangler is limited to plugin-required type generation and the local D1 migration command above.

## Local bindings

`wrangler.jsonc` contains example-only D1 (`DB`) and private R2 (`IMAGE_BUCKET`) binding names. The D1 binding intentionally omits a database ID for local-only use; replace the example database and bucket names and add the actual D1 ID only after the matching resources are intentionally provisioned. No remote resources are created by install, local development, builds, tests, or migrations. Do not deploy until binding IDs and access boundaries have been reviewed.

## Security boundaries

### Public MVP app access

The MVP app has no login or ownership model. Anyone who can reach a deployed instance can view, add, and delete health data through its API; supported body-metric correction is undo-and-reenter. Do not deploy with real personal health data until app access management and deployment boundaries have been reviewed.

### Pi bridge Access

Worker-to-bridge Cloudflare Access/Tunnel protection is separate from app-user authentication and does not secure the public health API. The Pi bridge is not connected to this UI slice. If enabled later, prompts may contain health data and the configured model provider may receive it; review that boundary before sending any user data.

The root `LICENSE` remains Apache-2.0. Product decisions and broader scope live in `docs/`.
