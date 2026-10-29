CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS workout_sessions_user_updated_idx
  ON workout_sessions (user_id, updated_at DESC);
