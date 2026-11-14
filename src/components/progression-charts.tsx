import { useId, type ReactNode } from "react";
import {
  CHART,
  formatWeightValue,
  linePath,
  stepPath,
  weightChartGeometry,
  xpChartGeometry,
} from "../domain/chart-geometry.ts";
import { displayUnit, type UnitPreference } from "../domain/units.ts";
import type { ProgressionSnapshot } from "../domain/progression-view.ts";

type ProgressionDays = ProgressionSnapshot["days"];

function dateLabelIndexes(count: number): number[] {
  if (count <= 4) return Array.from({ length: count }, (_, index) => index);
  return [...new Set([0, Math.round((count - 1) / 3), Math.round((count - 1) * 2 / 3), count - 1])];
}

function shortDate(date: string): string {
  return date.slice(5).replace("-", "/");
}

function levelAxisLabel(level: number): string {
  const value = level < 1_000_000
    ? new Intl.NumberFormat("ko-KR").format(level)
    : new Intl.NumberFormat("ko-KR", { notation: "compact", maximumSignificantDigits: 2 }).format(level);
  return `Lv ${value}`;
}

function DateLabels({ days }: { days: ProgressionDays }) {
  return dateLabelIndexes(days.length).map((index) => {
    const day = days[index];
    if (!day) return null;
    return <text key={day.date} className="progression-chart__date-label" x={days.length <= 1 ? (CHART.left + CHART.right) / 2 : CHART.left + (index / (days.length - 1)) * (CHART.right - CHART.left)} y={CHART.dateLabelY} textAnchor="middle">{shortDate(day.date)}</text>;
  });
}

function DataTable({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="progression-chart__table-wrap">
      <table className="progression-chart__table">
        <caption>{caption}</caption>
          {children}
        </table>
    </div>
  );
}

function ChartFigure({ title, unit, children }: { title: string; unit?: string; children: ReactNode }) {
  return (
    <figure className="progression-chart">
      <figcaption className="progression-chart__heading">
        <h2 className="progression-chart__title">{title}</h2>
        {unit ? <span className="progression-chart__unit">{unit}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}

export function WeightHistoryChart({ days, unitPreference }: { days: ProgressionDays; unitPreference: UnitPreference }) {
  const id = useId();
  const titleId = `${id}-weight-title`;
  const descriptionId = `${id}-weight-description`;
  const unit = displayUnit("mass", unitPreference);
  const values = days.map(({ bodyWeightKg }) => bodyWeightKg);
  const geometry = weightChartGeometry(values, unitPreference);
  const hasMeasurements = values.some((value) => value !== null);

  return (
    <ChartFigure title="최근 14일 몸무게" unit={`몸무게 (${unit})`}>
      <svg
        className="progression-chart__svg"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        tabIndex={0}
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>최근 14일 몸무게</title>
        <desc id={descriptionId}>{hasMeasurements
          ? `세로축은 몸무게 단위 ${unit}, 가로축은 날짜입니다. 기록이 없는 날은 선을 연결하지 않습니다.${geometry.axisMode === "scientific" ? " 넓은 범위는 과학 표기법 축척입니다." : ""}`
          : "최근 14일 동안 확인된 몸무게 기록이 없습니다."}</desc>
        {hasMeasurements ? (
          <>
            {geometry.ticks.map((tick, index) => (
              <g key={`${tick.y}-${index}`}>
                <line className="progression-chart__grid" x1={CHART.left} x2={CHART.right} y1={tick.y} y2={tick.y} />
                {tick.showLabel ? <text className="progression-chart__tick-label" x={CHART.left - 8} y={tick.y + 3} textAnchor="end">{tick.label}</text> : null}
              </g>
            ))}
            <path className="progression-chart__weight-line" d={linePath(geometry.points)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {geometry.points.map((point, index) => point ? (
              <circle key={days[index]?.date ?? index} className="progression-chart__point" cx={point.x} cy={point.y} r={3} fill="currentColor" />
            ) : null)}
            <DateLabels days={days} />
          </>
        ) : null}
      </svg>
      {!hasMeasurements ? <p role="status" className="inline-status">기록이 없어요.</p> : null}
      <DataTable caption="날짜별 몸무게">
        <thead><tr><th scope="col">날짜</th><th scope="col">몸무게 ({unit})</th></tr></thead>
        <tbody>{days.map((day) => (
          <tr key={day.date}>
            <th scope="row"><time dateTime={day.date}>{day.date}</time></th>
            <td>{day.bodyWeightKg === null ? "기록 없음" : formatWeightValue(day.bodyWeightKg, unitPreference)}</td>
          </tr>
        ))}</tbody>
      </DataTable>
    </ChartFigure>
  );
}

export function XpHistoryChart({ days }: { days: ProgressionDays }) {
  const id = useId();
  const titleId = `${id}-xp-title`;
  const descriptionId = `${id}-xp-description`;
  const geometry = xpChartGeometry(days);
  const hasDays = days.length > 0;

  return (
    <ChartFigure title="최근 14일 누적 XP와 레벨">
      <ul className="progression-chart__legend" aria-label="그래프 범례">
        <li className="progression-chart__legend-item"><span className="progression-chart__legend-swatch progression-chart__legend-swatch--xp" aria-hidden="true" />누적 XP</li>
        <li className="progression-chart__legend-item"><span className="progression-chart__legend-swatch progression-chart__legend-swatch--level" aria-hidden="true" />레벨 (계단선)</li>
      </ul>
      <svg
        className="progression-chart__svg"
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        tabIndex={0}
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>최근 14일 누적 XP와 레벨</title>
        <desc id={descriptionId}>가로축은 날짜입니다. 왼쪽 세로축은 누적 XP, 오른쪽 세로축은 레벨입니다. 실선은 XP, 점선 계단선은 XP에서 계산한 레벨입니다.</desc>
        {hasDays ? (
          <>
            {geometry.xpTicks.map((tick) => (
              <g key={`xp-${tick.xp}-${tick.y}`}>
                <line className="progression-chart__grid" x1={CHART.left} x2={CHART.right} y1={tick.y} y2={tick.y} />
                <text className="progression-chart__tick-label" x={CHART.left - 8} y={tick.y + 3} textAnchor="end">{tick.xp}</text>
              </g>
            ))}
            {geometry.levelTicks.map((tick) => (
              <g key={`level-${tick.level}`}>
                <line className="progression-chart__level-tick" x1={CHART.right} x2={CHART.right + 5} y1={tick.y} y2={tick.y} />
                <text className="progression-chart__tick-label" x={CHART.width - 4} y={tick.y + 3} textAnchor="end">{levelAxisLabel(tick.level)}</text>
              </g>
            ))}
            <text className="progression-chart__axis-label" x={CHART.left} y={13}>누적 XP</text>
            <text className="progression-chart__axis-label" x={CHART.right} y={13} textAnchor="end">레벨</text>
            <path className="progression-chart__xp-line" d={linePath(geometry.xpPoints)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path className="progression-chart__level-line" d={stepPath(geometry.levelPoints)} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
            {geometry.xpPoints.map((point, index) => (
              <circle key={days[index]?.date ?? index} className="progression-chart__point" cx={point.x} cy={point.y} r={2.5} fill="currentColor" />
            ))}
            <DateLabels days={days} />
          </>
        ) : (
          <text className="progression-chart__empty" x={CHART.width / 2} y={CHART.height / 2} textAnchor="middle">표시할 진행 기록이 없습니다</text>
        )}
      </svg>
      <DataTable caption="날짜별 누적 경험치와 레벨">
        <thead><tr><th scope="col">날짜</th><th scope="col">누적 XP</th><th scope="col">레벨</th></tr></thead>
        <tbody>{days.map((day) => (
          <tr key={day.date}>
            <th scope="row"><time dateTime={day.date}>{day.date}</time></th>
            <td>{day.xp} XP</td>
            <td>레벨 {day.level}</td>
          </tr>
        ))}</tbody>
      </DataTable>
    </ChartFigure>
  );
}
