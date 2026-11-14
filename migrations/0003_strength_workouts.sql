CREATE TABLE IF NOT EXISTS strength_workouts (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE CHECK (length(id) BETWEEN 1 AND 128),
  confirmed_revision INTEGER NOT NULL CHECK (typeof(confirmed_revision) = 'integer' AND confirmed_revision >= 1),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version >= 1),
  draft_json TEXT NOT NULL CHECK (
    json_valid(draft_json) AND
    json_type(draft_json) = 'object' AND
    json_extract(draft_json, '$.type') = 'Strength Training' AND
    json_type(draft_json, '$.items') = 'array' AND
    json_array_length(draft_json, '$.items') BETWEEN 1 AND 100
  ),
  recorded_at TEXT NOT NULL,
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 255),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS strength_workouts_recorded_at
  ON strength_workouts(recorded_at DESC, sequence DESC);

CREATE TABLE IF NOT EXISTS strength_workout_create_requests (
  idempotency_key TEXT PRIMARY KEY CHECK (length(idempotency_key) = 36),
  draft_hash TEXT NOT NULL CHECK (length(draft_hash) = 64 AND draft_hash NOT GLOB '*[^0-9a-f]*'),
  workout_id TEXT NOT NULL UNIQUE CHECK (length(workout_id) BETWEEN 1 AND 128)
);

CREATE TABLE IF NOT EXISTS strength_workout_muscle_awards (
  workout_id TEXT NOT NULL REFERENCES strength_workouts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 255),
  group_name TEXT NOT NULL CHECK (group_name IN (
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
    'Core', 'Glutes', 'Quadriceps', 'Hamstrings', 'Calves'
  )),
  xp INTEGER NOT NULL DEFAULT 1 CHECK (xp = 1),
  PRIMARY KEY (workout_id, item_id, group_name)
);

CREATE TABLE IF NOT EXISTS muscle_xp_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE CHECK (length(id) BETWEEN 1 AND 128),
  workout_id TEXT NOT NULL CHECK (length(workout_id) BETWEEN 1 AND 128),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 255),
  group_name TEXT NOT NULL CHECK (group_name IN (
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
    'Core', 'Glutes', 'Quadriceps', 'Hamstrings', 'Calves'
  )),
  delta INTEGER NOT NULL CHECK (delta IN (-1, 1)),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS muscle_xp_events_progression
  ON muscle_xp_events(local_date, sequence);
CREATE INDEX IF NOT EXISTS muscle_xp_events_award_pair
  ON muscle_xp_events(workout_id, item_id, group_name, sequence);

CREATE TABLE IF NOT EXISTS custom_workout_usages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_id TEXT NOT NULL UNIQUE CHECK (length(usage_id) BETWEEN 1 AND 128),
  mode TEXT NOT NULL CHECK (mode IN ('Machine', 'Free Weight', 'Bodyweight')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 256 AND length(trim(name)) > 0),
  added_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS custom_workout_usages_picker
  ON custom_workout_usages(mode, sequence DESC);
