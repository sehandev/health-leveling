# Product Roadmap

This roadmap decomposes the product into epics with dependency-aware completion criteria. It has no dates or estimates yet. Phases define implementation order, not a reduced feature scope for the first release. UI copy is Korean; canonical domain concepts and implementation discussions use English. See [Product Concept](product-concept.md), [Domain Glossary](domain-glossary.md), and [Cloudflare CLI and Local Pi Bridge](cloudflare-cli.md).

## Phase 0 — Product Definition

### Work

- **Decided:** the first release is a private, single-user personal app; in-app registration and multi-user support are out of scope initially.
- **Decided:** organize the daily journey into seven contextual touchpoints: Wake-up, Post-breakfast, Post-lunch, Post-dinner, Pre-workout, Post-workout, and Bedtime.
- **Decided:** Wake-up's first four pages are editable current `Body Weight`; 14-day daily weight graph; current `Avatar` level and XP; 14-day daily graph with cumulative XP line and `Avatar` Level step line. `Height` is not shown at Wake-up. Continuing without edits records that day's value unchanged.
- **Decided:** if a `Primary Goal` exists, the final page shows one `Next Best Action` balanced between today's `Plan` and that goal. If there is no `Primary Goal`, show the four Goal setup choices; if no choices are available, show only today's `Plan` and finish.
- **Decided:** the four initial `Goal Type` choices are `Target Body Weight`, `Target Body Fat Percentage`, `Muscle Gain`, and `Performance Goal`.
- **Decided:** `Target Body Weight` stores only the target value and `Target Date`; `Target Body Fat Percentage` stores only the target percentage and `Target Date`. Neither stores a separate start value.
- **Decided:** `Muscle Gain` has two sub-options: general muscle development with a `Target Date` only, or whole-body InBody `Skeletal Muscle Mass` with a target value and `Target Date`. The InBody option is a subtype, not a fifth top-level Goal Type.
- **Decided:** a `Performance Goal` can combine multiple target metrics/values, such as distance and duration; every target condition must be met to complete the goal. It stores no separate start value; workout records provide observed progress. Support `Load` (kg), `Reps` (count), `Distance` (km), `Duration` (seconds/minutes), and `Pace` (min/km). `Load`, `Reps`, `Distance`, and hold duration default to at-or-above target; completion time and `Pace` default to at-or-below target.
- **Decided:** both graphs share a visual design; the `Body Weight` graph uses 5-display-unit scale/reference intervals.
- **Decided:** `Next Best Action` recommends one action to do at any point today, not necessarily immediately.
- **Decided:** use a **Balanced** policy that considers both today's `Plan` and progress toward the `Primary Goal`.
- **Decided:** the user designates one active `Goal` as the `Primary Goal`; `Next Best Action` uses it as the main goal-priority signal. Exact ranking signals and tie-breakers remain open.
- **Decided:** assemble the daily `Plan` from existing sources such as `Program` workouts and scheduled supplement routines, with user-added actions; a separate full-featured planner is out of scope initially.
- **Decided:** all recommendations, inferred values, and prefilled suggestions across every domain are proposals only. The user explicitly confirms before they create or modify a source record, are applied to a `Plan`/`Goal`, or count as a completed action. Derived AI outputs and recommendation sessions may be stored separately but are not user-confirmed facts. Save/Confirm/Continue actions count as confirmation; avoid redundant confirmation dialogs. Derived analysis may be shown after the source record is confirmed.
- **Decided:** `Pre-workout` is a page for deciding what workout to do, with today's scheduled workout prefilled as the initial value. The user may edit or replace it; without a scheduled workout, the selection starts empty. The prefilled value does not itself modify `Program` or `Plan`. There is no separate start/select/modify menu or standalone add action. A left-arrow back control lets the user exit if they entered by mistake; this is not a `Skip` action.
- **Decided:** `Workout Type` values are `Strength Training`, `Cardio/Endurance`, `Sport`, `Mobility/Recovery`, and `Other`. `Strength Training` has `Machine`, `Free Weight`, and `Bodyweight` modes; these are not top-level workout types.
- **Decided:** initially offer common `Sport` choices—`Soccer/Futsal`, `Basketball`, `Volleyball`, `Baseball`, `Tennis`, `Badminton`, `Table Tennis`, `Golf`, and `Combat Sports`—plus `Other Sport` with a user-entered name. `Running`, `Cycling`, and `Swimming` are `Cardio/Endurance` activities.
- **Decided:** every workout has an optional plain-text `Note`, entered in a simple textarea without Markdown. Persist a blank note as an empty string.
- **Decided:** meal logging ends after AI nutrition analysis; recommendations are user-initiated. Tapping an empty `Meal Slot` opens a modal `Action Sheet` with `Menu Recommendation` and `Log Meal`. The `Log Meal` flow offers separate `Meal Photo`, `Receipt/Order Import`, and `Manual Food Item Entry` modes. AI extracts candidate `Food Items` from both meal photos and image-based receipts/orders; the user reviews and confirms before saving. Retain the original receipt/order image with the saved Meal. PDF import is unsupported initially.
- Define the full first-release scope, primary user journeys, page map, and acceptance criteria. Map the relevant actions to each touchpoint and protect access if the app is remotely reachable.
- Confirm domain fields, units, timezone behavior, and InBody report metrics.
- Specify XP awards, the supplement counting unit, and how body-metric levels relate to user goals.

### Done when

- The first release's included and excluded features are explicit.
- Each touchpoint has a clear purpose, relevant actions, and a focused mobile flow.
- The Wake-up flow's page sequence and graph behavior are defined, including daily value capture and the XP/Level series.
- `Next Best Action` selection is grounded in a clearly defined daily horizon and ranking policy.
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

- No in-app registration or multi-user authentication in the initial single-user release.
- Define owner-only access control for remote use, plus profile, timezone, and unit preferences.
- Create D1 schemas and migrations for source records and derived data.
- Implement private image upload and retrieval through R2 for meal/progress photos and retained receipt/order source images.
- Define edit, delete, and image cleanup behavior, including deleting all images associated with a Meal when that Meal is deleted.

### Done when

- A user can create, view, update, and delete their own records and associated images.

## Phase 3 — Core Logging

Implement manual source-data capture before relying on AI:

- **Body Metrics**: body weight and individual body-composition metrics.
- **Goals**: measurable and qualitative goals with a `Target Date`.
- **Meals**: separate `Meal Photo`, `Receipt/Order Import`, and `Manual Food Item Entry` modes; `Food Items`, `Place`, dining companions, and time. Retain receipt/order source images with saved meal records.
- **Supplements**: items, dosage, intake time, daily/weekly targets, and adherence records.
- **Workouts**: `Workout Type`-specific logging for `Strength Training`, `Cardio/Endurance`, `Sport`, `Mobility/Recovery`, or `Other`. `Strength Training` distinguishes `Machine`, `Free Weight`, and `Bodyweight` modes. Capture applicable exercises, target muscles, equipment, duration, distance, place, and optional workout-level `Note`. Use the curated `Sport` list plus `Other Sport` for custom names. For `Strength Training`, record `Reps` and one optional `Load` separately for each set; omit `Load` for bodyweight-only sets rather than entering zero or the user's `Body Weight`. Do not record set rest time. For `Cardio/Endurance`, derive `Pace` (min/km) from `Duration` and `Distance` when both are available.
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
- Add matching daily-granularity 14-day graphs: `Body Weight` with 5-unit scale intervals, and cumulative XP with an `Avatar` Level step line.
- Add progress-photo timeline and side-by-side comparison.
- Split details into focused mobile-first screens with progressive disclosure.

### Done when

- Users can understand current progress and historical plateaus without a dense dashboard.

## Phase 6 — AI Insights

Add AI features after the corresponding source-data flows exist:

1. Estimate meal nutrition from photos and `Food Items`, including `Calories`, macros, sugar, and sodium.
2. Show estimates as estimates and preserve source, status, and provenance.
3. Support corrections and clearly handle low-confidence or failed analysis.
4. Extract candidate `Food Items` from meal photos and image-based receipt/order uploads. Identify a specific branded/menu item when possible, otherwise use a generic food item. Require user review and confirmation before saving; do not support PDF import initially.
5. Provide on-demand meal/menu recommendations based on prior meals, current body metrics, active goals, current time, and remaining meal slots. Return 1–3 ranked options with reasons, and store the input snapshot, output, and selection/no-selection for future personalization. Do not proactively suggest meal improvements after logging or mutate Meal, `Draft`, or `Plan` data.
6. Provide next-workout suggestions based on `Program` and workout history.
7. Add supplement routine insights where deterministic rules are sufficient; use AI only if it adds value.

### Done when

- AI failure or delay does not lose source records, and users can distinguish estimates from measured or entered values.

## Phase 7 — Release Readiness

### Work

- Test owner-only access, upload limits, deletion (including cleanup of every image associated with a deleted Meal), and Access boundaries.
- Test XP calculations, migrations, AI timeouts, retries, and error handling.
- Test and clearly communicate AI unavailability when the Mac or Tunnel is offline.
- Verify mobile usability, accessibility, and performance.
- Add operational logging and a backup/recovery plan appropriate to the release.
- For a public release, replace or supplement the development-Mac Pi dependency with an available production AI runtime and decide how health data may be sent to model providers.

### Done when

- The private single-user release works reliably within its documented Mac/Tunnel availability constraints.
- Any later public or multi-user release has a separately available AI runtime and an explicit data-access model.

## Confirmed Initial Release Scope

The first complete release includes all planned core domains, AI, and progression features:

- Manual logging for meals, supplements, workouts, body metrics, goals, and progress photos.
- `Avatar`, muscle/body-metric/overall levels, non-decreasing XP, and progress history.
- AI meal-nutrition estimation and meal recommendations.
- Program- and workout-history-based training recommendations.

The feature scope is decided; Phase 0 still needs detailed acceptance criteria and user journeys. Implementation remains phased so each domain can be tested before later features depend on it. The Pi-on-Mac integration is the initial AI runtime; AI availability depends on the Mac and Tunnel being online.

## Key Dependencies

- Product scope and metric definitions precede schema design.
- The Pi/Tunnel feasibility spike precedes app-level AI integration.
- Core source-data flows precede XP rules, trends, and AI recommendations.
- A Mac-hosted Pi bridge is a prototype dependency; public availability requires a separately available AI runtime.
