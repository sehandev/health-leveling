# InBody Report Field Reference

The supplied `IMG_1522.png` report image is the authority for the initial InBody field set. The CSV was used only for comparison; values that appear only in the CSV are excluded. Initial entry paths are manual entry and AI extraction from an uploaded report image. Direct CSV import is unsupported. Parse the report's displayed measurement date/time as assessment metadata.

Store the report's measurement date/time and device model (`InBody 270`) as assessment metadata. Store each supported reported numeric result as an individual metric. Duplicate appearances of the same value in different report sections (for example, body weight and body fat mass) are one metric, not duplicate records. Treat computed InBody outputs as reported results; do not recalculate them. The `InBody Score` is a score, not a measurement, and is excluded.

AI-extracted values are candidates. The user reviews, corrects, and confirms them before they become saved metrics. Do not retain the uploaded report image; delete its temporary copy when the extraction/review flow ends.

## Supported current-assessment values

| Report label | Canonical metric | Unit / representation |
|---|---|---|
| `체중` / `Weight` | `Body Weight` | kg |
| `골격근량` / `Skeletal Muscle Mass` | `Skeletal Muscle Mass` | kg |
| `체지방량` / `Body Fat Mass` | `Body Fat Mass` | kg |
| `체수분` / `Body Water` | `Total Body Water` | L |
| `단백질` / `Protein` | `Protein Mass` | kg |
| `무기질` / `Minerals` | `Mineral Mass` | kg |
| `BMI` | `BMI` | kg/m² |
| `체지방률` / `Percent Body Fat` | `Body Fat Percentage` | % |
| `복부지방률` / `Waist-Hip Ratio` | `Waist-Hip Ratio` | Source-reported ratio |
| `내장지방레벨` / `Visceral Fat Level` | `Visceral Fat Level` | Level |
| `기초대사량` / `Basal Metabolic Rate` | `Basal Metabolic Rate` | kcal |
| `비만도` / `Obesity Degree` | `Obesity Degree` | % |
| Impedance at `20 kHz` and `100 kHz` for `RA`, `LA`, `TR`, `RL`, and `LL` | `Segment Impedance` by body segment and frequency | Ω |

In the impedance table, `RA` means right arm, `LA` left arm, `TR` trunk, `RL` right leg, and `LL` left leg. Repeated appearances of `Body Weight`/`Body Fat Mass` across report sections are one current-assessment metric, not duplicate records. Record only the current assessment identified by the report's measurement date/time; do not extract past points from the `Body Composition History` chart.

## Excluded report content

- Member number, height, age, and sex.
- `InBody Score`.
- Recommended/target weight and weight, fat, or muscle adjustment amounts.
- Recommended calorie intake and exercise calorie expenditure tables.
- Reference ranges, chart bars, and qualitative segment labels such as `표준` or `표준이하`.
- Any field available only in the CSV, including the three balance columns `상체하체`, `상체좌우`, and `하체좌우`.
