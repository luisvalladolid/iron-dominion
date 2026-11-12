# IRON DOMINION

Iron Dominion is a kettlebell workout tracker and Dominion Rounds BJJ timer.
Athletes use Netlify Identity to sign in and securely sync completed workout
history between devices. The current release also contains the local-only
foundation for member profiles, gamification, challenges, leaderboards, premium
entitlements, and internal Airtable analytics.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete data, privacy,
authorization, and delivery design.

## Run locally

From this directory:

```sh
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Training experience

- Strength plans A–D, live set progress, focus mode, and adjustable rest timers.
- A phase-aware BJJ timer with round markers, presets, and full-screen controls.
- A device logbook with session notes and CSV export.
- Responsive command center and rankings, with reduced-motion support.

The redesign retains the existing workout-history storage format and account
integrations. Interface checks can use isolated local fixtures without writing
training sessions to a real athlete account. Run server/domain checks with
`npm test`.

## Automatic GitHub deployments

Keep changes in this repository and push releases to `main`. Netlify must have
the target project connected to `luisvalladolid/iron-dominion`, production branch
`main`, for each push to create a deployment automatically. The publish directory
is `.` as declared in `netlify.toml`; leave the build command blank.

Deployment wiring checked on November 12, 2026:

- `iron-dominion-staging` builds from this repository's `main` branch and is
  protected by team sign-in.
- `iron-dominion` still publishes an older uploaded build. Connect that existing
  project under **Project configuration → Build & deploy → Continuous
  deployment → Link repository** to enable automatic production releases.

Verify that the published Netlify deploy's commit matches the intended GitHub
commit. Pushing this repository does not update an unconnected upload-only
project. Retain each project's Identity, database, and environment settings;
connecting a repository does not copy those between projects.

## Deploy with athlete accounts

The account and synced-history features use a Netlify Function and Netlify
Database. Deploy this source through a Netlify build (Git-connected project or
the Netlify CLI), not the drag-and-drop static-only flow.

1. Copy `.env.example` for local guidance only. Configure real secret values in
   **Netlify Project configuration → Environment variables**; never commit them.
2. Deploy the complete project directory with dependencies installed.
3. In the Netlify project, open **Identity** and select **Enable Identity**.
4. Under **Registration**, choose **Open** to let athletes create their own accounts.
5. Test sign-up, email confirmation, sign-in, and one completed workout at the
   production URL. The migration creates the private workout-history table
   automatically before the deploy publishes.

Unauthenticated progress remains only on the current device. Once an athlete
signs in, completed sessions are associated with their account and synced to
the project database.

## Database migrations

The database migrations are intentionally additive. Existing workout history is
kept in `workout_sessions.payload`; do not alter or remove the original migration.

For local development, install the Netlify CLI and start `netlify dev`, then run
`netlify database migrations apply`. For a production release, deploy the project
through Netlify. Netlify applies pending migrations before publishing; do not run
`drizzle-kit push`, `drizzle-kit migrate`, or manual production DDL.

The foundational migration adds the profile, BJJ, exercise, statistics, XP,
achievement, leaderboard, challenge, entitlement, and premium-program tables.
It does not activate a billing provider or expose a public leaderboard.

## Roles and entitlements

- **Roles:** `member`, `premium_member`, `coach`, `admin` live in Netlify Identity
  `app_metadata.roles` and are enforced in server functions.
- **Entitlements:** subscription access lives separately in
  `subscription_entitlements`; it must be updated later by a verified billing
  webhook.

Role changes take effect on the athlete's next sign-in or token refresh. The
existing `IRON_DOMINION_ADMIN_EMAILS` server-side allowlist remains only for
backward compatibility; use the Identity `admin` role for new administrators.
