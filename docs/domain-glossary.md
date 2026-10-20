# Domain Glossary

Canonical domain terms are English. UI labels may be Korean and do not need to mirror the English term word for word. Prefer one canonical term per concept; avoid using aliases interchangeably in code and product discussions.

| Canonical term | Definition and usage |
|---|---|
| **User-Generated Data** | Data directly entered or uploaded by the user. Device-imported values are also treated as source records, with their source recorded. |
| **Food Item** | A food or menu item included in a meal. Use `Food Items` for a collection. |
| **Place** | A general location associated with a meal or workout. Prefer over `Restaurant` or `Venue` as the shared domain concept so home and other locations are included. |
| **Place Type** | A classification for a `Place`, such as `Home`, `Restaurant`, or `Gym`. `Gym` is a type of place, not the general location concept. |
| **Meal Preparation Method** | How a meal was prepared or obtained, separately from where it was eaten; for example, home-cooked, restaurant-prepared, or takeaway. Exact allowed values are undecided. |
| **Body Weight** | A person's measured body weight. Use `Load` for resistance-training weight to avoid ambiguity. |
| **Body Fat Percentage** | The percentage of body weight that is fat. Store as an individual body metric. |
| **Skeletal Muscle Mass** | A body-composition metric reported by a measurement device. Store independently from the assessment event. |
| **Segmental Lean Mass** | A segment-level body-composition value, stored separately for each reported body segment. Confirm the exact field names against the device report before implementation; do not treat all InBody results as one opaque value. |
| **InBody Assessment** | A measurement event/source that may contain multiple individual body metrics. InBody is not itself a metric. |
| **Target Date** | The date by which a goal is intended to be achieved. |
| **Goal Type** | One of the initial setup choices: `Target Body Weight`, `Target Body Fat Percentage`, `Muscle Gain`, or `Performance Goal`. |
| **Target Body Weight** | A Goal Type with a target weight and `Target Date`; no separate start value is stored. |
| **Target Body Fat Percentage** | A Goal Type with a target percentage and `Target Date`; no separate start value is stored. |
| **Muscle Gain** | A Goal Type with two sub-options: general muscle development with a `Target Date` only, or a whole-body InBody `Skeletal Muscle Mass` target with a target value and `Target Date`. |
| **Performance Goal** | A Goal Type with one or more target performance metrics/values and units plus a `Target Date`; no separate start value is stored. A goal can combine metrics, such as distance and duration. Progress is compared with workout records. Defaults: `Load` in kg, `Reps` as a count, `Distance` in km, `Duration` in seconds or minutes, and `Pace` in min/km. Other units may be added later. |
| **Primary Goal** | The active goal the user designates as the main priority for personalized recommendations and progress summaries. |
| **Derived Data** | Data calculated or inferred from source data, including AI estimates. Preserve its provenance and distinguish estimates from direct measurements. |
| **Calories** | Product/domain term for meal energy. Persisted field names should make the unit explicit, such as kcal. |
| **Streak** | A count or duration of consecutive qualifying behaviors. A missed day may end a streak but must not deduct XP. |
| **Program** | A user's workout plan, including its split and planned training sessions. |
| **Plan** | The activities scheduled for the current day. Distinct from `Program`, which defines the workout routine. |
| **Presentation Model** | Data composed for a particular UI screen from source and derived data. It is not automatically a separate source-of-truth record. |
| **Avatar** | The game-like character used to visualize the user's overall and body-area progression. |
| **XP** | Experience points granted for qualifying behaviors. XP is never deducted. |

## Naming Notes

- Use `Place` for the location and `Meal Preparation Method` for how the food was prepared or obtained. This distinguishes, for example, home-cooked food eaten at work.
- Use `Body Weight` for anthropometric weight and `Load` for exercise weight.
- Record each result from an InBody assessment as an individual metric with its measurement time and source. Segmental values should follow the exact metric labels in the source report.
- The supplement XP counting unit is not finalized: it could mean distinct supplement items, planned doses, or servings. Do not encode that assumption into the domain model until agreed.
