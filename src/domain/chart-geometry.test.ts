import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART,
  formatWeightPointLabel,
  formatWeightValue,
  linePath,
  seriesPoints,
  stepPath,
  weightChartGeometry,
  xpChartGeometry,
} from "./chart-geometry.ts";
import { levelForXp } from "./body-metrics.ts";
import { toCanonicalValue } from "./units.ts";

function assertFinitePoints(points: readonly ({ x: number; y: number } | null)[]): void {
  for (const point of points) {
    if (!point) continue;
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= CHART.left && point.x <= CHART.right);
    assert.ok(point.y >= CHART.top && point.y <= CHART.bottom);
  }
}

test("weight reference intervals are one display unit in Metric and Imperial", () => {
  const metric = weightChartGeometry([70, 72], "Metric");
  assert.deepEqual(metric.ticks.map(({ value }) => value), [69, 70, 71, 72, 73]);
  assert.ok(metric.ticks.slice(1).every((tick, index) => tick.value! - metric.ticks[index].value! === 1));

  const imperialKg = [150, 152].map((pounds) => toCanonicalValue(pounds, "mass", "Imperial"));
  const imperial = weightChartGeometry(imperialKg, "Imperial");
  assert.deepEqual(imperial.ticks.map(({ value }) => value), [149, 150, 151, 152, 153]);
  assert.ok(imperial.ticks.slice(1).every((tick, index) => tick.value! - imperial.ticks[index].value! === 1));

  const wide = weightChartGeometry([50, 100], "Metric");
  assert.ok(wide.ticks.slice(1).every((tick, index) => tick.value! - wide.ticks[index].value! === 1));
  assert.ok(wide.ticks.length > wide.ticks.filter((tick) => tick.showLabel).length);
  assert.equal(wide.axisMode, "one-unit");
});

test("weight point labels show one decimal in the selected display unit", () => {
  assert.equal(formatWeightPointLabel(70, "Metric"), "70.0");
  assert.equal(formatWeightPointLabel(toCanonicalValue(150.26, "mass", "Imperial"), "Imperial"), "150.3");
});

test("flat, single-point, missing, and empty weight series stay finite and preserve gaps", () => {
  const single = weightChartGeometry([70], "Metric");
  assert.equal(single.points.length, 1);
  assertFinitePoints(single.points);
  assert.equal(single.points[0]?.x, (CHART.left + CHART.right) / 2);

  const flat = weightChartGeometry([70, 70], "Metric");
  assertFinitePoints(flat.points);
  assert.equal(flat.points[0]?.y, flat.points[1]?.y);

  const gapped = weightChartGeometry([null, 70, null, 80], "Metric");
  assert.deepEqual(gapped.points.map((point) => point === null), [true, false, true, false]);
  assert.match(linePath(gapped.points), /M[^ ]+ M/);

  const empty = weightChartGeometry([null, null], "Imperial");
  assert.deepEqual(empty.points, [null, null]);
  assert.deepEqual(empty.ticks, []);
  assert.equal(empty.axisMode, "one-unit");
  assert.equal(linePath(empty.points), "");
});

test("wide weight ranges use a small scientific scale instead of dropping one-unit ticks silently", () => {
  const geometry = weightChartGeometry([0, 1_000], "Metric");
  assert.equal(geometry.axisMode, "scientific");
  assert.equal(geometry.ticks.length, 5);
  assert.ok(geometry.ticks.every(({ label, value }) => label.includes("e") && value === null));
});

test("extreme finite weights use bounded finite geometry and SVG path numbers", () => {
  const values = [Number.MAX_VALUE / 2, Number.MAX_VALUE, null];
  for (const preference of ["Metric", "Imperial"] as const) {
    const geometry = weightChartGeometry(values, preference);
    assert.equal(geometry.axisMode, "scientific");
    assert.equal(geometry.ticks.length, 5);
    assert.ok(geometry.ticks.every(({ y, label }) => Number.isFinite(y) && label.length > 0 && !/Infinity|NaN/.test(label)));
    assertFinitePoints(geometry.points);
    const path = linePath(geometry.points);
    assert.match(path, /^[ML0-9., -]+$/);
    assert.ok(path.length < 100);
    assert.ok(formatWeightValue(Number.MAX_VALUE, preference).length < 32);
  }
});

test("XP chart handles plateaus and draws levels as a bounded step path", () => {
  const geometry = xpChartGeometry([
    { xp: 0, level: 1 },
    { xp: 9, level: 1 },
    { xp: 10, level: 2 },
    { xp: 10, level: 2 },
  ]);
  assertFinitePoints(geometry.xpPoints);
  assertFinitePoints(geometry.levelPoints);
  const xp = linePath(geometry.xpPoints);
  const level = stepPath(geometry.levelPoints);
  assert.match(xp, /^[ML0-9., -]+$/);
  assert.match(level, /^[ML0-9., -]+$/);
  assert.ok(level.includes(" L"));
  assert.equal(geometry.xpTicks.length, 3);
  assert.ok(geometry.levelTicks.every((tick) => tick.y === CHART.bottom - (tick.thresholdXp / 10) * (CHART.bottom - CHART.top)));
  assert.ok(CHART.width - CHART.right >= 64);

  const flat = xpChartGeometry([{ xp: 0, level: 1 }, { xp: 0, level: 1 }]);
  assert.equal(flat.xpPoints[0].y, flat.xpPoints[1].y);
  assert.equal(stepPath(flat.levelPoints).length > 0, true);
  assert.deepEqual(xpChartGeometry([]), { xpPoints: [], levelPoints: [], xpTicks: [], levelTicks: [] });
});

test("level axis ticks lie on exact thresholds for 0, 5, 10, 13, and 29 XP", () => {
  const cases = [
    { xp: 0, levels: [1] },
    { xp: 5, levels: [1] },
    { xp: 10, levels: [1, 2] },
    { xp: 13, levels: [1, 2] },
    { xp: 29, levels: [1, 2, 3] },
  ];
  for (const { xp, levels } of cases) {
    const geometry = xpChartGeometry([{ xp, level: levelForXp(xp) }]);
    assert.deepEqual(geometry.levelTicks.map((tick) => tick.level), levels);
    for (const tick of geometry.levelTicks) {
      assert.equal(tick.thresholdXp, (tick.level - 1) * 10);
      assert.equal(tick.y, CHART.bottom - (tick.thresholdXp / Math.max(10, xp)) * (CHART.bottom - CHART.top));
    }
    const actualLevel = levelForXp(xp);
    assert.equal(geometry.levelPoints[0].y, CHART.bottom - (((actualLevel - 1) * 10) / Math.max(10, xp)) * (CHART.bottom - CHART.top));
  }
});

test("level ticks stay bounded for the largest supported safe XP", () => {
  const xp = Number.MAX_SAFE_INTEGER;
  const geometry = xpChartGeometry([{ xp, level: levelForXp(xp) }]);
  assert.ok(geometry.levelTicks.length <= 6);
  assert.ok(geometry.levelTicks.every(({ y, thresholdXp }) => Number.isFinite(y) && thresholdXp <= xp));
});

test("series mapping remains finite for extreme values and breaks on nulls", () => {
  const points = seriesPoints([Number.MAX_VALUE / 2, null, Number.MAX_VALUE]);
  assertFinitePoints(points);
  assert.deepEqual(points.map((point) => point === null), [false, true, false]);
  assert.throws(() => seriesPoints([Number.POSITIVE_INFINITY]), RangeError);
});
