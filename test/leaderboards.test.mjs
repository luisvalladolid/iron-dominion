import test from "node:test";
import assert from "node:assert/strict";
import { challengeProgress, periodFor, publicAthlete, rankScores } from "../netlify/functions/_leaderboards.mjs";

test("leaderboard ranks use stable score, activity, timestamp, then opaque-id tie breaks", () => {
  const ranked = rankScores([
    { user_id: "z", score: 100, eligible_sessions: 2, last_eligible_at: "2026-10-10T10:00:00Z" },
    { user_id: "b", score: 100, eligible_sessions: 3, last_eligible_at: "2026-10-10T11:00:00Z" },
    { user_id: "a", score: 100, eligible_sessions: 3, last_eligible_at: "2026-10-10T10:00:00Z" },
  ]);
  assert.deepEqual(ranked.map((row) => row.user_id), ["a", "b", "z"]);
  assert.deepEqual(ranked.map((row) => row.rank), [1, 2, 3]);
});

test("weekly and monthly boards reset at their explicit calendar periods", () => {
  assert.deepEqual(periodFor("weekly_xp", "2026-10-29"), { start: "2026-10-26", end: "2026-11-01", label: "Oct 26 – Nov 1, 2026" });
  assert.deepEqual(periodFor("monthly_xp", "2026-10-29"), { start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
  assert.equal(periodFor("weekly_xp", "2026-11-02").start, "2026-11-02");
});

test("public athlete projection keeps opt-in profiles anonymous to private fields", () => {
  const athlete = publicAthlete({ user_id: "internal-user-id", email: "private@example.com", display_name: "Private Name", leaderboard_name: "Iron Fox", leaderboard_show_avatar: false, identity_metadata: { avatar_url: "https://private.example/avatar" }, lifetime_xp: 1600, score: 250, rank: 4 });
  assert.deepEqual(athlete, { rank: 4, name: "Iron Fox", avatarUrl: null, level: 5, score: 250 });
  assert.equal(JSON.stringify(athlete).includes("private@example.com"), false);
  assert.equal(JSON.stringify(athlete).includes("internal-user-id"), false);
  assert.equal(publicAthlete({ display_name: "Real Name", score: 1, rank: 1 }).name, "Dominion Athlete");
});

test("weekly challenges are derived from validated private totals", () => {
  const challenges = challengeProgress({ workouts: 3, bjjRounds: 10, trainingDays: 5, kettlebellReps: 99 });
  assert.deepEqual(challenges.map((item) => item.completed), [true, true, true, false]);
});
