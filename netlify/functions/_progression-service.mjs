import { ACHIEVEMENT_DEFINITIONS, XP_RULES, achievementProgress, cappedStandardXp, localTrainingDate, progressionForXp, safeTimeZone, sessionEventKey, validateSession, weekStart } from "./_gamification.mjs";
import { refreshLeaderboardScores } from "./_leaderboard-service.mjs";

const sqlDate = (date) => new Date(`${date}T12:00:00Z`);
const addDays = (date, days) => { const value = sqlDate(date); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

async function insertXp(database, userId, { eventKey, sourceType, sourceId = null, amount, localDate, metadata = {} }) {
  return database.sql`INSERT INTO xp_events (user_id, event_key, source_type, source_id, amount, occurred_at, metadata)
    VALUES (${userId}, ${eventKey}, ${sourceType}, ${sourceId}, ${amount}, NOW(), ${JSON.stringify({ localDate, ...metadata })}::jsonb)
    ON CONFLICT (user_id, event_key) DO NOTHING RETURNING id`;
}

export async function refreshStatistics(database, userId, timezone) {
  const [workoutRows, bjjRows, activeRows, xpRows] = await Promise.all([
    database.sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(CASE WHEN payload->>'kettlebellReps' ~ '^\\d+$' THEN (payload->>'kettlebellReps')::bigint ELSE 0 END), 0)::bigint AS reps, COALESCE(SUM(CASE WHEN payload->>'ms' ~ '^\\d+$' THEN ((payload->>'ms')::bigint / 1000) ELSE 0 END), 0)::bigint AS seconds FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL`,
    database.sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(rounds_completed), 0)::bigint AS rounds, COALESCE(SUM(active_training_seconds), 0)::bigint AS seconds FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL`,
    database.sql`SELECT local_training_date FROM workout_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL UNION SELECT local_training_date FROM bjj_sessions WHERE user_id = ${userId} AND eligible_for_xp = TRUE AND invalidated_at IS NULL`,
    database.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS xp FROM xp_events WHERE user_id = ${userId} AND is_valid = TRUE AND invalidated_at IS NULL`,
  ]);
  const workout = workoutRows[0] || {}, bjj = bjjRows[0] || {};
  const activeDates = activeRows.map((row) => String(row.local_training_date).slice(0, 10)).filter(Boolean).sort();
  const activeSet = new Set(activeDates);
  let streak = 0, cursor = localTrainingDate(new Date(), timezone);
  while (activeSet.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  const stats = {
    eligibleWorkouts: Number(workout.count || 0), bjjSessions: Number(bjj.count || 0), eligibleSessions: Number(workout.count || 0) + Number(bjj.count || 0),
    kettlebellReps: Number(workout.reps || 0), bjjRounds: Number(bjj.rounds || 0), activeDays: activeDates.length,
    trainingSeconds: Number(workout.seconds || 0) + Number(bjj.seconds || 0), currentStreak: streak, lifetimeXp: Number(xpRows[0]?.xp || 0), activeDates,
  };
  await database.sql`INSERT INTO user_statistics (user_id, lifetime_xp, workout_count, bjj_session_count, training_seconds, current_streak_days, longest_streak_days, last_training_date, updated_at)
    VALUES (${userId}, ${stats.lifetimeXp}, ${stats.eligibleWorkouts}, ${stats.bjjSessions}, ${stats.trainingSeconds}, ${stats.currentStreak}, ${stats.currentStreak}, ${activeDates.at(-1) || null}::date, NOW())
    ON CONFLICT (user_id) DO UPDATE SET lifetime_xp = EXCLUDED.lifetime_xp, workout_count = EXCLUDED.workout_count, bjj_session_count = EXCLUDED.bjj_session_count, training_seconds = EXCLUDED.training_seconds, current_streak_days = EXCLUDED.current_streak_days, longest_streak_days = GREATEST(user_statistics.longest_streak_days, EXCLUDED.current_streak_days), last_training_date = EXCLUDED.last_training_date, updated_at = NOW()`;
  return stats;
}

async function awardAchievements(database, userId, stats, localDate) {
  const unlockedRows = await database.sql`SELECT achievement_key FROM user_achievements WHERE user_id = ${userId}`;
  const unlocked = new Set(unlockedRows.map((row) => row.achievement_key));
  for (const achievement of ACHIEVEMENT_DEFINITIONS) {
    if (unlocked.has(achievement.key) || stats[achievement.metric] < achievement.threshold) continue;
    await insertXp(database, userId, { eventKey: `achievement:${achievement.key}`, sourceType: "achievement", amount: achievement.xp, localDate, metadata: { achievementKey: achievement.key } });
    await database.sql`INSERT INTO user_achievements (user_id, achievement_key) VALUES (${userId}, ${achievement.key}) ON CONFLICT (user_id, achievement_key) DO NOTHING`;
  }
}

export async function processCompletedSession(database, { userId, type, sourceId, timezone, completed = false, durationSeconds, completedSets, totalSets, reps, rounds, completedAt }) {
  const completedTime = new Date(completedAt || new Date());
  const safeCompletedTime = Number.isNaN(completedTime.valueOf()) ? new Date() : completedTime;
  const localDate = localTrainingDate(safeCompletedTime, safeTimeZone(timezone));
  const validation = validateSession({ type, completed, durationSeconds, completedSets, totalSets, reps, rounds, completedAt });
  const sourceType = type === "workout" ? "workout" : "bjj";
  if (type === "workout") {
    await database.sql`UPDATE workout_sessions SET eligible_for_xp = ${validation.eligible}, local_training_date = ${localDate}::date, suspicious_at = ${validation.suspicious ? new Date().toISOString() : null}::timestamptz WHERE user_id = ${userId} AND id = ${sourceId}`;
  } else {
    await database.sql`UPDATE bjj_sessions SET eligible_for_xp = ${validation.eligible}, local_training_date = ${localDate}::date, suspicious_at = ${validation.suspicious ? new Date().toISOString() : null}::timestamptz WHERE user_id = ${userId} AND id = ${sourceId}::uuid`;
  }
  if (!validation.eligible) {
    await database.sql`UPDATE xp_events SET is_valid = FALSE, invalidated_at = NOW() WHERE user_id = ${userId} AND source_type = ${sourceType} AND source_id = ${sourceId} AND is_valid = TRUE`;
    const stats = await refreshStatistics(database, userId, timezone);
    await refreshLeaderboardScores(database, userId, localDate);
    return { eligible: false, suspicious: validation.suspicious, stats };
  }
  const standardRows = await database.sql`SELECT COALESCE(SUM(amount), 0)::int AS total FROM xp_events WHERE user_id = ${userId} AND source_type IN ('workout', 'bjj') AND is_valid = TRUE AND invalidated_at IS NULL AND metadata->>'localDate' = ${localDate}`;
  const proposed = type === "workout" ? XP_RULES.eligibleKettlebellWorkout : XP_RULES.eligibleBjjSession;
  const sessionAmount = cappedStandardXp(standardRows[0]?.total || 0, proposed);
  if (sessionAmount > 0) await insertXp(database, userId, { eventKey: sessionEventKey(sourceType, sourceId), sourceType, sourceId, amount: sessionAmount, localDate, metadata: { durationSeconds: validation.duration } });
  await insertXp(database, userId, { eventKey: `daily-training:${localDate}`, sourceType: "challenge", amount: XP_RULES.dailyTrainingBonus, localDate, metadata: { kind: "daily_training" } });
  let stats = await refreshStatistics(database, userId, timezone);
  const start = weekStart(localDate), end = addDays(start, 6), activeThisWeek = stats.activeDates.filter((date) => date >= start && date <= end).length;
  if (activeThisWeek >= 3) await insertXp(database, userId, { eventKey: `weekly-training-3:${start}`, sourceType: "challenge", amount: XP_RULES.threeActiveDaysWeeklyBonus, localDate, metadata: { kind: "weekly_3_days" } });
  if (activeThisWeek >= 7) await insertXp(database, userId, { eventKey: `weekly-training-7:${start}`, sourceType: "challenge", amount: XP_RULES.sevenActiveDaysWeeklyBonus, localDate, metadata: { kind: "weekly_7_days" } });
  await awardAchievements(database, userId, stats, localDate);
  stats = await refreshStatistics(database, userId, timezone);
  // Competition cache is written only after the source session has passed
  // server-side validation and the idempotent XP ledger has been updated.
  await refreshLeaderboardScores(database, userId, localDate);
  const unlockedRows = await database.sql`SELECT achievement_key FROM user_achievements WHERE user_id = ${userId}`;
  return { eligible: true, suspicious: false, localDate, stats, progression: progressionForXp(stats.lifetimeXp), achievements: achievementProgress(stats, new Set(unlockedRows.map((row) => row.achievement_key))) };
}

export async function invalidateWorkoutEvents(database, userId, sourceId, timezone) {
  const sourceRows = await database.sql`SELECT local_training_date FROM workout_sessions WHERE user_id = ${userId} AND id = ${sourceId}`;
  await database.sql`UPDATE workout_sessions SET eligible_for_xp = FALSE, invalidated_at = COALESCE(invalidated_at, NOW()) WHERE user_id = ${userId} AND id = ${sourceId}`;
  await database.sql`UPDATE xp_events SET is_valid = FALSE, invalidated_at = NOW() WHERE user_id = ${userId} AND source_type = 'workout' AND source_id = ${sourceId} AND is_valid = TRUE`;
  const stats = await refreshStatistics(database, userId, timezone);
  if (sourceRows[0]?.local_training_date) await refreshLeaderboardScores(database, userId, String(sourceRows[0].local_training_date).slice(0, 10));
  return stats;
}
