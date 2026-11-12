# 나건렙 — 나답게 건강 레벨업

Mobile-first personal health-record foundation built with pnpm, TanStack Start, React, TanStack Query/Form, and Cloudflare Workers/D1. UI copy is Korean; body-weight values are stored canonically in kilograms, while the profile controls display units and the recording IANA timezone.

## Current slice

- Home page with explicit body-weight measurement save, recording date/time and timezone, latest-only undo, and a numeric body-weight goal.
- Persistent body-metric XP and derived Avatar level, with a focused expandable 14-day weight/XP progression view. Undo removes the source measurement and its XP from historical progression; saves disclose whether they earned 1 XP.
- XP display currently reflects body-metric awards only; workout and supplement XP are not connected yet. No inactivity or unfavorable-measurement penalty is applied.
- Profile unit/timezone settings, accessible reusable form controls, and loading/error/empty states.
- API calls use TanStack Query as the single server-state cache and are served by `handleHealthRequest` from the server-side `/api/health/*` route.
- No fabricated records, owner/auth model, or AI auto-confirmation. Other product domains remain out of scope for this foundation.

## Local development

Requirements: Node.js 24+, pnpm 10.28.2, and Cloudflare `cf` CLI v1.0.0-beta.18.

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs Vite with the official Cloudflare Vite plugin and Workers runtime. `pnpm dev:cf` invokes `cf dev`, which selects the framework's local development command when available. Use `pnpm build` for the production Worker build, `pnpm typecheck` for Cloudflare binding type generation plus TypeScript, and `pnpm test` for the Node 24 TypeScript tests under `src/domain`, `src/server`, `src/lib`, and `bridge`.

Cloudflare's current TanStack Start integration requires Wrangler as the Vite plugin's peer dependency and uses `wrangler types` to generate binding types. `cf` remains the primary Cloudflare operations CLI. `cf dev` and `cf build` are the preferred local Cloudflare workflows; Wrangler is limited to the plugin-required type generation and local D1 migration exception below. `cf d1 migrations apply` requires a database ID (not a binding name), while this local-only config intentionally has no ID, so apply local migrations with `pnpm exec wrangler d1 migrations apply health-leveling-local-example --local --persist-to ./.wrangler/state`.

## Local bindings

`wrangler.jsonc` contains example-only D1 (`DB`) and private R2 (`IMAGE_BUCKET`) binding names. The D1 binding intentionally omits a database ID for local-only use; replace the example database and bucket names and add the actual D1 ID only after the matching resources are intentionally provisioned. No remote resources are created by install, local development, builds, tests, or migrations. Do not deploy until the binding IDs and access plan have been reviewed. Use a separate `--persist-to` directory for stateful synthetic browser tests rather than clearing or reusing an existing local D1 state.

## Privacy and deployment warning

The MVP is intentionally public and has no login or ownership model. Anyone who can reach a deployed instance can view, add, change through the supported undo flow, and remove health data through its API. Do not deploy this app with real personal health data until access management and deployment boundaries have been reviewed. The future local Pi bridge can send prompt data to its configured model provider; it is not wired into this first UI slice.

The root `LICENSE` remains Apache-2.0. Product decisions and broader scope live in `docs/`.
