import { levelForXp } from "./body-metrics.ts";
import { addLocalDays, assertIsoInstant, assertLocalDate } from "./time.ts";

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

export interface ProgressionSnapshot {
  avatar: { xp: number; level: number };
  bodyMetrics: { metric: ProgressionMetric; xp: number; level: number }[];
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
    xpByMetric.set(award.metric, xpByMetric.get(award.metric)! + 1);
    validAwards.push(award);
  }

  const bodyMetrics = PROGRESSION_METRICS.map((metric) => {
    const xp = xpByMetric.get(metric)!;
    return { metric, xp, level: levelForXp(xp) };
  });
  const avatarXp = validAwards.length;
  const firstDate = addLocalDays(endDate, -13);
  const days: ProgressionSnapshot["days"] = [];
  const awardsByDate = new Map<string, number>();
  for (const award of validAwards) awardsByDate.set(award.localDate, (awardsByDate.get(award.localDate) ?? 0) + 1);

  let cumulativeXp = 0;
  const sortedAwardDates = [...awardsByDate.keys()].sort();
  let awardDateIndex = 0;
  for (let index = 0; index < 14; index += 1) {
    const date = addLocalDays(firstDate, index);
    while (awardDateIndex < sortedAwardDates.length && sortedAwardDates[awardDateIndex] <= date) {
      cumulativeXp += awardsByDate.get(sortedAwardDates[awardDateIndex])!;
      awardDateIndex += 1;
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
    days,
  };
}
