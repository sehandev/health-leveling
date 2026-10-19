# Product Roadmap

This roadmap decomposes the product into epics with dependency-aware completion criteria. It has no dates or estimates yet. UI copy is Korean; canonical domain concepts and implementation discussions use English. See [Product Concept](product-concept.md), [Domain Glossary](domain-glossary.md), and [Cloudflare CLI and Local Pi Bridge](cloudflare-cli.md).

## Phase 0 — Product Definition

### Work

- Decide whether the first release is a personal tool or a multi-user product.
- Define the MVP boundary, primary user journeys, page map, and acceptance criteria.
- Confirm domain fields, units, timezone behavior, and InBody report metrics.
- Specify XP awards, the supplement counting unit, and how body-metric levels relate to user goals.

### Done when

- The MVP's included and excluded features are explicit.
- Core records and progression rules have unambiguous definitions.

## Phase 1 — Platform Foundation and Feasibility

### Work

- Establish the pnpm, TanStack Start, shadcn/ui, and Cloudflare project structure.
- Pin and authenticate the `cf` CLI; validate the TanStack Start build/deploy path with it.
- Verify Workers deployment, D1 migrations, and R2 image storage.
- Build a minimal proof of concept for `Worker → Tunnel + Access → Mac HTTP bridge → Pi CLI RPC`.

### Done when

- A minimal application deploys and reads/writes a test D1 record and R2 object.
- A test request reaches Pi through the protected Tunnel without exposing raw RPC.

## Phase 2 — Identity and Data Foundation

### Work

- Implement authentication and per-user data ownership if the MVP is multi-user.
- Define profile, timezone, and unit preferences.
- Create D1 schemas and migrations for source records and derived data.
- Implement private image upload and retrieval through R2.
- Define edit, delete, and image cleanup behavior.

### Done when

- A user can create, view, update, and delete their own records and associated images.

## Phase 3 — Core Logging

Implement manual source-data capture before relying on AI:

- **Body Metrics**: body weight and individual body-composition metrics.
- **Goals**: measurable and qualitative goals with a `Target Date`.
- **Meals**: photos, `Food Items`, `Place`, dining companions, and time.
- **Supplements**: items, dosage, intake time, daily/weekly targets, and adherence records.
- **Workouts**: exercises, target muscles, equipment, sets, load, duration, place, and feedback.
- **Program**: training split and planned workout sessions.
- **Progress Photos**: dated upload, timeline, and comparison.

Each record flow should support validation, useful empty/error states, and correction or deletion of an entry.

### Done when

- Users can enter and review the core health records on mobile without AI being available.

## Phase 4 — XP and Leveling

### Work

- Define qualifying actions and XP awards.
- Keep the XP threshold per level fixed; never deduct XP.
- Resolve XP behavior for supplement item counts.
- Calculate muscle-group, body-metric, and overall `Avatar` levels.
- Store XP awards/history so retries or edits cannot accidentally award XP twice.

### Done when

- A qualifying action changes progression exactly once according to the documented rules.
- Missed days and unfavorable measurements never remove XP or levels.

## Phase 5 — Dashboard and Progress Views

### Work

- Create the minimalist `Avatar` view with selectable body areas.
- Show concise overall and per-area levels and XP progress.
- Add body-metric trends and XP/level history.
- Add progress-photo timeline and side-by-side comparison.
- Split details into focused mobile-first screens with progressive disclosure.

### Done when

- Users can understand current progress and historical plateaus without a dense dashboard.

## Phase 6 — AI Insights

Add AI features after the corresponding source-data flows exist:

1. Estimate meal nutrition from photos and `Food Items`, including `Calories`, macros, sugar, and sodium.
2. Show estimates as estimates and preserve source, status, and provenance.
3. Support corrections and clearly handle low-confidence or failed analysis.
4. Provide next-meal guidance based on goals and meal history.
5. Provide next-workout suggestions based on `Program` and workout history.
6. Add supplement routine insights where deterministic rules are sufficient; use AI only if it adds value.

### Done when

- AI failure or delay does not lose source records, and users can distinguish estimates from measured or entered values.

## Phase 7 — Release Readiness

### Work

- Test authentication, data isolation, upload limits, deletion, and Access boundaries.
- Test XP calculations, migrations, AI timeouts, retries, and error handling.
- Verify mobile usability, accessibility, and performance.
- Add operational logging and a backup/recovery plan appropriate to the release.
- For a public release, replace or supplement the development-Mac Pi dependency with an available production AI runtime and decide how health data may be sent to model providers.

### Done when

- The chosen release scope works reliably without relying on an individual developer's local session or machine.

## Proposed MVP Cut Line — Not Final

A reasonable first release is manual tracking for the selected core domains, goals, and a basic `Avatar`/XP progression loop. AI meal analysis and personalized recommendations can follow as a second milestone after the data model and logging flows are stable. This cut line is a proposal; the release scope must be confirmed in Phase 0.

## Key Dependencies

- Product scope and metric definitions precede schema design.
- The Pi/Tunnel feasibility spike precedes app-level AI integration.
- Core source-data flows precede XP rules, trends, and AI recommendations.
- A Mac-hosted Pi bridge is a prototype dependency; public availability requires a separately available AI runtime.
