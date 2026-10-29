const dayKey = (value) => new Date(value).toISOString().slice(0, 10);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function buildDashboard({ user, workouts = [], bjjSessions = [], achievements = [], achievementProgress: earnedProgress = [], progression = null, weeklyXp = 0, ranking = null, leaderboard = [], now = new Date() }) {
  const activities = [
    ...workouts.map((entry) => ({
      type: "kettlebell", date: entry.completedAt || entry.createdAt || entry.date,
      minutes: number(entry.ms) / 60000, reps: number(entry.kettlebellReps), title: entry.day ? `Kettlebell · Day ${entry.day}` : "Kettlebell workout",
    })),
    ...bjjSessions.map((entry) => ({
      type: "bjj", date: entry.completed_at || entry.started_at,
      minutes: number(entry.active_training_seconds) / 60, rounds: number(entry.rounds_completed), title: "Dominion Rounds",
    })),
  ].filter((entry) => entry.date && !Number.isNaN(new Date(entry.date).valueOf()));
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  const today = dayKey(now);
  const daySet = new Set(activities.map((entry) => dayKey(entry.date)));
  let streak = 0;
  for (let cursor = new Date(`${today}T00:00:00.000Z`); daySet.has(dayKey(cursor)); cursor.setUTCDate(cursor.getUTCDate() - 1)) streak++;
  const activityByDay = Object.fromEntries([...daySet].map((day) => [day, activities.filter((entry) => dayKey(entry.date) === day).length]));
  const trainingLevel = user.trainingLevel || user.identityMetadata?.training_level || "Recruit";
  return {
    profile: { displayName: user.displayName || user.email?.split("@")[0] || "Athlete", avatarUrl: user.avatarUrl || user.identityMetadata?.avatar_url || null, membershipTier: user.membershipTier || "Member", trainingLevel },
    summary: {
      completedWorkouts: workouts.length, kettlebellReps: workouts.reduce((total, entry) => total + number(entry.kettlebellReps), 0),
      bjjRounds: bjjSessions.reduce((total, entry) => total + number(entry.rounds_completed), 0),
      trainingMinutes: Math.round(activities.reduce((total, entry) => total + entry.minutes, 0)), currentStreak: progression?.currentStreak ?? streak, weeklyXp,
      leaderboardPosition: ranking?.rank_position || null,
    },
    activity: activities.map((entry) => ({ ...entry, date: new Date(entry.date).toISOString() })), activityByDay,
    personalRecords: { kettlebell: workouts.filter((entry) => number(entry.kettlebellReps) > 0).sort((a, b) => number(b.kettlebellReps) - number(a.kettlebellReps)).slice(0, 3), bjj: bjjSessions.filter((entry) => number(entry.rounds_completed) > 0).sort((a, b) => number(b.rounds_completed) - number(a.rounds_completed)).slice(0, 3) },
    achievements, achievementProgress: earnedProgress, progression, leaderboard,
  };
}
