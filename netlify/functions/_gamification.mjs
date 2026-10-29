/** Server-owned progression policy. Do not duplicate these values in browser code. */
export const XP_RULES = Object.freeze({
  eligibleKettlebellWorkout: 50,
  eligibleBjjSession: 50,
  dailyTrainingBonus: 20,
  threeActiveDaysWeeklyBonus: 50,
  sevenActiveDaysWeeklyBonus: 100,
  standardDailyCap: 200,
  minKettlebellSeconds: 300,
  minBjjSeconds: 180,
  maxSessionSeconds: 4 * 60 * 60,
});

export const ACHIEVEMENT_DEFINITIONS = Object.freeze([
  { key: "first_blood", name: "First Blood", description: "Complete your first eligible training session.", metric: "eligibleSessions", threshold: 1, xp: 50 },
  { key: "iron_discipline", name: "Iron Discipline", description: "Log training on 7 active local training days.", metric: "activeDays", threshold: 7, xp: 100 },
  { key: "century_club", name: "Century Club", description: "Log 100 kettlebell repetitions in eligible sessions.", metric: "kettlebellReps", threshold: 100, xp: 100 },
  { key: "mat_warrior", name: "Mat Warrior", description: "Complete 50 BJJ rounds in eligible sessions.", metric: "bjjRounds", threshold: 50, xp: 100 },
  { key: "relentless", name: "Relentless", description: "Log 30 active local training days.", metric: "activeDays", threshold: 30, xp: 200 },
  { key: "iron_veteran", name: "Iron Veteran", description: "Complete 100 eligible kettlebell workouts.", metric: "eligibleWorkouts", threshold: 100, xp: 250 },
]);

export const RANKS = Object.freeze([
  { level: 50, name: "Dominion Elite" }, { level: 35, name: "Champion" }, { level: 20, name: "Gladiator" },
  { level: 10, name: "Warrior" }, { level: 5, name: "Soldier" }, { level: 1, name: "Recruit" },
]);

// Cumulative XP required for level N: 100 × (N − 1)². Level 1 begins at 0.
export const xpForLevel = (level) => 100 * Math.max(0, level - 1) ** 2;
export function progressionForXp(rawXp) {
  const xp = Math.max(0, Number(rawXp) || 0);
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1);
  const nextLevelXp = xpForLevel(level + 1);
  const currentLevelXp = xpForLevel(level);
  return { xp, level, rank: RANKS.find((entry) => level >= entry.level).name, currentLevelXp, nextLevelXp, progress: nextLevelXp === currentLevelXp ? 1 : (xp - currentLevelXp) / (nextLevelXp - currentLevelXp) };
}

export function safeTimeZone(value) {
  try { Intl.DateTimeFormat("en-CA", { timeZone: value || "UTC" }); return value || "UTC"; } catch { return "UTC"; }
}
export function localTrainingDate(value, timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timezone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
}
export function weekStart(localDate) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function validateSession({ type, completed = false, durationSeconds, completedSets = 0, totalSets = 0, reps = 0, rounds = 0, completedAt = new Date(), now = Date.now() }) {
  const duration = Math.round(Number(durationSeconds));
  const isKettlebell = type === "workout";
  const minDuration = isKettlebell ? XP_RULES.minKettlebellSeconds : XP_RULES.minBjjSeconds;
  const completedTimestamp = new Date(completedAt).valueOf();
  const future = completedTimestamp > now + 10 * 60 * 1000;
  const suspicious = !Number.isFinite(completedTimestamp) || duration > XP_RULES.maxSessionSeconds || future || (isKettlebell && (completedSets > totalSets || reps < 0 || reps > Math.max(1, completedSets) * 100)) || (!isKettlebell && rounds > 150);
  const eligible = completed === true && !suspicious && duration >= minDuration && (isKettlebell ? completedSets > 0 && totalSets >= completedSets : rounds > 0);
  return { eligible, suspicious, duration };
}
export function cappedStandardXp(existingForDate, proposed) { return Math.max(0, Math.min(proposed, XP_RULES.standardDailyCap - Math.max(0, existingForDate))); }
export const sessionEventKey = (type, sourceId) => `session:${type}:${sourceId}`;
export const leaderboardEligible = (event) => event?.is_valid === true && !event?.invalidated_at;
export function achievementProgress(stats, unlocked = new Set()) {
  return ACHIEVEMENT_DEFINITIONS.map((achievement) => ({ ...achievement, value: Number(stats[achievement.metric]) || 0, unlocked: unlocked.has(achievement.key) }));
}
