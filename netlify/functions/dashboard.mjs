import { getDatabase } from "@netlify/database";
import { requireUser, userRoles } from "./_auth.mjs";
import { syncProfile } from "./_profiles.mjs";
import { buildDashboard } from "./_dashboard-data.mjs";
import { achievementProgress, progressionForXp } from "./_gamification.mjs";

const database = getDatabase();

export default async () => {
  let user;
  try { user = await requireUser(); } catch { return new Response("Authentication required", { status: 401 }); }
  await syncProfile(user);
  const profileRows = await database.sql`SELECT display_name, identity_metadata, training_timezone FROM user_profiles WHERE user_id = ${user.id}`;
  const [workoutRows, bjjRows, achievementRows, snapshotRows, entitlementRows, statisticsRows, weeklyXpRows] = await Promise.all([
    database.sql`SELECT payload, eligible_for_xp FROM workout_sessions WHERE user_id = ${user.id} ORDER BY updated_at DESC`,
    database.sql`SELECT started_at, completed_at, active_training_seconds, rounds_completed, eligible_for_xp FROM bjj_sessions WHERE user_id = ${user.id} ORDER BY started_at DESC`,
    database.sql`SELECT ua.achievement_key, a.name, a.description, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.achievement_key = ua.achievement_key WHERE ua.user_id = ${user.id} ORDER BY ua.unlocked_at DESC`,
    database.sql`SELECT id FROM leaderboard_snapshots ORDER BY generated_at DESC LIMIT 1`,
    database.sql`SELECT 1 FROM subscription_entitlements WHERE user_id = ${user.id} AND status IN ('active', 'trialing', 'grace_period') AND (ends_at IS NULL OR ends_at > NOW()) LIMIT 1`,
    database.sql`SELECT lifetime_xp, current_streak_days, workout_count, bjj_session_count, training_seconds FROM user_statistics WHERE user_id = ${user.id}`,
    database.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS xp FROM xp_events WHERE user_id = ${user.id} AND is_valid = TRUE AND invalidated_at IS NULL AND occurred_at >= date_trunc('week', NOW())`,
  ]);
  const snapshot = snapshotRows[0];
  let ranking = null, leaderboard = [];
  if (snapshot) {
    [ranking, leaderboard] = await Promise.all([
      database.sql`SELECT rank_position FROM leaderboard_rankings WHERE snapshot_id = ${snapshot.id} AND user_id = ${user.id} LIMIT 1`.then((rows) => rows[0] || null),
      database.sql`SELECT lr.rank_position, lr.score, up.display_name FROM leaderboard_rankings lr JOIN user_profiles up ON up.user_id = lr.user_id WHERE lr.snapshot_id = ${snapshot.id} ORDER BY lr.rank_position LIMIT 5`,
    ]);
  }
  const profile = profileRows[0] || {};
  const metadata = profile.identity_metadata || {};
  const statistics = statisticsRows[0] || {};
  const parsedWorkouts = workoutRows.map((row) => ({ ...(typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload), eligibleForXp: row.eligible_for_xp }));
  const achievementStats = {
    eligibleWorkouts: Number(statistics.workout_count || 0), bjjSessions: Number(statistics.bjj_session_count || 0),
    eligibleSessions: Number(statistics.workout_count || 0) + Number(statistics.bjj_session_count || 0),
    kettlebellReps: parsedWorkouts.filter((row) => row.eligibleForXp).reduce((total, row) => total + Number(row.kettlebellReps || 0), 0),
    bjjRounds: bjjRows.filter((row) => row.eligible_for_xp).reduce((total, row) => total + Number(row.rounds_completed || 0), 0), activeDays: 0,
  };
  const unlocked = new Set(achievementRows.map((row) => row.achievement_key));
  const activeDayRows = await database.sql`SELECT local_training_date FROM workout_sessions WHERE user_id = ${user.id} AND eligible_for_xp = TRUE AND invalidated_at IS NULL UNION SELECT local_training_date FROM bjj_sessions WHERE user_id = ${user.id} AND eligible_for_xp = TRUE AND invalidated_at IS NULL`;
  achievementStats.activeDays = activeDayRows.length;
  const progression = { ...progressionForXp(statistics.lifetime_xp || 0), currentStreak: Number(statistics.current_streak_days || 0), trainingTimezone: profile.training_timezone || "UTC" };
  return Response.json(buildDashboard({
    // Roles support existing premium members; a current provider entitlement
    // is the billing source of truth for new premium access.
    user: { email: user.email, displayName: profile.display_name, identityMetadata: metadata, membershipTier: userRoles(user).includes("premium_member") || entitlementRows.length ? "Premium" : "Member" },
    workouts: parsedWorkouts, bjjSessions: bjjRows,
    achievements: achievementRows.map((row) => ({ key: row.achievement_key, name: row.name, description: row.description, unlockedAt: row.unlocked_at })), achievementProgress: achievementProgress(achievementStats, unlocked), progression, weeklyXp: Number(weeklyXpRows[0]?.xp || 0), ranking, leaderboard,
  }));
};
export const config = { path: "/api/dashboard", method: ["GET"] };
