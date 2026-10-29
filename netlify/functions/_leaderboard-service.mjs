import { LEADERBOARD_METRICS, periodFor } from "./_leaderboards.mjs";

const nextDay = (date) => `${date}T00:00:00Z`;

async function upsert(database, userId, metricKey, period, score, eligibleSessions, lastEligibleAt) {
  await database.sql`INSERT INTO leaderboard_period_scores (metric_key, period_start, period_end, user_id, score, eligible_sessions, last_eligible_at, calculated_at)
    VALUES (${metricKey}, ${period.start}::date, ${period.end}::date, ${userId}, ${Math.max(0, Number(score) || 0)}, ${Math.max(0, Number(eligibleSessions) || 0)}, ${lastEligibleAt || null}::timestamptz, NOW())
    ON CONFLICT (metric_key, period_start, user_id) DO UPDATE
    SET period_end = EXCLUDED.period_end, score = EXCLUDED.score, eligible_sessions = EXCLUDED.eligible_sessions,
        last_eligible_at = EXCLUDED.last_eligible_at, calculated_at = NOW()`;
}

/** Refreshes only the athlete and periods touched by a server-validated session. */
export async function refreshLeaderboardScores(database, userId, localDate) {
  const week = periodFor("weekly_xp", localDate), month = periodFor("monthly_xp", localDate);
  const [weekXp, monthXp, workout, bjj, consistency, volume] = await Promise.all([
    database.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS score, COUNT(*) FILTER (WHERE source_type IN ('workout', 'bjj'))::int AS sessions, MAX(occurred_at) AS last_at FROM xp_events WHERE user_id = ${userId} AND is_valid = TRUE AND invalidated_at IS NULL AND occurred_at >= ${nextDay(week.start)}::timestamptz AND occurred_at < (${nextDay(week.end)}::timestamptz + INTERVAL '1 day')`,
    database.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS score, COUNT(*) FILTER (WHERE source_type IN ('workout', 'bjj'))::int AS sessions, MAX(occurred_at) AS last_at FROM xp_events WHERE user_id = ${userId} AND is_valid = TRUE AND invalidated_at IS NULL AND occurred_at >= ${nextDay(month.start)}::timestamptz AND occurred_at < (${nextDay(month.end)}::timestamptz + INTERVAL '1 day')`,
    database.sql`SELECT COUNT(*)::int AS sessions, MAX(COALESCE(completed_at, updated_at)) AS last_at FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${week.start}::date AND ${week.end}::date`,
    database.sql`SELECT COALESCE(SUM(rounds_completed), 0)::bigint AS score, COUNT(*)::int AS sessions, MAX(completed_at) AS last_at FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${week.start}::date AND ${week.end}::date`,
    database.sql`SELECT COUNT(*)::int AS score, COUNT(*)::int AS sessions, MAX(local_training_date)::timestamptz AS last_at FROM (SELECT local_training_date FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${week.start}::date AND ${week.end}::date UNION SELECT local_training_date FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${week.start}::date AND ${week.end}::date) AS active_days`,
    database.sql`SELECT COALESCE(SUM(er.load_kg * er.reps), 0)::bigint AS score, COUNT(DISTINCT ws.id)::int AS sessions, MAX(COALESCE(ws.completed_at, ws.updated_at)) AS last_at FROM exercise_records er JOIN workout_sessions ws ON ws.user_id = er.user_id AND ws.id = er.workout_session_id WHERE er.user_id = ${userId} AND ws.eligible_for_xp = TRUE AND ws.invalidated_at IS NULL AND ws.local_training_date BETWEEN ${week.start}::date AND ${week.end}::date`,
  ]);
  await Promise.all([
    upsert(database, userId, "weekly_xp", week, weekXp[0]?.score, weekXp[0]?.sessions, weekXp[0]?.last_at),
    upsert(database, userId, "monthly_xp", month, monthXp[0]?.score, monthXp[0]?.sessions, monthXp[0]?.last_at),
    upsert(database, userId, "kettlebell_volume", week, volume[0]?.score, volume[0]?.sessions, volume[0]?.last_at),
    upsert(database, userId, "bjj_rounds", week, bjj[0]?.score, bjj[0]?.sessions, bjj[0]?.last_at),
    upsert(database, userId, "training_consistency", week, consistency[0]?.score, consistency[0]?.sessions, consistency[0]?.last_at),
  ]);
}

export async function weeklyChallengeStats(database, userId, period) {
  const [workouts, bjj, days, reps] = await Promise.all([
    database.sql`SELECT COUNT(*)::int AS value FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${period.start}::date AND ${period.end}::date`,
    database.sql`SELECT COALESCE(SUM(rounds_completed), 0)::int AS value FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${period.start}::date AND ${period.end}::date`,
    database.sql`SELECT COUNT(*)::int AS value FROM (SELECT local_training_date FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${period.start}::date AND ${period.end}::date UNION SELECT local_training_date FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${period.start}::date AND ${period.end}::date) AS dates`,
    database.sql`SELECT COALESCE(SUM(CASE WHEN payload->>'kettlebellReps' ~ '^\\d+$' THEN (payload->>'kettlebellReps')::int ELSE 0 END), 0)::int AS value FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL AND local_training_date BETWEEN ${period.start}::date AND ${period.end}::date`,
  ]);
  return { workouts: workouts[0]?.value, bjjRounds: bjj[0]?.value, trainingDays: days[0]?.value, kettlebellReps: reps[0]?.value };
}
