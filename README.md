# Pronunciation Rating Platform

This static browser platform collects three listener-based measures from participant speech recordings:

- `comprehensibility_1_9`: 1 = very easy to understand, 9 = extremely difficult to understand.
- `accentedness_1_9`: 1 = no noticeable accent, 9 = extremely strong accent.
- `intelligibility`: typed spelling of the heard word, with exact-match auto-scoring when the target word is available.

The design follows the listener-based word-level measurement logic in Uchihara (2022), adapted to a 9-point scale and a combined trial format.

## Entry Point

```text
Rating_Platform/index.html
```

From `Experiment/`, preview locally with:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/Rating_Platform/
```

## Workflow

1. Enter a participant ID and session label.
2. Answer the required daily-life familiarity questions for Japanese and Chinese separately on 6-point scales: 1 = not familiar, 6 = very familiar.
3. Load the automatically loaded stimulus manifest, or upload local WAV files for manual testing.
4. Optionally upload a local manifest CSV with metadata.
5. In the server-backed study, the task mode is fixed to `Combined`: ratings and dictation in the same trial.
6. Click `Prepare counterbalanced session` for server-backed stimulus-pool audio, or `Prepare trials` for local manual audio.
7. Click `Start practice`.
8. Complete the practice session:
   - 6 placeholder combined trials.
   - Each trial asks for the typed English word plus both ratings.
   - If the word cannot be identified, participants can mark `I could not identify the word` instead of typing a forced guess.
   - The correct word and reference ratings are shown after each practice response.
9. For each sample, play the audio, use `Play again` only if needed, then complete the displayed response fields.
10. In the server-backed counterbalanced task, complete a short calculation distractor task between main stimulus-list blocks.
11. At the end, the participant is returned to Prolific only after the server marks the session as completed. If saving needs review, the participant is told to contact the researcher. If the participant leaves mid-task, saved trials remain in D1, but no Prolific completion URL is issued.

## GitHub Audio Workflow

Use `remote_manifest.csv` when stimulus recordings are already uploaded to GitHub, GitHub Pages, Cloudflare Pages, R2, or another static host. The bundled `remote_manifest.csv` is a small demo manifest, not a production counterbalance manifest. For production, replace it with the final counterbalance-ready manifest or set `COUNTERBALANCE_MANIFEST_URL`. A custom manifest URL is available through the `Use a custom stimulus manifest` option for local/manual preview workflows.

For the Cloudflare/Prolific version, server-side counterbalancing is enabled by default. The server reads the authoritative stimulus pool from `remote_manifest.csv`, or from the `COUNTERBALANCE_MANIFEST_URL` Pages secret when that secret is set, and assigns each participant to one of 20 counterbalance cells. External manifest URLs must use HTTPS, and `COUNTERBALANCE_ALLOWED_HOSTS` can restrict manifest/audio hosts. The browser does not provide the main stimulus pool to `/api/session/start`. Participant write APIs require a per-session token issued by `/api/session/start`; the token hash is stored in D1 and the raw token is kept only in browser memory. In production, `/api/session/start` requires `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`; D1 enforces one `participant_key` per `STUDY_ID + PROLIFIC_PID`. Use `?manual=1` only for the older manual participant-selection workflow.

For live dry runs, open `/admin/dry-run.html` after Cloudflare Access login. The page generates a unique URL with `STUDY_ID=DRY_RUN`, `dry_run=1`, and synthetic Prolific-style IDs. Dry-run sessions use the same server manifest, block construction, and counterbalance assignment code as production, but their counterbalance allocation statuses are stored as `dry_run_*`. They are excluded from `analysis.csv`, `quality.csv`, and production counterbalance counts; restricted raw exports still include them for audit.

Recommended GitHub Pages layout:

```text
Rating_Platform/
  index.html
  remote_manifest.csv
  recordings/
    jpn/
      natural/
      accented/
    chn/
      natural/
      accented/
    ame/
      natural/
```

In this layout, `remote_manifest.csv` can use relative paths:

```csv
audio_file,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number
recordings/jpn/natural/list_a_word_006_icicle.wav,icicle,JPN_S01,JPN,natural,A,6
recordings/chn/accented/list_a_word_016_paper.wav,paper,CHN_S01,CHN,accented,A,16
recordings/ame/natural/list_a_word_001_candle.wav,candle,AME_S01,AME,natural,A,1
```

You can also use an absolute `audio_url` column for raw GitHub or another static host:

```csv
audio_url,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number
https://example.com/recordings/jpn/natural/list_a_word_006_icicle.wav,icicle,JPN_S01,JPN,natural,A,6
```

Manual participant-selection flow with `?manual=1`:

1. Enter `Participant ID`.
2. Check one or more `Participant ID` values.
3. Click `Prepare checked participants`.
4. Start practice.

The downloaded CSV and assignment JSON include `audio_url`, `source_path`, and `participant_id` so the rated material can be audited later. See `remote_manifest_template.csv` for a minimal template.

## Manifest CSV

The manifest is optional. The platform can infer target words from these existing filename patterns:

```text
001_production_001_icicle.wav
001_japanese_pass01_natural_english_word001_icicle_take01_trial0001_talker_m1_guy.wav
```

Use a manifest when filenames do not include enough metadata or when you want to preserve experimental condition labels.

Supported column names include:

- `audio_file`, `file`, `filename`, or `path`
- `audio_url`, `url`, `source_url`, or `raw_url`
- `target_word`, `word`, `item`, or `expected_word`
- `participant_id`, `participant`, `speaker_id`, or `speaker`
- `l1_condition`, `l1`, `native_language`, `native`, or `speaker_l1`
- `pronunciation_condition`, `pronunciation`, `accent_condition`, `accent`, or `style`
- `stimulus_list`, `list`, `list_id`, or `counterbalance_list`
- `condition`, `pass_condition`, or `variability_condition`
- `talker`, `talker_id`, `voice`, or `voice_alias`
- `pass_number`, `trial_number`, `word_number`, `take_number`
- `spoken_form`, `spoken_text`, or `prompt`
- `practice_note`, `note`, or `notes`

See `manifest_template.csv`.

## Server-side Counterbalancing

The Cloudflare version assigns each participant to one of 20 cells:

- 10 list combinations: `ABCD`, `BCDE`, `CDEF`, `DEFG`, `EFGH`, `FGHI`, `GHIJ`, `HIJA`, `IJAB`, `JABC`
- 2 pronunciation styles: `a` and `b`

Each participant receives 100 main trials in four stimulus-list blocks:

- 4 stimulus lists per participant.
- 25 trials per stimulus list.
- Per list: 5 `AME`, 10 `JPN`, and 10 `CHN` items.
- `AME` items are native-speaker natural reference items.
- For `JPN` and `CHN`, each block has exactly 5 `natural` and 5 `accented` items.
- Style `a` assigns the 1st, 3rd, 5th, 7th, and 9th selected `JPN`/`CHN` items in that list to `natural`; style `b` reverses this assignment.

The selected list combination is also the block order. For example, cell `ABCD` presents:

```text
Block 1: List A, 25 trials
Calculation distractor task
Block 2: List B, 25 trials
Calculation distractor task
Block 3: List C, 25 trials
Calculation distractor task
Block 4: List D, 25 trials
```

Main trials are randomized within each 25-trial block. The 100 main trials are not globally shuffled across blocks.

The block-level randomizer rejects within-block orders where the same L1 group (`AME`, `JPN`, or `CHN`) occurs 3 or more times consecutively.

The server balances cells by completed sessions. If completed counts are tied, it uses assigned/start counts as a secondary criterion so simultaneous starts do not all claim the same cell. Incomplete or dropped sessions are not counted as completed.

This works best as rolling recruitment: continue recruiting until the target number of completed sessions is reached, then finalize stale sessions and check the completed count per cell. If a fixed batch of participants is launched all at once and recruitment stops before replacing dropouts, the assigned counts can be balanced while completed counts are still uneven. The counterbalance algorithm can compensate only when later participants are allowed to enter after dropouts are known or finalized.

If a participant closes the page or stops responding, the session remains `started` until a researcher finalizes stale sessions from `/admin/`. Finalization uses `last_seen_at_ms` and marks stale partial sessions as `incomplete_dropout` and stale zero-response sessions as `abandoned`. Their saved trial rows remain available in `ratings.csv` and their planned assignments remain available in `assignments.csv`, but `analysis.csv` continues to include completed sessions only.

Counterbalance reference files:

- `counterbalance_table.csv`: the 20 allocation cells.
- `counterbalance_list_specs.csv`: the A-J word-number ranges.
- `remote_manifest_template.csv`: recommended stimulus manifest columns.
- `scripts/verify_counterbalance.mjs`: local verification for 100-trial generation and no-3-consecutive same-L1 ordering.
- `scripts/simulate_counterbalance_design.mjs`: placeholder-material audit for cell balance, list position balance, and dropout allocation behavior.
- `EXPERIMENTAL_DESIGN_REVIEW.md`: reviewer-facing design specification, risk register, and final-stimulus checklist.

Recommended production manifest columns:

```csv
audio_file,audio_url,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number,condition,talker,take_number,spoken_form,practice_note
```

Use `natural` or `accented` in `pronunciation_condition`. `AME` rows must be explicitly labeled `natural`; `JPN` and `CHN` rows must be explicitly labeled `natural` or `accented`. The participant-level `pronunciation_style` values `a` and `b` are assigned by the server and should not be used as row-level pronunciation labels. The `a`/`b` labels describe complementary within-list assignment patterns, not global odd/even word-number rules.

`stimulus_list` is optional in the code, but including it is recommended. If several rows share the same `L1 x word_number x pronunciation_condition`, the server selects one row per required trial using the session seed. The final order is then randomized within each stimulus-list block with the no-3-consecutive same-L1 constraint.

Block metadata is saved in `rating_assignments`, `rating_trials`, local backup CSVs, and admin CSV exports:

- `block_index`: 1-4.
- `block_list`: A-J.
- `within_block_index`: 1-25.
- `block_trial_count`: normally 25.

Between Blocks 1-3, the browser presents a short arithmetic distractor task. Distractor completion is stored as `event_logs.event_type = distractor_complete` with responses and response time in `payload_json`.

To verify the counterbalance logic locally:

```sh
node scripts/verify_counterbalance.mjs
node scripts/simulate_counterbalance_design.mjs
```

`simulate_counterbalance_design.mjs` reports separate dropout scenarios for rolling recruitment, single-batch fixed starts, rolling recruitment to a completed target, and cell-correlated dropout.

## Cloudflare and GitHub Separation

This project is designed so GitHub stores only application code, public documentation, schemas, templates, and non-sensitive placeholder/demo materials.

Do not commit:

- `wrangler.toml` with real Cloudflare IDs if the project policy treats IDs as internal.
- `.dev.vars`, `.env`, API tokens, or `ADMIN_TOKEN`.
- D1 exports containing participant responses.
- R2 object exports or private audio files that should not be public.
- Prolific participant identifiers or downloaded study data.

Production response data is stored in Cloudflare D1. Large/private audio assets should be served from Cloudflare R2 or another approved storage location. Secrets such as `ADMIN_TOKEN` and private manifest URLs should be stored with Cloudflare Pages Secrets, not in GitHub.

Cloudflare Pages can still be connected to GitHub for deployment: GitHub provides the code, while runtime data and secrets stay in Cloudflare services.

## Demo Materials

Synthetic demo materials can be generated locally on macOS:

```sh
bash Rating_Platform/scripts/generate_practice_accent_audio.sh
```

This creates:

```text
Rating_Platform/practice_audio/english/{chocolate,coffee,pizza,sofa}.wav
Rating_Platform/practice_audio/japanese/{chocolate,coffee,pizza,sofa}.wav
Rating_Platform/practice_audio/chinese/{chocolate,coffee,pizza,sofa}.wav
Rating_Platform/practice_manifest.csv
```

The English samples use English TTS. The Japanese samples use katakana-shaped forms such as `チョコレート`, and the Chinese samples use comparable loanword/cognate forms such as `巧克力`. These are for interface checks only, not for final data collection.

After generating the files, start the local web server and click `Load demo materials` in the setup screen. The bundled demo loader uses browser `fetch`, so use `http://127.0.0.1:8765/Rating_Platform/` rather than opening `index.html` directly from Finder.

## Built-in Practice Session

The server-backed task automatically starts with a practice session before main ratings.

Current practice audio and reference ratings are placeholders:

- 6 combined practice items that are not part of the main 50-word set:
  - 2 very natural items
  - 2 mildly accented items
  - 2 strongly accented items
- Each practice trial follows the main-task flow: play the audio, type the English word, rate ease of understanding, and rate accent strength.
- Practice feedback shows the correct word and reference ratings. It does not ask participants to justify their ratings.

Practice audio paths are placeholders under `practice_training_audio/`. Until final WAV files are supplied, the browser plays a short placeholder tone so the interface flow can be tested. Replace these placeholder paths and reference values in `app.js` before production launch.

## Output

The ZIP contains:

- `{rater}_{session}_pronunciation_ratings.csv`
- `{rater}_{session}_pronunciation_ratings_assignment.json`

Important CSV columns:

- `typed_response`
- `normalized_response`
- `target_word`
- `intelligibility_exact`
- `intelligibility_needs_manual_review`
- `intelligibility_response_status`
- `intelligibility_unidentified`
- `first_key_rt_ms`
- `submit_rt_ms`
- `comprehensibility_1_9`
- `accentedness_1_9`
- `expert_comprehensibility_1_9`
- `expert_accentedness_1_9`
- `practice_feedback`
- `practice_requires_reason`
- `practice_reason`
- `japanese_familiarity_1_6`
- `chinese_familiarity_1_6`

Exact-match scoring is intentionally conservative. Following Uchihara (2022), minor misspellings can be treated as correct during later manual coding; non-exact rows are flagged with `intelligibility_needs_manual_review = 1`.

If a participant cannot identify the word, the response is saved as `intelligibility_response_status = unidentified` and `intelligibility_unidentified = 1`. This is scored as `intelligibility_exact = 0` but is not treated as a spelling/manual-review case. Empty dictation without the unidentified marker remains a data-quality problem and is counted separately in `blank_dictation_count`.

## Server-backed Cloudflare Version

This folder also contains a Cloudflare Pages + Functions + D1 version for Prolific-style data collection where raters should not email downloaded files.

Deployment steps are documented in [`DEPLOY_CLOUDFLARE.md`](DEPLOY_CLOUDFLARE.md).

Server-side files:

```text
functions/api/
  session/start.js       # create a rater session and persist trial order
  trial.js               # save each rating trial immediately
  event.js               # save UI/event logs
  session/complete.js    # mark a session complete
  admin/summary.js       # admin counts
  admin/finalize-stale.js # mark stale started sessions as dropout/abandoned
  admin/export/[dataset].js
admin/
  index.html             # researcher export page
db/schema.sql            # D1 schema
db/migrations/           # one-time migrations for existing D1 databases
wrangler.toml.example    # binding example
```

Apply the D1 schema after creating a D1 database:

```sh
wrangler d1 execute <DB_NAME> --file=./db/schema.sql
```

If the D1 database was created before counterbalancing was added, run this migration once instead of recreating the database:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0002_counterbalance.sql
```

Then apply the hardening migration, which is safe to run more than once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0003_hardening.sql
```

If the D1 database was created before block-level counterbalancing was added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0004_block_counterbalance.sql
```

If the D1 database was created before session-token hardening was added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0005_session_security.sql
```

If the D1 database was created before strict participant locking and millisecond audit fields were added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0006_participant_lock_ms.sql
```

If this migration fails on an existing pilot database because duplicate Prolific IDs already exist, export `sessions.csv`, resolve or archive the duplicate pilot rows, and rerun the migration.

For existing databases, add the stale-session lookup index:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0007_stale_session_index.sql
```

If the D1 database was created before the explicit unidentified-word response was added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0008_intelligibility_unidentified.sql
```

If the D1 database was created before response-order and rating-process metrics were added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0009_response_order_metrics.sql
```

Configure the Pages Functions D1 binding as `DB`. Set an admin token as a Cloudflare secret:

```sh
wrangler pages secret put ADMIN_TOKEN
```

Set the Prolific completion code as a Cloudflare secret, not as a participant URL query parameter:

```sh
wrangler pages secret put PROLIFIC_COMPLETION_CODE
```

If the production manifest should not be committed as `remote_manifest.csv`, set an authoritative manifest URL as a Pages secret:

```sh
wrangler pages secret put COUNTERBALANCE_MANIFEST_URL
```

Admin APIs fail closed when `ADMIN_TOKEN` is missing.
For production, protect `/admin/*` and `/api/admin/*` with Cloudflare Access and set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `CF_ACCESS_ALLOWED_EMAILS`; `ADMIN_TOKEN` remains as a second layer.

Rater responses are saved trial-by-trial to D1. The local ZIP download remains as a backup, but the server-backed workflow advances only after the current response has been saved. The Prolific return URL is issued only by `/api/session/complete` after all trials are present and the session token is valid.

Each saved trial includes process fields for order and fatigue analyses: `trial_index`, `block_index`, `within_block_index`, `response_order`, `first_response_field`, `first_response_rt_ms`, `rating_order`, `rating_interaction_sequence`, first/last RTs for each rating scale, rating selection counts, `submit_rt_ms`, `first_key_rt_ms`, and `replay_count`. Audio replay starts are also logged in `events.csv` with replay status and relative play time.

Mid-task dropouts keep their partial rows in D1. On `/admin/`, use `Finalize stale sessions` after the configured inactivity window, typically 240 minutes or longer during live collection. This marks stale `started` sessions as `incomplete_dropout` or `abandoned` and keeps them out of `analysis.csv`; inspect them through `quality.csv` and raw exports.

The researcher export page is:

```text
/admin/
```

Use `Download all CSVs ZIP` for routine exports. It downloads every CSV below in one archive while preserving the individual long-format CSV files for analysis scripts and audit checks.

Available CSV exports:

- `analysis.csv`: analysis-ready main-trial responses from completed sessions only. Prolific IDs are excluded and rows are labeled with `analysis_participant_id`.
- `quality.csv`: anonymized one-row-per-session quality export with completion status, missing-trial counts, active elapsed time, replay summaries, distractor accuracy/RT summaries, timing summaries, unidentified-word counts, manual-review counts, and response-quality flags.
- `ratings.csv`: restricted raw export with all practice and main responses, response times, response-order fields, rating interaction fields, intelligibility fields, 9-point rating values, practice feedback/reasons, familiarity ratings, and audio metadata.
- `sessions.csv`: participant/session/prolific metadata, `participant_key`, familiarity ratings, completion code, counterbalance cell, millisecond audit fields, duplicate-start counts, and completion status.
- `assignments.csv`: trial order shown to each participant, including counterbalance list/L1/pronunciation fields.
- `events.csv`: session start, trial display, audio playback, first key, save, pause, and completion logs.
- `counterbalance.csv`: cell allocation logs and completion status.

For local export smoke testing without Cloudflare, generate a 200-participant D1-like dataset and CSV exports:

```sh
python scripts/generate_smoke_test_200.py --participants 200
```

The generated SQLite database and CSV files are written to `exports/smoke_test_200/`.

To verify dropout handling, generate the same smoke dataset with finalized incomplete sessions:

```sh
python scripts/generate_smoke_test_200.py --participants 200 --dropouts 30
```

This writes to `exports/smoke_test_200_dropout_30/`. `analysis.csv` contains completed main trials only, while `quality.csv`, `sessions.csv`, `ratings.csv`, and `counterbalance.csv` expose the dropout status and partial saved data.

For local-only testing without a Cloudflare API, open the page with `?local=1`. Do not use `?local=1` for Prolific data collection because it permits advancing without server persistence.
