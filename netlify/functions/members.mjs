import { admin, getUser } from "@netlify/identity";
import { isAdministrator } from "./_auth.mjs";

export default async () => {
  const user = await getUser();
  if (!user) return new Response("Authentication required", { status: 401 });
  if (!isAdministrator(user)) return new Response("Administrator access required", { status: 403 });

  const listedUsers = await admin.listUsers();
  const users = Array.isArray(listedUsers) ? listedUsers : listedUsers.users || [];
  const members = users
    .filter((member) => member.confirmedAt)
    .map((member) => ({
      name: member.userMetadata?.fullName || member.user_metadata?.full_name || "",
      email: member.email,
      joinedAt: member.createdAt || member.created_at,
    }))
    .sort((a, b) => String(b.joinedAt).localeCompare(String(a.joinedAt)));
  return Response.json({ members });
};

export const config = { path: "/api/members", method: ["GET"] };
