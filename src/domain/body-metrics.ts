import { addLocalDays, assertIsoInstant, localDateAt, type IsoInstant, type LocalDate } from "./time.ts";

export interface BodyMetricMeasurement {
  id: string;
  metric: string;
  value: number;
  recordedAt: IsoInstant;
  timeZone: string;
  /** True only when this measurement currently owns its retained 1 XP award. */
  xpAwarded: boolean;
}

export interface NumericBodyGoal {
  metric: string;
  /** Null means this active goal has no numeric body-metric target and grants no gap XP. */
  targetValue: number | null;
  /** Activation/edit instant; measurements before it are outside this goal's comparison history. */
  comparisonResetAt: IsoInstant;
}

export interface BodyGoalState {
  metric: string;
  targetValue: number | null;
  active: boolean;
}

export interface BodyMetricUndoCapability {
  metric: string;
  /** Only a newly confirmed measurement is assigned here; undo clears it instead of exposing an older record. */
  measurementId: string | null;
}

function assertNonempty(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) throw new RangeError(`${label} must be a non-empty string`);
}

function validateMeasurement(measurement: BodyMetricMeasurement): LocalDate {
  assertNonempty(measurement.id, "Measurement ID");
  assertNonempty(measurement.metric, "Metric");
  if (!Number.isFinite(measurement.value)) throw new RangeError("Measurement value must be finite");
  assertIsoInstant(measurement.recordedAt);
  if (typeof measurement.xpAwarded !== "boolean") throw new RangeError("xpAwarded must be boolean");
  return localDateAt(measurement.recordedAt, measurement.timeZone);
}

export function assertAtMostOneActiveNumericGoalPerMetric(goals: readonly BodyGoalState[]): void {
  const activeMetrics = new Set<string>();
  for (const goal of goals) {
    assertNonempty(goal.metric, "Goal metric");
    if (typeof goal.active !== "boolean") throw new RangeError("Goal active state must be boolean");
    if (goal.targetValue !== null && !Number.isFinite(goal.targetValue)) throw new RangeError("Goal target must be finite or null");
    if (goal.active && goal.targetValue !== null) {
      if (activeMetrics.has(goal.metric)) throw new RangeError(`More than one active numeric goal for metric: ${goal.metric}`);
      activeMetrics.add(goal.metric);
    }
  }
}

function validateGoal(goal: NumericBodyGoal): void {
  assertNonempty(goal.metric, "Goal metric");
  if (goal.targetValue !== null && !Number.isFinite(goal.targetValue)) throw new RangeError("Goal target must be finite or null");
  assertIsoInstant(goal.comparisonResetAt);
}

function isEarlier(left: BodyMetricMeasurement, right: BodyMetricMeasurement): boolean {
  return Date.parse(left.recordedAt) < Date.parse(right.recordedAt);
}

function mostRecent(records: BodyMetricMeasurement[]): BodyMetricMeasurement | undefined {
  return records.reduce<BodyMetricMeasurement | undefined>((latest, record) =>
    !latest || Date.parse(record.recordedAt) > Date.parse(latest.recordedAt) ? record : latest, undefined);
}

/**
 * Decides whether one just-confirmed measurement earns its 1 XP. The caller should persist
 * the measurement and award atomically; this function does not mutate or store history.
 */
export function shouldAwardBodyMetricXp(
  measurement: BodyMetricMeasurement,
  previousMeasurements: readonly BodyMetricMeasurement[],
  activeGoal: NumericBodyGoal | null,
): boolean {
  const measurementDate = validateMeasurement(measurement);
  if (!activeGoal) return false;
  validateGoal(activeGoal);
  if (activeGoal.metric !== measurement.metric || activeGoal.targetValue === null) return false;

  const resetTime = Date.parse(activeGoal.comparisonResetAt);
  const currentTime = Date.parse(measurement.recordedAt);
  if (currentTime < resetTime) return false;

  const retained = previousMeasurements.map((record) => ({ record, date: validateMeasurement(record) }));
  // A retry of an already-known measurement must never mint a second award.
  if (retained.some(({ record }) => record.id === measurement.id)) return false;

  // The daily cap covers every retained award, even tied or later instants when this input is backdated.
  if (retained.some(({ record, date }) =>
    record.metric === measurement.metric && record.xpAwarded && date === measurementDate)) return false;

  // Baseline ordering remains strictly earlier by instant; tied timestamps are only considered by the cap above.
  const previous = retained
    .map(({ record }) => record)
    .filter((record) => record.metric === measurement.metric && isEarlier(record, measurement));
  const eligible = previous.filter((record) => Date.parse(record.recordedAt) >= resetTime);
  if (eligible.length === 0) return true;

  const windowStart = addLocalDays(measurementDate, -7);
  const recentAwarded = eligible.filter((record) => {
    if (!record.xpAwarded) return false;
    const date = validateMeasurement(record);
    return date >= windowStart && date <= measurementDate;
  });
  const baseline = mostRecent(recentAwarded.length > 0 ? recentAwarded : eligible);
  if (!baseline) return true;

  const target = activeGoal.targetValue;
  const previousGap = Math.abs(baseline.value - target);
  const currentGap = Math.abs(measurement.value - target);
  // Four machine epsilons cover subtraction/absolute-value roundoff only; this is not a measurement-precision rule.
  const tolerance = 4 * Number.EPSILON * Math.max(1, Math.abs(baseline.value), Math.abs(measurement.value), Math.abs(target));
  return previousGap - currentGap > tolerance;
}

export function supplementCompletionXp(scheduledOccurrences: number, takenOccurrences: number): 0 | 1 | 2 {
  if (!Number.isSafeInteger(scheduledOccurrences) || scheduledOccurrences < 0) {
    throw new RangeError("Scheduled occurrences must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(takenOccurrences) || takenOccurrences < 0 || takenOccurrences > scheduledOccurrences) {
    throw new RangeError("Taken occurrences must be a safe integer between zero and scheduled occurrences");
  }
  if (scheduledOccurrences === 0 || takenOccurrences * 2 < scheduledOccurrences) return 0;
  return takenOccurrences === scheduledOccurrences ? 2 : 1;
}

export function levelForXp(xp: number): number {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError("XP must be a non-negative safe integer");
  return 1 + Math.floor(xp / 10);
}

/** Marks a just-saved measurement as the sole undo candidate for this metric. */
export function grantMeasurementUndoCapability(metric: string, measurementId: string): BodyMetricUndoCapability {
  assertNonempty(metric, "Metric");
  assertNonempty(measurementId, "Measurement ID");
  return { metric, measurementId };
}

/** Physically removes the eligible measurement (and its embedded award); older records never regain undoability. */
export function undoLatestBodyMetricMeasurement(
  measurements: readonly BodyMetricMeasurement[],
  capability: BodyMetricUndoCapability,
): { measurements: BodyMetricMeasurement[]; capability: BodyMetricUndoCapability } | null {
  assertNonempty(capability.metric, "Metric");
  if (capability.measurementId === null) return null;
  assertNonempty(capability.measurementId, "Measurement ID");

  const target = measurements.find((record) => record.id === capability.measurementId);
  if (!target || target.metric !== capability.metric) throw new RangeError("Undo capability does not identify a saved measurement for this metric");
  return {
    measurements: measurements.filter((record) => record.id !== capability.measurementId),
    capability: { metric: capability.metric, measurementId: null },
  };
}
