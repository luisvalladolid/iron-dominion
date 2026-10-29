-- Additive server-side gamification state. Historic sessions stay visible but
-- are never retroactively rewarded unless a future audited migration says so.
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS eligible_for_xp BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS local_training_date DATE,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspicious_at TIMESTAMPTZ;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS training_timezone TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE bjj_sessions
  ADD COLUMN IF NOT EXISTS eligible_for_xp BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS local_training_date DATE,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspicious_at TIMESTAMPTZ;

ALTER TABLE xp_events
  ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS workout_sessions_eligible_date_idx
  ON workout_sessions (user_id, local_training_date DESC)
  WHERE eligible_for_xp = TRUE AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS bjj_sessions_eligible_date_idx
  ON bjj_sessions (user_id, local_training_date DESC)
  WHERE eligible_for_xp = TRUE AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS xp_events_valid_user_idx
  ON xp_events (user_id, occurred_at DESC)
  WHERE is_valid = TRUE AND invalidated_at IS NULL;

-- A source record can be removed or invalidated outside an application route.
-- Preserve the ledger row for auditability, but remove it from XP/stat/ranking use.
CREATE OR REPLACE FUNCTION iron_dominion_invalidate_source_xp()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE xp_events
      SET is_valid = FALSE, invalidated_at = COALESCE(invalidated_at, NOW())
      WHERE user_id = OLD.user_id
        AND source_type = TG_ARGV[0]
        AND source_id = OLD.id::text
        AND is_valid = TRUE;
  ELSIF NEW.invalidated_at IS NOT NULL OR NEW.eligible_for_xp = FALSE THEN
    UPDATE xp_events
      SET is_valid = FALSE, invalidated_at = COALESCE(invalidated_at, NOW())
      WHERE user_id = OLD.user_id
        AND source_type = TG_ARGV[0]
        AND source_id = OLD.id::text
        AND is_valid = TRUE;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workout_sessions_invalidate_xp ON workout_sessions;
CREATE TRIGGER workout_sessions_invalidate_xp
AFTER UPDATE OR DELETE ON workout_sessions
FOR EACH ROW EXECUTE FUNCTION iron_dominion_invalidate_source_xp('workout');

DROP TRIGGER IF EXISTS bjj_sessions_invalidate_xp ON bjj_sessions;
CREATE TRIGGER bjj_sessions_invalidate_xp
AFTER UPDATE OR DELETE ON bjj_sessions
FOR EACH ROW EXECUTE FUNCTION iron_dominion_invalidate_source_xp('bjj');

INSERT INTO achievements (achievement_key, name, description, category, xp_reward, criteria)
VALUES
  ('first_blood', 'First Blood', 'Complete your first eligible training session.', 'training', 50, '{"metric":"eligible_sessions","threshold":1}'::jsonb),
  ('iron_discipline', 'Iron Discipline', 'Log training on 7 active local training days.', 'consistency', 100, '{"metric":"active_days","threshold":7}'::jsonb),
  ('century_club', 'Century Club', 'Log 100 kettlebell repetitions in eligible sessions.', 'kettlebell', 100, '{"metric":"kettlebell_reps","threshold":100}'::jsonb),
  ('mat_warrior', 'Mat Warrior', 'Complete 50 BJJ rounds in eligible sessions.', 'bjj', 100, '{"metric":"bjj_rounds","threshold":50}'::jsonb),
  ('relentless', 'Relentless', 'Log 30 active local training days.', 'consistency', 200, '{"metric":"active_days","threshold":30}'::jsonb),
  ('iron_veteran', 'Iron Veteran', 'Complete 100 eligible kettlebell workouts.', 'training', 250, '{"metric":"eligible_workouts","threshold":100}'::jsonb)
ON CONFLICT (achievement_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    xp_reward = EXCLUDED.xp_reward,
    criteria = EXCLUDED.criteria;
