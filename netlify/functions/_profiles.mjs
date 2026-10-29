import { getDatabase } from "@netlify/database";

const database = getDatabase();

/**
 * Creates or refreshes the internal profile mirror for an authenticated user.
 * Roles remain authoritative in Netlify Identity JWT app_metadata; billing
 * entitlements are intentionally stored separately in subscription_entitlements.
 */
export async function syncProfile(user) {
  const metadata = user.userMetadata || user.user_metadata || {};
  const displayName = metadata.full_name || metadata.fullName || "";
  await database.sql`
    INSERT INTO user_profiles (user_id, email, display_name, identity_metadata, last_seen_at)
    VALUES (${user.id}, ${user.email}, ${displayName}, ${JSON.stringify(metadata)}::jsonb, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        identity_metadata = EXCLUDED.identity_metadata,
        last_seen_at = NOW(),
        updated_at = NOW()
  `;
}
