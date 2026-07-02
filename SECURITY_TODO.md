# Cloudflare Security TODO

This checklist is for the Cloudflare Pages + Pages Functions + D1 deployment of the Rating Platform. It assumes production rater responses are stored in D1, sensitive configuration is stored in Cloudflare secrets, and private audio or manifests are not committed to GitHub.

Priority:

- `P0`: Complete before production data collection.
- `P1`: Complete before the first full external pilot.
- `P2`: Operational hardening after the core controls are in place.

## P0 - Production Gate

- [x] Add security headers for static Pages assets.
  - Add a `_headers` file in the Pages output root.
  - Include at minimum `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
  - Keep CSP compatible with the current static app, audio files, Cloudflare Pages Functions, and optional Turnstile script.
  - Acceptance: browser devtools shows the expected headers on `/`, `/admin/`, `app.js`, and static audio/CSV assets.

- [x] Add the same security headers to Pages Functions responses.
  - `_headers` does not apply to Pages Functions responses, so extend `jsonResponse()` and `textResponse()` in `functions/api/_utils.js`.
  - Include API-safe `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
  - Acceptance: `/api/session/start`, `/api/trial`, `/api/session/complete`, `/api/admin/summary`, and `/api/admin/export/ratings.csv` return expected headers.

- [ ] Replace single shared `ADMIN_TOKEN` with stronger admin access.
  - Preferred: protect `/admin/*` and `/api/admin/*` with Cloudflare Access using named researcher accounts.
  - Done in code: admin APIs verify Cloudflare Access JWTs when `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are configured.
  - Keep `ADMIN_TOKEN` as a second-layer API secret.
  - Done in code: browser `localStorage` persistence of the admin token was removed from `admin/admin.js`; use in-memory storage per page session instead.
  - Acceptance: unauthorized users cannot reach admin UI or admin APIs; token is not retained after tab close.

- [x] Add request authentication for participant write APIs.
  - Issue a per-session server token from `/api/session/start`.
  - Require that token on `/api/trial`, `/api/event`, and `/api/session/complete`.
  - Bind token to `session_id` and store only a hash in D1.
  - Acceptance: a guessed `session_id` cannot write or complete another session.

- [x] Enforce strict one-session participant locking.
  - Done in code/schema: derive `participant_key` from `STUDY_ID + PROLIFIC_PID`.
  - D1 enforces `idx_sessions_participant_key_unique`.
  - Done in code: production requires `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
  - Done in code: duplicate starts for open sessions resume the same session; duplicate starts for closed sessions return 409 and no new token.
  - Done in code/schema: store millisecond audit fields for start, last seen, completion, completion URL issue, and duplicate starts.
  - Acceptance: two simultaneous starts for the same Prolific participant produce one session row and one counterbalance allocation.

- [ ] Add anti-abuse checks to session start and trial save.
  - Done in code: optional Turnstile support is wired for session start with server-side token validation.
  - Configure Cloudflare Turnstile keys and set `REQUIRE_TURNSTILE=1` before production if participant friction is acceptable.
  - Add Cloudflare WAF rate limiting rules for `/api/session/start`, `/api/trial`, `/api/event`, `/api/session/complete`, and `/api/admin/*`.
  - Acceptance: repeated automated starts and high-frequency writes are challenged or throttled without blocking normal Prolific flow.

- [ ] Enforce production mode server-side.
  - Add an environment flag such as `ENVIRONMENT=production`.
  - Done in code: in `ENVIRONMENT=production`, `/api/session/start` rejects browser-provided manual assignments and requires server-side counterbalancing.
  - Done in code: the static UI blocks start in production mode when `?local=1` or `?manual=1` would bypass server persistence or counterbalancing.
  - Done in code: in `ENVIRONMENT=production`, `/api/session/start` requires `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`.
  - Acceptance: production URL cannot bypass D1 persistence or server-side counterbalancing via query parameters.

- [ ] Remove placeholder study values before production.
  - Replace placeholder practice audio paths and expert ratings.
  - Done in code/docs: client-supplied `completion_code` was removed from the participant URL flow; use `PROLIFIC_COMPLETION_URL` or `PROLIFIC_COMPLETION_CODE` instead.
  - Current live blockers are external configuration/state: public `remote_manifest.csv` is still demo-sized and remote D1 is missing `speaker_pattern_index` until schema updates are applied.
  - Verify with `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off` after deployment while Turnstile is intentionally disabled; omit `--allow-turnstile-off` before production if Turnstile is required.
  - Acceptance: grep finds no `PLACEHOLDER`, demo-only manifest paths, or production-ineligible practice notes in production config.

## P1 - Data Protection

- [ ] Decide and document the data classification.
  - Classify Prolific IDs, response text, familiarity ratings, user agent, event logs, and audio source metadata.
  - Decide whether `rater_id` should be a research pseudonym or a Prolific-derived identifier.
  - Acceptance: `README.md` or deployment docs state what is collected, why, and who can export it.

- [x] Minimize participant identifiers in exports.
  - Done in code: `analysis.csv` is analysis-ready and excludes Prolific IDs, user agent, D1 `session_id`, and server timestamp fields.
  - Done in code: `quality.csv` is anonymized with `analysis_participant_id`; raw participant/session IDs remain in restricted exports only.
  - Done in code: raw restricted exports remain available as `ratings.csv`, `sessions.csv`, `assignments.csv`, `events.csv`, and `counterbalance.csv`.
  - Done in UI: admin export buttons distinguish analysis/quality exports from raw table exports.
  - Acceptance: admin export UI clearly distinguishes raw and pseudonymized datasets.

- [ ] Add retention and deletion procedure.
  - Define D1 retention period for sessions, trials, assignments, and event logs.
  - Add a documented deletion script or admin endpoint for removing one participant by Prolific/session ID.
  - Acceptance: a test participant can be fully located and removed from all D1 tables.

- [x] Define and implement dropout handling.
  - Done in code: admin stale-session finalization marks partial sessions as `incomplete_dropout` and zero-response sessions as `abandoned`.
  - Done in code: Prolific completion URLs are not issued for dropout/abandoned sessions.
  - Done in exports: `analysis.csv` excludes non-completed sessions; `quality.csv` and raw exports retain dropout status and partial data.
  - Acceptance: a simulated partial session can be finalized, excluded from analysis export, and audited in `events.csv`.

- [x] Separate unidentified words from missing dictation.
  - Done in UI: participants can mark `I could not identify the word` instead of entering a forced guess.
  - Done in code/schema: save `intelligibility_response_status` and `intelligibility_unidentified`.
  - Done in exports: unidentified responses are counted separately from blank dictation and manual-review spelling cases.
  - Acceptance: an unidentified response is scored as `intelligibility_exact = 0`, does not inflate manual-review counts, and is visible in analysis and quality exports.

- [ ] Back up D1 with a defined recovery window.
  - Use D1 Time Travel for short-term recovery.
  - For longer retention, schedule D1 export to R2 or another approved private store.
  - Encrypt or tightly restrict backup access.
  - Acceptance: a test restore/export procedure has been run and documented.

- [ ] Lock down stimulus and audio storage.
  - Decide whether final audio can be public. If not, store in private R2 and serve through signed or access-controlled URLs.
  - Keep `COUNTERBALANCE_MANIFEST_URL` private when it reveals unpublished stimuli or participant recording metadata.
  - Acceptance: public repository and public Pages assets contain no private audio, private manifest URLs, or participant recordings.

## P1 - API Hardening

- [x] Add strict input validation.
  - Enforce required 1-9 ratings, required 1-6 familiarity values, trial indexes, task modes, phase names, and string lengths.
  - Reject oversized JSON bodies before parsing where practical.
  - Acceptance: malformed or oversized requests return 400/413 and do not write to D1.

- [x] Make admin token comparison timing-safe where possible.
  - Avoid plain string equality for secrets.
  - If Cloudflare Access is adopted, keep this as defense in depth rather than the primary protection.
  - Acceptance: admin auth helper has tests or a small verification script for accepted/rejected credentials.

- [ ] Add CSRF and origin checks for admin APIs.
  - Done in code: reject unexpected `Origin` values on admin endpoints.
  - Reject unexpected `Origin` or `Sec-Fetch-Site` values.
  - Acceptance: cross-site form/fetch attempts cannot trigger admin CSV export.

- [x] Constrain outbound manifest fetching.
  - Done in code: external `COUNTERBALANCE_MANIFEST_URL` sources must use `https`.
  - Done in code: `COUNTERBALANCE_ALLOWED_HOSTS` or `COUNTERBALANCE_MANIFEST_ALLOWED_HOSTS` can restrict manifest and audio URL hosts.
  - Acceptance: non-HTTPS or unexpected-host manifest sources fail closed.

- [ ] Add structured error handling.
  - Avoid returning raw exception messages to participants for internal failures.
  - Log enough diagnostic detail server-side, but return stable public error codes/messages.
  - Acceptance: failed D1/config/manifest cases do not expose secrets, URLs, SQL details, or stack traces to clients.

## P1 - Cloudflare Configuration

- [ ] Configure branch and preview deployment controls.
  - Limit preview deployments to trusted branches or disable them for sensitive branches.
  - Protect preview URLs with Cloudflare Access if they expose admin UI, real manifests, or real D1 bindings.
  - Acceptance: untrusted branches cannot publish a preview connected to production data.

- [ ] Separate production and preview resources.
  - Use separate D1 databases for production and preview/testing.
  - Use separate secrets for production and preview.
  - Acceptance: preview deployment writes never appear in production D1.

- [ ] Set Cloudflare WAF custom rules for admin paths.
  - Protect `/admin/*` and `/api/admin/*` with Access, IP allowlist, managed challenge, or equivalent policy.
  - Acceptance: admin paths are not publicly reachable with only the URL.

- [ ] Confirm TLS and custom domain policy.
  - Use the final custom domain for production participant links.
  - Add `X-Robots-Tag: noindex` for `*.pages.dev` and preview deployments.
  - Acceptance: search indexing is disabled for preview/default Pages domains.

## P2 - Monitoring and Operations

- [ ] Add operational monitoring.
  - Track unexpected spikes in session starts, incomplete sessions, trial save failures, admin export requests, and 4xx/5xx rates.
  - Done in code: admin summary reports `started`, stale `started`, `incomplete_dropout`, and `abandoned` session counts.
  - Define who receives alerts and how quickly to respond during data collection.
  - Acceptance: pilot run produces a reviewable operations log.

- [ ] Add admin audit events.
  - Record admin summary/export access with dataset name, timestamp, and authenticated admin identity when available.
  - Done in code: admin summary, export, and stale-session finalization write audit rows to `event_logs`.
  - Avoid logging the admin token.
  - Acceptance: each export can be tied to an authorized researcher account or admin session.

- [ ] Add security smoke tests.
  - Test missing D1 binding, missing `ADMIN_TOKEN`, invalid admin token, duplicate Prolific starts, invalid trial index, replayed trial save, missing session token, and production `?local=1`.
  - Added production preflight: `node scripts/preflight_production.mjs` checks production manifest shape, demo-manifest leakage, audio QC failures, lexical balance flags, provisional practice ratings, duration summary, and static security files.
  - Added live deployment check: `node scripts/check_live_deployment.mjs --api-dry-run-start` checks public app-bundle drift, demo/static manifest exposure, selected practice audio deployment, production config, admin dry-run protection, live D1 schema compatibility, and server-side counterbalance assignment.
  - Added guarded D1 schema updater: `node scripts/apply_d1_schema_updates.mjs --database accentedness-rating --apply --backup-before-apply` checks live columns, exports a SQL backup, and applies only missing additive columns.
  - Added aggregate Cloudflare readiness audit: `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off` combines Wrangler authentication, Pages secrets, Pages deployment visibility, D1 info, D1 schema drift, production preflight, and live API dry-run checks.
  - Added hosted-audio URL probe: `node scripts/validate_audio_hosting.mjs --sample 80` checks HTTPS `audio_url` presence and sampled network reachability.
  - Added local simultaneous-start stress test: `python3 scripts/stress_counterbalance_concurrency.py --participants 200` checks counterbalance spread and duplicate participant-key rejection under same-timestamp starts.
  - Added live simultaneous-start stress test: `node scripts/stress_live_counterbalance_concurrency.mjs --participants 40` checks the deployed D1-backed dry-run start endpoint.
  - Acceptance: documented command or checklist passes before each production deployment.

- [ ] Document incident response.
  - Include steps for rotating secrets, disabling Pages deployment, exporting D1 evidence, invalidating exposed manifests/audio URLs, and notifying stakeholders.
  - Acceptance: one-page runbook exists in the deployment docs.

- [ ] Review repository contents before public release.
  - Scan for `.env`, `.dev.vars`, `wrangler.toml`, API tokens, private URLs, private audio, D1 exports, and downloaded participant response files.
  - Acceptance: clean scan is recorded before pushing or deploying.

## References

- Cloudflare Pages custom headers: https://developers.cloudflare.com/pages/configuration/headers/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare WAF rate limiting rules: https://developers.cloudflare.com/waf/rate-limiting-rules/
- Cloudflare WAF custom rules: https://developers.cloudflare.com/waf/custom-rules/
- Cloudflare Access policies: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
- Cloudflare Access application paths: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- Cloudflare Access JWT validation: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Cloudflare Pages bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare D1 Time Travel and backups: https://developers.cloudflare.com/d1/reference/time-travel/
