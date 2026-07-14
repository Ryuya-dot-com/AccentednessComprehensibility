# Pronunciation Rating Platform

This static browser platform collects three listener-based measures from participant speech recordings:

- `accentedness_1_9`: 1 = no accent, 9 = extremely strong accent.
- `comprehensibility_1_9`: 1 = easy to understand, 9 = extremely difficult to understand.
- `intelligibility`: typed spelling of the heard word, with exact-match auto-scoring when the target word is available.

The design follows the listener-based word-level measurement logic in Uchihara (2022), adapted to a 9-point scale and a combined trial format.

## Entry Point

```text
index.html
```

From the repository root, preview locally with:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/?manual=1&local=1
```

## Workflow

1. Enter a participant ID and session label.
2. Answer the required daily-life familiarity questions for Japanese and Chinese separately on 6-point scales: 1 = not familiar, 6 = very familiar.
3. Load the automatically loaded stimulus manifest, or upload local WAV files for manual testing.
4. Optionally upload a local manifest CSV with metadata.
5. In the server-backed study, the task mode is fixed to `Combined`, shown as separate word-identification and rating pages for each trial.
6. Click `Prepare counterbalanced session` for server-backed stimulus-pool audio, or `Prepare trials` for local manual audio.
7. Read the `Practice Session` introduction, which explains that the four samples familiarize participants with the procedure and calibrate Accentedness ratings against expert reference ranges, then click `Start practice`.
8. Complete the practice session:
   - 4 researcher-selected practice WAV trials, ordered from the lowest to the highest documented Accentedness band: `appreciation` (1–3), `pesticide` (3–5), `quality` (5–7), and `pizza` (7–9).
   - Each trial first asks for the typed English word, then shows a separate rating page.
   - If the word cannot be identified, participants can mark `I could not identify the word` instead of typing a forced guess.
   - After each practice response, the word played and its expert Accentedness reference range are shown. No scalar expert Accentedness or Comprehensibility value is asserted for these WAVs.
   - Audio can be replayed as many times as needed only while this practice feedback is visible. The word-identification and rating response pages still allow one playback each.
9. For each main-task sample, play the audio once on the word-identification page, type the word, continue, play the same audio once on the rating page, then rate accentedness followed by comprehensibility as displayed from top to bottom. Main-task feedback and replay are not provided.
10. In the server-backed counterbalanced task, complete a short calculation distractor task between main stimulus-list blocks.
11. After the final rating, review the 50-word familiarity checklist. Check words known before the study and leave unfamiliar words blank; all 50 explicit 0/1 responses are saved.
12. The participant is returned to Prolific only after all trials and the required checklist are saved and the server marks the session as completed. If saving needs review, the participant is told to contact the researcher. If the participant leaves mid-task, saved data remain in D1, but no Prolific completion URL is issued.

## GitHub Audio Workflow

Use `remote_manifest.csv` when stimulus recordings are already uploaded to GitHub, GitHub Pages, Cloudflare Pages, R2, or another static host. The bundled `remote_manifest.csv` is a small demo manifest, not a production counterbalance manifest. For production, replace it with the final counterbalance-ready manifest or set `COUNTERBALANCE_MANIFEST_URL`. A custom manifest URL is available through the `Use a custom stimulus manifest` option for local/manual preview workflows.

For the Cloudflare/Prolific version, server-side counterbalancing is enabled by default. The server reads the authoritative stimulus pool from `remote_manifest.csv`, or from the `COUNTERBALANCE_MANIFEST_URL` Pages secret when that secret is set, and assigns each participant to one of 20 list/style cells × 10 speaker-pattern bundles. External manifest URLs must use HTTPS, and `COUNTERBALANCE_ALLOWED_HOSTS` can restrict manifest/audio hosts. The browser does not provide the main stimulus pool to `/api/session/start`. Participant write APIs require a per-session token issued by `/api/session/start`; the token hash is stored in D1 and the raw token is kept only in browser memory. In production, `/api/session/start` requires `PROLIFIC_PID`, `STUDY_ID`, and `SESSION_ID`; D1 enforces one `participant_key` per `STUDY_ID + PROLIFIC_PID`. New production starts also require the `STUDY_ID` to be mapped to a server-authorized cohort in `COUNTERBALANCE_COHORTS_JSON`. Use `?manual=1` only for the older manual participant-selection workflow.

Configure Prolific with the stable Pages project URL, `https://accentednesscomprehensibility.pages.dev/`, plus Prolific's participant parameters. Never use a deployment-specific URL such as `https://<deployment-id>.accentednesscomprehensibility.pages.dev/`; it permanently targets that historical deployment and can continue serving an obsolete practice set after `main` is updated.

Before practice, participants complete the required background questionnaire: age; first-language English variety; gender; familiarity with Japanese-accented and Chinese-accented English; English-teaching experience; and relevant linguistics knowledge. `Other`/`Yes` detail fields are conditionally required. The server accepts only whole-number ages from 1–120, exact enumerated choices, familiarity ratings from 1–6, and bounded free text. Responses are stored once on the `sessions` row rather than copied into every trial. A `resume_only` lookup restores an open Prolific session and its saved background responses without asking the participant to answer the questionnaire again.

The final checklist contains the canonical 50 English target words in CounterBalance workbook number order. Meanings/translations are not shown because they would reveal the lexical knowledge being measured. A normalized `word_familiarity_responses` table stores one `word_known` value per session and word number. `analysis.csv` joins the appropriate 0/1 value to each main-trial row, so trials such as `capelin` can be filtered without inferring unfamiliarity from the dictation response. Sessions started by v0.6 and earlier remain compatible and export a blank checklist value rather than an incorrect zero.

For live dry runs, open `https://accentednesscomprehensibility.pages.dev/admin/dry-run.html` after Cloudflare Access login. The page generates a unique URL with `STUDY_ID=DRY_RUN`, `dry_run=1`, and synthetic Prolific-style IDs. Dry-run sessions use the same server manifest, block construction, and counterbalance assignment code as production, but their counterbalance allocation statuses are stored as `dry_run_*`. They are excluded from `analysis.csv`, `quality.csv`, and production counterbalance counts; restricted raw exports still include them for audit.

Recommended static host layout for small demo files:

```text
AccentednessComprehensibility/
  index.html
  remote_manifest.csv
  recordings/
    jpn/
      natural/
      accented/
    chn/
      natural/
      accented/
    eng/
      natural/
```

In this layout, `remote_manifest.csv` can use relative paths:

```csv
audio_file,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number
recordings/jpn/natural/list_a_word_006_icicle.wav,icicle,JPN_S01,JPN,natural,A,6
recordings/chn/accented/list_a_word_016_paper.wav,paper,CHN_S01,CHN,accented,A,16
recordings/eng/natural/list_a_word_001_candle.wav,candle,ENG_S01,ENG,natural,A,1
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

The Cloudflare version assigns each participant to one of 200 versioned microcells: 20 list/style cells crossed with 10 speaker-pattern bundles.

- 10 list combinations: `ABCD`, `BCDE`, `CDEF`, `DEFG`, `EFGH`, `FGHI`, `GHIJ`, `HIJA`, `IJAB`, `JABC`
- 2 pronunciation styles: `a` and `b`

Each participant receives 100 main trials in four stimulus-list blocks:

- 4 stimulus lists per participant.
- 25 trials per stimulus list.
- Per list: 5 `ENG`, 10 `JPN`, and 10 `CHN` items.
- `ENG` items are native-speaker natural reference items.
- For `JPN` and `CHN`, each block has exactly 5 `natural` and 5 `accented` items.
- Style `a` assigns the 1st, 3rd, 5th, 7th, and 9th selected `JPN`/`CHN` items in that list to `natural`; style `b` reverses this assignment.
- Each 25-trial block also receives one Sheet2 speaker pattern, indexed 1-10. The fixed four-block bundle is selected by `speaker_bundle_latin_v1`; it is not independently hashed per block. The pattern maps the five `ENG` positions to `eng_s01`-`eng_s05`, the ten `JPN` positions to `jpn_s01`-`jpn_s10`, and the ten `CHN` positions to `chn_s01`-`chn_s10`.
- Every bundle has two odd and two even patterns. Therefore every participant hears every `JPN` and `CHN` speaker exactly four times: two `natural` and two `accented`.

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

The block-level randomizer rejects within-block orders where the same L1 group (`ENG`, `JPN`, or `CHN`) occurs 3 or more times consecutively.

The server balances both the 20 cells and 200 cell×bundle microcells at session start. Counts are isolated by server-authorized `allocation_cohort` and `allocation_strategy_version`. The priority uses active-or-completed and completed counts before historical starts; ties use a session-derived offset over all 200 candidates. Incomplete or dropped sessions are not counted as completed after finalization.

This works as rolling recruitment to 200 completed sessions: finalize stale/dropout sessions, then continue recruiting until every cell×bundle microcell has one completion. At that full cycle, every word × analytic condition has 80 ratings, every non-ENG word × speaker × pronunciation token has 8 ratings, and every active ENG word × speaker token has 16 ratings. A fixed batch of 200 starts does not provide these completion guarantees when dropouts occur.

If a participant reloads or reopens the stable Prolific URL while the session is still `started`, the server issues a fresh session token for the same session. The browser deliberately presents all four practice items again, then continues at the first unsaved main trial, pending block distractor, final checklist, or completion state. Replayed practice does not overwrite an already saved practice response. Trial rows continue to use the familiarity and background values stored when the session first started. If a participant closes the page or stops responding, the session remains `started` until a researcher finalizes stale sessions from `/admin/`. Finalization uses `last_seen_at_ms` and marks stale partial sessions as `incomplete_dropout` and stale zero-response sessions as `abandoned`. It also marks stale orphan counterbalance allocations without a matching session as incomplete. Saved trial rows remain available in `ratings.csv` and planned assignments remain available in `assignments.csv`, but `analysis.csv` continues to include completed sessions only.

Counterbalance reference files:

- `counterbalance_table.csv`: the 20 allocation cells.
- `counterbalance_list_specs.csv`: the A-J word-number ranges.
- `remote_manifest_template.csv`: recommended stimulus manifest columns.
- `scripts/verify_counterbalance.mjs`: local verification for 100-trial generation and no-3-consecutive same-L1 ordering.
- `scripts/verify_speaker_pattern_bundles.mjs`: exhaustive 20×10 assignment and token-count verification.
- `scripts/simulate_counterbalance_design.mjs`: placeholder-material audit for cell balance, list position balance, and dropout allocation behavior.
- `EXPERIMENTAL_DESIGN_REVIEW.md`: reviewer-facing design specification, risk register, and final-stimulus checklist.

Recommended production manifest columns:

```csv
audio_file,audio_url,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number,condition,talker,take_number,spoken_form,practice_note,counterbalance_word_number,source_word_number
```

Use `natural` or `accented` in `pronunciation_condition`. `ENG` rows must be explicitly labeled `natural`; `JPN` and `CHN` rows must be explicitly labeled `natural` or `accented`. The participant-level `pronunciation_style` values `a` and `b` are assigned by the server and should not be used as row-level pronunciation labels. The `a`/`b` labels describe complementary within-list assignment patterns, not global odd/even word-number rules.

For production, `word_number` must be the CounterBalance lexical item number from `stimuli/CounterBalance.xlsx`, not the `word###` value embedded in a source audio filename. The generated OSF manifest preserves the source filename value as `source_word_number` and duplicates the experiment-facing value as `counterbalance_word_number`. `scripts/validate_production_manifest.mjs` fails if a single `word_number` maps to multiple `target_word` values.

For production, `participant_id` must use the standardized speaker IDs from the OSF crosswalk: `eng_s01`-`eng_s10`, `jpn_s01`-`jpn_s10`, and `chn_s01`-`chn_s10`. Sheet2 speaker-pattern assignment requires these IDs; arbitrary demo IDs such as `practice_english` are not production-valid.

`stimulus_list` is optional in the code, but including it is recommended. If several rows share the same `L1 x word_number x pronunciation_condition`, the server first applies the Sheet2 speaker-pattern target for that block and then selects the matching row. The final order is randomized within each stimulus-list block with the no-3-consecutive same-L1 constraint.

Block metadata is saved in `rating_assignments`, `rating_trials`, local backup CSVs, and admin CSV exports:

- `block_index`: 1-4.
- `block_list`: A-J.
- `speaker_pattern_index`: Sheet2 pattern number 1-10 used for that 25-trial block.
- `speaker_pattern_speaker`: expected speaker label for the pre-shuffle word position, e.g. `ENG3`, `JPN7`, or `CHN10`.
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

## Legacy Demo Materials

Legacy synthetic demo materials can be generated locally on macOS:

```sh
bash scripts/generate_practice_accent_audio.sh
```

This creates older interface-check files:

```text
practice_audio/english/{chocolate,coffee,pizza,sofa}.wav
practice_audio/japanese/{chocolate,coffee,pizza,sofa}.wav
practice_audio/chinese/{chocolate,coffee,pizza,sofa}.wav
practice_audio/legacy_tts_practice_manifest.csv
```

The English samples use system TTS. The Japanese samples use katakana-shaped forms such as `チョコレート`, and the Chinese samples use comparable loanword/cognate forms such as `巧克力`. They are legacy interface-check assets. One explicitly documented exception is the researcher-selected `chinese/pizza.wav`: the current fourth practice item intentionally reuses that synthetic Tingting token, so its provenance is retained rather than presented as a human recording.

The legacy script no longer overwrites top-level `practice_manifest.csv`. The researcher-only `Load selected practice` button reads the calibration manifest described below and passes each R2 URL directly to the browser's audio element; it does not fetch the cross-origin WAV into a JavaScript blob. Use `http://127.0.0.1:8765/?manual=1&local=1` rather than opening `index.html` directly from Finder. The server-backed participant flow plays the same HTTPS URLs.

## Built-in Practice Session

The server-backed task automatically starts with a practice session before main ratings.

Immediately before practice, the participant sees a dedicated `Practice Session` introduction. It states that four sample words will be transcribed and rated, explains that practice is intended both to familiarize the participant with the procedure and to calibrate Accentedness ratings against expert reference ranges, and makes clear that each sample can be replayed without limit only after its response has been submitted and the feedback screen is visible.

Current practice audio uses four researcher-selected WAV files hosted in production R2:

- 4 combined practice items that are not part of the main 50-word set:
  - `appreciation`: `ENG` female, documented Accentedness reference range 1–3.
  - `pesticide`: `JPN` male, documented Accentedness reference range 3–5.
  - `quality`: `JPN` female, documented Accentedness reference range 5–7.
  - `pizza`: synthetic macOS `say` voice `Tingting`, generated from the Mandarin form `披萨`, documented Accentedness reference range 7–9. This is not a human L2-English production; its methodological use was explicitly accepted on 2026-07-13.
- Each practice trial follows the main-task flow: play the audio for word identification, type the English word, continue, play the same audio for rating, rate accentedness, and then rate comprehensibility.
- Practice feedback uses `The word played`, shows the documented expert Accentedness reference range, and repeats the participant's Accentedness and Comprehensibility ratings. It does not invent a scalar expert rating and does not ask participants to justify their ratings.
- The practice-feedback screen permits unlimited replay so the calibration stimulus can be checked. This exception applies only after a practice response; response pages and all main-task pages retain the one-playback rule.
- Replay completion is guarded against stale events from the previous response-stage audio and has `ended`, near-end `timeupdate`, and timeout recovery paths, so the feedback Replay button is released after every attempt.

The direct production audio base is `https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/`. The local source WAVs are under `/Users/tohokusla/Dropbox/Accentedness/Stimuli/Practice&Calibration/`, and the standardized R2 filenames and source provenance are recorded in `practice_manifest.csv`. Both scalar fields, `expert_comprehensibility_1_9` and `expert_accentedness_1_9`, remain blank because exact scalar expert ratings have not been established; `expert_accentedness_range` stores the documented ranges in that manifest.

The top-level `practice_manifest.csv` points to the same four production R2 WAVs. It explicitly identifies item 4 as `macos_say_tingting_tts_wav` with `spoken_form=披萨`; the other three use `researcher_provided_calibration_wav`. Retired ElevenLabs materials are not part of the active flow.

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
  session/word-familiarity.js # save the final 50-word checklist
  trial.js               # save each rating trial immediately
  event.js               # save UI/event logs
  session/complete.js    # mark a session complete
  admin/summary.js       # admin counts and paginated background-response rows
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

If the D1 database was created before staged word-identification/rating pages were added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0010_staged_response_flow.sql
```

If the D1 database was created before Sheet2 speaker-pattern metadata was added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0011_speaker_pattern.sql
```

If the D1 database was created before the background questionnaire was added, run this migration once:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0012_background_questionnaire.sql
```

If the D1 database was created before the final word-familiarity checklist was added, run this migration once before deploying v0.7 code:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0013_word_familiarity.sql
```

For v0.8 or later, align the unique Prolific indexes with the archived-session lifecycle:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0014_archived_session_locks.sql
```

This preserves the full Prolific identifiers on `start_failed`/archived test rows while allowing one replacement active session. Active and completed sessions remain strictly unique.

Before deploying v0.9, add the versioned speaker-pattern bundle, strategy, and cohort fields and seed the adopted 10-bundle table:

```sh
wrangler d1 execute <DB_NAME> --file=./db/migrations/0015_speaker_pattern_bundles.sql
```

Existing rows intentionally retain `NULL` bundle/version/cohort values and resume their stored legacy assignments. Do not infer or backfill a bundle for them.

Run the archived-session lock regression test after changing these indexes:

```sh
python3 scripts/test_archived_session_lock.py
```

For a partially migrated Cloudflare D1 database, use the guarded schema updater after `npx wrangler login`. It checks live columns first, exports a backup when applying, and adds only missing additive columns:

```sh
node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility
node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility --apply --backup-before-apply
```

Configure the Pages Functions D1 binding as `DB`. Set an admin token as a Cloudflare secret:

```sh
wrangler pages secret put ADMIN_TOKEN
```

Set the Prolific completion return target as a Cloudflare secret, not as a participant URL query parameter. Prefer the full URL supplied by Prolific:

```sh
wrangler pages secret put PROLIFIC_COMPLETION_URL
```

If only a completion code is available, store the code instead:

```sh
wrangler pages secret put PROLIFIC_COMPLETION_CODE
```

Authorize the production Prolific study and isolate its allocation counts with a server-side JSON map. Production does not accept the development-only `COUNTERBALANCE_COHORT_ID` fallback:

```sh
wrangler pages secret put COUNTERBALANCE_COHORTS_JSON
# Enter: {"replace-with-prolific-study-id":"pilot_2026_07_bundle_v1"}
```

Keep the same cohort if soft-launch completions will be retained in the final 200; use a new cohort only when intentionally starting a separate analysis/recruitment cycle.

If the production manifest should not be committed as `remote_manifest.csv`, set an authoritative manifest URL as a Pages secret:

```sh
wrangler pages secret put COUNTERBALANCE_MANIFEST_URL
```

For R2 audio hosting, generate the upload command batch from the OSF package upload plan:

```sh
python3 scripts/generate_r2_upload_commands.py
```

This writes `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/upload_to_r2_accentedness_production_stimuli.sh`. Run `npx wrangler login` before executing it.

After the R2 bucket is exposed through a production HTTPS base URL, generate the hosted manifest from the already validated OSF package manifest:

```sh
node scripts/build_hosted_manifest.mjs \
  --audio-base-url https://stimuli.example.edu \
  --out /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv
```

This preserves the package manifest rows and fills `audio_url` from `audio_file`; it also checks that every manifest audio path is present in `metadata/r2_upload_plan.csv`.

Admin APIs fail closed when `ADMIN_TOKEN` is missing.
For production, protect `/admin/*` and `/api/admin/*` with Cloudflare Access and set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `CF_ACCESS_ALLOWED_EMAILS`; `ADMIN_TOKEN` remains as a second layer.

Rater responses are saved trial-by-trial to D1. The final checklist is saved as 50 normalized rows before completion. The local ZIP download remains as a backup and includes `*_word_familiarity.csv`. The Prolific return URL is issued only by `/api/session/complete` after all trials and any version-required checklist rows are present and the session token is valid.

For main trials, the collected scores are the selected integer values on the two 1–9 ordinal scales; collection does not transform or average them. Intelligibility is preflagged by comparing lowercased, letter-only versions of the typed response and target, while non-exact responses remain available for manual review and an explicit unidentified response remains a separate category. Response times are measured from the successful playback start of the relevant page: `dictation_submit_rt_ms` and `first_key_rt_ms` use the word-identification playback, while `rating_submit_rt_ms` and the first/last Accentedness and Comprehensibility selection RTs use the rating-page playback. Selection counts and interaction order preserve rating changes. These timing/process fields are recorded for quality control and analysis; they do not alter the 1–9 score at collection.

Each saved trial includes process fields for order and fatigue analyses: `trial_index`, `block_index`, `within_block_index`, `speaker_pattern_index`, `speaker_pattern_speaker`, `response_flow`, `dictation_played_at`, `rating_played_at`, `dictation_submit_rt_ms`, `rating_submit_rt_ms`, `response_order`, `first_response_field`, `first_response_rt_ms`, `rating_order`, `rating_interaction_sequence`, first/last RTs for each rating scale, rating selection counts, `submit_rt_ms`, `first_key_rt_ms`, and `replay_count`. Audio replay starts are also logged in `events.csv` with replay status and relative play time.

Mid-task reloads first repeat the complete four-item practice session, then resume at the first unsaved main trial or later saved-session state. Mid-task dropouts keep their partial rows in D1. On `/admin/`, use `Finalize stale sessions` after the configured inactivity window, typically 240 minutes or longer during live collection. This marks stale `started` sessions as `incomplete_dropout` or `abandoned` and keeps them out of `analysis.csv`; inspect them through `quality.csv` and raw exports.

The researcher export page is:

```text
/admin/
```

After Cloudflare Access login and `ADMIN_TOKEN` entry, the admin page shows a bounded, paginated table of recent participant background responses and checklist counts. Prolific IDs are deliberately shown in full in this protected view. Live sessions are shown by default; enable `Include dry runs` to inspect deployment checks. Free-text responses are inserted with `textContent`, not HTML. Existing sessions created before the questionnaire display blank background fields.

Use `Download all CSVs ZIP` for routine exports. It downloads every CSV below in one archive while preserving the individual long-format CSV files for analysis scripts and audit checks.

Available CSV exports:

- `analysis.csv`: analysis-ready main-trial responses from completed sessions only. Prolific IDs are excluded; rows retain `analysis_participant_id`, add a stable `session_id` join key, and include the structured background covariates plus the trial word's `word_known` value.
- `quality.csv`: anonymized one-row-per-session quality export with completion status, missing-trial/checklist counts, known-word count, active elapsed time, replay summaries, distractor accuracy/RT summaries, timing summaries, unidentified-word counts, manual-review counts, and response-quality flags.
- `ratings.csv`: restricted raw export with all practice and main responses, response times, response-order fields, rating interaction fields, intelligibility fields, 9-point rating values, practice feedback/reasons, familiarity ratings, and audio metadata.
- `sessions.csv`: restricted participant/session/prolific metadata with the full Prolific ID, `participant_key`, all background answers, checklist coverage/known count, completion code, counterbalance cell, millisecond audit fields, duplicate-start counts, and completion status.
- `word-familiarity.csv`: restricted long-format export with 50 explicit word-number/word-known rows for each submitted checklist and full Prolific identifiers.
- `assignments.csv`: trial order shown to each participant, including counterbalance list/L1/pronunciation fields.
- `events.csv`: session start, trial display, audio playback, first key, save, pause, and completion logs.
- `counterbalance.csv`: scoped cell×bundle allocation logs, four-block patterns, and completion status.
- `speaker_pattern_bundles.csv`: the versioned 10-row bundle definition.

For local export smoke testing without Cloudflare, generate a 200-participant D1-like dataset and CSV exports:

```sh
python scripts/generate_smoke_test_200.py --participants 200
```

For a real local Pages Functions + D1 integration test, create an ignored `wrangler.toml` from `wrangler.toml.example`, set its D1 database ID, and use a fresh persistence directory:

```sh
npx wrangler d1 execute accentedness-comprehensibility --local \
  --persist-to /tmp/accentedness-background-d1 \
  --file db/schema.sql --yes

npx wrangler pages dev . --port 8788 \
  --persist-to /tmp/accentedness-background-d1 \
  --binding ADMIN_TOKEN=local-admin-test \
  --binding PROLIFIC_COMPLETION_CODE=LOCAL-COMPLETE \
  --binding REQUIRE_TURNSTILE=0 \
  --binding ENVIRONMENT=development

node scripts/test_background_questionnaire_local.mjs \
  --base-url http://127.0.0.1:8788/ \
  --admin-token local-admin-test
```

The integration test rejects malformed ages and checklist payloads, verifies exact three-part Prolific resume identity, confirms that a missing `resume_only` lookup does not write, accepts a 50-word all-unfamiliar response, tests v0.6 compatibility, verifies CSV formula neutralization and the unmasked Prolific ID, and checks sessions, word-familiarity, quality, and analysis exports.

The generated SQLite database and CSV files are written to `exports/smoke_test_200/`.

To verify dropout handling, generate the same smoke dataset with finalized incomplete sessions:

```sh
python scripts/generate_smoke_test_200.py --participants 200 --dropouts 30
```

This writes to `exports/smoke_test_200_dropout_30/`. `analysis.csv` contains completed main trials only, while `quality.csv`, `sessions.csv`, `ratings.csv`, and `counterbalance.csv` expose the dropout status and partial saved data.

To stress-test simultaneous counterbalance starts locally with SQLite-compatible writes:

```sh
python3 scripts/stress_counterbalance_concurrency.py --participants 200
```

The script writes `COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md` to the OSF metadata directory. At 200 simultaneous starts it requires every one of the 20 cells × 10 speaker-pattern bundles exactly once, verifies the persisted `speaker_bundle_latin_v1` strategy/cohort/bundle metadata, and rejects duplicate participant-key insertion. Smaller local waves require cell and bundle spreads of at most 1 but do not claim complete microcell coverage.

After the live Pages API dry-run passes, stress-test the deployed D1-backed start endpoint with dry-run sessions:

```sh
node scripts/stress_live_counterbalance_concurrency.mjs --starts 40
```

This writes `LIVE_COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md` to the OSF metadata directory. It uses `STUDY_ID=DRY_RUN`, verifies response-level cell, bundle, strategy, cohort, four-block pattern, and per-speaker 2-natural/2-accented metadata, and confirms D1 persistence through duplicate-session resume. Smaller waves require both cell and bundle spreads of at most 1; their microcell count is descriptive only.

For the full launch gate, run `--starts 200` before any smaller v0.9 dry-run waves, or against a fresh deployment/D1 allocation scope. This requires all 200 cell×bundle microcells exactly once in that wave. Prior allocations in the shared dry-run cohort intentionally influence later balancing, so a polluted cohort is not a valid exact-wave test. To cross-check every stress row against the restricted D1 counterbalance export, set `LIVE_STRESS_ADMIN_TOKEN` (or `ADMIN_TOKEN`) in the process environment; the token is sent only in the `x-admin-token` header and is never printed.

For acoustic QC of the OSF package, run:

```sh
python3 scripts/audit_audio_qc.py
```

This writes `audio_qc_by_file.csv`, `audio_qc_summary.csv`, and `audio_qc_issues.csv` to `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/`. The current report is `AUDIO_QC_REPORT_20260703.md`; it has 0 launch-blocking failure rows after the `jpn_s06` / `capelin` OSF package copy was repaired. Review items remain for peak normalization, JPN sample-rate variation, and ENG intensity normalization. The accepted Tingting `pizza.wav` is not yet in that OSF calibration package; its local source and R2 copy were separately checked with `ffprobe`, MD5, and SHA-256, and must be added to the next regenerated OSF package.

The applied clipping repair candidate can be regenerated with:

```sh
python3 scripts/repair_clipped_audio.py
```

This does not overwrite the production audio or manifest. It writes a candidate under `metadata/audio_repair_candidates/` for researcher listening review.

`scripts/generate_reviewer_packet.py` and `scripts/apply_practice_review.py` describe the retired ElevenLabs/scalar-rating workflow. Do not run them against v0.8. A new review record for the four current items must preserve range-only ratings and the accepted synthetic Tingting/`披萨` provenance. Production-audio repair decisions remain tracked separately in the OSF audio QC report and repair metadata.

For lexical-balance QC of style `a` versus style `b`, run:

```sh
python3 scripts/audit_lexical_balance.py
```

This writes lexical metric, slot, cell, summary, pairwise-difference, and missing-metadata tables to the same OSF metadata directory. The current report is `LEXICAL_BALANCE_REPORT_20260703.md`.

For an audio-playback lower-bound estimate of task duration, run:

```sh
node scripts/estimate_task_duration.mjs
```

This writes duration estimate tables and `DURATION_ESTIMATE_REPORT_20260703.md` to the OSF metadata directory. It does not replace a Cloudflare/Prolific dry run because it excludes typing, rating decisions, distractors, questionnaires, pauses, and network latency.

Before any Prolific launch, run the production preflight:

```sh
node scripts/preflight_production.mjs
```

If the repository is not checked out next to `Stimuli_OSF_Release_20260703`, pass the package location explicitly:

```sh
node scripts/preflight_production.mjs \
  --package-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703
```

The script writes `PREFLIGHT_REPORT_20260703.md` to the OSF metadata directory and exits nonzero while launch blockers remain. It also checks source-level guards for Prolific completion redirect, per-trial server saving, duplicate-start/resume handling, counterbalance allocation, and stale-session dropout finalization. With the production R2 manifest and external manifest secret configured, the current expected result is `PASS`.

After each Cloudflare deployment, run the live deployment check against the public URL:

```sh
node scripts/check_live_deployment.mjs --allow-turnstile-off --api-dry-run-start
```

Use the `--allow-turnstile-off` flag only for pilot phases where Turnstile is intentionally disabled. For production, omit that flag if `REQUIRE_TURNSTILE=1` is expected. The `--api-dry-run-start` flag creates one dry-run session and verifies the live Pages Function, D1 schema, counterbalance allocation, server-side manifest path, and duplicate-start resume metadata by calling `/api/session/start`. If production uses `COUNTERBALANCE_MANIFEST_URL` and the public static `remote_manifest.csv` intentionally remains demo-only, add `--allow-demo-static-manifest` and rely on `--api-dry-run-start` for the server manifest check.

The script writes `LIVE_DEPLOYMENT_CHECK_20260703.md` to the OSF metadata directory and verifies that the public site is serving the current app bundle, the four R2 practice/calibration WAVs, protected admin dry-run route, production config, non-demo manifest state, and optionally the live API dry-run start. When `COUNTERBALANCE_MANIFEST_URL` points to the production R2 manifest and the repository static manifest intentionally remains demo-only, run with `--allow-demo-static-manifest`. The stable host has served v0.8 since the 2026-07-13 deployment of merge commit `99f3872`; both the static and live API gates passed. Update the Prolific study link to the stable hostname separately.

After `npx wrangler login`, run the aggregate Cloudflare readiness audit:

```sh
node scripts/audit_cloudflare_readiness.mjs \
  --allow-turnstile-off \
  --production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv \
  --using-external-manifest-secret
```

This writes `CLOUDFLARE_READINESS_REPORT_20260703.md` to the OSF metadata directory and combines Wrangler authentication, Pages secrets, Pages deployment visibility, D1 info, D1 schema drift, local preflight, hosted-audio checks, and the live API dry-run check. Pass `--production-manifest` after the hosted manifest is generated so local preflight and audio-hosting checks inspect the launch manifest. Add `--allow-demo-static-manifest` only when `COUNTERBALANCE_MANIFEST_URL` is intentionally the production manifest source. For the final launch gate, add `--live-concurrency-stress` after the single live dry-run passes.

After production audio URLs are generated, verify that hosted audio is actually reachable:

```sh
node scripts/validate_audio_hosting.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv --sample 80
```

Use `--sample 0` to probe every row before launch.

For local-only testing without a Cloudflare API, open the page with `?manual=1&local=1`. Do not use `?local=1` for Prolific data collection because it permits advancing without server persistence.
