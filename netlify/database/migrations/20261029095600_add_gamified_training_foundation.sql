-- Backward-compatible foundation for the gamified training platform.
-- Existing workout_sessions rows and payloads remain intact. New fields are
-- nullable so historic browser-synced workouts require no destructive backfill.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  identity_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_unique_idx
  ON user_profiles (LOWER(email));

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS total_sets INTEGER CHECK (total_sets IS NULL OR total_sets >= 0),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'kettlebell';

CREATE INDEX IF NOT EXISTS workout_sessions_user_completed_idx
  ON workout_sessions (user_id, completed_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS bjj_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  active_training_seconds INTEGER NOT NULL DEFAULT 0 CHECK (active_training_seconds >= 0),
  rest_seconds INTEGER NOT NULL DEFAULT 0 CHECK (rest_seconds >= 0),
  rounds_completed INTEGER NOT NULL DEFAULT 0 CHECK (rounds_completed >= 0),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bjj_sessions_user_started_idx
  ON bjj_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS exercise_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workout_session_id TEXT NOT NULL,
  exercise_code TEXT NOT NULL,
  set_number INTEGER NOT NULL CHECK (set_number > 0),
  reps INTEGER CHECK (reps IS NULL OR reps >= 0),
  load_kg NUMERIC(7,2) CHECK (load_kg IS NULL OR load_kg >= 0),
  side TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workout_session_id, exercise_code, set_number, side),
  FOREIGN KEY (user_id, workout_session_id)
    REFERENCES workout_sessions(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exercise_records_user_exercise_idx
  ON exercise_records (user_id, exercise_code, recorded_at DESC);

CREATE TABLE IF NOT EXISTS user_statistics (
  user_id TEXT PRIMARY KEY REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  lifetime_xp BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_xp >= 0),
  workout_count INTEGER NOT NULL DEFAULT 0 CHECK (workout_count >= 0),
  bjj_session_count INTEGER NOT NULL DEFAULT 0 CHECK (bjj_session_count >= 0),
  training_seconds BIGINT NOT NULL DEFAULT 0 CHECK (training_seconds >= 0),
  current_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (current_streak_days >= 0),
  longest_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak_days >= 0),
  last_training_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('workout', 'bjj', 'challenge', 'achievement', 'manual')),
  source_id TEXT,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS xp_events_user_occurred_idx
  ON xp_events (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  achievement_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL REFERENCES achievements(achievement_key) ON DELETE RESTRICT,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_event_id UUID REFERENCES xp_events(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (leaderboard_key, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS leaderboard_rankings (
  snapshot_id UUID NOT NULL REFERENCES leaderboard_snapshots(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  rank_position INTEGER NOT NULL CHECK (rank_position > 0),
  score BIGINT NOT NULL CHECK (score >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (snapshot_id, user_id),
  UNIQUE (snapshot_id, rank_position)
);

CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  xp_reward INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  visibility TEXT NOT NULL DEFAULT 'members' CHECK (visibility IN ('members', 'premium', 'coach_only')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS challenge_participations (
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'trialing', 'grace_period', 'expired', 'revoked')),
  provider TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS subscription_entitlements_user_status_idx
  ON subscription_entitlements (user_id, status, ends_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS premium_training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_entitlement_key TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id TEXT REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
