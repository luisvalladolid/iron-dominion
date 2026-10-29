# Iron Dominion architecture

## Existing stack retained

- **Static web UI:** `index.html` for kettlebell sessions and `rounds.html` for Dominion Rounds.
- **Authentication:** Netlify Identity via `@netlify/identity`.
- **Private application data:** Netlify Database accessed only from Netlify Functions.
- **Analytics mirror:** Airtable receives non-secret member profile metadata through a server-only Personal Access Token. Airtable is not an authorization or workout-data source of truth.

The browser never receives a database connection string, Airtable token, or privileged Identity credential. Functions always obtain the active Identity user server-side and use `user.id` for every member-scoped database operation.

## Data ownership and privacy

`workout_sessions` remains the compatibility source for existing synced workout history. Its composite primary key `(user_id, id)` already prevents one athlete from overwriting another athlete's session with the same browser-generated ID. The new `exercise_records` table references that composite key.

New user-owned tables (`bjj_sessions`, `xp_events`, `user_statistics`, `user_achievements`, `challenge_participations`, and `subscription_entitlements`) are all keyed by `user_id`. Future endpoints must use `requireUser()` and derive `user_id` exclusively from the verified Netlify Identity session—not from URL parameters or request bodies.

## Authorization and billing

Roles are Netlify Identity `app_metadata.roles` values: `member`, `premium_member`, `coach`, and `admin`. Authorization is enforced by Functions through `netlify/functions/_auth.mjs`; it is never a client-side-only decision. New signups receive the `member` role. Role changes take effect after the athlete's next sign-in or token refresh.

Billing is separate from roles. `subscription_entitlements` records time-bound provider entitlements; it must be updated later by a verified provider webhook in a server-side function. Do not make a subscription webhook grant `admin` or `coach` privileges.

The existing `IRON_DOMINION_ADMIN_EMAILS` server-side allowlist remains temporarily for backward compatibility. Move administrators to the Netlify Identity `admin` role before eventually removing the allowlist.

## Migration plan

`20261029095600_add_gamified_training_foundation.sql` only creates new tables and adds nullable, additive columns to `workout_sessions`. It does not rewrite, delete, or backfill existing workouts. A future release can incrementally populate normalized exercise records and statistics while continuing to read historical `payload` JSON.

Never modify an already-applied migration. Add a new timestamped migration for corrections. On Netlify, migrations apply immediately before a production deploy publishes, so run this code through a preview deployment first. Preview database branches may contain copied production PII; do not share preview URLs publicly.

## Delivery phases

1. **Foundation (this change):** schema, profile mirroring, server-side role helpers, docs.
2. **Member experience (current):** authenticated athlete command center at `/dashboard`, BJJ session cloud sync, and a read-time projection of the member's private workout records. Timer completion immediately syncs the newly finished record when the athlete is signed in.
3. **Competition (current):** `/leaderboard` reads a server-maintained period aggregate for weekly/monthly XP, kettlebell volume, BJJ timer rounds, and training consistency. Participation is opt-in and defaults to private; public responses project only nickname/anonymous name, optional avatar, level, score, and rank. It never returns email addresses, internal IDs, workout details, or source events. Stable ordering is score descending, eligible-session count descending, earliest final eligible effort, then internal user ID. The final internal key is never exposed.
4. **Commerce:** provider webhook validation, entitlement checks, premium-program delivery.

No payment provider or admin controls are enabled by this release. The leaderboard is public only for athletes who explicitly opt in; the command center remains member-private.

## Athlete command center

`/api/dashboard` requires an authenticated Identity user and derives the dashboard response server-side from that user's `workout_sessions`, `bjj_sessions`, achievements, and profile. `/api/leaderboard` reads only server-maintained aggregates and returns no private session data. Neither endpoint accepts a user ID from the browser. New athletes receive intentional zero-state cards, empty records, and clear prompts instead of demo statistics.

The kettlebell timer records completed kettlebell reps on new workout entries and triggers cloud synchronization immediately after completion. Dominion Rounds stores a completed BJJ session locally and also posts it to `/api/bjj-sessions` when the athlete has an active authenticated session. Both endpoints use the verified Identity user ID and synchronize the profile before inserting member-scoped rows.

Profile synchronization is required for private application records; the Airtable member mirror is not. `/api/account-profile` returns a successful profile result even when the optional analytics mirror is temporarily unavailable.

## Gamification engine

`netlify/functions/_gamification.mjs` is the single server-side source for XP values, session eligibility limits, daily caps, achievement rewards, ranks, and the progression formula. Cumulative level XP is `100 × (level − 1)²`: level 1 starts at 0 XP, and rank milestones are Recruit (1), Soldier (5), Warrior (10), Gladiator (20), Champion (35), and Dominion Elite (50).

The additive `20261029110000_add_gamification_engine.sql` migration adds eligibility, invalidation, suspicious-session, local training-date, timezone, and valid-XP fields. A completed session is validated server-side before its idempotent event key is awarded. Standard session XP is capped at 200 per athlete-local day; daily, weekly, and achievement bonuses use separate idempotent event keys. Purchase and payment activity never creates XP events.

`20261029123000_add_competition_leaderboards.sql` adds private-by-default leaderboard preferences plus a server-only cache keyed by metric, period, and athlete. The cache is refreshed from validated session records only. Kettlebell volume is based on the configured 10 kg bell recorded server-side × repetitions; BJJ score is completed timer rounds, never wins. No premium entitlement adjusts XP or rank.

Training days mean distinct eligible local dates in `user_profiles.training_timezone`; a current streak is the number of consecutive calendar days ending today in that timezone. Database triggers invalidate related XP events when a source session is invalidated or deleted, so those records are excluded from statistics and future leaderboard queries even outside an application route.
