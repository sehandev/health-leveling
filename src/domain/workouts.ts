import { assertIsoInstant, type IsoInstant } from "./time.ts";

export type StrengthMode = "Machine" | "Free Weight" | "Bodyweight";
export type MuscleGroup =
  | "Chest" | "Back" | "Shoulders" | "Biceps" | "Triceps"
  | "Forearms" | "Core" | "Glutes" | "Quadriceps" | "Hamstrings" | "Calves";

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms", "Core", "Glutes", "Quadriceps", "Hamstrings", "Calves",
];

export const DEFAULT_TARGET_MUSCLES: Readonly<Record<StrengthMode, Readonly<Record<string, readonly MuscleGroup[]>>>> = {
  Machine: {
    "Chest Press": ["Chest"],
    "Lat Pulldown": ["Back"],
    "Seated Cable Row": ["Back"],
    "Shoulder Press": ["Shoulders"],
    "Leg Press": ["Quadriceps"],
    "Leg Extension": ["Quadriceps"],
    "Leg Curl": ["Hamstrings"],
    "Chest Fly": ["Chest"],
    "Triceps Pushdown": ["Triceps"],
    "Biceps Curl": ["Biceps"],
  },
  "Free Weight": {
    "Barbell Bench Press": ["Chest"],
    "Dumbbell Bench Press": ["Chest"],
    "Barbell Squat": ["Quadriceps", "Glutes"],
    Deadlift: ["Glutes", "Hamstrings"],
    "Romanian Deadlift": ["Hamstrings", "Glutes"],
    "Overhead Press": ["Shoulders"],
    "Barbell Row": ["Back"],
    "Dumbbell Row": ["Back"],
    "Dumbbell Lateral Raise": ["Shoulders"],
    "Dumbbell Curl": ["Biceps"],
  },
  Bodyweight: {
    "Push-up": ["Chest"],
    "Pull-up": ["Back"],
    "Chin-up": ["Back", "Biceps"],
    Dip: ["Triceps", "Chest"],
    "Bodyweight Squat": ["Quadriceps", "Glutes"],
    Lunge: ["Quadriceps", "Glutes"],
    "Glute Bridge": ["Glutes"],
    "Calf Raise": ["Calves"],
    "Sit-up": ["Core"],
  },
};

export interface SavedTargetMuscleSelection {
  mode: StrengthMode;
  itemName: string;
  targetMuscles: readonly MuscleGroup[];
  confirmedAt: IsoInstant;
}

function assertMode(mode: StrengthMode): void {
  if (mode !== "Machine" && mode !== "Free Weight" && mode !== "Bodyweight") throw new RangeError(`Invalid strength mode: ${mode}`);
}

function assertMuscles(groups: readonly MuscleGroup[]): void {
  if (!Array.isArray(groups) || groups.some((group) => !MUSCLE_GROUPS.includes(group))) {
    throw new RangeError("Target muscles must be known muscle groups");
  }
}

function unique(groups: readonly MuscleGroup[]): MuscleGroup[] {
  return [...new Set(groups)];
}

/** Most recently confirmed exact-name choice wins, including an intentionally empty choice. */
export function targetMusclesForReuse(
  mode: StrengthMode,
  itemName: string,
  previousSelections: readonly SavedTargetMuscleSelection[],
): MuscleGroup[] {
  assertMode(mode);
  if (typeof itemName !== "string" || itemName.length === 0) throw new RangeError("Workout item name must be non-empty");
  for (const selection of previousSelections) {
    assertMode(selection.mode);
    if (typeof selection.itemName !== "string") throw new RangeError("Saved item name must be a string");
    assertMuscles(selection.targetMuscles);
    assertIsoInstant(selection.confirmedAt);
  }
  const matches = previousSelections
    .filter((selection) => selection.mode === mode && selection.itemName === itemName)
    .slice()
    .sort((a, b) => Date.parse(b.confirmedAt) - Date.parse(a.confirmedAt));
  if (matches.length > 0) return unique(matches[0].targetMuscles);
  const catalog = DEFAULT_TARGET_MUSCLES[mode];
  return unique(Object.hasOwn(catalog, itemName) ? catalog[itemName] : []);
}

export interface StrengthWorkoutItem {
  itemId: string;
  mode: StrengthMode;
  targetMuscles: readonly MuscleGroup[];
  /** Actual performed reps only; planned prescription values are not part of this type. */
  sets: readonly { reps?: number }[];
}

export interface MuscleXpAward {
  id: string;
  itemId: string;
  group: MuscleGroup;
  xp: 1;
}

function awardId(itemId: string, group: MuscleGroup): string {
  return `${encodeURIComponent(itemId)}:${group}`;
}

/** Emits one independent 1 XP award per target group for each qualifying confirmed item. */
export function muscleAwardsForWorkout(items: readonly StrengthWorkoutItem[], workoutConfirmed: boolean): MuscleXpAward[] {
  if (typeof workoutConfirmed !== "boolean") throw new RangeError("workoutConfirmed must be boolean");
  const itemIds = new Set<string>();
  for (const item of items) {
    if (typeof item.itemId !== "string" || item.itemId.length === 0 || itemIds.has(item.itemId)) {
      throw new RangeError("Workout item IDs must be non-empty and unique within a workout");
    }
    itemIds.add(item.itemId);
    assertMode(item.mode);
    assertMuscles(item.targetMuscles);
    for (const set of item.sets) {
      if (set.reps !== undefined && (!Number.isSafeInteger(set.reps) || set.reps < 0)) {
        throw new RangeError("Actual reps must be a non-negative safe integer");
      }
    }
  }
  if (!workoutConfirmed) return [];

  return items.flatMap((item) => {
    if (item.mode === "Bodyweight" || !item.sets.some((set) => (set.reps ?? 0) >= 1)) return [];
    return unique(item.targetMuscles).map((group) => ({ id: awardId(item.itemId, group), itemId: item.itemId, group, xp: 1 as const }));
  });
}

/** Diffs desired awards against saved awards by stable item/group identity; persistence is the caller's job. */
export function reconcileMuscleAwards(
  savedAwards: readonly MuscleXpAward[],
  desiredAwards: readonly MuscleXpAward[],
): { added: MuscleXpAward[]; cancelled: MuscleXpAward[]; unchanged: MuscleXpAward[] } {
  const uniqueIds = (awards: readonly MuscleXpAward[]): Set<string> => {
    const ids = new Set<string>();
    for (const award of awards) {
      if (award.id !== awardId(award.itemId, award.group) || ids.has(award.id)) {
        throw new RangeError("Muscle awards must have unique stable item/group identities");
      }
      ids.add(award.id);
    }
    return ids;
  };
  const saved = uniqueIds(savedAwards);
  const desired = uniqueIds(desiredAwards);
  return {
    added: desiredAwards.filter((award) => !saved.has(award.id)),
    cancelled: savedAwards.filter((award) => !desired.has(award.id)),
    unchanged: desiredAwards.filter((award) => saved.has(award.id)),
  };
}
