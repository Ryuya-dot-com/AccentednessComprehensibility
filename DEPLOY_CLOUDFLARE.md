# Cloudflare Deployment Guide

This guide describes deployment paths for confirming that the rating platform works on Cloudflare Pages with Pages Functions and D1.

There are two supported deployment styles:

- **GitHub integration**: recommended after pushing this repository to `Ryuya-dot-com/Accentedness_Rating`.
- **Direct Upload**: useful for a quick CLI-only feasibility test.

If deploying from the local Dropbox workspace, use the project directory as the deployment root:

```sh
cd /Users/tohokusla/Dropbox/Accentedness/Experiment/Rating_Platform
```

The expected Cloudflare structure is:

```text
Rating_Platform/
  index.html
  app.js
  styles.css
  admin/
  functions/
  db/schema.sql
  wrangler.toml
```

Do not deploy from `/Users/tohokusla/Dropbox/Accentedness` or `/Users/tohokusla/Dropbox/Accentedness/Experiment`. The `functions/` directory must be at the Pages project root.

If deploying from `Ryuya-dot-com/Accentedness_Rating`, the repository root is already the Pages project root.

## GitHub Integration

Use this route for normal Cloudflare Pages deployment.

1. In the Cloudflare dashboard, go to **Workers & Pages**.
2. Select **Create application** > **Pages**.
3. Connect the GitHub repository:

```text
Ryuya-dot-com/Accentedness_Rating
```

4. Use these build settings:

```text
Production branch: main
Framework preset: None
Build command: empty
Build output directory: .
Root directory: /
```

5. After the Pages project exists, configure bindings and secrets in Cloudflare, not in GitHub:

```text
D1 binding name: DB
Pages secret: ADMIN_TOKEN
Pages secret: PROLIFIC_COMPLETION_CODE
Optional Pages secret: COUNTERBALANCE_MANIFEST_URL
Optional Pages variable: COUNTERBALANCE_ALLOWED_HOSTS=<comma-separated hosts>
Optional Pages secret: TURNSTILE_SECRET_KEY
Optional Pages variable: ENVIRONMENT=production
Optional Pages variable: CF_ACCESS_TEAM_DOMAIN
Optional Pages variable: CF_ACCESS_AUD
Optional Pages variable: CF_ACCESS_ALLOWED_EMAILS
Optional Pages variable: TURNSTILE_SITE_KEY
Optional Pages variable: REQUIRE_TURNSTILE=1
Optional Pages variable: MIN_COMPLETION_SECONDS=<seconds>
Optional Pages variable: STALE_SESSION_MINUTES=240
```

6. Create and initialize D1 with the SQL commands below.

GitHub should contain code, schema, templates, and non-sensitive demo files only. Participant responses, admin tokens, private manifest URLs, and private audio assets should remain in Cloudflare D1/R2/Secrets or other approved storage.

## 1. Install and Log In to Wrangler

Use Wrangler through `npx` so a project-local install is not required:

```sh
npx wrangler login
npx wrangler whoami
```

If `whoami` shows your Cloudflare account, the CLI is ready.

## 2. Create a Cloudflare Pages Project by Direct Upload

For a CLI-only feasibility test, use Direct Upload from Wrangler:

```sh
npx wrangler pages project create accentedness-rating-platform --production-branch main
```

This creates a Pages project named `accentedness-rating-platform`.

Relevant Cloudflare docs:

- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages Functions](https://developers.cloudflare.com/pages/functions/)

## 3. Create a D1 Database

If EU data location is desired for the feasibility test, create the database with the EU jurisdiction option:

```sh
npx wrangler d1 create accentedness-rating --jurisdiction=eu
```

If a specific jurisdiction is not needed for the first test, use:

```sh
npx wrangler d1 create accentedness-rating
```

Wrangler returns a D1 database UUID. Copy that value for the next step.

Relevant Cloudflare docs:

- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)

Cloudflare notes that D1 jurisdictions can only be set when the database is created. If the wrong jurisdiction is selected, create a new D1 database rather than trying to update the existing one.

## 4. Create `wrangler.toml`

Copy the example file:

```sh
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml` and replace:

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

with the UUID returned by `wrangler d1 create`.

The binding name must remain:

```toml
binding = "DB"
```

The Pages Functions in this project expect `context.env.DB`.

Relevant Cloudflare docs:

- [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Wrangler configuration for Pages](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

## 5. Apply the D1 Schema

Create the tables in the remote D1 database:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/schema.sql
```

This creates tables for sessions, assignments, trial responses, and event logs.

If you already created the D1 database before the counterbalance tables/columns were added, run the one-time migration instead:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0002_counterbalance.sql
```

For an existing database, apply the hardening migration after `0002_counterbalance.sql`. It adds Prolific duplicate-start protection indexes and can be run more than once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0003_hardening.sql
```

If this fails because duplicate Prolific IDs already exist in a pilot database, export `sessions.csv`, resolve or archive the duplicate pilot rows, and rerun the migration.

If the database was created before block-level counterbalancing was added, run the block metadata migration once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0004_block_counterbalance.sql
```

If the database was created before session-token hardening was added, run the security migration once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0005_session_security.sql
```

If the database was created before strict participant locking and millisecond audit fields were added, run this migration once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0006_participant_lock_ms.sql
```

If `0006_participant_lock_ms.sql` fails while creating `idx_sessions_participant_key_unique`, export `sessions.csv`, resolve duplicate `participant_key` rows in the pilot database, and rerun the migration. Do not start production with duplicate Prolific participant keys.

For existing databases, add the stale-session lookup index used by the admin finalization endpoint:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0007_stale_session_index.sql
```

If the database was created before the explicit unidentified-word response was added, run this migration once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0008_intelligibility_unidentified.sql
```

If the database was created before response-order and rating-process metrics were added, run this migration once:

```sh
npx wrangler d1 execute accentedness-rating --remote --file=./db/migrations/0009_response_order_metrics.sql
```

## 6. Set Secrets and Production Variables

Generate a token:

```sh
openssl rand -base64 32
```

Set it as a Cloudflare Pages secret:

```sh
npx wrangler pages secret put ADMIN_TOKEN --project-name accentedness-rating-platform
```

Paste the generated token when prompted. Save the token securely; it is required for `/admin/`.

Do not put `ADMIN_TOKEN` in `wrangler.toml`.

The admin API fails closed when `ADMIN_TOKEN` is not configured.

Set the Prolific completion code as a Cloudflare Pages secret. Do not put it in the participant URL:

```sh
npx wrangler pages secret put PROLIFIC_COMPLETION_CODE --project-name accentedness-rating-platform
```

Set production mode so participant starts require Prolific identifiers:

```text
ENVIRONMENT=production
```

Production mode requires all three Prolific parameters: `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
The server derives a strict `participant_key` from `STUDY_ID + PROLIFIC_PID` and D1 enforces uniqueness.
Duplicate starts for a still-open session resume the same session; duplicate starts for a closed session are rejected.

Optional but recommended anti-abuse settings:

```text
TURNSTILE_SITE_KEY=<public Turnstile site key>
TURNSTILE_SECRET_KEY=<private Turnstile secret key>
REQUIRE_TURNSTILE=1
MIN_COMPLETION_SECONDS=<minimum plausible full-session duration>
```

When `REQUIRE_TURNSTILE=1`, `/api/session/start` fails closed unless the browser completes Turnstile and the server validates it.
When `MIN_COMPLETION_SECONDS` is set, `/api/session/complete` withholds the Prolific return URL from implausibly fast sessions.

Set the inactivity window used by the admin stale-session summary and finalization workflow:

```text
STALE_SESSION_MINUTES=240
```

During live collection, use a conservative value that is longer than the plausible task duration plus breaks. Stale sessions are finalized only from `/admin/`; participant APIs do not automatically mark a session as dropout.

If the production stimulus manifest should not be stored as a public `remote_manifest.csv`, set the server-side manifest URL as a Pages secret:

```sh
npx wrangler pages secret put COUNTERBALANCE_MANIFEST_URL --project-name accentedness-rating-platform
```

When this secret is set, `/api/session/start` uses it as the authoritative counterbalance manifest. The browser-side custom manifest field is only a preview/manual-workflow aid.

## 7. Protect Admin with Cloudflare Access

Create Cloudflare Access protection before production:

1. In Cloudflare Zero Trust, go to **Access controls** > **Applications**.
2. Create a **Self-hosted** application for the admin UI path:

```text
https://accentedness-rating-platform.pages.dev/admin/*
```

3. Create another Self-hosted application for the admin API path, or include this path in the same Access application if your Cloudflare plan/configuration supports the desired path coverage:

```text
https://accentedness-rating-platform.pages.dev/api/admin/*
```

4. Use an Allow policy that includes only named researcher email addresses or a controlled researcher email domain. Do not use `Include Everyone` or `Include all valid emails`.
5. Copy the Application Audience (AUD) tag for the admin API Access application.
6. Set these Pages variables:

```text
CF_ACCESS_TEAM_DOMAIN=https://<your-team-name>.cloudflareaccess.com
CF_ACCESS_AUD=<admin-api-application-aud-tag>
CF_ACCESS_ALLOWED_EMAILS=researcher1@example.edu,researcher2@example.edu
```

Keep `ADMIN_TOKEN` enabled. The admin API requires both the Cloudflare Access JWT and `ADMIN_TOKEN` when `CF_ACCESS_*` variables are configured.

## 8. Deploy

Deploy the current directory:

```sh
npx wrangler pages deploy . --project-name accentedness-rating-platform --branch main
```

Wrangler will print the deployed URL, usually in this form:

```text
https://accentedness-rating-platform.pages.dev/
```

## 9. Configure Edge Protection

Before production collection, add Cloudflare WAF rate limiting rules for these paths:

```text
/api/session/start
/api/trial
/api/event
/api/session/complete
/api/admin/*
```

Use thresholds that allow normal Prolific progress but challenge or throttle bursts. A practical starting point is:

- `/api/session/start`: low per-IP burst tolerance.
- `/api/trial`: allow steady single-participant progress, block high-frequency writes.
- `/api/session/complete`: very low repeat tolerance per IP/session.
- `/api/admin/*`: very low tolerance and restricted access; Cloudflare Access is recommended for `/admin/*`.

## 10. Smoke Test

Open the participant page:

```text
https://accentedness-rating-platform.pages.dev/
```

Open the researcher admin page:

```text
https://accentedness-rating-platform.pages.dev/admin/
```

Enter the `ADMIN_TOKEN` on the admin page and confirm that summary counts load.

Then complete a short test session from the participant page. Do not add `?local=1` for this test, because `?local=1` bypasses server persistence.

After saving a few trials, confirm records exist in D1:

```sh
npx wrangler d1 execute accentedness-rating --remote --command "SELECT COUNT(*) AS sessions FROM sessions;"
npx wrangler d1 execute accentedness-rating --remote --command "SELECT COUNT(*) AS trials FROM rating_trials;"
npx wrangler d1 execute accentedness-rating --remote --command "SELECT COUNT(*) AS events FROM event_logs;"
npx wrangler d1 execute accentedness-rating --remote --command "SELECT cell_id, status, COUNT(*) AS n FROM counterbalance_allocations GROUP BY cell_id, status;"
npx wrangler d1 execute accentedness-rating --remote --command "SELECT block_index, block_list, COUNT(*) AS n FROM rating_assignments WHERE phase = 'main' GROUP BY block_index, block_list ORDER BY block_index;"
```

On `/admin/`, confirm that these CSV downloads work:

- `analysis.csv`
- `quality.csv`
- `sessions.csv`
- `ratings.csv`
- `assignments.csv`
- `events.csv`
- `counterbalance.csv`

To test dropout handling, start a pilot session, save a few trials, then stop. After the chosen inactivity window, use `Finalize stale sessions` on `/admin/`. Confirm that the session changes from `started` to `incomplete_dropout`, no Prolific completion code is issued, `analysis.csv` excludes the session, and `quality.csv` shows the missing-trial count.

To test unintelligible-word handling, complete a pilot trial using `I could not identify the word`. Confirm that the row is saved with `intelligibility_response_status=unidentified`, `intelligibility_unidentified=1`, `intelligibility_exact=0`, and no increase in `manual_review_count`.

## 11. Prolific Test URL

For a Prolific-style test, use URL parameters such as:

```text
https://accentedness-rating-platform.pages.dev/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Do not include the completion code in the Prolific participant URL. Store it in `PROLIFIC_COMPLETION_CODE`.

After Cloudflare marks the session as `completed`, `/api/session/complete` returns the Prolific completion URL and the browser redirects to Prolific. If completion saving fails, the server detects missing trials, the session is implausibly fast, or `PROLIFIC_COMPLETION_CODE` is missing, the participant sees `CONTACT_RESEARCHER` instead.

## 12. Important Checks Before Production

Before running the actual study:

- Replace placeholder practice audio and expert ratings in `app.js`.
- Set `PROLIFIC_COMPLETION_CODE` as a Cloudflare Pages secret.
- Remove any `completion_code` query parameter from the Prolific Study URL.
- Apply `db/migrations/0005_session_security.sql` to existing D1 databases.
- Apply `db/migrations/0006_participant_lock_ms.sql` to existing D1 databases and confirm `participant_key` is unique.
- Apply `db/migrations/0007_stale_session_index.sql` to existing D1 databases.
- Apply `db/migrations/0008_intelligibility_unidentified.sql` to existing D1 databases.
- Apply `db/migrations/0009_response_order_metrics.sql` to existing D1 databases.
- Confirm the Prolific Study URL includes `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
- Protect `/admin/*` and `/api/admin/*` with Cloudflare Access; set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `CF_ACCESS_ALLOWED_EMAILS`.
- Configure WAF rate limiting rules for participant and admin API paths.
- Enable Turnstile with `REQUIRE_TURNSTILE=1` unless the ethics/pilot setup requires a no-challenge flow.
- Set `MIN_COMPLETION_SECONDS` to a conservative minimum plausible full-session duration after timing the pilot.
- Set `STALE_SESSION_MINUTES` to a conservative inactivity window and verify the `/admin/` stale-session finalization workflow.
- Confirm that the server-side manifest source points to the final audio files: either public `remote_manifest.csv` or the `COUNTERBALANCE_MANIFEST_URL` Pages secret.
- Confirm that the server-side manifest includes `word_number`, `l1_condition`, and `pronunciation_condition` for the counterbalanced stimulus pool.
- Confirm that `AME` rows are explicitly `natural`, never blank or `accented`; `JPN` and `CHN` rows must be explicitly labeled `natural` or `accented`.
- If using an external manifest, set `COUNTERBALANCE_ALLOWED_HOSTS` to the expected manifest/audio hostnames.
- Run `node scripts/verify_counterbalance.mjs` and `node scripts/simulate_counterbalance_design.mjs`.
- Use rolling Prolific recruitment until the target completed-session count is reached; do not rely on one fixed launch batch if dropouts must be replaced.
- Review `EXPERIMENTAL_DESIGN_REVIEW.md` and resolve all final-stimulus placeholders before production launch.
- Confirm that one pilot run presents four 25-trial blocks with calculation distractor tasks between Blocks 1-3.
- Confirm that the intended D1 data location or jurisdiction is acceptable for the ethics and data management plan.
- Confirm that `/admin/` requires the real `ADMIN_TOKEN`.
- Complete at least one full pilot run and one partial dropout pilot, then download all CSV files from `/admin/`.

## Local UI Testing Only

For local interface checks without Cloudflare persistence:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/?local=1
```

This mode is only for UI testing. It should not be used for Prolific data collection.
