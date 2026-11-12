import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAtMostOneActiveNumericGoalPerMetric,
  grantMeasurementUndoCapability,
  levelForXp,
  shouldAwardBodyMetricXp,
  supplementCompletionXp,
  undoLatestBodyMetricMeasurement,
  type BodyMetricMeasurement,
  type NumericBodyGoal,
} from "./body-metrics.ts";
import { localDateAt } from "./time.ts";
import { toCanonicalValue, toDisplayValue } from "./units.ts";

const goal = (targetValue: number | null = 100, comparisonResetAt = "2024-01-01T00:00:00Z"): NumericBodyGoal => ({
  metric: "weight",
  targetValue,
  comparisonResetAt,
});

const measurement = (
  id: string,
  value: number,
  recordedAt: string,
  options: Partial<Pick<BodyMetricMeasurement, "timeZone" | "metric" | "xpAwarded">> = {},
): BodyMetricMeasurement => ({
  id,
  metric: options.metric ?? "weight",
  value,
  recordedAt,
  timeZone: options.timeZone ?? "UTC",
  xpAwarded: options.xpAwarded ?? false,
});

test("fixed XP level threshold starts at 1 and advances every 10 XP", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(9), 1);
  assert.equal(levelForXp(10), 2);
  assert.equal(levelForXp(20), 3);
  assert.throws(() => levelForXp(-1), RangeError);
  assert.throws(() => levelForXp(1.5), RangeError);
});

test("only one active numeric goal is allowed per body metric", () => {
  assert.doesNotThrow(() => assertAtMostOneActiveNumericGoalPerMetric([
    { metric: "weight", targetValue: 100, active: false },
    { metric: "weight", targetValue: 95, active: true },
    { metric: "fat", targetValue: 20, active: true },
    { metric: "muscle", targetValue: null, active: true },
  ]));
  assert.throws(() => assertAtMostOneActiveNumericGoalPerMetric([
    { metric: "weight", targetValue: 100, active: true },
    { metric: "weight", targetValue: 95, active: true },
  ]), RangeError);
});

test("supplement XP uses occurrence completion boundaries and zero schedule", () => {
  assert.equal(supplementCompletionXp(0, 0), 0);
  assert.equal(supplementCompletionXp(3, 1), 0);
  assert.equal(supplementCompletionXp(2, 1), 1);
  assert.equal(supplementCompletionXp(3, 2), 1);
  assert.equal(supplementCompletionXp(3, 3), 2);
  assert.throws(() => supplementCompletionXp(2, 3), RangeError);
});

test("first measurement and first measurement after goal reset earn recording XP", () => {
  assert.equal(shouldAwardBodyMetricXp(measurement("first", 84, "2024-01-01T12:00:00Z"), [], goal()), true);
  const beforeReset = measurement("old", 120, "2024-01-01T00:00:00Z", { xpAwarded: true });
  assert.equal(
    shouldAwardBodyMetricXp(measurement("after-edit", 105, "2024-01-02T00:00:00Z"), [beforeReset], goal(100, "2024-01-01T12:00:00Z")),
    true,
  );
  assert.equal(shouldAwardBodyMetricXp(measurement("no-target", 84, "2024-01-01T12:00:00Z"), [], goal(null)), false);
});

test("absolute target gap rewards improvement, including a closer overshoot, not worse direction", () => {
  const previous = measurement("base", 90, "2024-01-01T00:00:00Z");
  assert.equal(shouldAwardBodyMetricXp(measurement("farther", 85, "2024-01-02T00:00:00Z"), [previous], goal()), false);
  assert.equal(shouldAwardBodyMetricXp(measurement("overshoot", 105, "2024-01-02T00:00:00Z"), [previous], goal()), true);
  const above = measurement("above", 110, "2024-01-01T00:00:00Z");
  assert.equal(shouldAwardBodyMetricXp(measurement("wrong-way", 115, "2024-01-02T00:00:00Z"), [above], goal()), false);
});

test("the latest awarded baseline stays authoritative over later non-awarded measurements", () => {
  const awarded = measurement("awarded", 80, "2024-01-01T00:00:00Z", { xpAwarded: true });
  const laterNoAward = measurement("later", 90, "2024-01-05T00:00:00Z");
  // Against the earned-XP baseline the gap grows (10 to 15); against the later record it would shrink.
  assert.equal(
    shouldAwardBodyMetricXp(measurement("now", 85, "2024-01-06T00:00:00Z"), [awarded, laterNoAward], goal(70)),
    false,
  );
});

test("awarded baseline window includes seven prior local dates but excludes eight", () => {
  const earned = measurement("earned", 100, "2024-01-01T12:00:00Z", { xpAwarded: true });
  const later = measurement("later", 80, "2024-01-07T12:00:00Z");
  const atSevenDays = measurement("day-seven", 85, "2024-01-08T12:00:00Z");
  const atEightDays = measurement("day-eight", 85, "2024-01-09T12:00:00Z");
  assert.equal(shouldAwardBodyMetricXp(atSevenDays, [earned, later], goal(100)), false);
  assert.equal(shouldAwardBodyMetricXp(atEightDays, [earned, later], goal(100)), true);
});

test("daily cap includes equal-timestamp and later retained awards, and retries are idempotent", () => {
  const instant = "2026-11-12T00:00:00.000Z";
  const tiedAward = measurement("saved-award", 90, instant, { xpAwarded: true });
  assert.equal(shouldAwardBodyMetricXp(measurement("same-instant", 95, instant), [tiedAward], goal()), false);

  const laterAward = measurement("later-award", 90, "2026-11-12T23:00:00.000Z", { xpAwarded: true });
  const backdated = measurement("backdated", 95, "2026-11-12T12:00:00.000Z");
  assert.equal(shouldAwardBodyMetricXp(backdated, [laterAward], goal()), false);

  const unawardedRetry = measurement("retry", 95, instant);
  assert.equal(shouldAwardBodyMetricXp(unawardedRetry, [unawardedRetry], goal()), false);
});

test("one metric award per local date applies across recording timezones and goal resets", () => {
  const alreadyAwarded = measurement("awarded", 90, "2024-01-02T01:00:00Z", {
    timeZone: "America/Los_Angeles",
    xpAwarded: true,
  });
  const current = measurement("second", 95, "2024-01-02T02:00:00Z", { timeZone: "America/New_York" });
  assert.equal(localDateAt(alreadyAwarded.recordedAt, alreadyAwarded.timeZone), "2024-01-01");
  assert.equal(localDateAt(current.recordedAt, current.timeZone), "2024-01-01");
  assert.equal(shouldAwardBodyMetricXp(current, [alreadyAwarded], goal(100)), false);

  const resetGoal = goal(100, "2024-01-02T01:30:00Z");
  assert.equal(shouldAwardBodyMetricXp(current, [alreadyAwarded], resetGoal), false);
  // The reset leaves the older award in history; only the current decision is capped.
  assert.equal(alreadyAwarded.xpAwarded, true);
});

test("conversion round-trip noise below machine arithmetic tolerance does not earn XP", () => {
  const baselineValue = 0.3;
  const convertedBack = toCanonicalValue(toDisplayValue(baselineValue, "mass", "Imperial"), "mass", "Imperial");
  const base = measurement("base", baselineValue, "2024-01-01T00:00:00Z", { xpAwarded: true });
  assert.equal(
    shouldAwardBodyMetricXp(measurement("round-trip", convertedBack, "2024-01-02T00:00:00Z"), [base], goal(0.1)),
    false,
  );
});

test("timezone and numeric trust boundaries reject malformed values", () => {
  assert.throws(() => localDateAt("2024-02-30T00:00:00Z", "UTC"), RangeError);
  assert.throws(() => localDateAt("2024-01-01T00:00:00Z", "Not/AZone"), RangeError);
  assert.throws(() => shouldAwardBodyMetricXp(measurement("bad", Number.NaN, "2024-01-01T00:00:00Z"), [], goal()), RangeError);
});

test("undo physically removes the measurement and award without restoring older undoability", () => {
  const older = measurement("older", 90, "2024-01-01T00:00:00Z", { xpAwarded: true });
  const newest = measurement("newest", 95, "2024-01-02T00:00:00Z", { xpAwarded: true });
  const undone = undoLatestBodyMetricMeasurement([older, newest], grantMeasurementUndoCapability("weight", "newest"));
  assert.ok(undone);
  assert.deepEqual(undone.measurements, [older]);
  assert.equal(undone.measurements.some((record) => record.id === "newest"), false);
  assert.equal(undone.capability.measurementId, null);
  assert.equal(undoLatestBodyMetricMeasurement(undone.measurements, undone.capability), null);

  const candidate = measurement("corrected", 94, "2024-01-03T00:00:00Z");
  assert.equal(shouldAwardBodyMetricXp(candidate, undone.measurements, goal()), true);
  const reentered = { ...candidate, xpAwarded: true };
  const nextCapability = grantMeasurementUndoCapability("weight", reentered.id);
  assert.equal(nextCapability.measurementId, "corrected");
  const secondUndo = undoLatestBodyMetricMeasurement([...undone.measurements, reentered], nextCapability);
  assert.deepEqual(secondUndo?.measurements, [older]);
});
