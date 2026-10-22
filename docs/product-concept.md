# Product Concept

See [Product Roadmap](roadmap.md) for the confirmed first-release scope and implementation phases.

## Product Vision

A mobile-first personal health and fitness tracking service that turns a user's health records into useful feedback and a positive, game-like growth experience. The product supports consistent behavior and visible progress; missed days do not erase accumulated progress.

## Initial Release Scope

- The first release is a private, single-user personal app. In-app registration and multi-user support are out of scope initially.
- Include all planned core domains, the Avatar/XP progression loop, progress views, and AI features in the first complete release; AI is not deferred to a later product milestone.
- UI access still needs protection if the app is remotely reachable. The access-control implementation is not yet finalized.
- The initial AI integration uses Pi on the development Mac through the local bridge and Cloudflare Tunnel. AI availability therefore depends on that Mac and its connection being online.
- Roadmap phases describe implementation order, not a reduced feature scope for the first release.

## User Confirmation Principle

The app may offer recommendations, inferred values, and prefilled suggestions, but the user makes the decisions and confirms records across every domain. Suggestions—including extracted `Food Items`, workout actions, meal recommendations, and body-metric values—remain proposals and must not create or modify user source records, be applied to a `Plan`/`Goal`, or be treated as completed behavior until the user explicitly confirms. Derived AI outputs and recommendation sessions may be stored separately as specified, but are not user-confirmed facts. A deliberate Save, Confirm, or Continue action counts as confirmation; do not add a redundant confirmation dialog. Derived analysis may be shown after its source record is confirmed and saved.

## Core Domains

- **Meals**: record meal photos, `Food Items`, `Place`, dining companions, and time. Provide separate `Meal Photo`, `Receipt/Order Import`, and `Manual Food Item Entry` paths. AI extracts candidate `Food Items` from meal photos and image-based receipts/orders, recognizing a specific brand/menu item when possible or a generic food item otherwise. The user reviews and confirms, edits, removes, or adds items before saving. Retain the original receipt/order image with the saved Meal. Deleting a Meal deletes all images associated with it, including meal photos and retained receipt/order images. Receipt/order PDF import is not supported initially. After a meal is recorded, AI shows nutrition analysis such as `Calories`, carbohydrates, protein, fat, sugar, and sodium, then ends the meal flow without unsolicited improvement advice. Users can explicitly request on-demand meal/menu recommendations based on prior meals, current body metrics, active goals, current time, and remaining meal slots.
- **Supplements**: record supplement items, dosage, and intake time. Items taken together may be grouped in one `Supplement Intake`; confirm each item's taken status and dosage independently. Support daily and weekly goals and routine adherence.
- **Workouts**: classify a workout as `Strength Training`, `Cardio/Endurance`, `Sport`, `Mobility/Recovery`, or `Other`, using the relevant logging form for each type. Within `Strength Training`, distinguish `Machine`, `Free Weight`, and `Bodyweight` modes; these are not top-level workout types. Provide a curated button list without search: `Machine`—`Chest Press`, `Lat Pulldown`, `Seated Cable Row`, `Shoulder Press`, `Leg Press`, `Leg Extension`, `Leg Curl`, `Chest Fly`, `Triceps Pushdown`, `Biceps Curl`; `Free Weight`—`Barbell Bench Press`, `Dumbbell Bench Press`, `Barbell Squat`, `Deadlift`, `Romanian Deadlift`, `Overhead Press`, `Barbell Row`, `Dumbbell Row`, `Dumbbell Lateral Raise`, `Dumbbell Curl`; `Bodyweight`—`Push-up`, `Pull-up`, `Chin-up`, `Dip`, `Bodyweight Squat`, `Lunge`, `Glute Bridge`, `Calf Raise`, `Sit-up`. Use direct input for items not in the curated list. Record applicable exercises, sets, duration, distance, place, and an optional workout-level `Note`. `Note` is plain text entered in a textarea, with no Markdown; when left blank, store an empty string. For `Sport`, offer common choices—`Soccer/Futsal`, `Basketball`, `Volleyball`, `Baseball`, `Tennis`, `Badminton`, `Table Tennis`, `Golf`, and `Combat Sports`—plus `Other Sport` with a user-entered name. For `Cardio/Endurance`, offer `Running`, `Walking`, `Cycling`, `Swimming`, `Rowing`, `Elliptical`, `Stair Climber`, `Hiking`, and `Jump Rope`. For `Strength Training`, store `Reps` and a single optional `Load` field separately for each set; do not record rest time. For a bodyweight-only set, leave `Load` empty rather than entering zero or the user's `Body Weight`. For `Cardio/Endurance`, use recorded `Duration` and `Distance` to derive `Pace` in min/km when both are available; do not treat the calculated `Pace` as a separately entered source value. A `Workout` contains an ordered list of `Workout Items` that the user can reorder and edit individually. A `+` between items opens a vertical button-list picker and inserts one selected item at that position; add items one at a time with no separate batch mode. Do not provide search; use curated options and the direct-input modal for items not listed. Give picker buttons generous horizontal and vertical spacing and use vertical scrolling. Show a subtle top fade when the list is scrolled below its start and a subtle bottom fade when more items continue below the viewport. The picker also offers direct input in a modal with recent custom items shown newest-first as buttons. Selecting a recent item inserts it at the current position. After the same custom item string has been added three times—including additions via a recent-item button—promote it to the regular options in that picker. Count items only when their strings are exactly identical; do not normalize whitespace, case, or other characters. For `Strength Training`, each item is an exercise with nested sets. The same list can be edited during or after the activity. `Post-workout` is an entry point for recording or editing the workout, not a summary or recap screen. For `Mobility/Recovery`, choose `Stretching`, `Yoga`, `Mobility Drill`, `Foam Rolling`, or `Other` with a user-entered name. Record `Duration`, with optional `Target Muscle Groups`, `Place`, and `Note`; do not record `Reps`, `Load`, or `Distance`. For the `Other` workout type, require a user-entered activity name and `Duration`, with optional `Place` and `Note`. A `Program` may define a split such as two- or three-day training. Use past records and the program to suggest the next workout and exercise prescription.
- **Body Metrics**: record height, body weight, and individual body-composition measurements. An InBody assessment is a measurement event/source, not a single metric; store its resulting metrics separately. Support manual entry of InBody values and report-image upload with AI extraction; the user reviews and confirms or corrects extracted metrics before saving. These are the only InBody entry paths in the initial release; direct CSV import is unsupported. Do not retain the uploaded report image: delete the temporary image when the extraction/review flow ends, and keep only user-confirmed metrics. Use the supplied [InBody Report Field Reference](inbody-csv-fields.md) as the supported field set: the report image is authoritative, and fields present only in the CSV are excluded.
- **Goals**: the initial Goal setup offers four types—`Target Body Weight`, `Target Body Fat Percentage`, `Muscle Gain`, and `Performance Goal`—each with a `Target Date`. `Target Body Weight` stores only the target weight and date; `Target Body Fat Percentage` stores only the target percentage and date. Neither stores a separate start value. `Muscle Gain` has two sub-options: general muscle development with a `Target Date` but no numeric target, or whole-body InBody `Skeletal Muscle Mass` with a target value and `Target Date`. The InBody option is a subtype of `Muscle Gain`, not an additional top-level Goal Type. `Performance Goal` stores one or more target performance metrics and values with units, plus a `Target Date`; it does not store a separate start value. A goal may combine metrics, such as a target distance and duration for a run; a combined goal is achieved only when all target conditions are met. Workout records provide observed progress. Default achievement directions are `Load`, `Reps`, `Distance`, and hold `Duration` at or above target; completion `Duration` and `Pace` at or below target. Thus `Duration` direction depends on the activity (for example, plank hold vs. 5km completion time). Support all discussed metric families: `Load`, `Reps`, `Distance`, `Duration`/time, and `Pace`. Use metric defaults: `Load` in kg, `Distance` in km, `Duration` in seconds or minutes as appropriate, `Reps` as a count, and `Pace` in min/km. Additional units can be added later if needed.
- **Progress Photos**: let users upload dated photos and review them chronologically or side by side.

## Data Layers

Keep these concepts distinct throughout domain models, storage, and application code:

1. **User-Generated Data / Source Data** — information the user enters or uploads, including photos and measurements from a device.
2. **Derived Data** — values calculated or inferred from source records, including AI nutrition estimates, workout metrics, adherence, trends, recommendations, XP, and levels. AI outputs are estimates, not user-entered facts.
3. **Presentation Model** — data composed for a particular screen. It may combine source and derived data and does not have to be stored as a separate canonical record.

## Gamification

- The **Avatar** is the central growth visualization on the home screen.
- Track separate levels for muscle groups and body-related metrics, plus an overall character level.
- All levels start at Level 1.
- Reward defined positive behaviors with XP. Never subtract XP for missed records, inactivity, or an unfavorable result.
- Keep the XP threshold per level fixed; it does not increase at higher levels.
- Award supplement XP by completion of planned supplement intake occurrences: below 50% earns 0 XP, 50% to below 100% earns 1 XP, and 100% earns 2 XP. Each scheduled per-item intake occurrence counts once when confirmed as taken; if the same supplement is scheduled more than once, each occurrence counts separately. Record actual dosage separately; it does not multiply the XP unit. Calculate this percentage per day using the user's configured timezone.
- Provide a separate progression view with XP and level history so users can recognize periods of growth and plateaus.

Exact XP rules and how body-metric levels reflect different user goals remain open design decisions.

## Daily Touchpoints

The user journey is divided into seven contextual touchpoints rather than one generic daily check-in:

1. **Wake-up** — after waking.
2. **Post-breakfast** — after breakfast.
3. **Post-lunch** — after lunch.
4. **Post-dinner** — after dinner.
5. **Pre-workout** — before a workout.
6. **Post-workout** — after a workout.
7. **Bedtime** — before sleep.

These are flexible entry points, not mandatory steps or a strict clock-based sequence. Users may skip irrelevant touchpoints without penalty; existing XP never decreases. The exact records, actions, and recommendations shown at the other touchpoints—and whether to send reminders—remain to be defined.

The daily `Plan` is assembled from existing schedules, including workouts from `Program` and scheduled supplement routines. Users can manually add other actions; a separate full-featured planner is not required for the initial release. `Pre-workout` opens a page for deciding what workout to do. Use today's scheduled workout as the page's initial value; the user can edit or replace it. If none is scheduled, start with an empty selection. The prefilled value is not itself an edit to `Program` or `Plan`, and there is no separate start/select/modify menu or standalone add action. Provide a left-arrow back-navigation control for leaving the flow if it was opened by mistake; this is not a `Skip` action.

Meal logging at Post-breakfast, Post-lunch, and Post-dinner ends after showing AI nutrition analysis. Meal/menu recommendations are user-initiated, not automatically suggested after logging. Tapping an empty `Meal Slot` opens a modal `Action Sheet` with two choices: `Menu Recommendation` or `Log Meal`. `Log Meal` then offers separate `Meal Photo`, `Receipt/Order Import`, and `Manual Food Item Entry` paths. Receipt/order extraction is a reviewable candidate list; only user-confirmed items are saved.

`Menu Recommendation` opens a separate page that returns 1–3 ranked menu options with reasons, using prior meal records, current body metrics, active goals, current time, and remaining meal slots. It does not create or change a Meal, `Draft`, or `Plan`. On leaving the page, store a `Menu Recommendation Session`—the internal record of this one use—containing request/end timestamps, the relevant `Meal Slot`, the exact structured input sent to AI, the 1–3 ranked menu options and reasons shown, the selected rank or no selection, and AI provider/model ID and prompt version. Retain each session indefinitely with no automatic expiry and use it to inform future recommendations. Store the structured input snapshot, not duplicate original photo files.

### Wake-up Flow

The Wake-up experience is a sequence of focused pages:

1. Show the current `Body Weight` and allow it to be edited. Do not ask for or display `Height` here; height changes infrequently and remains available in Body Metrics.
2. Show a daily-granularity `Body Weight` graph covering the past 14 days. Use the same visual chart design as the XP graph, with scale/reference intervals of 5 display units (5 kg when the selected unit is kg).
3. Show the current `Avatar` level and XP.
4. Show a daily-granularity 14-day progression graph with a cumulative XP line and an `Avatar` Level step line.
5. If a `Primary Goal` exists, show exactly one `Next Best Action` for something to do at any point during the current day. Balance today's `Plan` with progress toward the `Primary Goal`; the action does not have to start immediately.
6. If no `Primary Goal` exists, show the four Goal setup choices instead. If no choices are available to present, show only today's `Plan` and finish the Wake-up flow.

If the user leaves `Body Weight` unchanged and continues, record that day's entry using the saved value; pressing Continue is explicit confirmation, so a separate skip action or redundant confirmation dialog is not required. This provides a daily value for the 14-day graph. The two graphs share the same visual design and differ in their plotted values and scale.

Users can designate one active `Goal` as their `Primary Goal`. When a `Primary Goal` exists, `Next Best Action` uses a **Balanced, discomfort-avoiding** policy: consider both today's `Plan` and actions that advance the `Primary Goal`, while first excluding completed or infeasible actions and favoring lower-disruption options. AI may rank only existing candidate actions; it must not invent or generate a new action. The exact sources for the candidate pool remain to be defined. The aim is to avoid unpleasant recommendations, not maximize user satisfaction. `Not now` is the only explicit decline; there is no `Don't suggest again` control. No response or leaving the recommendation is neutral. Within a rolling 30-day lookback window, count `Not now` declines and edits away from similar recommendations together; the first three do not lower priority, and the fourth and subsequent instances add a soft negative signal. Let AI determine which recent recommendations are similar rather than maintaining a fixed action taxonomy. Provide only the compact structured feedback entries from that 30-day window, not the user's full history; AI compares the feedback with other eligible actions' fit to today's `Plan`, progress toward the `Primary Goal`, and likely disruption. Do not assign the negative signal a fixed numeric penalty. Tapping a `Next Best Action` opens its normal action/recording flow with the proposed values prefilled. The user may edit and confirm; no source record or `Plan` change is made before confirmation. Record a changed confirmed action as an `edit` interaction against the original suggestion without asking for a reason or adding a separate feedback form. Deterministic rules may remove completed or infeasible candidates before AI ranks the remainder. Do not give AI the user's full history.

## UX and Visual Direction

- **Mobile-first**, with little information on each screen.
- Split tasks into focused screens rather than creating a dense all-in-one dashboard.
- Use progressive disclosure for details and analysis.
- Use a minimalist visual language based primarily on dots and lines, with minimal filled surfaces.
- The home screen centers on the Avatar and concise growth information; detailed logging, analysis, goals, photos, and progression live in focused views.
- UI copy is Korean. Canonical domain terms, code identifiers, and engineering discussions use English.

## Initial Technology Direction

- **Runtime and data**: Cloudflare Workers, D1, and R2.
- **Web application**: pnpm, TanStack Start, and shadcn/ui.
- **Client libraries**: TanStack Form for forms, TanStack Query for remote/server state, and Zustand for client-only state.
- Define clear ownership between route loaders and TanStack Query to avoid maintaining duplicate server-state caches.
- **AI prototype**: connect to Pi running on the development Mac through Pi CLI RPC mode and a local HTTP bridge. See [Cloudflare CLI and Pi Bridge](cloudflare-cli.md).

Additional dependencies such as schema validation, an ORM, or charting libraries have not been selected yet.
