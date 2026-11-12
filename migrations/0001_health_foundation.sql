CREATE TABLE IF NOT EXISTS health_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  unit_preference TEXT NOT NULL CHECK (unit_preference IN ('Metric', 'Imperial')),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 255)
);

CREATE TABLE IF NOT EXISTS health_measurements (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  metric TEXT NOT NULL CHECK (metric IN ('body_weight', 'body_fat_percentage', 'skeletal_muscle_mass')),
  value REAL NOT NULL CHECK (typeof(value) IN ('integer', 'real') AND value >= 0),
  recorded_at TEXT NOT NULL,
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 255),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  can_undo INTEGER NOT NULL DEFAULT 0 CHECK (can_undo IN (0, 1)),
  CHECK (metric != 'body_fat_percentage' OR value <= 100),
  CHECK (metric = 'body_fat_percentage' OR value > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS health_measurements_one_undoable_per_metric
  ON health_measurements(metric) WHERE can_undo = 1;

CREATE INDEX IF NOT EXISTS health_measurements_metric_recorded_at
  ON health_measurements(metric, recorded_at DESC, sequence DESC);

CREATE TABLE IF NOT EXISTS health_goals (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  metric TEXT NOT NULL CHECK (metric IN ('body_weight', 'body_fat_percentage', 'skeletal_muscle_mass')),
  target_value REAL NOT NULL CHECK (typeof(target_value) IN ('integer', 'real') AND target_value >= 0),
  target_date TEXT NOT NULL CHECK (target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  activated_at TEXT NOT NULL,
  CHECK (metric != 'body_fat_percentage' OR target_value <= 100),
  CHECK (metric = 'body_fat_percentage' OR target_value > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS health_goals_one_active_per_metric
  ON health_goals(metric) WHERE active = 1;

CREATE INDEX IF NOT EXISTS health_goals_metric_activation
  ON health_goals(metric, activated_at DESC, sequence DESC);
