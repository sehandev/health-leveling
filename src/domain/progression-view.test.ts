import assert from "node:assert/strict";
import test from "node:test";
import {
  PROGRESSION_METRICS,
  buildProgressionSnapshot,
  type BodyMetricXpAward,
  type ProgressionMeasurement,
} from "./progression-view.ts";

const measurement = (
  id: string,
  metric: ProgressionMeasurement["metric"],
  value: number,
  recordedAt: string,
  localDate: string,
  sequence = 0,
): ProgressionMeasurement => ({ id, metric, value, recordedAt, localDate, sequence });

const award = (source: ProgressionMeasurement): BodyMetricXpAward => ({
  measurementId: source.id,
  metric: source.metric,
  localDate: source.localDate,
  xp: 1,
});

test("snapshot always has 14 consecutive dates across month, year, and leap-day boundaries", () => {
  const leapWindow = buildProgressionSnapshot([], [], "2024-03-05");
  assert.equal(leapWindow.days.length, 14);
  assert.equal(leapWindow.days[0].date, "2024-02-21");
  assert.equal(leapWindow.days[7].date, "2024-02-28");
  assert.equal(leapWindow.days[8].date, "2024-02-29");
  assert.equal(leapWindow.days[13].date, "2024-03-05");
  assert.deepEqual(leapWindow.days.map(({ date }) => date), [
    "2024-02-21", "2024-02-22", "2024-02-23", "2024-02-24", "2024-02-25", "2024-02-26", "2024-02-27",
    "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05",
  ]);
  const yearWindow = buildProgressionSnapshot([], [], "2025-01-05");
  assert.equal(yearWindow.days[0].date, "2024-12-23");
  assert.equal(yearWindow.days[13].date, "2025-01-05");
});

test("body weight is missing without a measurement and selects latest instant then highest same-day sequence", () => {
  const weight = [
    measurement("early", "body_weight", 69, "2024-02-22T18:00:00Z", "2024-02-22", 99),
    measurement("latest-low-sequence", "body_weight", 70, "2024-02-22T20:00:00Z", "2024-02-22", 2),
    measurement("latest-high-sequence", "body_weight", 71, "2024-02-22T20:00:00Z", "2024-02-22", 7),
  ];
  const snapshot = buildProgressionSnapshot(weight, [], "2024-03-01");
  assert.equal(snapshot.days[0].bodyWeightKg, null);
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-22")?.bodyWeightKg, 71);
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-23")?.bodyWeightKg, null);
});

test("XP before the window is included, daily values plateau, and the level changes at 10 XP", () => {
  const measurements: ProgressionMeasurement[] = [];
  const awards: BodyMetricXpAward[] = [];
  const priorDates = ["2024-01-25", "2024-01-26", "2024-01-27", "2024-01-28", "2024-01-29", "2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02"];
  for (let index = 0; index < priorDates.length; index += 1) {
    const date = priorDates[index];
    const source = measurement(`prior-${index}`, "body_weight", 70, `${date}T12:00:00Z`, date);
    measurements.push(source);
    awards.push(award(source));
  }
  const tenth = measurement("tenth", "body_weight", 70, "2024-02-04T12:00:00Z", "2024-02-04");
  measurements.push(tenth);
  awards.push(award(tenth));

  const snapshot = buildProgressionSnapshot(measurements, awards, "2024-02-17");
  assert.equal(snapshot.days[0].date, "2024-02-04");
  assert.deepEqual(snapshot.days.slice(0, 3).map(({ xp, level }) => [xp, level]), [[10, 2], [10, 2], [10, 2]]);
});

test("area totals use stable metric order and count each retained award once", () => {
  const sources = PROGRESSION_METRICS.map((metric, index) =>
    measurement(`area-${index}`, metric, [70, 20, 30][index], "2024-11-10T12:00:00Z", "2024-11-10"));
  const awards = sources.map(award);
  const snapshot = buildProgressionSnapshot(sources, awards, "2024-11-10");
  assert.deepEqual(snapshot.bodyMetrics, [
    { metric: "body_weight", xp: 1, level: 1 },
    { metric: "body_fat_percentage", xp: 1, level: 1 },
    { metric: "skeletal_muscle_mass", xp: 1, level: 1 },
  ]);
  assert.deepEqual(snapshot.avatar, { xp: 3, level: 1 });
  assert.deepEqual(snapshot.days.at(-1), { date: "2024-11-10", bodyWeightKg: 70, xp: 3, level: 1 });
  assert.deepEqual(buildProgressionSnapshot([], [], "2024-11-10").avatar, { xp: 0, level: 1 });
});

test("stored event localDate is honored instead of re-bucketing from recordedAt", () => {
  const source = measurement("event-local-day", "body_weight", 71, "2024-02-21T01:00:00Z", "2024-02-20");
  const snapshot = buildProgressionSnapshot([source], [award(source)], "2024-02-25");
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-20")?.bodyWeightKg, 71);
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-21")?.bodyWeightKg, null);
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-20")?.xp, 1);
  assert.equal(snapshot.days.find(({ date }) => date === "2024-02-21")?.xp, 1);
});

test("undo recomposition removes its historical award instead of recording a reversal", () => {
  const first = measurement("first-award", "body_weight", 70, "2024-11-10T12:00:00Z", "2024-11-10");
  const second = measurement("second-award", "body_fat_percentage", 20, "2024-11-12T12:00:00Z", "2024-11-12");
  const retainedMeasurements = [first, second];
  const retainedAwards = [award(first), award(second)];
  const beforeUndo = buildProgressionSnapshot(retainedMeasurements, retainedAwards, "2024-11-20");
  const afterUndo = buildProgressionSnapshot([second], [award(second)], "2024-11-20");

  assert.equal(beforeUndo.days.find(({ date }) => date === "2024-11-10")?.xp, 1);
  assert.equal(afterUndo.days.find(({ date }) => date === "2024-11-10")?.xp, 0);
  assert.equal(beforeUndo.days.find(({ date }) => date === "2024-11-12")?.xp, 2);
  assert.equal(afterUndo.days.find(({ date }) => date === "2024-11-12")?.xp, 1);
  assert.equal(afterUndo.avatar.xp, 1);
  assert.equal(afterUndo.days.at(-1)?.date, "2024-11-20");
  assert.equal(afterUndo.days.at(-1)?.xp, 1);
});

test("future retained awards affect all-time totals but not dates before their localDate", () => {
  const future = measurement("future", "skeletal_muscle_mass", 30, "2024-03-01T12:00:00Z", "2024-03-01");
  const snapshot = buildProgressionSnapshot([future], [award(future)], "2024-02-20");
  assert.equal(snapshot.avatar.xp, 1);
  assert.equal(snapshot.bodyMetrics[2].xp, 1);
  assert.equal(snapshot.days.at(-1)?.xp, 0);
});

test("malformed sources, impossible metrics, and duplicate or mismatched awards are rejected", () => {
  assert.throws(() => buildProgressionSnapshot([
    measurement("bad-metric", "height" as ProgressionMeasurement["metric"], 170, "2024-01-01T00:00:00Z", "2024-01-01"),
  ], [], "2024-01-01"), RangeError);
  assert.throws(() => buildProgressionSnapshot([
    measurement("bad-percent", "body_fat_percentage", 101, "2024-01-01T00:00:00Z", "2024-01-01"),
  ], [], "2024-01-01"), RangeError);

  const source = measurement("source", "body_weight", 70, "2024-01-01T00:00:00Z", "2024-01-01");
  assert.throws(() => buildProgressionSnapshot([source], [award(source), award(source)], "2024-01-01"), RangeError);
  const sameDate = measurement("same-date", "body_weight", 71, "2024-01-01T01:00:00Z", "2024-01-01");
  assert.throws(() => buildProgressionSnapshot([source, sameDate], [award(source), award(sameDate)], "2024-01-01"), RangeError);
  assert.throws(() => buildProgressionSnapshot([source], [
    { measurementId: "source", metric: "body_fat_percentage", localDate: source.localDate, xp: 1 },
  ], "2024-01-01"), RangeError);
  assert.throws(() => buildProgressionSnapshot([source], [
    { ...award(source), localDate: "2024-01-02" },
  ], "2024-01-01"), RangeError);
  assert.throws(() => buildProgressionSnapshot([], [], "2024-02-30"), RangeError);
});
