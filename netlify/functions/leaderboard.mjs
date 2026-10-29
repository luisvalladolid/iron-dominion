import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";
import { challengeProgress, LEADERBOARD_METRICS, periodFor, publicAthlete } from "./_leaderboards.mjs";
import { weeklyChallengeStats } from "./_leaderboard-service.mjs";

const database = getDatabase();
const metricKey = (value) => LEADERBOARD_METRICS[value] ? value : "weekly_xp";

export default async (request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const metric = metricKey(url.searchParams.get("metric"));
  const period = periodFor(metric, url.searchParams.get("period"));
  const search = (url.searchParams.get("q") || "").trim().slice(0, 40);
  let user; try { user = await getUser(); } catch { user = null; }
  const searchTerm = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await database.sql`WITH ranked AS (
    SELECT lps.user_id, lps.score, lps.eligible_sessions, lps.last_eligible_at, up.display_name, up.leaderboard_name, up.leaderboard_show_avatar, up.identity_metadata,
      us.lifetime_xp, ROW_NUMBER() OVER (ORDER BY lps.score DESC, lps.eligible_sessions DESC, lps.last_eligible_at ASC NULLS LAST, lps.user_id ASC) AS rank
    FROM leaderboard_period_scores lps
    JOIN user_profiles up ON up.user_id = lps.user_id
    LEFT JOIN user_statistics us ON us.user_id = lps.user_id
    WHERE lps.metric_key = ${metric} AND lps.period_start = ${period.start}::date AND up.leaderboard_opt_in = TRUE
  ) SELECT * FROM ranked WHERE (${search} = '' OR COALESCE(leaderboard_name, 'Dominion Athlete') ILIKE ${searchTerm} ESCAPE '\\') ORDER BY rank LIMIT 100`;
  let current = null, challenges = [];
  if (user) {
    const [rankRows, preferenceRows, stats] = await Promise.all([
      database.sql`WITH ranked AS (SELECT lps.user_id, lps.score, lps.eligible_sessions, lps.last_eligible_at, up.display_name, up.leaderboard_name, up.leaderboard_show_avatar, up.identity_metadata, us.lifetime_xp, ROW_NUMBER() OVER (ORDER BY lps.score DESC, lps.eligible_sessions DESC, lps.last_eligible_at ASC NULLS LAST, lps.user_id ASC) AS rank FROM leaderboard_period_scores lps JOIN user_profiles up ON up.user_id = lps.user_id LEFT JOIN user_statistics us ON us.user_id = lps.user_id WHERE lps.metric_key = ${metric} AND lps.period_start = ${period.start}::date AND up.leaderboard_opt_in = TRUE) SELECT * FROM ranked WHERE user_id = ${user.id}`,
      database.sql`SELECT leaderboard_opt_in FROM user_profiles WHERE user_id = ${user.id}`,
      weeklyChallengeStats(database, user.id, periodFor("weekly_xp", undefined)),
    ]);
    current = preferenceRows[0]?.leaderboard_opt_in ? (rankRows[0] ? publicAthlete(rankRows[0]) : null) : { private: true };
    challenges = challengeProgress(stats);
  }
  return Response.json({ metric, metricOptions: Object.entries(LEADERBOARD_METRICS).map(([key, value]) => ({ key, label: value.label, period: value.period })), period, definition: LEADERBOARD_METRICS[metric].definition, standings: rows.map(publicAthlete), current, challenges }, { headers: { "Cache-Control": "private, max-age=30", Vary: "Cookie" } });
};
export const config = { path: "/api/leaderboard", method: ["GET"] };
