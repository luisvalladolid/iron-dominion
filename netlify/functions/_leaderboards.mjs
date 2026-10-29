import { progressionForXp } from "./_gamification.mjs";

export const LEADERBOARD_METRICS = Object.freeze({
  weekly_xp: { label: "Weekly Dominion XP", period: "week", unit: "XP", definition: "Valid Dominion XP earned during the Monday–Sunday training week." },
  monthly_xp: { label: "Monthly Dominion XP", period: "month", unit: "XP", definition: "Valid Dominion XP earned during the calendar month." },
  kettlebell_volume: { label: "Kettlebell volume", period: "week", unit: "kg", definition: "Logged kettlebell load × repetitions from eligible completed workouts." },
  bjj_rounds: { label: "BJJ rounds", period: "week", unit: "rounds", definition: "Completed timer rounds from eligible BJJ sessions; not competitive wins." },
  training_consistency: { label: "Training consistency", period: "week", unit: "days", definition: "Distinct local training days with an eligible completed session." },
});

const dateAtNoon = (value) => new Date(`${value}T12:00:00.000Z`);
const iso = (date) => date.toISOString().slice(0, 10);
export function periodFor(metricKey, requestedStart, now = new Date()) {
  const metric = LEADERBOARD_METRICS[metricKey] || LEADERBOARD_METRICS.weekly_xp;
  let date = requestedStart && /^\d{4}-\d{2}-\d{2}$/.test(requestedStart) ? dateAtNoon(requestedStart) : new Date(now);
  if (Number.isNaN(date.valueOf())) date = new Date(now);
  if (metric.period === "month") {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
    return { start: iso(start), end: iso(end), label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  const day = dateAtNoon(iso(date));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const end = new Date(day); end.setUTCDate(end.getUTCDate() + 6);
  return { start: iso(day), end: iso(end), label: `${day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` };
}

/** Stable published order: score, eligible-session count, earlier final effort, then opaque account id. */
export function rankScores(rows) {
  return [...rows].sort((a, b) => Number(b.score) - Number(a.score)
    || Number(b.eligible_sessions) - Number(a.eligible_sessions)
    || String(a.last_eligible_at || "9999-12-31").localeCompare(String(b.last_eligible_at || "9999-12-31"))
    || String(a.user_id).localeCompare(String(b.user_id)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function publicAthlete(row) {
  const xp = Number(row.lifetime_xp || 0);
  // A real profile name is never a public fallback. Opted-in athletes may
  // choose a nickname; otherwise the board keeps them anonymous.
  return { rank: row.rank, name: row.leaderboard_name || "Dominion Athlete", avatarUrl: row.leaderboard_show_avatar ? (row.identity_metadata?.avatar_url || null) : null, level: progressionForXp(xp).level, score: Number(row.score || 0) };
}

export const CHALLENGES = Object.freeze([
  { slug: "three-workouts", title: "Three workouts this week", target: 3, metric: "workouts", unit: "workouts" },
  { slug: "ten-bjj-rounds", title: "Ten BJJ rounds this week", target: 10, metric: "bjjRounds", unit: "rounds" },
  { slug: "five-training-days", title: "Train on five distinct days", target: 5, metric: "trainingDays", unit: "days" },
  { slug: "hundred-kettlebell-reps", title: "One hundred kettlebell reps", target: 100, metric: "kettlebellReps", unit: "reps" },
]);

export function challengeProgress(stats = {}) {
  return CHALLENGES.map((challenge) => ({ ...challenge, value: Number(stats[challenge.metric] || 0), completed: Number(stats[challenge.metric] || 0) >= challenge.target }));
}
