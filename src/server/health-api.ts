import {
  shouldAwardBodyMetricXp,
  type BodyMetricMeasurement,
  type NumericBodyGoal,
} from "../domain/body-metrics.ts";
import {
  buildProgressionSnapshot,
  type BodyMetricXpAward,
  type MuscleXpEvent,
  type ProgressionMeasurement,
  type ProgressionSnapshot,
} from "../domain/progression-view.ts";
import {
  parseStrengthWorkoutDraft,
  type CustomWorkoutUsage,
  type StrengthWorkoutDraft,
  type StrengthWorkoutRecord,
  type WorkoutMuscleSelection,
  type WorkoutPickerState,
} from "../domain/workout-records.ts";
import {
  muscleAwardsForWorkout,
  reconcileMuscleAwards,
  type MuscleXpAward,
  type StrengthMode,
} from "../domain/workouts.ts";

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

type WorkoutRow = Record<string, unknown>;

const MAX_BODY_BYTES = 16 * 1024;
const MAX_WORKOUT_BODY_BYTES = 64 * 1024;
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

async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ value?: unknown; response?: Response }> {
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
    if (length > maxBytes) return { response: error(413, "Request body is too large.") };
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
      if (size > maxBytes) {
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

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        UPDATE health_profile SET unit_preference = ?, timezone = ? WHERE id = 1 AND ${WRITE_GUARD}
      `, [body.unitPreference, body.timezone], nextRevision, token),
      guardedStatement(db, `
        INSERT OR IGNORE INTO health_profile (id, unit_preference, timezone)
        SELECT 1, ?, ? WHERE ${WRITE_GUARD}
      `, [body.unitPreference, body.timezone], nextRevision, token),
    ]);
    if (committed) return json({ unitPreference: body.unitPreference, timezone: body.timezone, initialized: true });
  }
  return error(409, "Health data changed repeatedly; retry the profile update.");
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

const STRENGTH_MODES: readonly StrengthMode[] = ["Machine", "Free Weight", "Bodyweight"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isStrengthMode(value: unknown): value is StrengthMode {
  return typeof value === "string" && STRENGTH_MODES.includes(value as StrengthMode);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function workoutFromRow(row: WorkoutRow): StrengthWorkoutRecord {
  const draft = parseStrengthWorkoutDraft(JSON.parse(String(row.draft_json)));
  return {
    ...draft,
    id: String(row.id),
    version: Number(row.version),
    localDate: String(row.local_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parseWorkoutDraft(value: unknown): { draft?: StrengthWorkoutDraft; response?: Response } {
  try {
    const draft = parseStrengthWorkoutDraft(value);
    if (!validUtcInstant(draft.recordedAt)) return { response: error(400, "Workout recordedAt must be a UTC ISO instant.") };
    return { draft: { ...draft, recordedAt: new Date(draft.recordedAt).toISOString() } };
  } catch {
    return { response: error(400, "Invalid Strength Training workout.") };
  }
}

function isFutureWorkoutDraft(draft: StrengthWorkoutDraft): boolean {
  return Date.parse(draft.recordedAt) > Date.now();
}

async function workoutDraftFingerprint(draft: StrengthWorkoutDraft): Promise<string> {
  const canonicalDraft = JSON.stringify(draft);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalDraft));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function desiredMuscleAwards(draft: StrengthWorkoutDraft): MuscleXpAward[] {
  return muscleAwardsForWorkout(draft.items.map((item) => ({
    itemId: item.id,
    mode: item.mode,
    targetMuscles: item.targetMuscles,
    sets: item.sets.map((set) => ({ reps: set.reps ?? undefined })),
  })), true);
}

function storedMuscleAward(row: WorkoutRow): MuscleXpAward {
  const itemId = String(row.item_id);
  const group = String(row.group_name) as MuscleXpAward["group"];
  return { id: `${encodeURIComponent(itemId)}:${group}`, itemId, group, xp: 1 };
}

async function currentWorkoutAwards(db: D1Database, workoutId: string): Promise<MuscleXpAward[]> {
  const result = await db.prepare(`
    SELECT item_id, group_name FROM strength_workout_muscle_awards WHERE workout_id = ?
    ORDER BY item_id, group_name
  `).bind(workoutId).all<WorkoutRow>();
  return (result.results ?? []).map(storedMuscleAward);
}

function eventFromRow(row: WorkoutRow): MuscleXpEvent {
  return {
    id: String(row.id),
    workoutId: String(row.workout_id),
    itemId: String(row.item_id),
    group: String(row.group_name) as MuscleXpEvent["group"],
    delta: Number(row.delta) as 1 | -1,
    localDate: String(row.local_date),
    occurredAt: String(row.occurred_at),
    sequence: Number(row.sequence),
  };
}

async function readMuscleEvents(db: D1Database): Promise<MuscleXpEvent[]> {
  const result = await db.prepare(`
    SELECT id, workout_id, item_id, group_name, delta, local_date, occurred_at, sequence
    FROM muscle_xp_events ORDER BY local_date, sequence
  `).all<WorkoutRow>();
  return (result.results ?? []).map(eventFromRow);
}

function awardPairKey(workoutId: string, itemId: string, group: string): string {
  return JSON.stringify([workoutId, itemId, group]);
}

function assertCurrentAwardsMatchEvents(events: readonly MuscleXpEvent[], awards: readonly WorkoutRow[]): void {
  const balances = new Map<string, number>();
  for (const event of events) {
    const key = awardPairKey(event.workoutId, event.itemId, event.group);
    balances.set(key, (balances.get(key) ?? 0) + event.delta);
  }
  const current = new Set(awards.map((award) => awardPairKey(
    String(award.workout_id), String(award.item_id), String(award.group_name),
  )));
  for (const [key, balance] of balances) {
    if (balance !== (current.has(key) ? 1 : 0)) throw new Error("Muscle award ledger is inconsistent");
  }
  for (const key of current) {
    if (balances.get(key) !== 1) throw new Error("Muscle award is missing its event history");
  }
}

function muscleEventsRemainReadable(events: readonly MuscleXpEvent[]): boolean {
  try {
    buildProgressionSnapshot([], [], new Date().toISOString().slice(0, 10), events);
    return true;
  } catch {
    return false;
  }
}

function activeAwardLocalDates(events: readonly MuscleXpEvent[]): Map<string, string> {
  const activeDates = new Map<string, string>();
  const ordered = [...events].sort((left, right) => {
    const timeDifference = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (timeDifference !== 0) return timeDifference;
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.id === right.id ? 0 : left.id > right.id ? 1 : -1;
  });
  for (const event of ordered) {
    const key = awardPairKey(event.workoutId, event.itemId, event.group);
    if (event.delta === 1) activeDates.set(key, event.localDate);
    else activeDates.delete(key);
  }
  return activeDates;
}

function hasGrantDateForCancelledAwards(
  workoutId: string,
  changes: ReturnType<typeof reconcileMuscleAwards>,
  activeDates: ReadonlyMap<string, string>,
): boolean {
  return changes.cancelled.every((award) => activeDates.has(awardPairKey(workoutId, award.itemId, award.group)));
}

function eventsForAwardChanges(
  workoutId: string,
  changes: ReturnType<typeof reconcileMuscleAwards>,
  localDate: string,
  occurredAt: string,
  firstSequence = 1,
  activeDates: ReadonlyMap<string, string> = new Map(),
): MuscleXpEvent[] {
  return [
    ...changes.added.map((award) => ({ ...award, delta: 1 as const })),
    ...changes.cancelled.map((award) => ({ ...award, delta: -1 as const })),
  ].map((award, index) => ({
    id: crypto.randomUUID(),
    workoutId,
    itemId: award.itemId,
    group: award.group,
    delta: award.delta,
    localDate: award.delta === 1 ? localDate : activeDates.get(awardPairKey(workoutId, award.itemId, award.group))!,
    occurredAt,
    sequence: firstSequence + index,
  }));
}

function awardChangeStatements(
  db: D1Database,
  workoutId: string,
  changes: ReturnType<typeof reconcileMuscleAwards>,
  events: readonly MuscleXpEvent[],
  revision: number,
  token: string,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  if (changes.cancelled.length > 0) {
    statements.push(guardedStatement(db, `
      DELETE FROM strength_workout_muscle_awards
      WHERE workout_id = ? AND EXISTS (
        SELECT 1 FROM json_each(?) AS pair
        WHERE json_extract(pair.value, '$.itemId') = item_id
          AND json_extract(pair.value, '$.group') = group_name
      ) AND ${WRITE_GUARD}
    `, [workoutId, JSON.stringify(changes.cancelled)], revision, token));
  }
  if (changes.added.length > 0) {
    statements.push(guardedStatement(db, `
      INSERT INTO strength_workout_muscle_awards (workout_id, item_id, group_name, xp)
      SELECT ?, json_extract(pair.value, '$.itemId'), json_extract(pair.value, '$.group'), 1
      FROM json_each(?) AS pair WHERE ${WRITE_GUARD}
    `, [workoutId, JSON.stringify(changes.added)], revision, token));
  }
  if (events.length > 0) {
    statements.push(guardedStatement(db, `
      INSERT INTO muscle_xp_events (id, workout_id, item_id, group_name, delta, local_date, occurred_at)
      SELECT json_extract(event.value, '$.id'), json_extract(event.value, '$.workoutId'),
        json_extract(event.value, '$.itemId'), json_extract(event.value, '$.group'),
        json_extract(event.value, '$.delta'), json_extract(event.value, '$.localDate'),
        json_extract(event.value, '$.occurredAt')
      FROM json_each(?) AS event WHERE ${WRITE_GUARD}
    `, [JSON.stringify(events)], revision, token));
  }
  return statements;
}

async function workouts(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "GET") return error(405, "Method not allowed.");
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const result = await db.prepare(`
      SELECT id, version, draft_json, local_date, created_at, updated_at
      FROM strength_workouts ORDER BY recorded_at DESC, sequence DESC
    `).all<WorkoutRow>();
    if (await progressionRevision(db) !== revision) continue;
    return json({ workouts: (result.results ?? []).map(workoutFromRow) });
  }
  return error(409, "Health data changed repeatedly; retry the workout list request.");
}

async function workoutById(request: Request, db: D1Database, id: string): Promise<Response> {
  if (request.method === "GET") {
    const row = await db.prepare(`
      SELECT id, version, draft_json, local_date, created_at, updated_at
      FROM strength_workouts WHERE id = ?
    `).bind(id).first<WorkoutRow>();
    return row ? json({ workout: workoutFromRow(row) }) : error(404, "Workout not found.");
  }
  if (request.method !== "PUT" && request.method !== "DELETE") return error(405, "Method not allowed.");

  const parsed = await readJson(request, MAX_WORKOUT_BODY_BYTES);
  if (parsed.response) return parsed.response;
  if (!isRecord(parsed.value)) return error(400, "A workout request object is required.");
  const body = parsed.value;
  const expectedVersion = body.expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1) {
    return error(400, "A positive expectedVersion is required.");
  }

  if (request.method === "DELETE") {
    if (!exactKeys(body, ["expectedVersion"])) return error(400, "Delete requires only expectedVersion.");
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      const revision = await progressionRevision(db);
      const row = await db.prepare(`
        SELECT id, version, draft_json, local_date, created_at, updated_at
        FROM strength_workouts WHERE id = ?
      `).bind(id).first<WorkoutRow>();
      if (!row) return error(404, "Workout not found.");
      const workout = workoutFromRow(row);
      if (workout.version !== expectedVersion) return error(409, "Workout version is stale; reload before deleting.");

      const saved = await currentWorkoutAwards(db, id);
      const changes = reconcileMuscleAwards(saved, []);
      const profileRow = await db.prepare("SELECT timezone FROM health_profile WHERE id = 1")
        .first<{ timezone: string }>();
      const occurredAt = new Date().toISOString();
      const localDate = localDateFor(occurredAt, profileRow?.timezone ?? DEFAULT_PROFILE.timezone);
      const oldEvents = await readMuscleEvents(db);
      const nextSequence = oldEvents.reduce((highest, event) => Math.max(highest, event.sequence), 0) + 1;
      const activeDates = activeAwardLocalDates(oldEvents);
      if (!hasGrantDateForCancelledAwards(id, changes, activeDates)) {
        if (await progressionRevision(db) !== revision) continue;
        return error(409, "Muscle XP history is inconsistent; no changes were saved.");
      }
      const newEvents = eventsForAwardChanges(id, changes, localDate, occurredAt, nextSequence, activeDates);
      if (!muscleEventsRemainReadable([...oldEvents, ...newEvents])) {
        if (await progressionRevision(db) !== revision) continue;
        return error(409, "Muscle XP history is inconsistent; no changes were saved.");
      }
      const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
        ...awardChangeStatements(db, id, changes, newEvents, nextRevision, token),
        guardedStatement(db, `
          DELETE FROM strength_workouts WHERE id = ? AND version = ? AND ${WRITE_GUARD}
        `, [id, expectedVersion], nextRevision, token),
      ]);
      if (committed) return json({ ok: true, xpChange: { added: 0, cancelled: changes.cancelled.length } });
    }
    return error(409, "Health data changed repeatedly; retry the workout deletion.");
  }

  if (!exactKeys(body, ["expectedVersion", "type", "recordedAt", "timezone", "place", "note", "items"])) {
    return error(400, "Workout update must contain expectedVersion and the complete draft.");
  }
  const draftInput = { ...body };
  delete draftInput.expectedVersion;
  const parsedDraft = parseWorkoutDraft(draftInput);
  if (parsedDraft.response) return parsedDraft.response;
  const draft = parsedDraft.draft!;
  if (isFutureWorkoutDraft(draft)) return error(400, "운동 기록 시간은 현재 시각 이후일 수 없습니다.");

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const row = await db.prepare(`
      SELECT id, version, draft_json, local_date, created_at, updated_at
      FROM strength_workouts WHERE id = ?
    `).bind(id).first<WorkoutRow>();
    if (!row) return error(404, "Workout not found.");
    const current = workoutFromRow(row);
    if (current.version !== expectedVersion) return error(409, "Workout version is stale; reload before saving.");
    const saved = await currentWorkoutAwards(db, id);
    const desired = desiredMuscleAwards(draft);
    const changes = reconcileMuscleAwards(saved, desired);
    const profileRow = await db.prepare("SELECT timezone FROM health_profile WHERE id = 1")
      .first<{ timezone: string }>();
    const occurredAt = new Date().toISOString();
    const localDate = localDateFor(occurredAt, profileRow?.timezone ?? DEFAULT_PROFILE.timezone);
    const oldEvents = await readMuscleEvents(db);
    const nextSequence = oldEvents.reduce((highest, event) => Math.max(highest, event.sequence), 0) + 1;
    const activeDates = activeAwardLocalDates(oldEvents);
    if (!hasGrantDateForCancelledAwards(id, changes, activeDates)) {
      if (await progressionRevision(db) !== revision) continue;
      return error(409, "Muscle XP history is inconsistent; no changes were saved.");
    }
    const newEvents = eventsForAwardChanges(id, changes, localDate, occurredAt, nextSequence, activeDates);
    if (!muscleEventsRemainReadable([...oldEvents, ...newEvents])) {
      if (await progressionRevision(db) !== revision) continue;
      return error(409, "Muscle XP history is inconsistent; no changes were saved.");
    }
    const nextVersion = Number(expectedVersion) + 1;
    const nextLocalDate = localDateFor(draft.recordedAt, draft.timezone);
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        UPDATE strength_workouts SET version = ?, draft_json = ?, recorded_at = ?, timezone = ?,
          local_date = ?, updated_at = ?, confirmed_revision = ?
        WHERE id = ? AND version = ? AND ${WRITE_GUARD}
      `, [nextVersion, JSON.stringify(draft), draft.recordedAt, draft.timezone,
        nextLocalDate, occurredAt, nextRevision, id, expectedVersion], nextRevision, token),
      ...awardChangeStatements(db, id, changes, newEvents, nextRevision, token),
    ]);
    if (committed) {
      const workout: StrengthWorkoutRecord = {
        ...draft,
        id,
        version: nextVersion,
        localDate: nextLocalDate,
        createdAt: current.createdAt,
        updatedAt: occurredAt,
      };
      return json({ workout, xpChange: { added: changes.added.length, cancelled: changes.cancelled.length } });
    }
  }
  return error(409, "Health data changed repeatedly; retry the workout update.");
}

async function createWorkout(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "POST") return error(405, "Method not allowed.");
  const idempotencyHeader = request.headers.get("Idempotency-Key");
  if (!idempotencyHeader || !UUID_PATTERN.test(idempotencyHeader)) {
    return error(400, "A valid UUID Idempotency-Key header is required.");
  }
  const idempotencyKey = idempotencyHeader.toLowerCase();
  const parsed = await readJson(request, MAX_WORKOUT_BODY_BYTES);
  if (parsed.response) return parsed.response;
  if (!isRecord(parsed.value) || !exactKeys(parsed.value, ["type", "recordedAt", "timezone", "place", "note", "items"])) {
    return error(400, "Workout creation requires the complete Strength Training draft.");
  }
  const parsedDraft = parseWorkoutDraft(parsed.value);
  if (parsedDraft.response) return parsedDraft.response;
  const draft = parsedDraft.draft!;
  if (isFutureWorkoutDraft(draft)) return error(400, "운동 기록 시간은 현재 시각 이후일 수 없습니다.");
  const draftHash = await workoutDraftFingerprint(draft);
  const id = crypto.randomUUID();
  const awards = desiredMuscleAwards(draft);

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const prior = await db.prepare(`
      SELECT draft_hash, workout_id FROM strength_workout_create_requests WHERE idempotency_key = ?
    `).bind(idempotencyKey).first<WorkoutRow>();
    if (prior) {
      if (String(prior.draft_hash) !== draftHash) {
        return error(409, "This Idempotency-Key was already used for a different workout draft.");
      }
      const priorWorkout = await db.prepare(`
        SELECT id, version, draft_json, local_date, created_at, updated_at
        FROM strength_workouts WHERE id = ?
      `).bind(String(prior.workout_id)).first<WorkoutRow>();
      if (await progressionRevision(db) !== revision) continue;
      if (!priorWorkout) return error(410, "This workout was deleted; the Idempotency-Key cannot recreate it.");
      return json({ workout: workoutFromRow(priorWorkout), xpChange: { added: 0, cancelled: 0 } });
    }

    const occurredAt = new Date().toISOString();
    const localDate = localDateFor(draft.recordedAt, draft.timezone);
    const changes = reconcileMuscleAwards([], awards);
    const events = eventsForAwardChanges(id, changes, localDate, occurredAt);
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        INSERT INTO strength_workouts (id, confirmed_revision, version, draft_json, recorded_at, timezone, local_date, created_at, updated_at)
        SELECT ?, ?, 1, ?, ?, ?, ?, ?, ? WHERE ${WRITE_GUARD}
      `, [id, nextRevision, JSON.stringify(draft), draft.recordedAt, draft.timezone, localDate, occurredAt, occurredAt], nextRevision, token),
      guardedStatement(db, `
        INSERT INTO strength_workout_create_requests (idempotency_key, draft_hash, workout_id)
        SELECT ?, ?, ? WHERE ${WRITE_GUARD}
      `, [idempotencyKey, draftHash, id], nextRevision, token),
      ...awardChangeStatements(db, id, changes, events, nextRevision, token),
    ]);
    if (committed) {
      const workout: StrengthWorkoutRecord = { ...draft, id, version: 1, localDate, createdAt: occurredAt, updatedAt: occurredAt };
      return json({ workout, xpChange: { added: awards.length, cancelled: 0 } }, 201);
    }
  }
  return error(409, "Health data changed repeatedly; retry the workout save.");
}

async function workoutPicker(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "GET") return error(405, "Method not allowed.");
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const [usageResult, workoutResult] = await Promise.all([
      db.prepare(`
        SELECT usage_id, mode, name, added_at, sequence FROM custom_workout_usages ORDER BY sequence
      `).all<WorkoutRow>(),
      db.prepare(`
        SELECT id, version, draft_json, local_date, created_at, updated_at, confirmed_revision
        FROM strength_workouts ORDER BY updated_at DESC, confirmed_revision DESC
      `).all<WorkoutRow>(),
    ]);
    if (await progressionRevision(db) !== revision) continue;

    const usages: CustomWorkoutUsage[] = (usageResult.results ?? []).map((row) => ({
      id: String(row.usage_id),
      mode: String(row.mode) as StrengthMode,
      name: String(row.name),
      addedAt: String(row.added_at),
      sequence: Number(row.sequence),
    }));
    const selections: WorkoutMuscleSelection[] = [];
    const seen = new Set<string>();
    for (const row of workoutResult.results ?? []) {
      const workout = workoutFromRow(row);
      for (const item of workout.items.slice().reverse()) {
        const key = JSON.stringify([item.mode, item.name, item.source]);
        if (seen.has(key)) continue;
        seen.add(key);
        selections.push({
          mode: item.mode,
          name: item.name,
          source: item.source,
          targetMuscles: [...item.targetMuscles],
          confirmedAt: workout.updatedAt,
          sequence: Number(row.confirmed_revision),
        });
      }
    }
    return json({ usages, selections } satisfies WorkoutPickerState);
  }
  return error(409, "Health data changed repeatedly; retry the workout picker request.");
}

async function recordCustomWorkoutUsage(request: Request, db: D1Database): Promise<Response> {
  if (request.method !== "POST") return error(405, "Method not allowed.");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.value;
  if (!isRecord(body) || !exactKeys(body, ["usageId", "mode", "name"]) ||
      typeof body.usageId !== "string" || !UUID_PATTERN.test(body.usageId) || !isStrengthMode(body.mode) ||
      typeof body.name !== "string" || body.name.length < 1 || body.name.length > 256 || body.name.trim().length === 0) {
    return error(400, "usageId, a Strength Training mode, and a non-empty exact name are required.");
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const revision = await progressionRevision(db);
    const existing = await db.prepare(`
      SELECT usage_id, mode, name, added_at, sequence FROM custom_workout_usages WHERE usage_id = ?
    `).bind(body.usageId).first<WorkoutRow>();
    if (existing) {
      if (existing.mode !== body.mode || existing.name !== body.name) {
        return error(409, "This usageId was already used for a different workout item.");
      }
      return json({ usage: {
        id: String(existing.usage_id), mode: String(existing.mode) as StrengthMode,
        name: String(existing.name), addedAt: String(existing.added_at), sequence: Number(existing.sequence),
      } satisfies CustomWorkoutUsage });
    }

    const addedAt = new Date().toISOString();
    const committed = await compareAndSwapBatch(db, revision, (nextRevision, token) => [
      guardedStatement(db, `
        INSERT INTO custom_workout_usages (usage_id, mode, name, added_at)
        SELECT ?, ?, ?, ? WHERE ${WRITE_GUARD}
      `, [body.usageId, body.mode, body.name, addedAt], nextRevision, token),
    ]);
    if (committed) {
      const row = await db.prepare(`
        SELECT usage_id, mode, name, added_at, sequence FROM custom_workout_usages WHERE usage_id = ?
      `).bind(body.usageId).first<WorkoutRow>();
      if (!row) throw new Error("Saved custom workout usage is unavailable");
      return json({ usage: {
        id: String(row.usage_id), mode: String(row.mode) as StrengthMode,
        name: String(row.name), addedAt: String(row.added_at), sequence: Number(row.sequence),
      } satisfies CustomWorkoutUsage });
    }
  }
  return error(409, "Health data changed repeatedly; retry the custom item addition.");
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
    const [measurementResult, awardResult, muscleEventResult, muscleAwardResult] = await Promise.all([
      db.prepare(`
        SELECT id, metric, value, recorded_at, local_date, sequence
        FROM health_measurements ORDER BY recorded_at ASC, sequence ASC
      `).all<Record<string, unknown>>(),
      db.prepare(`
        SELECT measurement_id, metric, local_date, xp FROM body_metric_xp_awards
        ORDER BY local_date ASC, measurement_id ASC
      `).all<Record<string, unknown>>(),
      db.prepare(`
        SELECT id, workout_id, item_id, group_name, delta, local_date, occurred_at, sequence
        FROM muscle_xp_events ORDER BY local_date, sequence
      `).all<WorkoutRow>(),
      db.prepare(`
        SELECT workout_id, item_id, group_name, xp FROM strength_workout_muscle_awards
        ORDER BY workout_id, item_id, group_name
      `).all<WorkoutRow>(),
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
    const muscleEvents = (muscleEventResult.results ?? []).map(eventFromRow);
    assertCurrentAwardsMatchEvents(muscleEvents, muscleAwardResult.results ?? []);
    const snapshot: ProgressionSnapshot = buildProgressionSnapshot(measurements, awards, endDate, muscleEvents);
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

    let route: "profile" | "measurements" | "goals" | "undo" | "progression" | "workouts" | "workout" | "picker" | "usage" | "missing" = "missing";
    let undoId = "";
    let workoutId = "";
    if (path === "/api/health/profile") route = "profile";
    else if (path === "/api/health/measurements") route = "measurements";
    else if (path === "/api/health/goals") route = "goals";
    else if (path === "/api/health/progression") route = "progression";
    else if (path === "/api/health/workouts") route = "workouts";
    else if (path === "/api/health/workout-picker") route = "picker";
    else if (path === "/api/health/workout-picker/usages") route = "usage";
    else {
      const workoutMatch = path.match(/^\/api\/health\/workouts\/([^/]+)$/);
      const undoMatch = path.match(/^\/api\/health\/measurements\/([^/]+)\/undo$/);
      try {
        if (workoutMatch) {
          workoutId = decodeURIComponent(workoutMatch[1]);
          route = "workout";
        } else if (undoMatch) {
          undoId = decodeURIComponent(undoMatch[1]);
          route = "undo";
        }
      } catch {
        return error(400, "Invalid record ID.");
      }
    }
    if (route === "missing") return error(404, "Health endpoint not found.");
    const methodAllowed = route === "profile"
      ? request.method === "GET" || request.method === "PUT"
      : route === "measurements"
        ? request.method === "GET" || request.method === "POST"
        : route === "goals"
          ? request.method === "GET" || request.method === "POST"
          : route === "undo" || route === "usage"
            ? request.method === "POST"
            : route === "workouts"
              ? request.method === "GET" || request.method === "POST"
              : route === "workout"
                ? request.method === "GET" || request.method === "PUT" || request.method === "DELETE"
                : route === "picker"
                  ? request.method === "GET"
                  : route === "progression"
                    ? request.method === "GET"
                    : false;
    if (!methodAllowed) return error(405, "Method not allowed.");

    if (!env?.DB) return error(503, "Health data storage is unavailable.");
    switch (route) {
      case "profile": return await profile(request, env.DB);
      case "measurements": return await measurements(request, env.DB, url);
      case "goals": return await goals(request, env.DB);
      case "undo": return await undoMeasurement(request, env.DB, undoId);
      case "progression": return await progression(request, env.DB, url);
      case "workouts": return request.method === "POST"
        ? await createWorkout(request, env.DB)
        : await workouts(request, env.DB);
      case "workout": return await workoutById(request, env.DB, workoutId);
      case "picker": return await workoutPicker(request, env.DB);
      case "usage": return await recordCustomWorkoutUsage(request, env.DB);
    }
  } catch {
    return error(500, "Health request failed.");
  }
}
