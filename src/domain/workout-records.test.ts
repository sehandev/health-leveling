import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStrengthWorkoutDraft,
  pickerOptions,
  targetMusclesForWorkoutItem,
  type CustomWorkoutUsage,
  type WorkoutMuscleSelection,
} from "./workout-records.ts";

const validDraft = (overrides: Record<string, unknown> = {}) => ({
  type: "Strength Training",
  recordedAt: "2025-01-02T03:04:05Z",
  timezone: "America/Los_Angeles",
  place: "",
  note: "",
  items: [{
    id: "item-1",
    name: "Chest Press",
    source: "curated",
    mode: "Machine",
    targetMuscles: ["Chest"],
    sets: [{ reps: 8, loadKg: 20 }, { reps: null, loadKg: null }],
  }],
  ...overrides,
});

const usage = (
  id: string,
  name: string,
  addedAt: string,
  sequence: number,
  mode: CustomWorkoutUsage["mode"] = "Machine",
): CustomWorkoutUsage => ({ id, mode, name, addedAt, sequence });

const selection = (
  name: string,
  targetMuscles: WorkoutMuscleSelection["targetMuscles"],
  confirmedAt: string,
  sequence: number,
  source: WorkoutMuscleSelection["source"] = "curated",
  mode: WorkoutMuscleSelection["mode"] = "Machine",
): WorkoutMuscleSelection => ({ mode, name, source, targetMuscles, confirmedAt, sequence });

test("parser keeps the source shape, exact names, and deduplicates target groups", () => {
  const parsed = parseStrengthWorkoutDraft(validDraft({
    place: "  Gym  ",
    note: "  completed  ",
    items: [
      { id: "one", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: ["Chest", "Chest"], sets: [{ reps: 0, loadKg: 0 }] },
      { id: "two", name: " chest press ", source: "custom", mode: "Machine", targetMuscles: [], sets: [] },
    ],
  }));
  assert.deepEqual(parsed, {
    type: "Strength Training",
    recordedAt: "2025-01-02T03:04:05Z",
    timezone: "America/Los_Angeles",
    place: "  Gym  ",
    note: "  completed  ",
    items: [
      { id: "one", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: ["Chest"], sets: [{ reps: 0, loadKg: 0 }] },
      { id: "two", name: " chest press ", source: "custom", mode: "Machine", targetMuscles: [], sets: [] },
    ],
  });
});

test("parser canonicalizes blank place/note without changing nonblank text", () => {
  assert.deepEqual(parseStrengthWorkoutDraft(validDraft({ place: " \t ", note: "\n" })), {
    ...validDraft(), place: "", note: "",
  });
});

test("parser accepts exact custom names including prototype keys but requires own curated catalog keys", () => {
  const customItems = ["constructor", "toString", "__proto__", " Chest Press "].map((name, index) => ({
    id: `custom-${index}`, name, source: "custom", mode: "Machine", targetMuscles: [], sets: [],
  }));
  assert.equal(parseStrengthWorkoutDraft(validDraft({ items: customItems })).items[0].name, "constructor");
  assert.throws(() => parseStrengthWorkoutDraft(validDraft({
    items: [{ id: "bad", name: "constructor", source: "curated", mode: "Machine", targetMuscles: [], sets: [] }],
  })), RangeError);
});

test("bodyweight-only sets keep load unrecorded while explicitly loaded sets retain canonical kg", () => {
  const parsed = parseStrengthWorkoutDraft(validDraft({
    items: [{ id: "push", name: "Push-up", source: "curated", mode: "Bodyweight", targetMuscles: ["Chest"], sets: [
      { reps: 10, loadKg: null }, { reps: 5, loadKg: 12.5 },
    ] }],
  }));
  assert.deepEqual(parsed.items[0].sets, [{ reps: 10, loadKg: null }, { reps: 5, loadKg: 12.5 }]);
  assert.throws(() => parseStrengthWorkoutDraft(validDraft({
    items: [{ id: "push", name: "Push-up", source: "curated", mode: "Bodyweight", targetMuscles: ["Chest"], sets: [
      { reps: 10, loadKg: 0 },
    ] }],
  })), RangeError);
});

test("parser rejects invalid boundaries, identities, values, groups, and oversized lists", () => {
  for (const input of [
    null,
    [],
    validDraft({ type: "Cardio/Endurance" }),
    validDraft({ recordedAt: "2025-02-30T03:04:05Z" }),
    validDraft({ timezone: "Not/AZone" }),
    validDraft({ items: [] }),
    validDraft({ items: [
      { id: "same", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [] },
      { id: "same", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [] },
    ] }),
    validDraft({ items: [{ id: "bad", name: "  ", source: "custom", mode: "Machine", targetMuscles: [], sets: [] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Bodyweight", targetMuscles: [], sets: [] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: ["Neck"], sets: [] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [{ reps: -1, loadKg: null }] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [{ reps: 1.5, loadKg: null }] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [{ reps: null, loadKg: Infinity }] }] }),
    validDraft({ items: [{ id: "bad", name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [{ reps: null, loadKg: -1 }] }] }),
    validDraft({ note: "x".repeat(10_001) }),
    validDraft({ items: Array.from({ length: 101 }, (_, index) => ({
      id: `item-${index}`, name: "Chest Press", source: "curated", mode: "Machine", targetMuscles: [], sets: [],
    })) }),
  ]) assert.throws(() => parseStrengthWorkoutDraft(input), RangeError);
});

test("picker options are mode-scoped, exact-name unique, newest-first, and promote on the third addition", () => {
  const options = pickerOptions("Machine", { usages: [
    usage("one", "Row", "2025-01-01T00:00:00Z", 1),
    usage("two", " row", "2025-01-02T00:00:00Z", 2),
    usage("three", "Row", "2025-01-03T00:00:00Z", 3),
    usage("four", "Row", "2025-01-04T00:00:00Z", 4),
    usage("five", "Row", "2025-01-04T00:00:00Z", 5),
    usage("free", "Row", "2025-01-05T00:00:00Z", 6, "Free Weight"),
  ], selections: [] });
  assert.deepEqual(options, {
    recentCustomNames: ["Row", " row"],
    promotedCustomNames: ["Row"],
  });
});

test("picker options reject duplicate usage identities and malformed usage records", () => {
  assert.throws(() => pickerOptions("Machine", { usages: [] } as never), RangeError);
  assert.throws(() => pickerOptions("Machine", { usages: [
    usage("same", "Row", "2025-01-01T00:00:00Z", 1),
    usage("same", "Row", "2025-01-02T00:00:00Z", 2),
  ], selections: [] }), RangeError);
  assert.throws(() => pickerOptions("Machine", { usages: [
    { ...usage("bad", "Row", "2025-01-01T00:00:00Z", 1), addedAt: "not-an-instant" },
  ], selections: [] }), RangeError);
});

test("latest saved muscle selection matches exact source, mode, and name, including empty", () => {
  const history = [
    selection("Chest Press", ["Back"], "2025-01-01T00:00:00Z", 1),
    selection("Chest Press", [], "2025-01-02T00:00:00Z", 1),
    selection("Chest Press", ["Triceps"], "2025-01-02T00:00:00Z", 2, "custom"),
    selection("Chest Press", ["Glutes"], "2025-01-03T00:00:00Z", 1, "curated", "Free Weight"),
  ];
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "curated" }, history), []);
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "custom" }, history), ["Triceps"]);
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name: " chest press", source: "custom" }, history), []);
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Free Weight", name: "Chest Press", source: "custom" }, history), []);
});

test("curated defaults apply only to curated catalog names; custom prototype names are safe", () => {
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "curated" }, []), ["Chest"]);
  assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "custom" }, []), []);
  for (const name of ["constructor", "toString", "__proto__"]) {
    assert.deepEqual(targetMusclesForWorkoutItem({ mode: "Machine", name, source: "custom" }, []), []);
    assert.throws(() => targetMusclesForWorkoutItem({ mode: "Machine", name, source: "curated" }, []), RangeError);
  }
});

test("muscle selection input rejects malformed history instead of returning a misleading prefill", () => {
  assert.throws(() => targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "curated" }, [
    selection("Chest Press", ["Unknown" as never], "2025-01-01T00:00:00Z", 1),
  ]), RangeError);
  assert.throws(() => targetMusclesForWorkoutItem({ mode: "Machine", name: "Chest Press", source: "curated" }, [
    { ...selection("Chest Press", [], "2025-01-01T00:00:00Z", 1), sequence: -1 },
  ]), RangeError);
});
