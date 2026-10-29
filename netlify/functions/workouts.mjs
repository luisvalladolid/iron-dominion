import { getDatabase } from "@netlify/database";
import { requireUser } from "./_auth.mjs";
import { syncProfile } from "./_profiles.mjs";
import { invalidateWorkoutEvents, processCompletedSession } from "./_progression-service.mjs";
import { safeTimeZone } from "./_gamification.mjs";

const database = getDatabase();

export default async (request) => {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new Response("Authentication required", { status: 401 });
  }

  if (request.method === "GET") {
    const rows = await database.sql`
      SELECT payload FROM workout_sessions
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
    `;
    return Response.json({ history: rows.map((row) => row.payload) });
  }

  if (request.method === "PUT") {
    const { history, replace = false, timeZone } = await request.json().catch(() => ({}));
    if (!Array.isArray(history) || history.length > 10000) {
      return new Response("Invalid workout history", { status: 400 });
    }

    await syncProfile(user);
    const timezone = safeTimeZone(timeZone);
    await database.sql`UPDATE user_profiles SET training_timezone = ${timezone}, updated_at = NOW() WHERE user_id = ${user.id}`;
    for (const session of history) {
      if (!session || typeof session.cloudId !== "string" || session.cloudId.length > 128) {
        return new Response("Every session needs a valid cloud id", { status: 400 });
      }
      await database.sql`
        INSERT INTO workout_sessions (id, user_id, payload, updated_at)
        VALUES (${session.cloudId}, ${user.id}, ${JSON.stringify(session)}::jsonb, NOW())
        ON CONFLICT (user_id, id) DO UPDATE
        SET payload = EXCLUDED.payload, updated_at = NOW()
      `;
      // The current program uses the configured 10 kg bell. Store the
      // aggregate server-side so volume is weight × reps, never a browser
      // supplied leaderboard score. The unique key makes retries idempotent.
      const reps = Math.max(0, Math.round(Number(session.kettlebellReps) || 0));
      await database.sql`
        INSERT INTO exercise_records (user_id, workout_session_id, exercise_code, set_number, reps, load_kg)
        VALUES (${user.id}, ${session.cloudId}, 'configured_kettlebell', 1, ${reps}, 10)
        ON CONFLICT (user_id, workout_session_id, exercise_code, set_number, side) DO UPDATE
        SET reps = EXCLUDED.reps, load_kg = EXCLUDED.load_kg, recorded_at = NOW()
      `;
      await processCompletedSession(database, {
        userId: user.id, type: "workout", sourceId: session.cloudId, timezone, completed: session.finished === true,
        durationSeconds: Math.round(Number(session.ms) / 1000), completedSets: Number(session.completed), totalSets: Number(session.total),
        reps: Number(session.kettlebellReps), completedAt: session.createdAt || session.date,
      });
    }
    if (replace) {
      const existing = await database.sql`
        SELECT id FROM workout_sessions WHERE user_id = ${user.id}
      `;
      const keep = new Set(history.map((session) => session.cloudId));
      for (const row of existing) {
        if (!keep.has(row.id)) {
          await invalidateWorkoutEvents(database, user.id, row.id, timezone);
          await database.sql`
            DELETE FROM workout_sessions
            WHERE user_id = ${user.id} AND id = ${row.id}
          `;
        }
      }
    }
    return Response.json({ saved: history.length });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
};

export const config = { path: "/api/workouts", method: ["GET", "PUT"] };
