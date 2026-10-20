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
- **Supplements**: record supplement items, dosage, and intake time. Support daily and weekly goals and routine adherence.
- **Workouts**: classify a workout as `Strength Training`, `Cardio/Endurance`, `Sport`, `Mobility/Recovery`, or `Other`, using the relevant logging form for each type. Within `Strength Training`, distinguish `Machine`, `Free Weight`, and `Bodyweight` modes; these are not top-level workout types. Record applicable exercises, sets, reps, load, duration, distance, place, and feedback. Do not record rest time for sets. A `Program` may define a split such as two- or three-day training. Use past records and the program to suggest the next workout and exercise prescription.
- **Body Metrics**: record height, body weight, and individual body-composition measurements. An InBody assessment is a measurement event/source, not a single metric; store its resulting metrics separately.
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
- The XP awarded for supplement intake should vary with the number of supplement items taken. The counting unit (distinct items, planned doses, or servings) and exact XP values remain undecided.
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

`Menu Recommendation` opens a separate page that returns 1–3 ranked menu options with reasons, using prior meal records, current body metrics, active goals, current time, and remaining meal slots. It does not create or change a Meal, `Draft`, or `Plan`. On leaving the page, store a `Menu Recommendation Session` containing the input snapshot, AI output, and either the selected rank or no selection. Use these sessions to inform future recommendations.

### Wake-up Flow

The Wake-up experience is a sequence of focused pages:

1. Show the current `Body Weight` and allow it to be edited. Do not ask for or display `Height` here; height changes infrequently and remains available in Body Metrics.
2. Show a daily-granularity `Body Weight` graph covering the past 14 days. Use the same visual chart design as the XP graph, with scale/reference intervals of 5 display units (5 kg when the selected unit is kg).
3. Show the current `Avatar` level and XP.
4. Show a daily-granularity 14-day progression graph with a cumulative XP line and an `Avatar` Level step line.
5. If a `Primary Goal` exists, show exactly one `Next Best Action` for something to do at any point during the current day. Balance today's `Plan` with progress toward the `Primary Goal`; the action does not have to start immediately.
6. If no `Primary Goal` exists, show the four Goal setup choices instead. If no choices are available to present, show only today's `Plan` and finish the Wake-up flow.

If the user leaves `Body Weight` unchanged and continues, record that day's entry using the saved value; pressing Continue is explicit confirmation, so a separate skip action or redundant confirmation dialog is not required. This provides a daily value for the 14-day graph. The two graphs share the same visual design and differ in their plotted values and scale.

Users can designate one active `Goal` as their `Primary Goal`. When a `Primary Goal` exists, `Next Best Action` uses a **Balanced** policy: consider both today's `Plan` and actions that advance the `Primary Goal`. Do not rank solely by what can be done immediately. Exact signals, weights, and tie-breakers remain undecided.

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
