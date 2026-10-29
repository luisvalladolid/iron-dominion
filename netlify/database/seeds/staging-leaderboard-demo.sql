-- STAGING ONLY. Run this manually against a separate staging database after
-- migrations have been verified. Do not add this file to the migrations path.
INSERT INTO user_profiles (user_id, email, display_name, leaderboard_opt_in, leaderboard_name, leaderboard_show_avatar, identity_metadata)
VALUES
  ('demo-athlete-iron-fox', 'demo-iron-fox@example.invalid', '', TRUE, 'Iron Fox [Demo]', FALSE, '{}'::jsonb),
  ('demo-athlete-raven', 'demo-raven@example.invalid', '', TRUE, 'Raven Guard [Demo]', FALSE, '{}'::jsonb),
  ('demo-athlete-forge', 'demo-forge@example.invalid', '', TRUE, 'Forge Wolf [Demo]', FALSE, '{}'::jsonb),
  ('demo-athlete-slate', 'demo-slate@example.invalid', '', TRUE, 'Slate Viper [Demo]', FALSE, '{}'::jsonb),
  ('demo-athlete-ember', 'demo-ember@example.invalid', '', TRUE, 'Ember Pike [Demo]', FALSE, '{}'::jsonb),
  ('demo-athlete-north', 'demo-north@example.invalid', '', TRUE, 'North Star [Demo]', FALSE, '{}'::jsonb)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_statistics (user_id, lifetime_xp)
VALUES
  ('demo-athlete-iron-fox', 8100), ('demo-athlete-raven', 5300), ('demo-athlete-forge', 3200),
  ('demo-athlete-slate', 1700), ('demo-athlete-ember', 900), ('demo-athlete-north', 400)
ON CONFLICT (user_id) DO NOTHING;

WITH demo_scores(user_id, weekly_xp, monthly_xp, volume, rounds, days, sessions) AS (
  VALUES
    ('demo-athlete-iron-fox', 540, 1680, 3200, 16, 5, 7),
    ('demo-athlete-raven', 510, 1490, 2760, 20, 4, 6),
    ('demo-athlete-forge', 420, 1210, 2440, 12, 5, 5),
    ('demo-athlete-slate', 360, 980, 1980, 10, 3, 4),
    ('demo-athlete-ember', 290, 770, 1650, 8, 3, 3),
    ('demo-athlete-north', 220, 620, 1210, 6, 2, 3)
), periods AS (
  SELECT date_trunc('week', CURRENT_DATE)::date AS week_start,
    (date_trunc('week', CURRENT_DATE)::date + 6) AS week_end,
    date_trunc('month', CURRENT_DATE)::date AS month_start,
    (date_trunc('month', CURRENT_DATE)::date + INTERVAL '1 month - 1 day')::date AS month_end
)
INSERT INTO leaderboard_period_scores (metric_key, period_start, period_end, user_id, score, eligible_sessions, last_eligible_at)
SELECT metric_key, period_start, period_end, user_id, score, sessions, NOW() - (sessions || ' hours')::interval
FROM demo_scores CROSS JOIN periods CROSS JOIN LATERAL (VALUES
  ('weekly_xp'::text, week_start, week_end, weekly_xp::bigint),
  ('monthly_xp'::text, month_start, month_end, monthly_xp::bigint),
  ('kettlebell_volume'::text, week_start, week_end, volume::bigint),
  ('bjj_rounds'::text, week_start, week_end, rounds::bigint),
  ('training_consistency'::text, week_start, week_end, days::bigint)
) AS board(metric_key, period_start, period_end, score)
ON CONFLICT (metric_key, period_start, user_id) DO NOTHING;
