import { getDatabase } from "@netlify/database";
import { requireUser } from "./_auth.mjs";
import { syncProfile } from "./_profiles.mjs";

const database = getDatabase();
const cleanName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export default async (request) => {
  let user; try { user = await requireUser(); } catch { return new Response("Authentication required", { status: 401 }); }
  await syncProfile(user);
  if (request.method === "GET") {
    const [profile] = await database.sql`SELECT leaderboard_opt_in, leaderboard_name, leaderboard_show_avatar FROM user_profiles WHERE user_id = ${user.id}`;
    return Response.json({ optIn: Boolean(profile?.leaderboard_opt_in), nickname: profile?.leaderboard_name || "", showAvatar: Boolean(profile?.leaderboard_show_avatar) });
  }
  if (request.method !== "PUT") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, PUT" } });
  const body = await request.json().catch(() => ({}));
  const nickname = cleanName(body.nickname);
  if (body.optIn !== true && body.optIn !== false) return new Response("Invalid privacy preference", { status: 400 });
  if (nickname && (nickname.length < 2 || nickname.length > 40)) return new Response("Nickname must be 2–40 characters", { status: 400 });
  await database.sql`UPDATE user_profiles SET leaderboard_opt_in = ${body.optIn}, leaderboard_name = ${nickname || null}, leaderboard_show_avatar = ${body.showAvatar === true}, updated_at = NOW() WHERE user_id = ${user.id}`;
  return Response.json({ optIn: body.optIn, nickname, showAvatar: body.showAvatar === true });
};
export const config = { path: "/api/leaderboard-preferences", method: ["GET", "PUT"] };
