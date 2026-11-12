import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TARGET_MUSCLES,
  muscleAwardsForWorkout,
  reconcileMuscleAwards,
  targetMusclesForReuse,
  type StrengthWorkoutItem,
} from "./workouts.ts";

const item = (
  itemId: string,
  mode: StrengthWorkoutItem["mode"],
  targetMuscles: StrengthWorkoutItem["targetMuscles"],
  reps?: number,
): StrengthWorkoutItem => ({ itemId, mode, targetMuscles, sets: reps === undefined ? [{}] : [{ reps }] });

test("curated target-muscle defaults exactly match the initial catalog", () => {
  assert.deepEqual(DEFAULT_TARGET_MUSCLES, {
    Machine: {
      "Chest Press": ["Chest"], "Lat Pulldown": ["Back"], "Seated Cable Row": ["Back"],
      "Shoulder Press": ["Shoulders"], "Leg Press": ["Quadriceps"], "Leg Extension": ["Quadriceps"],
      "Leg Curl": ["Hamstrings"], "Chest Fly": ["Chest"], "Triceps Pushdown": ["Triceps"], "Biceps Curl": ["Biceps"],
    },
    "Free Weight": {
      "Barbell Bench Press": ["Chest"], "Dumbbell Bench Press": ["Chest"], "Barbell Squat": ["Quadriceps", "Glutes"],
      Deadlift: ["Glutes", "Hamstrings"], "Romanian Deadlift": ["Hamstrings", "Glutes"], "Overhead Press": ["Shoulders"],
      "Barbell Row": ["Back"], "Dumbbell Row": ["Back"], "Dumbbell Lateral Raise": ["Shoulders"], "Dumbbell Curl": ["Biceps"],
    },
    Bodyweight: {
      "Push-up": ["Chest"], "Pull-up": ["Back"], "Chin-up": ["Back", "Biceps"], Dip: ["Triceps", "Chest"],
      "Bodyweight Squat": ["Quadriceps", "Glutes"], Lunge: ["Quadriceps", "Glutes"], "Glute Bridge": ["Glutes"],
      "Calf Raise": ["Calves"], "Sit-up": ["Core"],
    },
  });
});

test("latest confirmed exact same-picker selection overrides curated defaults, including empty", () => {
  const previous = [
    { mode: "Machine" as const, itemName: "Chest Press", targetMuscles: ["Triceps"] as const, confirmedAt: "2024-01-01T00:00:00Z" },
    { mode: "Machine" as const, itemName: "Chest Press", targetMuscles: [] as const, confirmedAt: "2024-01-02T00:00:00Z" },
    { mode: "Free Weight" as const, itemName: "Chest Press", targetMuscles: ["Back"] as const, confirmedAt: "2024-01-03T00:00:00Z" },
  ];
  assert.deepEqual(targetMusclesForReuse("Machine", "Chest Press", previous), []);
  assert.deepEqual(targetMusclesForReuse("Machine", " chest press", previous), []);
  assert.deepEqual(targetMusclesForReuse("Machine", "Biceps Curl", []), ["Biceps"]);
  assert.deepEqual(targetMusclesForReuse("Machine", "Custom exact string", []), []);
});

test("inherited object property names are safe custom names unless saved selection exists", () => {
  for (const itemName of ["constructor", "toString", "__proto__"]) {
    assert.deepEqual(targetMusclesForReuse("Machine", itemName, []), []);
    assert.deepEqual(targetMusclesForReuse("Machine", itemName, [
      { mode: "Machine", itemName, targetMuscles: ["Back"], confirmedAt: "2024-01-01T00:00:00Z" },
    ]), ["Back"]);
  }
});

test("only confirmed Machine/Free Weight items with actual reps award XP; load is irrelevant", () => {
  const bodyweightWithLoad = { ...item("body", "Bodyweight", ["Chest"], 10), loadKg: 20 };
  assert.deepEqual(muscleAwardsForWorkout([
    item("machine-none", "Machine", ["Chest"], 0),
    item("free-none", "Free Weight", ["Back"]),
    bodyweightWithLoad,
  ], true), []);
  assert.deepEqual(muscleAwardsForWorkout([item("planned", "Machine", ["Chest"], 10)], false), []);
  assert.deepEqual(muscleAwardsForWorkout([item("reps-no-load", "Free Weight", ["Back"], 1)], true).map((award) => award.group), ["Back"]);
});

test("multi-group awards are independent, duplicate targets dedupe, repeated items remain separate", () => {
  const awards = muscleAwardsForWorkout([
    item("squat-1", "Free Weight", ["Quadriceps", "Glutes", "Glutes"], 1),
    item("squat-2", "Free Weight", ["Quadriceps", "Glutes"], 8),
  ], true);
  assert.deepEqual(awards.map(({ itemId, group, xp }) => [itemId, group, xp]), [
    ["squat-1", "Quadriceps", 1], ["squat-1", "Glutes", 1],
    ["squat-2", "Quadriceps", 1], ["squat-2", "Glutes", 1],
  ]);
  assert.equal(new Set(awards.map((award) => award.id)).size, 4);
});

test("edit reconciliation adds, cancels, and preserves stable item/group identities", () => {
  const before = muscleAwardsForWorkout([
    item("row", "Machine", ["Back"], 3),
    item("press", "Free Weight", ["Chest"], 5),
  ], true);
  const after = muscleAwardsForWorkout([
    item("row", "Machine", ["Back", "Biceps"], 3),
  ], true);
  const diff = reconcileMuscleAwards(before, after);
  assert.deepEqual(diff.added.map((award) => award.id), ["row:Biceps"]);
  assert.deepEqual(diff.cancelled.map((award) => award.id), ["press:Chest"]);
  assert.deepEqual(diff.unchanged.map((award) => award.id), ["row:Back"]);
});

test("trust-boundary workout data rejects invalid reps and duplicate item identities", () => {
  assert.throws(() => muscleAwardsForWorkout([item("bad", "Machine", ["Chest"], -1)], true), RangeError);
  assert.throws(() => muscleAwardsForWorkout([
    item("same", "Machine", ["Chest"], 1), item("same", "Machine", ["Back"], 1),
  ], true), RangeError);
});
