CREATE TABLE strength_workout_muscle_awards_new (
  workout_id TEXT NOT NULL REFERENCES strength_workouts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 255),
  group_name TEXT NOT NULL CHECK (group_name IN (
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
    'Core', 'Glutes', 'Quadriceps', 'Hamstrings', 'Calves'
  )),
  xp INTEGER NOT NULL DEFAULT 1 CHECK (xp = 1),
  PRIMARY KEY (workout_id, item_id, group_name)
);
INSERT INTO strength_workout_muscle_awards_new SELECT * FROM strength_workout_muscle_awards;
DROP TABLE strength_workout_muscle_awards;
ALTER TABLE strength_workout_muscle_awards_new RENAME TO strength_workout_muscle_awards;

CREATE TABLE forearms_migration_sequence (seq INTEGER NOT NULL);
INSERT INTO forearms_migration_sequence SELECT COALESCE(MAX(seq), 0) FROM sqlite_sequence WHERE name = 'muscle_xp_events';
CREATE TABLE muscle_xp_events_new (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE CHECK (length(id) BETWEEN 1 AND 128),
  workout_id TEXT NOT NULL CHECK (length(workout_id) BETWEEN 1 AND 128),
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 255),
  group_name TEXT NOT NULL CHECK (group_name IN (
    'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
    'Core', 'Glutes', 'Quadriceps', 'Hamstrings', 'Calves'
  )),
  delta INTEGER NOT NULL CHECK (delta IN (-1, 1)),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  occurred_at TEXT NOT NULL
);
INSERT INTO muscle_xp_events_new SELECT * FROM muscle_xp_events;
DROP TABLE muscle_xp_events;
ALTER TABLE muscle_xp_events_new RENAME TO muscle_xp_events;
UPDATE sqlite_sequence SET seq = MAX(seq, (SELECT seq FROM forearms_migration_sequence)) WHERE name = 'muscle_xp_events';
INSERT INTO sqlite_sequence (name, seq)
  SELECT 'muscle_xp_events', seq FROM forearms_migration_sequence
  WHERE seq > 0 AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'muscle_xp_events');
DROP TABLE forearms_migration_sequence;
CREATE INDEX muscle_xp_events_progression ON muscle_xp_events(local_date, sequence);
CREATE INDEX muscle_xp_events_award_pair ON muscle_xp_events(workout_id, item_id, group_name, sequence);
