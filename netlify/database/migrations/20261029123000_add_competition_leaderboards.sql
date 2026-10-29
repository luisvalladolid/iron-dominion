-- Competition data is explicitly separate from the private training profile.
-- `leaderboard_opt_in` defaults to false: no athlete is published by migration.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leaderboard_name TEXT,
  ADD COLUMN IF NOT EXISTS leaderboard_show_avatar BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_leaderboard_name_length') THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_leaderboard_name_length
      CHECK (leaderboard_name IS NULL OR char_length(leaderboard_name) BETWEEN 2 AND 40);
  END IF;
END $$;

-- This is a server-maintained aggregate cache. The browser never writes it.
CREATE TABLE IF NOT EXISTS leaderboard_period_scores (
  metric_key TEXT NOT NULL CHECK (metric_key IN ('weekly_xp', 'monthly_xp', 'kettlebell_volume', 'bjj_rounds', 'training_consistency')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  user_id TEXT NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  score BIGINT NOT NULL DEFAULT 0 CHECK (score >= 0),
  eligible_sessions INTEGER NOT NULL DEFAULT 0 CHECK (eligible_sessions >= 0),
  last_eligible_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (metric_key, period_start, user_id),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS leaderboard_period_scores_rank_idx
  ON leaderboard_period_scores (metric_key, period_start, score DESC, eligible_sessions DESC, last_eligible_at ASC, user_id ASC);

-- If a source is invalidated outside the application path, remove its cached
-- rows rather than risk publishing a stale score. The normal server path
-- immediately recalculates the affected athlete after validation.
CREATE OR REPLACE FUNCTION iron_dominion_invalidate_leaderboard_cache()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM leaderboard_period_scores WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  IF NEW.invalidated_at IS NOT NULL OR NEW.eligible_for_xp = FALSE THEN
    DELETE FROM leaderboard_period_scores WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workout_sessions_invalidate_leaderboard_cache ON workout_sessions;
CREATE TRIGGER workout_sessions_invalidate_leaderboard_cache
AFTER UPDATE OR DELETE ON workout_sessions
FOR EACH ROW EXECUTE FUNCTION iron_dominion_invalidate_leaderboard_cache();

DROP TRIGGER IF EXISTS bjj_sessions_invalidate_leaderboard_cache ON bjj_sessions;
CREATE TRIGGER bjj_sessions_invalidate_leaderboard_cache
AFTER UPDATE OR DELETE ON bjj_sessions
FOR EACH ROW EXECUTE FUNCTION iron_dominion_invalidate_leaderboard_cache();
