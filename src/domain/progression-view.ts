import { levelForXp } from "./body-metrics.ts";
import { addLocalDays, assertIsoInstant, assertLocalDate } from "./time.ts";
import { MUSCLE_GROUPS, type MuscleGroup } from "./workouts.ts";

export type ProgressionMetric = "body_weight" | "body_fat_percentage" | "skeletal_muscle_mass";

export interface ProgressionMeasurement {
  id: string;
  metric: ProgressionMetric;
  value: number;
  recordedAt: string;
  localDate: string;
  sequence: number;
}

export interface BodyMetricXpAward {
  measurementId: string;
  metric: ProgressionMetric;
  localDate: string;
  xp: 1;
}

export interface MuscleXpEvent {
  id: string;
  workoutId: string;
  itemId: string;
  group: MuscleGroup;
  delta: 1 | -1;
  localDate: string;
  occurredAt: string;
  sequence: number;
}

export interface ProgressionSnapshot {
  avatar: { xp: number; level: number };
  bodyMetrics: { metric: ProgressionMetric; xp: number; level: number }[];
  muscles: { group: MuscleGroup; xp: number; level: number }[];
  days: { date: string; bodyWeightKg: number | null; xp: number; level: number }[];
}

export const PROGRESSION_METRICS: readonly ProgressionMetric[] = [
  "body_weight",
  "body_fat_percentage",
  "skeletal_muscle_mass",
];

function isProgressionMetric(value: unknown): value is ProgressionMetric {
  return typeof value === "string" && PROGRESSION_METRICS.includes(value as ProgressionMetric);
}

function assertDate(value: string, label: string): void {
  if (typeof value !== "string") throw new RangeError(`${label} must be a calendar date string`);
  assertLocalDate(value);
}

function assertMeasurement(measurement: ProgressionMeasurement): void {
  if (!measurement || typeof measurement !== "object") throw new RangeError("Measurement must be an object");
  if (typeof measurement.id !== "string" || measurement.id.length === 0) throw new RangeError("Measurement ID must be non-empty");
  if (!isProgressionMetric(measurement.metric)) throw new RangeError(`Unknown progression metric: ${String(measurement.metric)}`);
  if (!Number.isFinite(measurement.value) || measurement.value < 0) throw new RangeError("Measurement value must be finite and non-negative");
  if (measurement.metric === "body_fat_percentage" && measurement.value > 100) {
    throw new RangeError("Body fat percentage must be between zero and 100");
  }
  if (typeof measurement.recordedAt !== "string") throw new RangeError("Measurement recording time must be a string");
  assertIsoInstant(measurement.recordedAt);
  assertDate(measurement.localDate, "Measurement localDate");
  if (!Number.isSafeInteger(measurement.sequence) || measurement.sequence < 0) {
    throw new RangeError("Measurement sequence must be a non-negative safe integer");
  }
}

function assertAward(award: BodyMetricXpAward): void {
  if (!award || typeof award !== "object") throw new RangeError("XP award must be an object");
  if (typeof award.measurementId !== "string" || award.measurementId.length === 0) {
    throw new RangeError("Award measurement ID must be non-empty");
  }
  if (!isProgressionMetric(award.metric)) throw new RangeError(`Unknown award metric: ${String(award.metric)}`);
  assertDate(award.localDate, "Award localDate");
  if (award.xp !== 1) throw new RangeError("Body metric awards must be exactly 1 XP");
}

function assertMuscleEvent(event: MuscleXpEvent): void {
  if (!event || typeof event !== "object") throw new RangeError("Muscle XP event must be an object");
  for (const [value, label] of [[event.id, "event ID"], [event.workoutId, "workout ID"], [event.itemId, "item ID"]] as const) {
    if (typeof value !== "string" || value.length === 0) throw new RangeError(`Muscle XP ${label} must be non-empty`);
  }
  if (typeof event.group !== "string" || !MUSCLE_GROUPS.includes(event.group)) {
    throw new RangeError(`Unknown muscle group: ${String(event.group)}`);
  }
  if (event.delta !== 1 && event.delta !== -1) throw new RangeError("Muscle XP delta must be +1 or -1");
  assertDate(event.localDate, "Muscle event localDate");
  if (typeof event.occurredAt !== "string") throw new RangeError("Muscle event occurredAt must be a string");
  assertIsoInstant(event.occurredAt);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
    throw new RangeError("Muscle event sequence must be a non-negative safe integer");
  }
}

function muscleEventHistory(events: readonly MuscleXpEvent[]): {
  xpByGroup: Map<MuscleGroup, number>;
  changesByDate: Map<string, number>;
} {
  if (!Array.isArray(events)) throw new RangeError("Muscle XP events must be a list");
  const ids = new Set<string>();
  const ordered = events.map((event) => {
    assertMuscleEvent(event);
    if (ids.has(event.id)) throw new RangeError(`Duplicate muscle XP event ID: ${event.id}`);
    ids.add(event.id);
    return event;
  }).sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (timeDifference !== 0) return timeDifference;
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.id === right.id ? 0 : left.id > right.id ? 1 : -1;
  });

  const activeAwards = new Map<string, string>();
  const xpByGroup = new Map<MuscleGroup, number>(MUSCLE_GROUPS.map((group) => [group, 0]));
  const changesByDate = new Map<string, number>();
  const changesByDateAndGroup = new Map<string, Map<MuscleGroup, number>>();
  for (const event of ordered) {
    const pair = JSON.stringify([event.workoutId, event.itemId, event.group]);
    const grantDate = activeAwards.get(pair);
    if ((event.delta === 1 && grantDate !== undefined) || (event.delta === -1 && grantDate === undefined)) {
      throw new RangeError(`Muscle XP event does not follow award order for ${event.workoutId}/${event.itemId}/${event.group}`);
    }
    const effectiveDate = event.delta === 1 ? event.localDate : grantDate!;
    if (event.delta === 1) activeAwards.set(pair, effectiveDate);
    else activeAwards.delete(pair);

    const groupTotal = xpByGroup.get(event.group)! + event.delta;
    if (!Number.isSafeInteger(groupTotal) || groupTotal < 0) throw new RangeError("Muscle XP total is malformed");
    xpByGroup.set(event.group, groupTotal);

    const dailyTotal = (changesByDate.get(effectiveDate) ?? 0) + event.delta;
    if (!Number.isSafeInteger(dailyTotal)) throw new RangeError("Muscle XP daily total is malformed");
    changesByDate.set(effectiveDate, dailyTotal);
    const groupChanges = changesByDateAndGroup.get(effectiveDate) ?? new Map<MuscleGroup, number>();
    const dailyGroupTotal = (groupChanges.get(event.group) ?? 0) + event.delta;
    if (!Number.isSafeInteger(dailyGroupTotal)) throw new RangeError("Muscle XP daily group total is malformed");
    groupChanges.set(event.group, dailyGroupTotal);
    changesByDateAndGroup.set(effectiveDate, groupChanges);
  }

  const runningByGroup = new Map<MuscleGroup, number>(MUSCLE_GROUPS.map((group) => [group, 0]));
  for (const date of [...changesByDateAndGroup.keys()].sort()) {
    for (const [group, delta] of changesByDateAndGroup.get(date)!) {
      const total = runningByGroup.get(group)! + delta;
      if (!Number.isSafeInteger(total) || total < 0) {
        throw new RangeError("Muscle XP correction predates its retained award in local-date history");
      }
      runningByGroup.set(group, total);
    }
  }
  for (const group of MUSCLE_GROUPS) {
    if (runningByGroup.get(group) !== xpByGroup.get(group)) throw new RangeError("Muscle XP history totals are inconsistent");
  }
  return { xpByGroup, changesByDate };
}

function addSafeTotal(map: Map<string, number>, key: string, amount: number): void {
  const total = (map.get(key) ?? 0) + amount;
  if (!Number.isSafeInteger(total)) throw new RangeError("Progression XP total is malformed");
  map.set(key, total);
}

function compareLatest(left: ProgressionMeasurement, right: ProgressionMeasurement): number {
  const instantDifference = Date.parse(left.recordedAt) - Date.parse(right.recordedAt);
  if (instantDifference !== 0) return instantDifference;
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return left.id === right.id ? 0 : left.id > right.id ? 1 : -1;
}

function latestWeightOnDate(
  measurements: readonly ProgressionMeasurement[],
  date: string,
): number | null {
  let latest: ProgressionMeasurement | undefined;
  for (const measurement of measurements) {
    if (measurement.metric === "body_weight" && measurement.localDate === date && (!latest || compareLatest(measurement, latest) > 0)) {
      latest = measurement;
    }
  }
  return latest?.value ?? null;
}

/** Compose a read-only 14-day view from retained confirmed measurements and awards. */
export function buildProgressionSnapshot(
  measurements: readonly ProgressionMeasurement[],
  awards: readonly BodyMetricXpAward[],
  endDate: string,
  muscleEvents: readonly MuscleXpEvent[] = [],
): ProgressionSnapshot {
  assertDate(endDate, "endDate");

  const measurementsById = new Map<string, ProgressionMeasurement>();
  for (const measurement of measurements) {
    assertMeasurement(measurement);
    if (measurementsById.has(measurement.id)) throw new RangeError(`Duplicate measurement ID: ${measurement.id}`);
    measurementsById.set(measurement.id, measurement);
  }

  const awardsBySource = new Set<string>();
  const awardedMetricDates = new Set<string>();
  const xpByMetric = new Map<ProgressionMetric, number>(PROGRESSION_METRICS.map((metric) => [metric, 0]));
  const validAwards: BodyMetricXpAward[] = [];
  for (const award of awards) {
    assertAward(award);
    if (awardsBySource.has(award.measurementId)) throw new RangeError(`Duplicate XP award source: ${award.measurementId}`);
    awardsBySource.add(award.measurementId);

    const measurement = measurementsById.get(award.measurementId);
    if (!measurement) throw new RangeError(`XP award has no retained measurement: ${award.measurementId}`);
    if (measurement.metric !== award.metric || measurement.localDate !== award.localDate) {
      throw new RangeError(`XP award does not match its source measurement: ${award.measurementId}`);
    }

    const metricDate = `${award.metric}\u0000${award.localDate}`;
    if (awardedMetricDates.has(metricDate)) throw new RangeError(`Multiple XP awards for ${award.metric} on ${award.localDate}`);
    awardedMetricDates.add(metricDate);
    const metricXp = xpByMetric.get(award.metric)! + 1;
    if (!Number.isSafeInteger(metricXp)) throw new RangeError("Body metric XP total is malformed");
    xpByMetric.set(award.metric, metricXp);
    validAwards.push(award);
  }

  const bodyMetrics = PROGRESSION_METRICS.map((metric) => {
    const xp = xpByMetric.get(metric)!;
    return { metric, xp, level: levelForXp(xp) };
  });
  const { xpByGroup, changesByDate: muscleChangesByDate } = muscleEventHistory(muscleEvents);
  const muscles = MUSCLE_GROUPS.map((group) => {
    const xp = xpByGroup.get(group)!;
    return { group, xp, level: levelForXp(xp) };
  });
  const muscleTotal = muscles.reduce((total, muscle) => {
    const next = total + muscle.xp;
    if (!Number.isSafeInteger(next)) throw new RangeError("Muscle XP total is malformed");
    return next;
  }, 0);
  const avatarXp = validAwards.length + muscleTotal;
  if (!Number.isSafeInteger(avatarXp)) throw new RangeError("Avatar XP total is malformed");

  const firstDate = addLocalDays(endDate, -13);
  const days: ProgressionSnapshot["days"] = [];
  const xpChangesByDate = new Map<string, number>();
  for (const award of validAwards) addSafeTotal(xpChangesByDate, award.localDate, 1);
  for (const [date, change] of muscleChangesByDate) addSafeTotal(xpChangesByDate, date, change);

  let cumulativeXp = 0;
  const sortedDates = [...xpChangesByDate.keys()].sort();
  let changeIndex = 0;
  for (let index = 0; index < 14; index += 1) {
    const date = addLocalDays(firstDate, index);
    while (changeIndex < sortedDates.length && sortedDates[changeIndex] <= date) {
      cumulativeXp += xpChangesByDate.get(sortedDates[changeIndex])!;
      if (!Number.isSafeInteger(cumulativeXp) || cumulativeXp < 0) {
        throw new RangeError("Progression history total is malformed");
      }
      changeIndex += 1;
    }
    days.push({
      date,
      bodyWeightKg: latestWeightOnDate(measurements, date),
      xp: cumulativeXp,
      level: levelForXp(cumulativeXp),
    });
  }

  return {
    avatar: { xp: avatarXp, level: levelForXp(avatarXp) },
    bodyMetrics,
    muscles,
    days,
  };
}
