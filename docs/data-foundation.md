# Health Data Foundation

`migrations/0001_health_foundation.sql`, `0002_body_metric_xp.sql`, and `0003_strength_workouts.sql`, plus `src/server/health-api.ts`, provide D1 source data and progression for profile preferences, confirmed Body Metric records/goals/awards, and unlinked confirmed Strength Training workouts with muscle awards/events. No owner/auth model or fabricated initial data is stored. Body Metric correction remains latest-once undo; Workout correction uses optimistic versioned PUT/delete.

## D1 integration

The Worker environment must expose a structurally compatible D1 binding as `env.DB`. After the root app configures D1 and its database name, apply this migration from the repository root with `pnpm exec wrangler d1 migrations apply <configured-database-name> --local` (use `--remote` only for an explicitly provisioned deployment). No database has been provisioned here. Missing `DB` returns `503` rather than falling back to memory.

The API module has no Cloudflare runtime import, so it can be imported by Node tests. Run the migration-backed API tests on Node 24 with:

```sh
node --experimental-strip-types --experimental-sqlite --test src/server/health-api.test.ts
```

## API

`handleHealthRequest(request, env)` returns `undefined` outside `/api/health/*`; health routes return JSON with `Cache-Control: no-store`.

- `GET|PUT /api/health/profile`: `{ unitPreference: "Metric" | "Imperial", timezone: string, initialized: boolean }`. GET returns `initialized: false` only when no profile row exists; PUT always returns `initialized: true`, and any existing row remains initialized even when its saved values are the defaults `Metric` and `UTC`.
- `GET /api/health/measurements?metric=<metric>`: `{ measurements: [...] }`, each including `xpAwarded`, ordered by recorded instant descending and insertion sequence for timestamp ties.
- `POST /api/health/measurements`: JSON `{ metric, value, recordedAt, timezone }`; returns `{ measurement }` including `xpAwarded` with `201`.
- `GET /api/health/progression?endDate=YYYY-MM-DD` (optional): returns the 14-day progression snapshot ending on `endDate`, or today in the stored profile timezone (UTC only when the profile is absent). Invalid, repeated, or unknown query parameters are rejected.
- `POST /api/health/measurements/:id/undo`: JSON `{}`; returns `{ ok: true }`. Only the latest saved measurement for that metric is undoable; deletion is physical, and a consumed prior measurement does not become undoable.
- `GET /api/health/goals`: `{ goals: [...] }`.
- `POST /api/health/goals`: JSON `{ metric, targetValue, targetDate }`; returns `{ goal }` with `201`, deactivating the prior active goal for that metric in the same guarded D1 batch and resetting comparison history at the server activation time.
- Strength Workout CRUD, required create idempotency, live future-time rejection with legacy future-source read/delete support, grant-date XP cancellation, picker usage, transport bounds, and migration behavior are specified in [Workout Data](workout-data.md).

`body_weight` and `skeletal_muscle_mass` values/targets are canonical kg; `body_fat_percentage` values/targets are percentages. Measurement timestamps must be UTC ISO instants and timezones valid to `Intl`; each saved record stores that supplied timezone and a local date derived from it. The API never substitutes the profile timezone for an event timezone. Numeric checks require finite positive mass values and a body-fat percentage from 0 through 100; they do not invent upper clinical limits or precision rules. Goal dates are real `YYYY-MM-DD` calendar dates. Mutations require `application/json`, are limited to 16 KiB, and reject mismatched `Origin` headers when provided. This is a same-origin browser guard, not authentication.

The app should initialize preferences from `Intl.DateTimeFormat().resolvedOptions().timeZone` and its selected unit preference only when GET returns `initialized: false`; do not infer initialization from the preference values, since a saved `Metric`/`UTC` profile is intentionally initialized. Until first PUT, GET returns `{ unitPreference: "Metric", timezone: "UTC", initialized: false }`; this fallback is not used for measurement timestamps or local dates. This initialization belongs to the platform/UI integration.

## Body Metric XP persistence

Migration `0002_body_metric_xp.sql` preserves all `0001` source rows and starts with no award backfill. `body_metric_xp_awards` records only retained source-linked 1XP awards and constrains one award per measurement and one per metric/event-local-date; deleting an undoable measurement deletes its own award in the same batch. Goal replacement retains all prior awards. XP is calculated with `shouldAwardBodyMetricXp` from `src/domain/body-metrics.ts`, including its target-gap rules, reset activation time, local-day cap, 7-day awarded baseline, and machine-arithmetic tolerance; the API introduces no separate measurement precision rule. Levels are derived at 10XP per level and never stored. Migration `0003_strength_workouts.sql` adds current muscle awards per workout/item/group and signed muscle XP events without backfilling historical source records; supplement awards are not implemented.

All measurement saves, latest-once undos, goal replacements, Workout source/version updates, picker usage writes, and muscle award/event changes use `health_progression_revision` optimistic compare-and-swap with a unique per-attempt token; each dependent D1 statement checks the next revision and token. D1 batch atomicity makes a failed dependent write roll back the revision and all related changes; stale snapshots retry up to six times, then return `409`. This avoids process-only locks and protects writes across Workers. Progression and picker/list snapshots verify the revision around their related reads and retry on concurrent writes.

`GET /api/health/progression` delegates aggregation to `buildProgressionSnapshot` in `src/domain/progression-view.ts`: the 14-day weight series uses the latest saved daily weight, and cumulative XP includes retained Body Metric awards and signed muscle events before the displayed window. A muscle-event debit is composed on the registered date of its matched active grant, including legacy events whose stored negative date reflects the former edit-date rule; source event rows are not rewritten. New Workout writes reject future recording instants, but saved legacy future sources remain readable and deletable.
