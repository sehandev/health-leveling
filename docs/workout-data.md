# Strength Workout Data

`migrations/0003_strength_workouts.sql` adds confirmed, unlinked Strength Training records, an exact custom-picker usage registry, current per-item/group muscle awards, and signed muscle XP history. The migration leaves `0001` and `0002` unchanged, preserves existing Body Metric rows and awards, and creates no historical workout data or XP backfill.

## API

All routes use the existing `handleHealthRequest` D1 binding and return JSON with `Cache-Control: no-store`. A missing `env.DB` remains `503`; mutations require `application/json` and reject a mismatched `Origin` when present. These same-origin checks are not authentication, and the API adds no owner model.

- `GET /api/health/workouts` returns `{ workouts: StrengthWorkoutRecord[] }`, newest `recordedAt` first with stable insertion-order ties.
- `GET /api/health/workouts/:id` returns `{ workout }` or `404`.
- `POST /api/health/workouts` requires a UUID `Idempotency-Key` header, accepts the unchanged `StrengthWorkoutDraft` JSON, and returns `201 { workout, xpChange: { added, cancelled } }`. Future `recordedAt` instants are rejected with `400`. Repeating the key with the same canonical parsed draft returns `200` with the existing current workout and zero XP delta; a different draft returns `409`. Replaying after deletion returns `410` and never recreates the source.
- `PUT /api/health/workouts/:id` accepts the complete draft plus `expectedVersion`; it returns `{ workout, xpChange }`. Future `recordedAt` instants return `400`; stale versions return `409`. An unchanged draft still advances its source version and confirmation time, but creates no muscle awards or events.
- `DELETE /api/health/workouts/:id` requires JSON `{ expectedVersion }`; it returns `{ ok: true, xpChange }`, or `404`/`409` without deleting a missing or stale source. Existing legacy sources with future `recordedAt` values remain readable and deletable. The client is responsible for explicit Delete/Cancel confirmation.
- `GET /api/health/workout-picker` returns `{ usages, selections }` as `WorkoutPickerState`. Selections are derived from currently saved workout sources, including empty targets; deleting a source removes its name/sets/selection from picker history.
- `POST /api/health/workout-picker/usages` accepts `{ usageId, mode, name }` and returns `{ usage }`. `usageId` is a UUID and retries with the same mode/name are idempotent; reusing it with different values returns `409`. Clients call this only after an explicit custom-item insertion, never while typing, loading, or selecting a curated item.
- `GET /api/health/progression` retains its existing `avatar`, `bodyMetrics`, and `days` response and adds `muscles` in `MUSCLE_GROUPS` order. It composes the Body Metric source/award snapshot with signed workout events under one verified progression revision.

The draft and record shape is defined by `src/domain/workout-records.ts`. The API uses `parseStrengthWorkoutDraft`, `muscleAwardsForWorkout`, and `reconcileMuscleAwards` rather than implementing independent validation or XP rules. Wall-clock future validation applies only at live create/update boundaries; saved rows are structurally parsed without a current-time restriction. Custom names remain exact, including whitespace/case; a name containing only whitespace is invalid. Curated and custom sources remain distinct.

## Storage and XP

`0004_forearms_muscle_group.sql` expands the existing award and event constraints to include `Forearms`, preserving existing rows and event sequence. It does not backfill past awards or alter recorded targets; explicitly adding `Forearms` to a qualifying saved item follows the normal edit-award rule.

`strength_workouts` stores the current source draft, version, event-local date, server creation/update instants, and CAS confirmation revision. The revision breaks same-instant picker-selection ties in favor of the latest saved source. Source data is physically deleted on confirmed deletion. `strength_workout_create_requests` retains only the normalized UUID key, SHA-256 of the canonical parsed draft, and opaque workout ID; it has no foreign key to source rows, so its mapping remains after deletion to prevent resurrection without retaining names or sets. `strength_workout_muscle_awards` stores only currently active `(workout_id, item_id, group)` awards; composite keys scope repeated local item IDs to their owning workout. `muscle_xp_events` stores only IDs, group, signed delta, event local date, confirmation instant, and sequence. It does not reference retained source details, so deleting a Workout cannot leave its name or sets behind.

A qualifying Machine/Free Weight item awards +1 per selected target group once when any saved set has at least one rep; Bodyweight never awards. Muscle groups and stored awards are side-independent, so a bilateral group is counted once per item, not once per side. Unchanged item/group pairs retain their award identity and produce no new event on PUT. New +1 events on initial creation use the Workout's recorded local date; newly qualifying edit awards use the current profile timezone at server confirmation (UTC if no profile exists). Every -1 event uses the local date of the currently active matching +1 grant, including a later re-award, regardless of subsequent Workout date/timezone changes or current profile timezone. Event `occurredAt` remains the server confirmation instant. Legacy negative events that stored the old correction-date value compose against their matching grant date without a destructive ledger rewrite.

Future Workout `recordedAt` instants are rejected on create and update by a live server-time check. This check is separate from structural saved-record parsing, so legacy future-dated sources remain readable and can be deleted. Current awards, source versions, picker usage writes, and events share the token-guarded `health_progression_revision` D1 compare-and-swap used by Body Metrics. Each dependent statement checks the CAS token; D1 batch atomicity prevents partial source/award/ledger changes. Stale versions and repeated revision conflicts return `409`.

The progression composer validates event IDs, pair order, current award balances, per-group totals, and daily cumulative XP. It matches each debit to its active grant date for historical progression, including legacy events whose stored negative `localDate` is an old correction date; no event rows are rewritten and XP is not clamped.

## Input limits

Workout JSON bodies are limited to 64 KiB; picker-usage requests use the existing 16 KiB bound. Domain parsing limits item names to 256 characters, place to 500, note to 10,000, timezone to 255, at most 100 items and 100 sets per item, and stable item IDs to 255 characters. Muscle groups are drawn from the fixed eleven-group catalog; repeated selected groups are deduplicated. These transport limits do not define clinical measurement precision or impose a load/reps upper range. Custom picker names are limited to 256 characters and preserve exact nonblank text.

## Migration and tests

From the repository root, apply the configured local D1 migrations with:

```sh
pnpm exec wrangler d1 migrations apply health-leveling-local-example --local
```

Use a separate isolated persistence directory for temporary migration/browser tests; do not clear the regular `.wrangler/state` directory. Migration-backed server tests execute the real SQL in SQLite on Node 24:

```sh
node --experimental-strip-types --experimental-sqlite --test src/server/health-api.test.ts
```

The suite covers legacy migration preservation, award/event/idempotency metadata constraints, exact picker usage, required-key create replay/mismatch/concurrency/deleted replay, future create/update rejection with no mutation, now/past writes, readable/deletable legacy future sources, timezone-inverted cancellation and re-award dates, legacy ledger composition without rewrite, CAS and rollback atomicity, Body Metric history/undo, and request validation.
