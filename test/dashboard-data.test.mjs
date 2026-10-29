import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboard } from "../netlify/functions/_dashboard-data.mjs";
import { userRoles } from "../netlify/functions/_roles.mjs";

test("buildDashboard derives athlete totals and current streak from athlete data", () => {
  const data = buildDashboard({ user: { email: "athlete@example.com", displayName: "Ari" }, now: new Date("2026-10-29T12:00:00Z"), weeklyXp: 170, workouts: [{ date: "2026-10-29", ms: 600000, kettlebellReps: 40, day: "A" }, { date: "2026-10-28", ms: 1200000, kettlebellReps: 20, day: "B" }], bjjSessions: [{ started_at: "2026-10-29T10:00:00Z", active_training_seconds: 300, rounds_completed: 3 }] });
  assert.equal(data.summary.completedWorkouts, 2);
  assert.equal(data.summary.kettlebellReps, 60);
  assert.equal(data.summary.bjjRounds, 3);
  assert.equal(data.summary.trainingMinutes, 35);
  assert.equal(data.summary.currentStreak, 2);
  assert.equal(data.summary.weeklyXp, 170);
});

test("userRoles accepts Netlify request and event metadata shapes", () => {
  assert.deepEqual(userRoles({ app_metadata: { roles: ["premium_member"] } }), ["premium_member"]);
  assert.deepEqual(userRoles({ appMetadata: { roles: ["coach"] } }), ["coach"]);
});
