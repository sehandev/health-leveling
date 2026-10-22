# InBody CSV Field Reference

This field set is based on the supplied `InBody-20261022.csv`. Use it for manual InBody entry and AI extraction from an uploaded report image. These are the only supported entry paths in the initial release; direct CSV import is unsupported.

Each CSV data row represents one `InBody Assessment`. Store the assessment time and device model as source metadata, and store each non-empty measurement as an individual body metric associated with that assessment.

- Parse `날짜` in the source format `yyyyMMddHHmmss` as the assessment's local measurement time.
- `측정장비` is the source device model (the sample uses model `270`).
- A `-` means the value is unavailable: store it as missing/null, never as zero.
- Preserve reported values and units. For example, keep reported `BMI` and `InBody Score` as source measurements even if a derived equivalent can also be calculated.
- For segmental fields, store one metric per body segment using the segment name and metric type rather than treating all segments as one opaque value.
- Keep the three balance indicator values as raw source values until their code meanings are verified; do not infer labels from the numeric code.
- AI-extracted values are candidates. The user reviews, corrects, and confirms each value before it becomes a saved body metric.
- Do not retain the uploaded report image. Delete the temporary image when the extraction/review flow ends; the assessment keeps confirmed metrics and source metadata, not the image.

| CSV header | Canonical metric / metadata | Unit or representation |
|---|---|---|
| `날짜` | Assessment measurement time | `yyyyMMddHHmmss`, local time |
| `측정장비` | InBody device model | Source metadata; e.g. `270` |
| `체중(kg)` | `Body Weight` | kg |
| `골격근량(kg)` | `Skeletal Muscle Mass` | kg |
| `근육량(kg)` | `Muscle Mass` | kg |
| `체지방량(kg)` | `Body Fat Mass` | kg |
| `BMI(kg/m²)` | `BMI` | kg/m² |
| `체지방률(%)` | `Body Fat Percentage` | % |
| `기초대사량(kcal)` | `Basal Metabolic Rate` | kcal |
| `인바디점수` | `InBody Score` | Source-reported score; unitless |
| `오른팔 근육량(kg)` | Segmental Muscle Mass — right arm | kg |
| `왼팔 근육량(kg)` | Segmental Muscle Mass — left arm | kg |
| `몸통 근육량(kg)` | Segmental Muscle Mass — trunk | kg |
| `오른다리 근육량(kg)` | Segmental Muscle Mass — right leg | kg |
| `왼다리 근육량(kg)` | Segmental Muscle Mass — left leg | kg |
| `오른팔 체지방(kg)` | Segmental Body Fat Mass — right arm | kg |
| `왼팔 체지방(kg)` | Segmental Body Fat Mass — left arm | kg |
| `몸통 체지방(kg)` | Segmental Body Fat Mass — trunk | kg |
| `오른다리 체지방(kg)` | Segmental Body Fat Mass — right leg | kg |
| `왼다리 체지방(kg)` | Segmental Body Fat Mass — left leg | kg |
| `오른팔 세포외수분비` | Segmental ECW/TBW Ratio — right arm | Source-reported ratio |
| `왼팔 세포외수분비` | Segmental ECW/TBW Ratio — left arm | Source-reported ratio |
| `몸통 세포외수분비` | Segmental ECW/TBW Ratio — trunk | Source-reported ratio |
| `오른다리 세포외수분비` | Segmental ECW/TBW Ratio — right leg | Source-reported ratio |
| `왼다리 세포외수분비` | Segmental ECW/TBW Ratio — left leg | Source-reported ratio |
| `복부지방률` | Abdominal Fat Ratio | Source-reported ratio |
| `허리둘레(cm)` | Waist Circumference | cm |
| `내장지방단면적(cm²)` | Visceral Fat Area | cm² |
| `내장지방레벨(Level)` | Visceral Fat Level | Level |
| `체수분(L)` | Total Body Water | L |
| `세포내수분(L)` | Intracellular Water | L |
| `세포외수분(L)` | Extracellular Water | L |
| `세포외수분비` | ECW/TBW Ratio | Source-reported ratio |
| `상체하체` | Upper/Lower Balance Indicator | Preserve raw source value; semantics to verify |
| `상체좌우` | Upper Left/Right Balance Indicator | Preserve raw source value; semantics to verify |
| `하체좌우` | Lower Left/Right Balance Indicator | Preserve raw source value; semantics to verify |
| `다리근육레벨(Level)` | Leg Muscle Level | Level |
| `다리근육량(kg)` | Leg Muscle Mass | kg |
| `단백질(kg)` | Protein Mass | kg |
| `무기질(kg)` | Mineral Mass | kg |
| `골무기질량(kg)` | Bone Mineral Mass | kg |
| `체세포량(kg)` | Body Cell Mass | kg |
| `SMI(kg/m²)` | Skeletal Muscle Index | kg/m² |
| `전신위상각(°)` | Whole Body Phase Angle | degrees |
