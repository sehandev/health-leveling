import { assertIsoInstant, type IsoInstant } from "./time.ts";
import {
  DEFAULT_TARGET_MUSCLES,
  MUSCLE_GROUPS,
  type MuscleGroup,
  type StrengthMode,
} from "./workouts.ts";

export interface StrengthWorkoutItemRecord {
  id: string;
  name: string;
  source: "curated" | "custom";
  mode: StrengthMode;
  targetMuscles: MuscleGroup[];
  sets: { reps: number | null; loadKg: number | null }[];
}

export interface StrengthWorkoutDraft {
  type: "Strength Training";
  recordedAt: string;
  timezone: string;
  place: string;
  note: string;
  items: StrengthWorkoutItemRecord[];
}

export interface StrengthWorkoutRecord extends StrengthWorkoutDraft {
  id: string;
  version: number;
  localDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomWorkoutUsage {
  id: string;
  mode: StrengthMode;
  name: string;
  addedAt: string;
  sequence: number;
}

export interface WorkoutMuscleSelection {
  mode: StrengthMode;
  name: string;
  source: "curated" | "custom";
  targetMuscles: MuscleGroup[];
  confirmedAt: string;
  sequence: number;
}

export interface WorkoutPickerState {
  usages: CustomWorkoutUsage[];
  selections: WorkoutMuscleSelection[];
}

// Input caps bound transport-controlled text and lists without imposing measurement precision.
const MAX_NAME_LENGTH = 256;
const MAX_PLACE_LENGTH = 500;
const MAX_NOTE_LENGTH = 10_000;
const MAX_TIMEZONE_LENGTH = 255;
const MAX_ITEMS = 100;
const MAX_SETS_PER_ITEM = 100;
const MAX_TARGETS_PER_ITEM = 100;
const MAX_STABLE_ID_LENGTH = 255;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new RangeError(`${label} must be a string of at most ${maxLength} characters`);
  }
  return value;
}

function requireNonempty(value: unknown, label: string, maxLength: number): string {
  const text = requireString(value, label, maxLength);
  if (text.trim().length === 0) throw new RangeError(`${label} must not be empty`);
  return text;
}

function isStrengthMode(value: unknown): value is StrengthMode {
  return value === "Machine" || value === "Free Weight" || value === "Bodyweight";
}

function requireMode(value: unknown): StrengthMode {
  if (!isStrengthMode(value)) throw new RangeError(`Invalid strength mode: ${String(value)}`);
  return value;
}

function requireSource(value: unknown): "curated" | "custom" {
  if (value !== "curated" && value !== "custom") throw new RangeError(`Invalid workout item source: ${String(value)}`);
  return value;
}

function requireIsoInstant(value: unknown, label: string): IsoInstant {
  const instant = requireNonempty(value, label, 64);
  assertIsoInstant(instant);
  return instant;
}

function requireSequence(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function requireTargetMuscles(value: unknown, label: string): MuscleGroup[] {
  if (!Array.isArray(value) || value.length > MAX_TARGETS_PER_ITEM) {
    throw new RangeError(`${label} must be a list of at most ${MAX_TARGETS_PER_ITEM} muscle groups`);
  }
  const unique: MuscleGroup[] = [];
  for (const group of value) {
    if (typeof group !== "string" || !MUSCLE_GROUPS.includes(group as MuscleGroup)) {
      throw new RangeError(`${label} contains an unknown muscle group`);
    }
    if (!unique.includes(group as MuscleGroup)) unique.push(group as MuscleGroup);
  }
  return unique;
}

function requireCuratedName(mode: StrengthMode, source: "curated" | "custom", name: string): void {
  if (source === "curated" && !Object.hasOwn(DEFAULT_TARGET_MUSCLES[mode], name)) {
    throw new RangeError(`Unknown curated ${mode} exercise: ${name}`);
  }
}

/** Parses a confirmed Strength Training draft; blank place/note become empty strings. */
export function parseStrengthWorkoutDraft(input: unknown): StrengthWorkoutDraft {
  if (!isRecord(input)) throw new RangeError("Workout draft must be an object");
  if (input.type !== "Strength Training") throw new RangeError("Workout type must be Strength Training");

  const recordedAt = requireIsoInstant(input.recordedAt, "recordedAt");
  const timezone = requireNonempty(input.timezone, "timezone", MAX_TIMEZONE_LENGTH);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  }

  const place = requireString(input.place, "place", MAX_PLACE_LENGTH);
  const note = requireString(input.note, "note", MAX_NOTE_LENGTH);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > MAX_ITEMS) {
    throw new RangeError(`Workout must contain between 1 and ${MAX_ITEMS} items`);
  }

  const itemIds = new Set<string>();
  const items = input.items.map((value, index): StrengthWorkoutItemRecord => {
    if (!isRecord(value)) throw new RangeError(`items[${index}] must be an object`);
    const id = requireNonempty(value.id, `items[${index}].id`, MAX_STABLE_ID_LENGTH);
    if (itemIds.has(id)) throw new RangeError(`Duplicate workout item ID: ${id}`);
    itemIds.add(id);

    const mode = requireMode(value.mode);
    const source = requireSource(value.source);
    const name = requireNonempty(value.name, `items[${index}].name`, MAX_NAME_LENGTH);
    requireCuratedName(mode, source, name);
    const targetMuscles = requireTargetMuscles(value.targetMuscles, `items[${index}].targetMuscles`);
    if (!Array.isArray(value.sets) || value.sets.length > MAX_SETS_PER_ITEM) {
      throw new RangeError(`items[${index}].sets must be a list of at most ${MAX_SETS_PER_ITEM} sets`);
    }
    const sets = value.sets.map((set, setIndex) => {
      if (!isRecord(set)) throw new RangeError(`items[${index}].sets[${setIndex}] must be an object`);
      const reps = set.reps;
      const loadKg = set.loadKg;
      if (reps !== null && (!Number.isSafeInteger(reps) || (reps as number) < 0)) {
        throw new RangeError(`items[${index}].sets[${setIndex}].reps must be null or a non-negative safe integer`);
      }
      if (loadKg !== null && (typeof loadKg !== "number" || !Number.isFinite(loadKg) || loadKg < 0)) {
        throw new RangeError(`items[${index}].sets[${setIndex}].loadKg must be null or a finite non-negative number`);
      }
      if (mode === "Bodyweight" && loadKg === 0) {
        throw new RangeError(`items[${index}].sets[${setIndex}].loadKg must be null for a bodyweight-only set`);
      }
      return { reps: reps as number | null, loadKg: loadKg as number | null };
    });

    return { id, name, source, mode, targetMuscles, sets };
  });

  return {
    type: "Strength Training",
    recordedAt,
    timezone,
    place: place.trim().length === 0 ? "" : place,
    note: note.trim().length === 0 ? "" : note,
    items,
  };
}

function validateUsage(usage: CustomWorkoutUsage): void {
  if (!isRecord(usage)) throw new RangeError("Workout usage must be an object");
  requireNonempty(usage.id, "Workout usage ID", MAX_STABLE_ID_LENGTH);
  requireMode(usage.mode);
  requireNonempty(usage.name, "Workout usage name", MAX_NAME_LENGTH);
  requireIsoInstant(usage.addedAt, "Workout usage addedAt");
  requireSequence(usage.sequence, "Workout usage sequence");
}

/** Returns exact-name custom history and promotions, newest first within the selected mode. */
export function pickerOptions(
  mode: StrengthMode,
  state: WorkoutPickerState,
): { recentCustomNames: string[]; promotedCustomNames: string[] } {
  requireMode(mode);
  if (!isRecord(state) || !Array.isArray(state.usages) || !Array.isArray(state.selections)) {
    throw new RangeError("Workout picker state must contain usages and selections");
  }

  const ids = new Set<string>();
  const usages = state.usages.map((usage) => {
    validateUsage(usage);
    if (ids.has(usage.id)) throw new RangeError(`Duplicate workout usage ID: ${usage.id}`);
    ids.add(usage.id);
    return usage;
  }).filter((usage) => usage.mode === mode).sort((left, right) => {
    const timeDifference = Date.parse(right.addedAt) - Date.parse(left.addedAt);
    if (timeDifference !== 0) return timeDifference;
    if (left.sequence !== right.sequence) return right.sequence - left.sequence;
    return left.id === right.id ? 0 : left.id > right.id ? -1 : 1;
  });

  const counts = new Map<string, number>();
  for (const usage of usages) counts.set(usage.name, (counts.get(usage.name) ?? 0) + 1);
  const seen = new Set<string>();
  const recentCustomNames: string[] = [];
  const promotedCustomNames: string[] = [];
  for (const usage of usages) {
    if (seen.has(usage.name)) continue;
    seen.add(usage.name);
    recentCustomNames.push(usage.name);
    if (counts.get(usage.name)! >= 3) promotedCustomNames.push(usage.name);
  }
  return { recentCustomNames, promotedCustomNames };
}

/** Latest exact source/mode/name selection wins; an empty saved selection is intentional. */
export function targetMusclesForWorkoutItem(
  item: { mode: StrengthMode; name: string; source: "curated" | "custom" },
  selections: readonly WorkoutMuscleSelection[],
): MuscleGroup[] {
  if (!isRecord(item)) throw new RangeError("Workout item must be an object");
  const mode = requireMode(item.mode);
  const source = requireSource(item.source);
  const name = requireNonempty(item.name, "Workout item name", MAX_NAME_LENGTH);
  requireCuratedName(mode, source, name);
  if (!Array.isArray(selections)) throw new RangeError("Workout muscle selections must be a list");

  let latest: WorkoutMuscleSelection | undefined;
  for (const selection of selections) {
    if (!isRecord(selection)) throw new RangeError("Workout muscle selection must be an object");
    const selectionMode = requireMode(selection.mode);
    const selectionSource = requireSource(selection.source);
    const selectionName = requireNonempty(selection.name, "Workout muscle selection name", MAX_NAME_LENGTH);
    const targetMuscles = requireTargetMuscles(selection.targetMuscles, "Workout muscle selection targets");
    const confirmedAt = requireIsoInstant(selection.confirmedAt, "Workout muscle selection confirmedAt");
    const sequence = requireSequence(selection.sequence, "Workout muscle selection sequence");
    if (selectionMode !== mode || selectionSource !== source || selectionName !== name) continue;
    const confirmedTime = Date.parse(confirmedAt);
    const latestTime = latest ? Date.parse(latest.confirmedAt) : -Infinity;
    if (!latest || confirmedTime > latestTime || (confirmedTime === latestTime && sequence > latest.sequence)) {
      latest = { ...selection, mode: selectionMode, source: selectionSource, name: selectionName, targetMuscles, confirmedAt, sequence };
    }
  }
  if (latest) return [...latest.targetMuscles];
  return source === "curated" && Object.hasOwn(DEFAULT_TARGET_MUSCLES[mode], name)
    ? [...DEFAULT_TARGET_MUSCLES[mode][name]]
    : [];
}
