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

## Core Domains

- **Meals**: record meal photos, `Food Items`, `Place`, dining companions, and time. AI may estimate `Calories`, carbohydrates, protein, fat, sugar, sodium, and other nutrition values, then provide meal insights and next-meal suggestions.
- **Supplements**: record supplement items, dosage, and intake time. Support daily and weekly goals and routine adherence.
- **Workouts**: record exercises, target muscle groups, equipment, sets, load, duration, place, and feedback. A `Program` may define a split such as two- or three-day training. Use past records and the program to suggest the next workout and exercise prescription.
- **Body Metrics**: record height, body weight, and individual body-composition measurements. An InBody assessment is a measurement event/source, not a single metric; store its resulting metrics separately.
- **Goals**: the initial Goal setup offers four types—`Target Body Weight`, `Target Body Fat Percentage`, `Muscle Gain`, and `Performance Goal`—each with a `Target Date`. `Target Body Weight` stores only the target weight and date; `Target Body Fat Percentage` stores only the target percentage and date. Neither stores a separate start value. `Muscle Gain` has two sub-options: general muscle development with a `Target Date` but no numeric target, or whole-body InBody `Skeletal Muscle Mass` with a target value and `Target Date`. The InBody option is a subtype of `Muscle Gain`, not an additional top-level Goal Type. `Performance Goal` stores a target performance value and `Target Date`, without a separate start value; workout records provide observed progress. The supported performance metrics and units remain to be defined.
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

### Wake-up Flow

The Wake-up experience is a sequence of focused pages:

1. Show the current `Body Weight` and allow it to be edited. Do not ask for or display `Height` here; height changes infrequently and remains available in Body Metrics.
2. Show a daily-granularity `Body Weight` graph covering the past 14 days. Use the same visual chart design as the XP graph, with scale/reference intervals of 5 display units (5 kg when the selected unit is kg).
3. Show the current `Avatar` level and XP.
4. Show a daily-granularity 14-day progression graph with a cumulative XP line and an `Avatar` Level step line.
5. If a `Primary Goal` exists, show exactly one `Next Best Action` for something to do at any point during the current day. Balance today's `Plan` with progress toward the `Primary Goal`; the action does not have to start immediately.
6. If no `Primary Goal` exists, show the four Goal setup choices instead. If no choices are available to present, show only today's `Plan` and finish the Wake-up flow.

If the user leaves `Body Weight` unchanged and continues, record that day's entry using the saved value; a separate skip action is not required. This provides a daily value for the 14-day graph. The two graphs share the same visual design and differ in their plotted values and scale.

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
