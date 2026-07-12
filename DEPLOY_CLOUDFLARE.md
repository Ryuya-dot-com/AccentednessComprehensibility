# Cloudflare Deployment Guide

This guide describes deployment paths for confirming that the rating platform works on Cloudflare Pages with Pages Functions and D1.

There are two supported deployment styles:

- **GitHub integration**: recommended after pushing this repository to `Ryuya-dot-com/AccentednessComprehensibility`.
- **Direct Upload**: useful for a quick CLI-only feasibility test.

If deploying from the local Dropbox workspace, use the current repository directory as the deployment root:

```sh
cd /Users/tohokusla/Dropbox/Accentedness/AccentednessComprehensibility
```

The expected Cloudflare structure is:

```text
AccentednessComprehensibility/
  index.html
  app.js
  styles.css
  admin/
  functions/
  db/schema.sql
  wrangler.toml
```

Do not deploy from `/Users/tohokusla/Dropbox/Accentedness` or `/Users/tohokusla/Dropbox/Accentedness/Experiment`. The `functions/` directory must be at the Pages project root.

If deploying from `Ryuya-dot-com/AccentednessComprehensibility`, the repository root is already the Pages project root.

## GitHub Integration

Use this route for normal Cloudflare Pages deployment.

1. In the Cloudflare dashboard, go to **Workers & Pages**.
2. Select **Create application** > **Pages**.
3. Connect the GitHub repository:

```text
Ryuya-dot-com/AccentednessComprehensibility
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
Pages secret: PROLIFIC_COMPLETION_URL or PROLIFIC_COMPLETION_CODE
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
npx wrangler pages project create accentednesscomprehensibility --production-branch main
```

This creates a Pages project named `accentednesscomprehensibility`.

Relevant Cloudflare docs:

- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Pages Functions](https://developers.cloudflare.com/pages/functions/)

## 3. Create a D1 Database

If EU data location is desired for the feasibility test, create the database with the EU jurisdiction option:

```sh
npx wrangler d1 create accentedness-comprehensibility --jurisdiction=eu
```

If a specific jurisdiction is not needed for the first test, use:

```sh
npx wrangler d1 create accentedness-comprehensibility
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
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/schema.sql
```

This creates tables for sessions, assignments, trial responses, and event logs.

If you already created the D1 database before the counterbalance tables/columns were added, run the one-time migration instead:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0002_counterbalance.sql
```

For an existing database, apply the hardening migration after `0002_counterbalance.sql`. It adds Prolific duplicate-start protection indexes and can be run more than once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0003_hardening.sql
```

If this fails because duplicate Prolific IDs already exist in a pilot database, export `sessions.csv`, resolve or archive the duplicate pilot rows, and rerun the migration.

If the database was created before block-level counterbalancing was added, run the block metadata migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0004_block_counterbalance.sql
```

If the database was created before session-token hardening was added, run the security migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0005_session_security.sql
```

If the database was created before strict participant locking and millisecond audit fields were added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0006_participant_lock_ms.sql
```

If `0006_participant_lock_ms.sql` fails while creating `idx_sessions_participant_key_unique`, export `sessions.csv`, resolve duplicate `participant_key` rows in the pilot database, and rerun the migration. Do not start production with duplicate Prolific participant keys.

For existing databases, add the stale-session lookup index used by the admin finalization endpoint:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0007_stale_session_index.sql
```

If the database was created before the explicit unidentified-word response was added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0008_intelligibility_unidentified.sql
```

If the database was created before response-order and rating-process metrics were added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0009_response_order_metrics.sql
```

If the database was created before staged word-identification/rating pages were added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0010_staged_response_flow.sql
```

If the database was created before Sheet2 speaker-pattern metadata was added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0011_speaker_pattern.sql
```

If the database was created before the participant background questionnaire was added, run this migration once:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0012_background_questionnaire.sql
```

Before deploying v0.7 or later, add the final 50-word familiarity table and the version-gated session flag:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --file=./db/migrations/0013_word_familiarity.sql
```

Apply this D1 migration before the Pages code. Existing v0.6 sessions receive `word_familiarity_required=0`, so they can finish without being misclassified as unfamiliar; new v0.7 sessions require all 50 rows before completion.

If the remote D1 database may be partially migrated, use the guarded schema updater instead of replaying all migration files. It inspects D1 first and applies only missing additive columns:

```sh
node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility
node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility --apply --backup-before-apply
```

The updater includes all nine questionnaire columns, the word-familiarity requirement flag, and the normalized checklist table/index. For production, always write the backup outside the repository and apply the schema before deploying code that reads the new schema:

```sh
node scripts/apply_d1_schema_updates.mjs \
  --database accentedness-comprehensibility \
  --apply --backup-before-apply \
  --backup-output /private/tmp/accentedness-d1-before-background.sql
```

## 6. Host Production Audio

Do not commit the 2,497 main production audio files or the current practice/calibration WAVs to the Pages repository. Serve them from Cloudflare R2 or another approved static HTTPS host. The current practice set uses these direct R2 objects in low-to-high Accentedness-reference order:

```text
https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/eng_female_appreciation_practice.wav  # 1–3
https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/jpn_male_pesticide_practice.wav       # 3–5
https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/jpn_female_quality_practice.wav      # 5–7
https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/chn_female_pizza_practice.wav        # 7–9
```

The two scalar expert fields remain blank because exact scalar Accentedness and Comprehensibility reference ratings have not been established. The app and top-level `practice_manifest.csv` store only `expert_accentedness_range` for these four practice items.

Both the participant flow and the researcher-only `Load selected practice` helper pass these HTTPS URLs directly to the browser's audio element. The helper does not fetch the R2 objects into JavaScript blobs, so ordinary playback is not dependent on an `Access-Control-Allow-Origin` response header. Test both flows after any audio-host change.

The recommended R2 bucket name is:

```text
accentedness-production-stimuli
```

Create the bucket:

```sh
npx wrangler r2 bucket create accentedness-production-stimuli
```

Upload the OSF-standardized package audio under the same relative paths used by the package manifest. For bulk upload, use `rclone` or another S3-compatible tool. For a single-object smoke test, Wrangler supports:

```sh
npx wrangler r2 object put accentedness-production-stimuli/main/eng/natural/eng_s08/eng_s08_natural_pass01_word021_pacifier_take01_trial0021.wav \
  --file /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/main/eng/natural/eng_s08/eng_s08_natural_pass01_word021_pacifier_take01_trial0021.wav \
  --content-type audio/wav
```

For the full package, the local source root is:

```text
/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703
```

The generated upload command batch is:

```text
/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/upload_to_r2_accentedness_production_stimuli.sh
```

Regenerate it with:

```sh
python3 scripts/generate_r2_upload_commands.py
```

It uploads 2,545 audio objects from `metadata/r2_upload_plan.csv`. Run `npx wrangler login` first; the current local Wrangler check reports that this machine is not authenticated.

Expose the bucket with a production custom domain when possible, for example:

```text
https://stimuli.example.edu/
```

The current practice implementation references the verified public `r2.dev` URLs listed above. If the audio is later moved to a custom domain, update all four `PRACTICE_ITEMS`, `practice_manifest.csv`, the live-deployment checks, and the allowed-host setting together before changing the Prolific study. A custom domain remains preferable for cache, WAF, access-control, and bot-management options.

Generate the production manifest with absolute audio URLs after the public audio base URL is known. Prefer the hosted-manifest builder because it preserves the already validated OSF package manifest and only fills `audio_url` from `audio_file`:

```sh
node scripts/build_hosted_manifest.mjs \
  --audio-base-url https://stimuli.example.edu \
  --out /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv
```

This command also checks that every `audio_file` in the manifest exists in `metadata/r2_upload_plan.csv`. Use `scripts/generate_production_manifest_from_crosswalk.py` only when the OSF crosswalk itself has changed and the package manifest must be rebuilt.

Validate the manifest before setting it in Cloudflare:

```sh
node scripts/validate_production_manifest.mjs \
  --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv
```

After the audio host is public, verify hosted audio URLs:

```sh
node scripts/validate_audio_hosting.mjs \
  --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv \
  --sample 80
```

Use `--sample 0` for the final full-row probe before Prolific launch.

Set the manifest URL as a Pages secret if the manifest is hosted outside the repository:

```sh
npx wrangler pages secret put COUNTERBALANCE_MANIFEST_URL --project-name accentednesscomprehensibility
```

Set allowed hosts to the manifest host and audio host:

```text
COUNTERBALANCE_ALLOWED_HOSTS=accentednesscomprehensibility.pages.dev,pub-c26f53c7e40c448db5847c2079933f52.r2.dev
```

Official references:

- Cloudflare R2 bucket creation: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Cloudflare R2 public buckets and custom domains: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare Wrangler command syntax: https://developers.cloudflare.com/workers/wrangler/commands/
- Cloudflare R2 object upload: https://developers.cloudflare.com/r2/objects/upload-objects/

## 7. Set Secrets and Production Variables

Generate a token:

```sh
openssl rand -base64 32
```

Set it as a Cloudflare Pages secret:

```sh
npx wrangler pages secret put ADMIN_TOKEN --project-name accentednesscomprehensibility
```

Paste the generated token when prompted. Save the token securely; it is required for `/admin/`.

Do not put `ADMIN_TOKEN` in `wrangler.toml`.

The admin API fails closed when `ADMIN_TOKEN` is not configured.

Set the Prolific completion return target as a Cloudflare Pages secret. Prefer the full completion URL supplied by Prolific:

```sh
npx wrangler pages secret put PROLIFIC_COMPLETION_URL --project-name accentednesscomprehensibility
```

If Prolific only provides a completion code, set the code instead. The server will construct `https://app.prolific.com/submissions/complete?cc=...`:

```sh
npx wrangler pages secret put PROLIFIC_COMPLETION_CODE --project-name accentednesscomprehensibility
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
npx wrangler pages secret put COUNTERBALANCE_MANIFEST_URL --project-name accentednesscomprehensibility
```

When this secret is set, `/api/session/start` uses it as the authoritative counterbalance manifest. The browser-side custom manifest field is only a preview/manual-workflow aid.

## 8. Protect Admin with Cloudflare Access

Create Cloudflare Access protection before production:

1. In Cloudflare Zero Trust, go to **Access controls** > **Applications**.
2. Create a **Self-hosted** application for the admin UI path:

```text
https://accentednesscomprehensibility.pages.dev/admin/*
```

3. Create another Self-hosted application for the admin API path, or include this path in the same Access application if your Cloudflare plan/configuration supports the desired path coverage:

```text
https://accentednesscomprehensibility.pages.dev/api/admin/*
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

## 9. Deploy

This project is connected to GitHub. Merge the reviewed branch into the configured production branch (`main`) and let Cloudflare Pages Git integration create the production deployment. Use a direct Wrangler upload only as an explicitly documented fallback:

```sh
npx wrangler pages deploy . --project-name accentednesscomprehensibility --branch main
```

Wrangler will print the deployed URL, usually in this form:

```text
https://accentednesscomprehensibility.pages.dev/
```

Immediately verify that the public URL is serving the same implementation that was just deployed:

```sh
node scripts/check_live_deployment.mjs --allow-turnstile-off --api-dry-run-start
```

Use `--allow-turnstile-off` only while Turnstile is intentionally disabled for a pilot. For production, omit that flag if `REQUIRE_TURNSTILE=1` is configured. Keep `--api-dry-run-start` for the final readiness check; it creates one dry-run D1 session and confirms that `/api/session/start` can build the 100-trial server-side main assignment without falling back to placeholder materials. It also repeats the same dry-run start once to verify duplicate-start resume metadata. If `COUNTERBALANCE_MANIFEST_URL` is configured and the public static `remote_manifest.csv` intentionally remains demo-only, also pass `--allow-demo-static-manifest`. The script writes:

```text
/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LIVE_DEPLOYMENT_CHECK_20260703.md
```

Do not run or resume Prolific recruitment until this check passes against the new production deployment. The dry-run start also verifies that the saved age/background choices and word-checklist requirement are returned by a questionnaire-free `resume_only` lookup.

After Wrangler authentication is available, run the aggregate readiness audit:

```sh
node scripts/audit_cloudflare_readiness.mjs \
  --allow-turnstile-off \
  --production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv \
  --using-external-manifest-secret
```

It writes `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/CLOUDFLARE_READINESS_REPORT_20260703.md` and combines Wrangler authentication, Pages secrets, Pages deployment visibility, D1 info, D1 schema drift, local preflight, hosted-audio checks, and live API dry-run checks. Pass `--production-manifest` after the hosted manifest is generated so both preflight and audio-hosting checks inspect the actual launch manifest. Add `--allow-demo-static-manifest` only when `COUNTERBALANCE_MANIFEST_URL` is intentionally the production manifest source.

## 10. Configure Edge Protection

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

## 11. Smoke Test

Open the participant page:

```text
https://accentednesscomprehensibility.pages.dev/
```

Open the researcher admin page:

```text
https://accentednesscomprehensibility.pages.dev/admin/
```

Enter the `ADMIN_TOKEN` on the admin page and confirm that summary counts load.

Then complete a short test session from the participant page. Do not add `?local=1` for this test, because `?local=1` bypasses server persistence.

After saving a few trials, confirm records exist in D1:

```sh
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT COUNT(*) AS sessions FROM sessions;"
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT COUNT(*) AS trials FROM rating_trials;"
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT COUNT(*) AS events FROM event_logs;"
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT COUNT(*) AS checklist_rows, SUM(word_known) AS known_words FROM word_familiarity_responses;"
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT cell_id, status, COUNT(*) AS n FROM counterbalance_allocations GROUP BY cell_id, status;"
npx wrangler d1 execute accentedness-comprehensibility --remote --command "SELECT block_index, block_list, COUNT(*) AS n FROM rating_assignments WHERE phase = 'main' GROUP BY block_index, block_list ORDER BY block_index;"
```

On `/admin/`, confirm that these CSV downloads work:

- `analysis.csv`
- `quality.csv`
- `sessions.csv`
- `ratings.csv`
- `assignments.csv`
- `events.csv`
- `counterbalance.csv`
- `word-familiarity.csv`

To test dropout handling, start a pilot session, save a few trials, then stop. After the chosen inactivity window, use `Finalize stale sessions` on `/admin/`. Confirm that the session changes from `started` to `incomplete_dropout`, no Prolific completion code is issued, `analysis.csv` excludes the session, and `quality.csv` shows the missing-trial count. The same finalization endpoint also marks stale orphan counterbalance allocations as incomplete if a Worker interruption occurred after allocation but before session creation.

To test reload recovery, start a pilot session from the stable Prolific-style URL, save several practice/main trials, then reload the same URL. Confirm that `/api/session/start` returns `existing_session: true`, all four practice items are presented again, the browser then continues at the first unsaved main trial or later saved-session state, already completed block distractors are not repeated, and completion is issued only after the remaining assignments are saved. Confirm that replaying practice does not overwrite an already saved practice response.

To test the final checklist, finish all ratings and confirm that the 50-word screen appears before any completion code or Prolific redirect. Leave `capelin` blank in a test response, submit all 50 explicit values, and verify `word-familiarity.csv` contains `word_number=23,target_word=capelin,word_known=0` while the matching `analysis.csv` trial rows also contain `word_known=0`. A zero-known-word submission is valid; failing to review/submit the checklist is not.

To test unintelligible-word handling, complete a pilot trial using `I could not identify the word`. Confirm that the row is saved with `intelligibility_response_status=unidentified`, `intelligibility_unidentified=1`, `intelligibility_exact=0`, and no increase in `manual_review_count`.

To stress-test local simultaneous counterbalance allocation before the Cloudflare dry run:

```sh
python3 scripts/stress_counterbalance_concurrency.py --participants 200
```

The current local result is 10 assignments per cell for 200 simultaneous starts, with duplicate participant keys rejected. The allocation query balances active-or-completed counts and uses a session-derived tie-breaker among equal-count cells. This verifies the local SQL-level invariant; still run at least one live Cloudflare dry run because D1, Pages Functions, secrets, and public asset hosting are external state.

## 12. Prolific Test URL

For a Prolific-style test, use URL parameters such as:

```text
https://accentednesscomprehensibility.pages.dev/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

Use this stable Pages project hostname in the Prolific Study URL. Do not copy a deployment-specific hostname such as `https://<deployment-id>.accentednesscomprehensibility.pages.dev/` from a Cloudflare deployment detail page: that URL remains pinned to the historical deployment and will not receive later fixes or practice-stimulus changes.

Do not include the completion code or completion URL in the Prolific participant URL. Store the full return URL in `PROLIFIC_COMPLETION_URL`, or store the code in `PROLIFIC_COMPLETION_CODE`.

After Cloudflare marks the session as `completed`, `/api/session/complete` returns the Prolific completion URL and the browser redirects to Prolific. Completion is issued only when every server-side assignment has a saved rating and every version-required word-familiarity row is present. If completion saving fails, the server detects missing assignments/trials/checklist rows, the session is implausibly fast, or both `PROLIFIC_COMPLETION_URL` and `PROLIFIC_COMPLETION_CODE` are missing, the participant sees `CONTACT_RESEARCHER` instead.

## 13. Important Checks Before Production

Before running the actual study:

- Confirm the four R2 practice/calibration WAVs are reachable and presented in this order: `appreciation` (1–3), `pesticide` (3–5), `quality` (5–7), `pizza` (7–9). Keep scalar expert fields blank unless exact expert ratings are formally established.
- Confirm unlimited audio replay is available only on the practice-feedback screen; practice response pages and all main-task pages must retain one playback per page.
- Set `PROLIFIC_COMPLETION_URL` or `PROLIFIC_COMPLETION_CODE` as a Cloudflare Pages secret.
- Remove any `completion_code` query parameter from the Prolific Study URL.
- Apply `db/migrations/0005_session_security.sql` to existing D1 databases.
- Apply `db/migrations/0006_participant_lock_ms.sql` to existing D1 databases and confirm `participant_key` is unique.
- Apply `db/migrations/0007_stale_session_index.sql` to existing D1 databases.
- Apply `db/migrations/0008_intelligibility_unidentified.sql` to existing D1 databases.
- Apply `db/migrations/0009_response_order_metrics.sql` to existing D1 databases.
- Apply `db/migrations/0010_staged_response_flow.sql` to existing D1 databases.
- Apply `db/migrations/0011_speaker_pattern.sql` to existing D1 databases.
- Apply `db/migrations/0012_background_questionnaire.sql` to existing D1 databases, or confirm all nine columns through the guarded updater.
- Apply `db/migrations/0013_word_familiarity.sql` before v0.7 code, or confirm the flag, table, and index through the guarded updater.
- For a partially migrated D1 database, prefer `node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility --apply --backup-before-apply`; it exports a SQL backup first and applies only missing additive schema.
- Confirm the Prolific Study URL includes `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
- Protect `/admin/*` and `/api/admin/*` with Cloudflare Access; set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `CF_ACCESS_ALLOWED_EMAILS`.
- Configure WAF rate limiting rules for participant and admin API paths.
- Enable Turnstile with `REQUIRE_TURNSTILE=1` unless the ethics/pilot setup requires a no-challenge flow.
- Set `MIN_COMPLETION_SECONDS` to a conservative minimum plausible full-session duration after timing the pilot.
- Set `STALE_SESSION_MINUTES` to a conservative inactivity window and verify the `/admin/` stale-session finalization workflow.
- Confirm that the server-side manifest source points to the final R2/custom-domain audio files through either public `remote_manifest.csv` or the `COUNTERBALANCE_MANIFEST_URL` Pages secret.
- Confirm that the production manifest generated with `--audio-base-url` has reachable HTTPS `audio_url` values.
- Confirm that the server-side manifest includes `word_number`, `l1_condition`, and `pronunciation_condition` for the counterbalanced stimulus pool.
- Confirm that `word_number` is the CounterBalance lexical item number from `stimuli/CounterBalance.xlsx`; source filename positions must be stored only as `source_word_number`.
- Confirm that `ENG` rows are explicitly `natural`, never blank or `accented`; `JPN` and `CHN` rows must be explicitly labeled `natural` or `accented`.
- If using an external manifest, set `COUNTERBALANCE_ALLOWED_HOSTS` to the expected manifest/audio hostnames.
- Run `python3 scripts/audit_lexical_balance.py` and confirm `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_pairwise_differences.csv` has no unresolved imbalance flags.
- Run `python3 scripts/audit_audio_qc.py` and resolve or explicitly accept launch-blocking flags in `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_qc_issues.csv`. The current QC report has 0 launch-blocking failure rows after the `jpn_s06` / `capelin` OSF package copy was repaired.
- Run `node scripts/validate_audio_hosting.mjs --sample 80` after production HTTPS audio URLs are generated, and use `--sample 0` for the final full-row probe before launch.
- Run `node scripts/preflight_production.mjs`. If the repository is not checked out next to `Stimuli_OSF_Release_20260703`, pass `--package-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`. It must pass before Prolific launch. When the production R2 manifest is provided through `COUNTERBALANCE_MANIFEST_URL`, pass `--production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv --using-external-manifest-secret`.
- Run `node scripts/check_live_deployment.mjs --api-dry-run-start` after deployment. It must pass before Prolific launch. During a no-Turnstile pilot only, use `node scripts/check_live_deployment.mjs --allow-turnstile-off --api-dry-run-start` and document that exception. If the static manifest is intentionally demo-only because `COUNTERBALANCE_MANIFEST_URL` is configured, add `--allow-demo-static-manifest`.
- Run `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off --production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv --using-external-manifest-secret` after Wrangler authentication is available; this is the aggregate launch gate.
- Run `node scripts/stress_live_counterbalance_concurrency.mjs --participants 40` after the live API dry-run passes. This creates dry-run starts only and verifies that one simultaneous wave spreads across the 20 cells with assigned spread 0 or 1.
- For the final launch gate, run `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off --production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv --using-external-manifest-secret --live-concurrency-stress`.
- Complete a live pilot reload test: save trials, reload the same stable Prolific-style URL, confirm that all four practice items repeat before the first unsaved main trial or later saved-session state, then finish and verify completion/export rows.
- Run `python3 scripts/stress_counterbalance_concurrency.py --participants 200` and keep the generated concurrency report with the OSF metadata.
- Run `node scripts/verify_counterbalance.mjs` and `node scripts/simulate_counterbalance_design.mjs`.
- Use rolling Prolific recruitment until the target completed-session count is reached; do not rely on one fixed launch batch if dropouts must be replaced.
- Review `EXPERIMENTAL_DESIGN_REVIEW.md` and resolve all final-stimulus placeholders before production launch.
- Confirm that one pilot run presents four 25-trial blocks with calculation distractor tasks between Blocks 1-3.
- Confirm that the intended D1 data location or jurisdiction is acceptable for the ethics and data management plan.
- Confirm that `/admin/` requires the real `ADMIN_TOKEN`.
- Confirm that `/admin/` shows the full Prolific ID and all background responses, and that its live/dry-run filter and pagination work.
- Confirm the final screen lists exactly the canonical 50 English words without translations, uses the corrected unfamiliar/blank instruction, and preserves Accentedness before Comprehensibility in task instructions and practice feedback.
- Download `sessions.csv`, `word-familiarity.csv`, `quality.csv`, and `analysis.csv`; verify checklist coverage, `capelin` word number 23, trial-level `word_known`, questionnaire columns, and the stable `session_id` analysis join key.
- Complete at least one full pilot run and one partial dropout pilot, then download all CSV files from `/admin/`.

## Local UI Testing Only

For local interface checks without Cloudflare persistence:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/?manual=1&local=1
```

This mode is only for UI testing. It should not be used for Prolific data collection.
