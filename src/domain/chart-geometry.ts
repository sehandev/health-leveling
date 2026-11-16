import { levelForXp } from "./body-metrics.ts";
import { toDisplayValue, type UnitPreference } from "./units.ts";

export const CHART = {
  width: 400,
  height: 204,
  left: 56,
  right: 320,
  top: 24,
  bottom: 150,
  dateLabelY: 178,
} as const;

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartTick {
  y: number;
  label: string;
  /** Display-unit tick value for ordinary axes; null for scientific-scale fallback labels. */
  value: number | null;
  showLabel: boolean;
}

export interface WeightChartGeometry {
  points: (ChartPoint | null)[];
  ticks: ChartTick[];
  axisMode: "one-unit" | "scientific";
}

export interface XpChartGeometry {
  xpPoints: ChartPoint[];
  levelPoints: ChartPoint[];
  xpTicks: { y: number; xp: number }[];
  levelTicks: { y: number; level: number; thresholdXp: number }[];
}

function assertWeightValues(valuesKg: readonly (number | null)[]): number[] {
  const present: number[] = [];
  for (const value of valuesKg) {
    if (value === null) continue;
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Chart weights must be finite and non-negative");
    present.push(value);
  }
  return present;
}

function xAt(index: number, count: number): number {
  if (count <= 1) return (CHART.left + CHART.right) / 2;
  return CHART.left + (index / (count - 1)) * (CHART.right - CHART.left);
}

function yFor(value: number, minimum: number, maximum: number): number {
  const fraction = maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum);
  return CHART.bottom - fraction * (CHART.bottom - CHART.top);
}

/** Maps finite non-negative series to bounded SVG coordinates; nulls remain gaps. */
export function seriesPoints(values: readonly (number | null)[]): (ChartPoint | null)[] {
  const present = values.filter((value): value is number => value !== null);
  for (const value of present) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError("Chart series values must be finite and non-negative");
  }
  if (present.length === 0) return values.map(() => null);
  const minimum = Math.min(...present);
  const maximum = Math.max(...present);
  return values.map((value, index) => value === null
    ? null
    : { x: xAt(index, values.length), y: yFor(value, minimum, maximum) });
}

function formatAxisValue(value: number): string {
  if (Math.abs(value) >= 1e12) return value.toExponential(2);
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
}

function formatOverflowingWeight(kg: number, preference: UnitPreference): string {
  const [mantissaText, exponentText] = kg.toExponential(2).split("e");
  let mantissa = Number(mantissaText) * (preference === "Imperial" ? 1 / 0.45359237 : 1);
  let exponent = Number(exponentText);
  while (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  while (mantissa < 1) {
    mantissa *= 10;
    exponent -= 1;
  }
  return `${mantissa.toPrecision(3)}e${exponent}`;
}

export function formatWeightValue(kg: number, preference: UnitPreference): string {
  if (!Number.isFinite(kg) || kg < 0) throw new RangeError("Chart weights must be finite and non-negative");
  const displayed = toDisplayValue(kg, "mass", preference);
  return Number.isFinite(displayed) ? String(displayed) : formatOverflowingWeight(kg, preference);
}

export function formatWeightPointLabel(kg: number, preference: UnitPreference): string {
  if (!Number.isFinite(kg) || kg < 0) throw new RangeError("Chart weights must be finite and non-negative");
  const displayed = toDisplayValue(kg, "mass", preference);
  if (!Number.isFinite(displayed) || Math.abs(displayed) >= 1e12) return scientificWeightLabel(kg, preference);
  return new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(displayed);
}

function scientificWeightLabel(kg: number, preference: UnitPreference): string {
  const displayed = toDisplayValue(kg, "mass", preference);
  return Number.isFinite(displayed) ? displayed.toExponential(2) : formatOverflowingWeight(kg, preference);
}

// shortcut: unrepresentable one-unit ticks or more than 61 references use five scientific ticks; upgrade to a zoomable axis if such ranges become normal.
function scientificWeightTicks(present: readonly number[], preference: UnitPreference): ChartTick[] {
  const minimum = Math.min(...present);
  const maximum = Math.max(...present);
  return Array.from({ length: 5 }, (_, index) => {
    const fraction = 1 - index / 4;
    const value = minimum * (1 - fraction) + maximum * fraction;
    return {
      y: CHART.top + (index / 4) * (CHART.bottom - CHART.top),
      label: scientificWeightLabel(value, preference),
      value: null,
      showLabel: true,
    };
  });
}

/** Uses five display-unit intervals while representable, with a bounded scientific-scale fallback for extremes. */
export function weightChartGeometry(
  valuesKg: readonly (number | null)[],
  preference: UnitPreference,
): WeightChartGeometry {
  const present = assertWeightValues(valuesKg);
  if (present.length === 0) return { points: valuesKg.map(() => null), ticks: [], axisMode: "one-unit" };

  const displayed = valuesKg.map((value) => value === null ? null : toDisplayValue(value, "mass", preference));
  const displayValues = displayed.filter((value): value is number => value !== null);
  const displayMin = Math.min(...displayValues);
  const displayMax = Math.max(...displayValues);
  const representableStep = 4 * Number.EPSILON * Math.max(1, Math.abs(displayMin), Math.abs(displayMax)) < 1;
  const canUseOneUnitScale = displayValues.every(Number.isFinite) && representableStep;

  if (!canUseOneUnitScale) {
    return { points: seriesPoints(valuesKg), ticks: scientificWeightTicks(present, preference), axisMode: "scientific" };
  }

  const step = 1;
  let axisMin = Math.floor(displayMin / step) * step;
  let axisMax = Math.ceil(displayMax / step) * step;
  if (axisMin === displayMin) axisMin -= step;
  if (axisMax === displayMax) axisMax += step;
  if (axisMin < 0 && displayMin >= 0) axisMin = 0;
  if (!(axisMax > axisMin) || !Number.isFinite(axisMin) || !Number.isFinite(axisMax)) {
    return { points: seriesPoints(valuesKg), ticks: scientificWeightTicks(present, preference), axisMode: "scientific" };
  }

  const tickCount = Math.round((axisMax - axisMin) / step) + 1;
  if (tickCount < 2 || tickCount > 61) {
    return { points: seriesPoints(valuesKg), ticks: scientificWeightTicks(present, preference), axisMode: "scientific" };
  }
  const labelStride = Math.max(1, Math.ceil((tickCount - 1) / 6));
  const points = displayed.map((value, index) => value === null
    ? null
    : { x: xAt(index, displayed.length), y: yFor(value, axisMin, axisMax) });
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = axisMin + index * step;
    return {
      y: yFor(value, axisMin, axisMax),
      label: formatAxisValue(value),
      value,
      showLabel: index === 0 || index === tickCount - 1 || index % labelStride === 0,
    };
  });
  return { points, ticks, axisMode: "one-unit" };
}

/** XP and level share the same XP-equivalent scale; each step is located at its 10-XP threshold. */
export function xpChartGeometry(days: readonly { xp: number; level: number }[]): XpChartGeometry {
  for (const day of days) {
    if (!Number.isSafeInteger(day.xp) || day.xp < 0 || !Number.isSafeInteger(day.level) || day.level !== levelForXp(day.xp)) {
      throw new RangeError("XP chart levels must match non-negative cumulative XP");
    }
  }
  if (days.length === 0) return { xpPoints: [], levelPoints: [], xpTicks: [], levelTicks: [] };

  const observedMaxXp = Math.max(...days.map(({ xp }) => xp));
  const maximumXp = Math.max(10, observedMaxXp);
  const levelThresholds = days.map(({ xp }) => xp - (xp % 10));
  const xpPoints = days.map(({ xp }, index) => ({ x: xAt(index, days.length), y: yFor(xp, 0, maximumXp) }));
  const levelPoints = levelThresholds.map((threshold, index) => ({
    x: xAt(index, days.length),
    y: yFor(threshold, 0, maximumXp),
  }));
  const xpTicks = [0, 0.5, 1].map((fraction) => {
    const xp = Math.round(maximumXp * fraction);
    return { y: yFor(xp, 0, maximumXp), xp };
  });
  const maxLevel = levelForXp(observedMaxXp);
  const maxLevelTicks = 6;
  const levelStride = Math.max(1, Math.ceil((maxLevel - 1) / (maxLevelTicks - 1)));
  const levels = [1];
  for (let level = 1 + levelStride; level < maxLevel; level += levelStride) levels.push(level);
  if (maxLevel > 1) levels.push(maxLevel);
  const levelTicks = levels.map((level) => {
    const thresholdXp = (level - 1) * 10;
    return { level, thresholdXp, y: yFor(thresholdXp, 0, maximumXp) };
  });
  return { xpPoints, levelPoints, xpTicks, levelTicks };
}

function coordinate(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("SVG coordinates must be finite");
  return value.toFixed(2);
}

export function linePath(points: readonly (ChartPoint | null)[]): string {
  let active = false;
  const commands: string[] = [];
  for (const point of points) {
    if (point === null) {
      active = false;
      continue;
    }
    const command = active ? "L" : "M";
    commands.push(`${command}${coordinate(point.x)},${coordinate(point.y)}`);
    active = true;
  }
  return commands.join(" ");
}

export function stepPath(points: readonly (ChartPoint | null)[]): string {
  let previous: ChartPoint | null = null;
  const commands: string[] = [];
  for (const point of points) {
    if (point === null) {
      previous = null;
      continue;
    }
    if (previous === null) {
      commands.push(`M${coordinate(point.x)},${coordinate(point.y)}`);
    } else {
      commands.push(`L${coordinate(point.x)},${coordinate(previous.y)} L${coordinate(point.x)},${coordinate(point.y)}`);
    }
    previous = point;
  }
  return commands.join(" ");
}
