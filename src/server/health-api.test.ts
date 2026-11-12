import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { localDateAt } from "../domain/time.ts";
import { handleHealthRequest } from "./health-api.ts";

class SQLiteD1Statement {
  readonly database: DatabaseSync;
  readonly sql: string;
  readonly values: unknown[];

  constructor(database: DatabaseSync, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new SQLiteD1Statement(this.database, this.sql, values);
  }

  first<T = Record<string, unknown>>(columnName?: string): T | null {
    const row = this.database.prepare(this.sql).get(...this.values) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class SQLiteD1 {
  readonly database: DatabaseSync;
  beforeNextBatch?: () => Promise<void> | void;
  failNextBatchStatementAt: number | null = null;

  constructor(database = new DatabaseSync(":memory:")) {
    this.database = database;
  }

  prepare(sql: string) {
    return new SQLiteD1Statement(this.database, sql);
  }

  async batch(statements: SQLiteD1Statement[]) {
    const hook = this.beforeNextBatch;
    this.beforeNextBatch = undefined;
    if (hook) await hook();
    const failAt = this.failNextBatchStatementAt;
    this.failNextBatchStatementAt = null;
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const [index, statement] of statements.entries()) {
        if (index === failAt) throw new Error("injected batch failure");
        results.push(statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function applyMigration(adapter: SQLiteD1, name: string) {
  const migration = readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8");
  adapter.database.exec(migration);
}

function makeDatabase() {
  const adapter = new SQLiteD1();
  adapter.database.exec("PRAGMA foreign_keys = ON");
  applyMigration(adapter, "0001_health_foundation.sql");
  applyMigration(adapter, "0002_body_metric_xp.sql");
  return adapter;
}

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://health.test${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(db: SQLiteD1 | undefined, req: Request) {
  const response = await handleHealthRequest(req, db ? { DB: db as never } : {});
  assert.ok(response, "health route is handled");
  return response;
}

async function jsonBody(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

function measurement(value: number, recordedAt = "2026-11-11T15:30:00.000Z", timezone = "Asia/Seoul") {
  return { metric: "body_weight", value, recordedAt, timezone };
}

function metricMeasurement(metric: string, value: number, recordedAt: string, timezone = "UTC") {
  return { metric, value, recordedAt, timezone };
}

function utcAtDay(dayOffset: number, hour = 12) {
  const date = new Date("2026-11-01T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function setActiveGoal(db: SQLiteD1, metric: string, targetValue: number) {
  const response = await call(db, request("/api/health/goals", "POST", {
    metric, targetValue, targetDate: "2027-12-31",
  }));
  const goal = (await jsonBody(response)).goal;
  db.prepare("UPDATE health_goals SET activated_at = ? WHERE id = ?")
    .bind("2024-01-01T00:00:00.000Z", goal.id).run();
  return goal.id as string;
}

function awardRows(db: SQLiteD1) {
  return db.prepare("SELECT measurement_id, metric, local_date, xp FROM body_metric_xp_awards ORDER BY local_date, measurement_id")
    .all().results ?? [];
}

async function saveMetric(db: SQLiteD1, metric: string, value: number, recordedAt: string, timezone = "UTC") {
  const response = await call(db, request("/api/health/measurements", "POST",
    metricMeasurement(metric, value, recordedAt, timezone)));
  return { response, ...(await jsonBody(response)).measurement };
}

async function progressionSnapshot(db: SQLiteD1, endDate: string) {
  return jsonBody(await call(db, request(`/api/health/progression?endDate=${endDate}`)));
}

test("migration executes and enforces metric, value, undo, and active-goal constraints", () => {
  const db = makeDatabase();
  const insertMeasurement = db.prepare(`
    INSERT INTO health_measurements (id, metric, value, recorded_at, timezone, local_date, can_undo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const validMeasurement = ["m1", "body_weight", 70, "2026-11-12T00:30:00.000Z", "Asia/Seoul", "2026-11-12", 1];
  insertMeasurement.bind(...validMeasurement).run();
  assert.throws(() => insertMeasurement.bind("m2", "height", 170, ...validMeasurement.slice(3)).run());
  assert.throws(() => insertMeasurement.bind("m3", "body_weight", 0, ...validMeasurement.slice(3)).run());
  assert.throws(() => insertMeasurement.bind("m4", "body_fat_percentage", 101, ...validMeasurement.slice(3)).run());
  assert.throws(() => insertMeasurement.bind("m5", ...validMeasurement.slice(1)).run());
  insertMeasurement.bind("m2", "body_weight", 71, ...validMeasurement.slice(3, 6), 0).run();
  const insertAward = db.prepare(`
    INSERT INTO body_metric_xp_awards (measurement_id, metric, local_date, xp) VALUES (?, ?, ?, ?)
  `);
  insertAward.bind("m1", "body_weight", "2026-11-12", 1).run();
  assert.throws(() => insertAward.bind("m1", "body_weight", "2026-11-12", 1).run());
  assert.throws(() => insertAward.bind("m2", "body_weight", "2026-11-12", 1).run());
  assert.throws(() => insertAward.bind("missing", "body_weight", "2026-11-13", 1).run());
  assert.throws(() => insertAward.bind("m2", "body_weight", "2026-11-13", 2).run());

  const insertGoal = db.prepare(`
    INSERT INTO health_goals (id, metric, target_value, target_date, active, activated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertGoal.bind("g1", "body_weight", 65, "2027-01-01", 1, "2026-11-12T00:00:00.000Z").run();
  assert.throws(() => insertGoal.bind("g2", "body_weight", 60, "2027-02-01", 1, "2026-11-12T00:00:00.000Z").run());
});

test("0002 upgrades populated 0001 data without losing records or backfilling awards", () => {
  const db = new SQLiteD1();
  db.database.exec("PRAGMA foreign_keys = ON");
  applyMigration(db, "0001_health_foundation.sql");
  db.prepare("INSERT INTO health_profile (id, unit_preference, timezone) VALUES (1, 'Metric', 'UTC')").run();
  db.prepare(`
    INSERT INTO health_measurements (id, metric, value, recorded_at, timezone, local_date, can_undo)
    VALUES ('legacy-measurement', 'body_weight', 70, '2026-11-01T12:00:00.000Z', 'UTC', '2026-11-01', 1)
  `).run();
  db.prepare(`
    INSERT INTO health_goals (id, metric, target_value, target_date, active, activated_at)
    VALUES ('legacy-goal', 'body_weight', 65, '2027-12-31', 1, '2026-10-01T00:00:00.000Z')
  `).run();

  applyMigration(db, "0002_body_metric_xp.sql");
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements").first()?.count, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_goals WHERE active = 1").first()?.count, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_profile WHERE timezone = 'UTC'").first()?.count, 1);
  assert.equal(awardRows(db).length, 0);
  assert.equal(db.prepare("SELECT revision FROM health_progression_revision WHERE id = 1").first()?.revision, 0);
});

test("profile defaults, persists preferences, and never changes historical measurement timezone", async () => {
  const db = makeDatabase();
  const initial = await call(db, request("/api/health/profile"));
  assert.deepEqual(await jsonBody(initial), { unitPreference: "Metric", timezone: "UTC", initialized: false });
  assert.equal(initial.headers.get("cache-control"), "no-store");

  const explicitDefault = await call(db, request("/api/health/profile", "PUT", {
    unitPreference: "Metric",
    timezone: "UTC",
  }));
  assert.deepEqual(await jsonBody(explicitDefault), { unitPreference: "Metric", timezone: "UTC", initialized: true });
  assert.deepEqual(await jsonBody(await call(db, request("/api/health/profile"))), {
    unitPreference: "Metric", timezone: "UTC", initialized: true,
  });

  const put = await call(db, request("/api/health/profile", "PUT", {
    unitPreference: "Imperial",
    timezone: "Asia/Seoul",
  }));
  assert.deepEqual(await jsonBody(put), { unitPreference: "Imperial", timezone: "Asia/Seoul", initialized: true });
  const saved = await call(db, request("/api/health/measurements", "POST", measurement(72)));
  const savedBody = await jsonBody(saved);
  assert.equal(saved.status, 201);
  assert.equal(savedBody.measurement.localDate, "2026-11-12");
  assert.equal(savedBody.measurement.timezone, "Asia/Seoul");

  await call(db, request("/api/health/profile", "PUT", { unitPreference: "Metric", timezone: "America/Los_Angeles" }));
  const listed = await call(db, request("/api/health/measurements?metric=body_weight"));
  assert.equal((await jsonBody(listed)).measurements[0].timezone, "Asia/Seoul");
});

test("measurements round-trip, order deterministically, and enforce one-time latest undo", async () => {
  const db = makeDatabase();
  const first = await call(db, request("/api/health/measurements", "POST", measurement(70)));
  const firstRecord = (await jsonBody(first)).measurement;
  const second = await call(db, request("/api/health/measurements", "POST", measurement(69)));
  const secondRecord = (await jsonBody(second)).measurement;
  const list = await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")));
  assert.deepEqual(list.measurements.map((record: any) => record.id), [secondRecord.id, firstRecord.id]);
  assert.deepEqual(list.measurements.map((record: any) => record.canUndo), [true, false]);
  assert.deepEqual(list.measurements.map((record: any) => record.xpAwarded), [false, false]);

  const undone = await call(db, request(`/api/health/measurements/${secondRecord.id}/undo`, "POST", {}));
  assert.equal(undone.status, 200);
  assert.deepEqual(await jsonBody(undone), { ok: true });
  const stale = await call(db, request(`/api/health/measurements/${secondRecord.id}/undo`, "POST", {}));
  assert.equal(stale.status, 404);
  const previous = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(previous.length, 1);
  assert.equal(previous[0].id, firstRecord.id);
  assert.equal(previous[0].canUndo, false);

  const replacement = await call(db, request("/api/health/measurements", "POST", measurement(68)));
  assert.equal((await jsonBody(replacement)).measurement.canUndo, true);
  const wrongId = await call(db, request(`/api/health/measurements/${firstRecord.id}/undo`, "POST", {}));
  assert.equal(wrongId.status, 409);
});

test("concurrent saves and goal activations keep one undoable measurement and one active goal", async () => {
  const db = makeDatabase();
  await Promise.all([
    call(db, request("/api/health/measurements", "POST", measurement(70))),
    call(db, request("/api/health/measurements", "POST", measurement(71))),
  ]);
  const measurements = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(measurements.length, 2);
  assert.equal(measurements.filter((record: any) => record.canUndo).length, 1);

  const goal = (targetValue: number) => request("/api/health/goals", "POST", {
    metric: "body_weight", targetValue, targetDate: "2027-01-01",
  });
  await Promise.all([call(db, goal(65)), call(db, goal(60))]);
  const goals = (await jsonBody(await call(db, request("/api/health/goals")))).goals;
  assert.equal(goals.length, 2);
  assert.equal(goals.filter((item: any) => item.active).length, 1);
});

test("goal creation replaces the prior active goal but retains its history", async () => {
  const db = makeDatabase();
  const body = { metric: "skeletal_muscle_mass", targetValue: 32, targetDate: "2027-06-01" };
  const first = await call(db, request("/api/health/goals", "POST", body));
  const firstGoal = (await jsonBody(first)).goal;
  const second = await call(db, request("/api/health/goals", "POST", { ...body, targetValue: 35 }));
  const secondGoal = (await jsonBody(second)).goal;
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.match(secondGoal.activatedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const goals = (await jsonBody(await call(db, request("/api/health/goals")))).goals;
  assert.equal(goals.length, 2);
  assert.equal(goals[0].id, secondGoal.id);
  assert.equal(goals[0].active, true);
  assert.equal(goals[1].id, firstGoal.id);
  assert.equal(goals[1].active, false);
});

test("confirmed measurements persist body XP once per metric/event-local-day and compose progression", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 65);
  await setActiveGoal(db, "body_fat_percentage", 20);

  const firstWeight = await saveMetric(db, "body_weight", 70, utcAtDay(0));
  const firstFat = await saveMetric(db, "body_fat_percentage", 30, utcAtDay(0));
  const nextDayWeight = await saveMetric(db, "body_weight", 69, "2026-11-02T08:00:00.000Z", "America/Los_Angeles");
  const sameTimestampOtherZone = await saveMetric(db, "body_weight", 68, "2026-11-02T08:00:00.000Z", "America/Vancouver");
  const sameDayOtherZone = await saveMetric(db, "body_weight", 68, "2026-11-02T18:00:00.000Z", "Europe/London");
  const nextDayFat = await saveMetric(db, "body_fat_percentage", 29, "2026-11-02T17:00:00.000Z");
  const worse = await saveMetric(db, "body_weight", 70, utcAtDay(2));
  const unchanged = await saveMetric(db, "body_weight", 69, utcAtDay(3));
  const improvedAgain = await saveMetric(db, "body_weight", 68, utcAtDay(4));

  assert.equal(firstWeight.xpAwarded, true);
  assert.equal(firstFat.xpAwarded, true);
  assert.equal(nextDayWeight.localDate, sameTimestampOtherZone.localDate);
  assert.equal(nextDayWeight.localDate, sameDayOtherZone.localDate);
  assert.equal(nextDayWeight.xpAwarded, true);
  assert.equal(sameTimestampOtherZone.xpAwarded, false);
  assert.equal(sameDayOtherZone.xpAwarded, false);
  assert.equal(nextDayFat.xpAwarded, true);
  assert.equal(worse.xpAwarded, false);
  assert.equal(unchanged.xpAwarded, false);
  assert.equal(improvedAgain.xpAwarded, true);
  assert.equal(awardRows(db).length, 5);

  const listed = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(listed.find((item: any) => item.id === sameTimestampOtherZone.id).xpAwarded, false);
  assert.equal(listed.find((item: any) => item.id === sameDayOtherZone.id).xpAwarded, false);
  const snapshot = await progressionSnapshot(db, "2026-11-05");
  assert.deepEqual(snapshot.avatar, { xp: 5, level: 1 });
  assert.deepEqual(snapshot.bodyMetrics, [
    { metric: "body_weight", xp: 3, level: 1 },
    { metric: "body_fat_percentage", xp: 2, level: 1 },
    { metric: "skeletal_muscle_mass", xp: 0, level: 1 },
  ]);
  assert.equal(snapshot.days.length, 14);
  assert.deepEqual(snapshot.days.at(-1), {
    date: "2026-11-05", bodyWeightKg: 68, xp: 5, level: 1,
  });
});

test("API delegates floating-point noise handling to the canonical XP rule", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 0.1);
  assert.equal((await saveMetric(db, "body_weight", 0.3, utcAtDay(0))).xpAwarded, true);
  assert.equal((await saveMetric(db, "body_weight", 0.29999999999999993, utcAtDay(1))).xpAwarded, false);
  assert.equal(awardRows(db).length, 1);
});

test("7-day awarded baseline expires on day eight in favor of previous confirmed history", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 100);
  assert.equal((await saveMetric(db, "body_weight", 100, utcAtDay(0))).xpAwarded, true);
  assert.equal((await saveMetric(db, "body_weight", 80, utcAtDay(6))).xpAwarded, false);
  assert.equal((await saveMetric(db, "body_weight", 85, utcAtDay(7))).xpAwarded, false);
  assert.equal((await saveMetric(db, "body_weight", 90, utcAtDay(8))).xpAwarded, true);
});

test("goal replacement resets comparison history but retains the prior award and same-day cap", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 60);
  const beforeActivation = new Date(Date.now() - 60_000).toISOString();
  const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"];
  const localDate = (instant: string, timezone: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instant));
  const activationRequest = request("/api/health/goals", "POST", {
    metric: "body_weight", targetValue: 100, targetDate: "2027-12-31",
  });
  const afterUpperBound = new Date(Date.now() + 60_000).toISOString();
  const timezone = zones.find((candidate) => localDate(beforeActivation, candidate) === localDate(afterUpperBound, candidate)) ?? "UTC";
  const first = await saveMetric(db, "body_weight", 90, beforeActivation, timezone);
  assert.equal(first.xpAwarded, true);
  const replacementResponse = await call(db, activationRequest);
  const replacement = (await jsonBody(replacementResponse)).goal;
  const afterActivation = new Date(Date.parse(replacement.activatedAt) + 1_000).toISOString();
  assert.equal(localDate(beforeActivation, timezone), localDate(afterActivation, timezone));
  const sameDayAfterReset = await saveMetric(db, "body_weight", 95, afterActivation, timezone);
  assert.equal(sameDayAfterReset.xpAwarded, false);
  assert.equal(awardRows(db).length, 1);
  const goals = (await jsonBody(await call(db, request("/api/health/goals")))).goals;
  assert.equal(goals.length, 2);
  assert.equal(goals.find((goal: any) => goal.id === replacement.id).active, true);
  assert.equal((await progressionSnapshot(db, localDate(afterActivation, timezone))).avatar.xp, 1);
});

test("CAS retries stale same-day awards and different-day baselines without losing either save", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 65);
  assert.equal((await saveMetric(db, "body_weight", 80, utcAtDay(0))).xpAwarded, true);

  let competitorSameDay: any;
  db.beforeNextBatch = async () => {
    competitorSameDay = await saveMetric(db, "body_weight", 69, utcAtDay(1));
  };
  const outerSameDay = await saveMetric(db, "body_weight", 68, utcAtDay(1, 18));
  assert.equal(competitorSameDay.xpAwarded, true);
  assert.equal(outerSameDay.xpAwarded, false);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements WHERE local_date = '2026-11-02'")
    .first()?.count, 2);
  assert.equal(db.prepare("SELECT count(*) AS count FROM body_metric_xp_awards WHERE metric = 'body_weight' AND local_date = '2026-11-02'")
    .first()?.count, 1);

  const next = makeDatabase();
  await setActiveGoal(next, "body_weight", 60);
  assert.equal((await saveMetric(next, "body_weight", 80, utcAtDay(0))).xpAwarded, true);
  let competitorEarlierDay: any;
  next.beforeNextBatch = async () => {
    competitorEarlierDay = await saveMetric(next, "body_weight", 65, utcAtDay(1));
  };
  const staleBaseline = await saveMetric(next, "body_weight", 70, utcAtDay(2));
  assert.equal(competitorEarlierDay.xpAwarded, true);
  assert.equal(staleBaseline.xpAwarded, false);
  assert.equal(next.prepare("SELECT count(*) AS count FROM health_measurements").first()?.count, 3);
  assert.equal(awardRows(next).length, 2);
});

test("CAS retry recomputes measurement XP after a concurrent goal reset", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 60);
  const previousDay = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal((await saveMetric(db, "body_weight", 80, previousDay)).xpAwarded, true);
  const recordedBeforeReplacement = new Date(Date.now() - 60_000).toISOString();
  let replacement: any;
  db.beforeNextBatch = async () => {
    const response = await call(db, request("/api/health/goals", "POST", {
      metric: "body_weight", targetValue: 100, targetDate: "2027-12-31",
    }));
    replacement = (await jsonBody(response)).goal;
  };
  const latePostBeforeReset = await saveMetric(db, "body_weight", 70, recordedBeforeReplacement);
  assert.ok(Date.parse(latePostBeforeReset.recordedAt) < Date.parse(replacement.activatedAt));
  assert.equal(latePostBeforeReset.xpAwarded, false);
  assert.equal(awardRows(db).length, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements").first()?.count, 2);
});

test("CAS retry reevaluates history after a concurrent undo removes its award", async () => {
  const db = makeDatabase();
  db.prepare(`
    INSERT INTO health_measurements (id, metric, value, recorded_at, timezone, local_date, can_undo)
    VALUES ('before-reset', 'body_weight', 80, ?, 'UTC', ?, 0)
  `).bind(new Date(Date.now() - 120_000).toISOString(), localDateAt(new Date(Date.now() - 120_000).toISOString(), "UTC")).run();
  await call(db, request("/api/health/goals", "POST", {
    metric: "body_weight", targetValue: 100, targetDate: "2027-12-31",
  }));
  const awarded = await saveMetric(db, "body_weight", 90, new Date(Date.now() + 1_000).toISOString());
  assert.equal(awarded.xpAwarded, true);
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  nextDay.setUTCHours(12, 0, 0, 0);
  let undoResult: Response | undefined;
  db.beforeNextBatch = async () => {
    undoResult = await call(db, request(`/api/health/measurements/${awarded.id}/undo`, "POST", {}));
  };
  const afterUndo = await saveMetric(db, "body_weight", 85, nextDay.toISOString());
  assert.equal(undoResult?.status, 200);
  assert.equal(afterUndo.xpAwarded, true);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements WHERE id = ?")
    .bind(awarded.id).first()?.count, 0);
  assert.equal(awardRows(db).length, 1);
  assert.equal(db.prepare("SELECT id FROM health_measurements WHERE id = 'before-reset'").first()?.id, "before-reset");
});

test("failed dependent write rolls back CAS, undoability, source, and award together", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 100);
  const original = await saveMetric(db, "body_weight", 90, utcAtDay(0));
  assert.equal(original.xpAwarded, true);
  const revisionBefore = db.prepare("SELECT revision FROM health_progression_revision WHERE id = 1").first()?.revision;
  db.failNextBatchStatementAt = 2;
  const failed = await saveMetric(db, "body_weight", 95, utcAtDay(1));
  assert.equal(failed.response.status, 500);
  assert.equal(db.prepare("SELECT revision FROM health_progression_revision WHERE id = 1").first()?.revision, revisionBefore);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements").first()?.count, 1);
  assert.equal(awardRows(db).length, 1);
  const retained = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(retained[0].id, original.id);
  assert.equal(retained[0].canUndo, true);
  const retry = await saveMetric(db, "body_weight", 95, utcAtDay(1));
  assert.equal(retry.response.status, 201);
  assert.equal(retry.xpAwarded, true);
});

test("undo removes its award and past progression, can lower a level, and allows re-entry", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 100);
  const records = [];
  for (let day = 0; day < 10; day++) {
    const saved = await saveMetric(db, "body_weight", 90 + day, utcAtDay(day));
    records.push(saved);
    assert.equal(saved.xpAwarded, true);
  }
  assert.deepEqual((await progressionSnapshot(db, "2026-11-10")).avatar, { xp: 10, level: 2 });

  const undo = await call(db, request(`/api/health/measurements/${records[9].id}/undo`, "POST", {}));
  assert.deepEqual(await jsonBody(undo), { ok: true });
  assert.equal(awardRows(db).length, 9);
  assert.equal(db.prepare("SELECT count(*) AS count FROM health_measurements WHERE id = ?")
    .bind(records[9].id).first()?.count, 0);
  assert.deepEqual((await progressionSnapshot(db, "2026-11-10")).avatar, { xp: 9, level: 1 });
  const older = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(older.find((record: any) => record.id === records[8].id).canUndo, false);

  const reentered = await saveMetric(db, "body_weight", 100, utcAtDay(10));
  assert.equal(reentered.xpAwarded, true);
  assert.equal(reentered.canUndo, true);
  assert.deepEqual((await progressionSnapshot(db, "2026-11-11")).avatar, { xp: 10, level: 2 });
});

test("undoing a non-awarded latest measurement preserves other awards and older undo state", async () => {
  const db = makeDatabase();
  await setActiveGoal(db, "body_weight", 100);
  const awarded = await saveMetric(db, "body_weight", 90, utcAtDay(0));
  const notAwarded = await saveMetric(db, "body_weight", 80, utcAtDay(1));
  assert.equal(awarded.xpAwarded, true);
  assert.equal(notAwarded.xpAwarded, false);
  const response = await call(db, request(`/api/health/measurements/${notAwarded.id}/undo`, "POST", {}));
  assert.equal(response.status, 200);
  assert.equal(awardRows(db).length, 1);
  assert.deepEqual((await progressionSnapshot(db, "2026-11-02")).avatar, { xp: 1, level: 1 });
  const remaining = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, awarded.id);
  assert.equal(remaining[0].canUndo, false);
  assert.equal((await saveMetric(db, "body_weight", 95, utcAtDay(2))).xpAwarded, true);
});

test("progression validates query and method and defaults endDate from profile timezone", async () => {
  const db = makeDatabase();
  const now = new Date().toISOString();
  const utcSnapshot = await jsonBody(await call(db, request("/api/health/progression")));
  assert.equal(utcSnapshot.days.at(-1).date, localDateAt(now, "UTC"));
  assert.deepEqual(utcSnapshot.avatar, { xp: 0, level: 1 });

  await call(db, request("/api/health/profile", "PUT", {
    unitPreference: "Metric", timezone: "Pacific/Kiritimati",
  }));
  const profileTimezoneSnapshot = await jsonBody(await call(db, request("/api/health/progression")));
  assert.equal(profileTimezoneSnapshot.days.at(-1).date, localDateAt(new Date().toISOString(), "Pacific/Kiritimati"));
  assert.equal((await call(db, request("/api/health/progression?endDate=2026-02-30"))).status, 400);
  assert.equal((await call(db, request("/api/health/progression?endDate=2026-11-01&endDate=2026-11-02"))).status, 400);
  assert.equal((await call(db, request("/api/health/progression?unknown=true"))).status, 400);
  assert.equal((await call(db, request("/api/health/progression", "POST"))).status, 405);
});

test("API validates inputs, methods, media type, origin, and bounded request bodies", async () => {
  const db = makeDatabase();
  const invalid = [
    measurement(-1),
    { ...measurement(101), metric: "body_fat_percentage" },
    { ...measurement(0), metric: "skeletal_muscle_mass" },
    { ...measurement(70), recordedAt: "2026-02-30T00:00:00Z" },
    { ...measurement(70), timezone: "Mars/Olympus" },
    { ...measurement(70), metric: "body_weight' OR 1=1 --" },
  ];
  for (const body of invalid) {
    assert.equal((await call(db, request("/api/health/measurements", "POST", body))).status, 400);
  }
  assert.equal((await call(db, request("/api/health/measurements?metric=height"))).status, 400);
  assert.equal((await call(db, request("/api/health/profile", "POST"))).status, 405);
  assert.equal((await call(db, request("/api/health/measurements", "POST", measurement(70), {
    "content-type": "text/plain",
  }))).status, 415);
  assert.equal((await call(db, new Request("https://health.test/api/health/measurements", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://other.test" },
    body: JSON.stringify(measurement(70)),
  }))).status, 403);

  const oversized = new Request("https://health.test/api/health/measurements", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...measurement(70), extra: "x".repeat(17_000) }),
  });
  assert.equal((await call(db, oversized)).status, 413);
  const undoWithoutJson = new Request("https://health.test/api/health/measurements/id/undo", { method: "POST" });
  assert.equal((await call(db, undoWithoutJson)).status, 415);
});

test("undo IDs are SQL parameters and cannot delete unrelated measurements", async () => {
  const db = makeDatabase();
  await call(db, request("/api/health/measurements", "POST", measurement(70)));
  const injected = encodeURIComponent("' OR 1=1 --");
  const response = await call(db, request(`/api/health/measurements/${injected}/undo`, "POST", {}));
  assert.equal(response.status, 404);
  const records = (await jsonBody(await call(db, request("/api/health/measurements?metric=body_weight")))).measurements;
  assert.equal(records.length, 1);
});

test("database failures are opaque and missing binding returns unavailable", async () => {
  assert.equal((await call(undefined, request("/api/health/profile"))).status, 503);
  assert.equal((await call(undefined, request("/api/health/progression"))).status, 503);
  const failing = {
    DB: {
      prepare() {
        return { first: async () => { throw new Error("private SQL details"); } };
      },
    },
  } as never;
  const response = await handleHealthRequest(request("/api/health/profile"), failing);
  assert.equal(response?.status, 500);
  assert.deepEqual(await jsonBody(response!), { error: "Health request failed." });
});

test("unrelated paths are not handled", async () => {
  assert.equal(await handleHealthRequest(request("/api/other"), {}), undefined);
});
