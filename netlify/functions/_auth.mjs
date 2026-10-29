import { getUser } from "@netlify/identity";
import { hasAnyRole, userRoles } from "./_roles.mjs";

export { PLATFORM_ROLES, hasAnyRole, userRoles } from "./_roles.mjs";

export async function requireUser() {
  const user = await getUser();
  if (!user) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
  return user;
}

export function isAdministrator(user) {
  const allowlist = (Netlify.env.get("IRON_DOMINION_ADMIN_EMAILS") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return hasAnyRole(user, ["admin"]) || allowlist.includes(user?.email?.toLowerCase());
}

export function forbidden(message = "Administrator access required") {
  return new Response(message, { status: 403 });
}
