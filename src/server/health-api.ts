import {
  shouldAwardBodyMetricXp,
  type BodyMetricMeasurement,
  type NumericBodyGoal,
} from "../domain/body-metrics.ts";
import {
  buildProgressionSnapshot,
  type BodyMetricXpAward,
  type ProgressionMeasurement,
  type ProgressionSnapshot,
} from "../domain/progression-view.ts";

const METRICS = ["body_weight", "body_fat_percentage", "skeletal_muscle_mass"] as const;
type Metric = (typeof METRICS)[number];
type UnitPreference = "Metric" | "Imperial";

interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface HealthEnv {
  DB?: D1Database;
}

type HealthMeasurement = {
  id: string;
  metric: Metric;
  value: number;
  recordedAt: string;
  timezone: string;
  localDate: string;
  canUndo: boolean;
  xpAwarded: boolean;
};

type HealthGoal = {
  id: string;
  metric: Metric;
  targetValue: number;
  targetDate: string;
  active: boolean;
  activatedAt: string;
};

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_PROFILE = { unitPreference: "Metric" as const, timezone: "UTC" };
const MAX_WRITE_ATTEMPTS = 6;
const WRITE_GUARD = `EXISTS (
  SELECT 1 FROM health_progression_revision
  WHERE id = 1 AND revision = ? AND write_token = ?
)`;

async function progressionRevision(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT revision FROM health_progression_revision WHERE id = 1")
    .first<{ revision: number }>();
  if (!row || !Number.isSafeInteger(Number(row.revision))) throw new Error("Progression revision is unavailable");
  return Number(row.revision);
}

async function compareAndSwapBatch(
  db: D1Database,
  expectedRevision: number,
  dependents: (revision: number, token: string) => D1PreparedStatement[],
): Promise<boolean> {
  const token = crypto.randomUUID();
  const nextRevision = expectedRevision + 1;
  const results = await db.batch([
    db.prepare(`
      UPDATE health_progression_revision
      SET revision = revision + 1, write_token = ?
      WHERE id = 1 AND revision = ?
    `).bind(token, expectedRevision),
    ...dependents(nextRevision, token),
  ]);
  return Number(results[0]?.meta?.changes ?? 0) === 1;
}

function guardedStatement(
  db: D1Database,
  sql: string,
  values: unknown[],
  revision: number,
  token: string,
): D1PreparedStatement {
  return db.prepare(sql).bind(...values, revision, token);
}

function measurementAwarded(row: Record<string, unknown>): boolean {
  return Number(row.xp_awarded) === 1;
}

function bodyMetricMeasurement(row: Record<string, unknown>): BodyMetricMeasurement {
  return {
    id: String(row.id),
    metric: String(row.metric),
    value: Number(row.value),
    recordedAt: String(row.recorded_at),
    timeZone: String(row.timezone),
    xpAwarded: measurementAwarded(row),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetric(value: unknown): value is Metric {
  return typeof value === "string" && (METRICS as readonly string[]).includes(value);
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function localDateFor(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${String(values.year).padStart(4, "0")}-${values.month}-${values.day}`;
}

function validTarget(metric: Metric, value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (metric === "body_fat_percentage") return value >= 0 && value <= 100;
  return value > 0;
}

async function readJson(request: Request): Promise<{ value?: unknown; response?: Response }> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { response: error(415, "Content-Type must be application/json.") };
  }

  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) {
      return { response: error(400, "Invalid Content-Length.") };
    }
    if (length > MAX_BODY_BYTES) return { response: error(413, "Request body is too large.") };
  }

  if (!request.body) return { response: error(400, "A JSON request body is required.") };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel();
        return { response: error(413, "Request body is too large.") };
      }
      chunks.push(value);
    }
  } catch {
    return { response: error(400, "Could not read request body.") };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { response: error(400, "Request body must be valid JSON.") };
  }
}

function rejectsCrossOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

function measurementFromRow(row: Record<string, unknown>): HealthMeasurement {
  return {
    id: String(row.id),
    metric: row.metric as Metric,
    value: Number(row.value),
    recordedAt: String(row.recorded_at),
    timezone: String(row.timezone),
    localDate: String(row.local_date),
    canUndo: Number(row.can_undo) === 1,
    xpAwarded: measurementAwarded(row),
  };
}

function goalFromRow(row: Record<string, unknown>): HealthGoal {
  return {
    id: String(row.id),
    metric: row.metric as Metric,
    targetValue: Number(row.target_value),
    targetDate: String(row.target_date),
    active: Number(row.active) === 1,
    activatedAt: String(row.activated_at),
  };
}

async function profile(request: Request, db: D1Database): Promise<Response> {
  if (request.method === "GET") {
    const row = await db.prepare(
      "SELECT unit_preference, timezone FROM health_profile WHERE id = 1",
    ).first<{ unit_preference: string; timezone: string }>();
    return json(row
      ? { unitPreference: row.unit_preference, timezone: row.timezone, initialized: true }
      : { ...DEFAULT_PROFILE, initialized: false });
  }
  if (request.method !== "PUT") return error(405, "Method not allowed.");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.value;
  if (!isRecord(body) || (body.unitPreference !== "Metric" && body.unitPreference !== "Imperial") || !validTimezone(body.timezone)) {
    return error(400, "unitPreference and a valid IANA timezone are required.");
  }

  await db.prepare(`
    INSERT INTO health_profile (id, unit_preference, timezone) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET unit_preference = excluded.unit_preference, timezone = excluded.timezone
  `).bind(body.unitPreference, body.timezone).run();
  return json({ unitPreference: body.unitPreference, timezone: body.timezone, initialized: true });
}

async function measurements(request: Request, db: D1Database, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const metric = url.searchParams.get("metric");
    if (!isMetric(metric)) return error(400, "A supported metric query parameter is required.");
    const result = await db.prepare(`
      SELECT m.id, m.metric, m.value, m.recorded_at, m.timezone, m.local_date, m.can_undo,
        CASE WHEN a.measurement_id IS NULL THEN 0 ELSE 1 END AS xp_awarded
      FROM health_measurements m
      LEFT JOIN body_metric_xp_awards a ON a.measurement_id = m.id
      WHERE m.metric = ? ORDER BY m.recorded_at DESC, m.sequence DESC
    `).bind(metric).all<Record<string, unknown>>();
    return json({ measurements: (result.results ?? []).map(measurementFromRow) });
  }
  if (request.method !== "POST") return error(405, "Method not allowed.");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.value;
  if (!isRecord(body) || !isMetric(body.metric) || !validTarget(body.metric, body.value) ||
      !validUtcInstant(body.recordedAt) || !validTimezone(body.timezone)) {
    return error(400, "metric, a valid value, UTC recordedAt, and IANA timezone are required.");
  }

  const measurement: HealthMeasurement = {
    id: crypto.randomUUID(),
    metric: body.metric,
    value: body.value,
    recordedAt: new Date(body.recordedAt).toISOString(),
    timezone: body.timezone,
    localDate: localDateFor(body.recordedAt, body.timezone),
    canUndo: true,
    xpAwarded: false,
  };
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const [goalRow, historyResult] = await Promise.all([
      db.prepare(`
        SELECT metric, target_value, activated_at FROM health_goals
        WHERE metric = ? AND active = 1
      `).bind(measurement.metric).first<Record<string, unknown>>(),
      db.prepare(`
        SELECT m.id, m.metric, m.value, m.recorded_at, m.timezone, m.local_date, m.sequence,
          CASE WHEN a.measurement_id IS NULL THEN 0 ELSE 1 END AS xp_awarded
        FROM health_measurements m
        LEFT JOIN body_metric_xp_awards a ON a.measurement_id = m.id
        WHERE m.metric = ? ORDER BY m.recorded_at ASC, m.sequence ASC
      `).bind(measurement.metric).all<Record<string, unknown>>(),
    ]);
    const previous = (historyResult.results ?? []).map(bodyMetricMeasurement);
    const activeGoal: NumericBodyGoal | null = goalRow ? {
      metric: String(goalRow.metric),
      targetValue: goalRow.target_value === null ? null : Number(goalRow.target_value),
      comparisonResetAt: String(goalRow.activated_at),
    } : null;
    const domainMeasurement: BodyMetricMeasurement = {
      id: measurement.id,
      metric: measurement.metric,
      value: measurement.value,
      recordedAt: measurement.recordedAt,
      timeZone: measurement.timezone,
      xpAwarded: false,
    };
    const xpAwarded = shouldAwardBodyMetricXp(domainMeasurement, previous, activeGoal);
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => {
      const statements = [
        guardedStatement(db, `
          UPDATE health_measurements SET can_undo = 0
          WHERE metric = ? AND can_undo = 1 AND ${WRITE_GUARD}
        `, [measurement.metric], nextRevision, token),
        guardedStatement(db, `
          INSERT INTO health_measurements (id, metric, value, recorded_at, timezone, local_date, can_undo)
          SELECT ?, ?, ?, ?, ?, ?, 1 WHERE ${WRITE_GUARD}
        `, [measurement.id, measurement.metric, measurement.value, measurement.recordedAt,
          measurement.timezone, measurement.localDate], nextRevision, token),
      ];
      if (xpAwarded) {
        statements.push(guardedStatement(db, `
          INSERT INTO body_metric_xp_awards (measurement_id, metric, local_date, xp)
          SELECT ?, ?, ?, 1 WHERE ${WRITE_GUARD}
        `, [measurement.id, measurement.metric, measurement.localDate], nextRevision, token));
      }
      return statements;
    });
    if (committed) return json({ measurement: { ...measurement, xpAwarded } }, 201);
  }
  return error(409, "Health data changed repeatedly; retry the measurement.");
}

async function undoMeasurement(request: Request, db: D1Database, id: string): Promise<Response> {
  if (request.method !== "POST") return error(405, "Method not allowed.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if (!isRecord(parsed.value) || Object.keys(parsed.value).length !== 0) {
    return error(400, "Undo requires an empty JSON object.");
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const row = await db.prepare("SELECT metric, can_undo FROM health_measurements WHERE id = ?")
      .bind(id).first<{ metric: string; can_undo: number }>();
    if (!row) return error(404, "Measurement not found.");
    if (Number(row.can_undo) !== 1) return error(409, "This measurement is no longer undoable.");

    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        DELETE FROM body_metric_xp_awards WHERE measurement_id = ? AND ${WRITE_GUARD}
      `, [id], nextRevision, token),
      guardedStatement(db, `
        DELETE FROM health_measurements WHERE id = ? AND can_undo = 1 AND ${WRITE_GUARD}
      `, [id], nextRevision, token),
    ]);
    if (committed) return json({ ok: true });
  }
  return error(409, "Health data changed repeatedly; retry the undo.");
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function goals(request: Request, db: D1Database): Promise<Response> {
  if (request.method === "GET") {
    const result = await db.prepare(`
      SELECT id, metric, target_value, target_date, active, activated_at
      FROM health_goals ORDER BY active DESC, activated_at DESC, sequence DESC
    `).all<Record<string, unknown>>();
    return json({ goals: (result.results ?? []).map(goalFromRow) });
  }
  if (request.method !== "POST") return error(405, "Method not allowed.");

  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.value;
  if (!isRecord(body) || !isMetric(body.metric) || !validTarget(body.metric, body.targetValue) || !validDate(body.targetDate)) {
    return error(400, "metric, a valid targetValue, and a YYYY-MM-DD targetDate are required.");
  }

  const goalId = crypto.randomUUID();
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const goal: HealthGoal = {
      id: goalId,
      metric: body.metric,
      targetValue: body.targetValue,
      targetDate: body.targetDate,
      active: true,
      activatedAt: new Date().toISOString(),
    };
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        UPDATE health_goals SET active = 0
        WHERE metric = ? AND active = 1 AND ${WRITE_GUARD}
      `, [goal.metric], nextRevision, token),
      guardedStatement(db, `
        INSERT INTO health_goals (id, metric, target_value, target_date, active, activated_at)
        SELECT ?, ?, ?, ?, 1, ? WHERE ${WRITE_GUARD}
      `, [goal.id, goal.metric, goal.targetValue, goal.targetDate, goal.activatedAt], nextRevision, token),
    ]);
    if (committed) return json({ goal }, 201);
  }
  return error(409, "Health data changed repeatedly; retry the goal update.");
}

async function progression(request: Request, db: D1Database, url: URL): Promise<Response> {
  if (request.method !== "GET") return error(405, "Method not allowed.");
  const keys = [...url.searchParams.keys()];
  const endDates = url.searchParams.getAll("endDate");
  if (keys.some((key) => key !== "endDate") || endDates.length > 1) {
    return error(400, "Only one endDate query parameter is supported.");
  }
  const requestedEndDate = endDates[0];
  if (requestedEndDate !== undefined && !validDate(requestedEndDate)) {
    return error(400, "endDate must be a real YYYY-MM-DD date.");
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    let endDate = requestedEndDate;
    if (endDate === undefined) {
      const profileRow = await db.prepare("SELECT timezone FROM health_profile WHERE id = 1")
        .first<{ timezone: string }>();
      endDate = localDateFor(new Date().toISOString(), profileRow?.timezone ?? DEFAULT_PROFILE.timezone);
    }
    const [measurementResult, awardResult] = await Promise.all([
      db.prepare(`
        SELECT id, metric, value, recorded_at, local_date, sequence
        FROM health_measurements ORDER BY recorded_at ASC, sequence ASC
      `).all<Record<string, unknown>>(),
      db.prepare(`
        SELECT measurement_id, metric, local_date, xp FROM body_metric_xp_awards
        ORDER BY local_date ASC, measurement_id ASC
      `).all<Record<string, unknown>>(),
    ]);
    if (await progressionRevision(db) !== revision) continue;

    const measurements: ProgressionMeasurement[] = (measurementResult.results ?? []).map((row) => ({
      id: String(row.id),
      metric: String(row.metric) as Metric,
      value: Number(row.value),
      recordedAt: String(row.recorded_at),
      localDate: String(row.local_date),
      sequence: Number(row.sequence),
    }));
    const awards: BodyMetricXpAward[] = (awardResult.results ?? []).map((row) => ({
      measurementId: String(row.measurement_id),
      metric: String(row.metric) as Metric,
      localDate: String(row.local_date),
      xp: Number(row.xp) as 1,
    }));
    const snapshot: ProgressionSnapshot = buildProgressionSnapshot(measurements, awards, endDate);
    return json(snapshot);
  }
  return error(409, "Health data changed repeatedly; retry the progression request.");
}

export async function handleHealthRequest(request: Request, env: HealthEnv): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path !== "/api/health" && !path.startsWith("/api/health/")) return undefined;

  try {
    if (request.method !== "GET" && request.method !== "HEAD" && rejectsCrossOriginMutation(request)) {
      return error(403, "Cross-origin mutations are not allowed.");
    }

    let route: "profile" | "measurements" | "goals" | "undo" | "progression" | "missing" = "missing";
    let undoId = "";
    if (path === "/api/health/profile") route = "profile";
    else if (path === "/api/health/measurements") route = "measurements";
    else if (path === "/api/health/goals") route = "goals";
    else if (path === "/api/health/progression") route = "progression";
    else {
      const match = path.match(/^\/api\/health\/measurements\/([^/]+)\/undo$/);
      if (match) {
        try {
          undoId = decodeURIComponent(match[1]);
          route = "undo";
        } catch {
          return error(400, "Invalid measurement ID.");
        }
      }
    }
    if (route === "missing") return error(404, "Health endpoint not found.");
    const methodAllowed = route === "profile"
      ? request.method === "GET" || request.method === "PUT"
      : route === "measurements"
        ? request.method === "GET" || request.method === "POST"
        : route === "goals"
          ? request.method === "GET" || request.method === "POST"
          : route === "undo"
            ? request.method === "POST"
            : request.method === "GET";
    if (!methodAllowed) return error(405, "Method not allowed.");

    if (!env?.DB) return error(503, "Health data storage is unavailable.");
    switch (route) {
      case "profile": return await profile(request, env.DB);
      case "measurements": return await measurements(request, env.DB, url);
      case "goals": return await goals(request, env.DB);
      case "undo": return await undoMeasurement(request, env.DB, undoId);
      case "progression": return await progression(request, env.DB, url);
    }
  } catch {
    return error(500, "Health request failed.");
  }
}
