import { getDatabase } from "@netlify/database";
import { requireUser } from "./_auth.mjs";
import { syncProfile } from "./_profiles.mjs";
import { processCompletedSession } from "./_progression-service.mjs";
import { safeTimeZone } from "./_gamification.mjs";
const database = getDatabase();
export default async (request) => {
  let user; try { user = await requireUser(); } catch { return new Response("Authentication required", { status: 401 }); }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const body = await request.json().catch(() => null);
  const activeTrainingSeconds = Math.round(Number(body?.activeTrainingSeconds));
  const roundsCompleted = Math.round(Number(body?.roundsCompleted));
  if (!body?.id || typeof body.id !== "string" || !Number.isFinite(activeTrainingSeconds) || activeTrainingSeconds < 1 || !Number.isFinite(roundsCompleted) || roundsCompleted < 0) return new Response("Invalid BJJ session", { status: 400 });
  await syncProfile(user);
  const timezone = safeTimeZone(body?.timeZone);
  await database.sql`UPDATE user_profiles SET training_timezone = ${timezone}, updated_at = NOW() WHERE user_id = ${user.id}`;
  const saved = await database.sql`INSERT INTO bjj_sessions (id, user_id, started_at, completed_at, active_training_seconds, rounds_completed, configuration) VALUES (${body.id}::uuid, ${user.id}, ${body.startedAt || new Date().toISOString()}::timestamptz, NOW(), ${activeTrainingSeconds}, ${roundsCompleted}, ${JSON.stringify(body.configuration || {})}::jsonb) ON CONFLICT (id) DO UPDATE SET active_training_seconds = EXCLUDED.active_training_seconds, rounds_completed = EXCLUDED.rounds_completed, completed_at = NOW(), configuration = EXCLUDED.configuration WHERE bjj_sessions.user_id = EXCLUDED.user_id RETURNING id`;
  if (!saved.length) return new Response("Session identifier belongs to another athlete", { status: 409 });
  const progression = await processCompletedSession(database, { userId: user.id, type: "bjj", sourceId: body.id, timezone, completed: true, durationSeconds: activeTrainingSeconds, rounds: roundsCompleted, completedAt: body.startedAt || new Date() });
  return Response.json({ saved: true, progression });
};
export const config = { path: "/api/bjj-sessions", method: ["POST"] };
