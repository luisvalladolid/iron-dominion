import test from "node:test";
import assert from "node:assert/strict";
import { ACHIEVEMENT_DEFINITIONS, XP_RULES, achievementProgress, cappedStandardXp, leaderboardEligible, localTrainingDate, progressionForXp, sessionEventKey, validateSession } from "../netlify/functions/_gamification.mjs";

test("session idempotency keys are stable across retries", () => {
  assert.equal(sessionEventKey("workout", "same-id"), sessionEventKey("workout", "same-id"));
  assert.notEqual(sessionEventKey("workout", "same-id"), sessionEventKey("bjj", "same-id"));
});

test("local training dates honor athlete timezone boundaries", () => {
  assert.equal(localTrainingDate("2026-01-01T00:30:00Z", "America/Los_Angeles"), "2025-12-31");
  assert.equal(localTrainingDate("2026-01-01T00:30:00Z", "Asia/Manila"), "2026-01-01");
});

test("standard XP cannot exceed the daily cap", () => {
  assert.equal(cappedStandardXp(150, XP_RULES.eligibleKettlebellWorkout), 50);
  assert.equal(cappedStandardXp(200, XP_RULES.eligibleBjjSession), 0);
});

test("invalid, deleted, and suspicious sessions are excluded from rewards and rankings", () => {
  assert.equal(validateSession({ type: "workout", completed: true, durationSeconds: 60, completedSets: 1, totalSets: 1 }).eligible, false);
  assert.equal(validateSession({ type: "workout", completed: true, durationSeconds: 600, completedSets: 1, totalSets: 1, reps: 101 }).suspicious, true);
  assert.equal(validateSession({ type: "bjj", completed: true, durationSeconds: 300, rounds: 151 }).suspicious, true);
  assert.equal(leaderboardEligible({ is_valid: true, invalidated_at: null }), true);
  assert.equal(leaderboardEligible({ is_valid: false, invalidated_at: null }), false);
  assert.equal(leaderboardEligible({ is_valid: true, invalidated_at: "2026-01-01" }), false);
});

test("achievement thresholds and ranks use central policy", () => {
  const progress = achievementProgress({ eligibleSessions: 1, activeDays: 30, kettlebellReps: 100, bjjRounds: 50, eligibleWorkouts: 100 });
  assert.equal(progress.filter((item) => item.value >= item.threshold).length, ACHIEVEMENT_DEFINITIONS.length);
  assert.deepEqual(progressionForXp(1600).rank, "Soldier");
  assert.equal(progressionForXp(8100).rank, "Warrior");
});
