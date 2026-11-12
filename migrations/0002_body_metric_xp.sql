CREATE TABLE IF NOT EXISTS health_progression_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  write_token TEXT NOT NULL
);

INSERT OR IGNORE INTO health_progression_revision (id, revision, write_token)
VALUES (1, 0, '0002-initial');

CREATE TABLE IF NOT EXISTS body_metric_xp_awards (
  measurement_id TEXT PRIMARY KEY REFERENCES health_measurements(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('body_weight', 'body_fat_percentage', 'skeletal_muscle_mass')),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  xp INTEGER NOT NULL DEFAULT 1 CHECK (xp = 1),
  UNIQUE (metric, local_date)
);
