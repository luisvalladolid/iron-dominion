export const PLATFORM_ROLES = Object.freeze(["member", "premium_member", "coach", "admin"]);

/** Read only server-provided Netlify Identity metadata shapes. */
export function userRoles(user) {
  const roles = [user?.roles, user?.appMetadata?.roles, user?.app_metadata?.roles]
    .find(Array.isArray) || [];
  return roles.filter((role) => PLATFORM_ROLES.includes(role));
}

export function hasAnyRole(user, allowedRoles) {
  const allowed = new Set(allowedRoles);
  return userRoles(user).some((role) => allowed.has(role));
}
