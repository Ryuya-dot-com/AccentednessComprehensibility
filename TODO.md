# Project TODO

Updated: 2026-07-15 JST

This list tracks the remaining work before using
`https://accentednesscomprehensibility.pages.dev/` for Prolific data collection.

The Prolific Study URL must use this stable project hostname, never a deployment-specific `https://<deployment-id>.accentednesscomprehensibility.pages.dev/` hostname.

## Current Audit Summary

- [x] Counterbalance cell design is implemented: 10 list combinations x 2 pronunciation styles.
- [x] A-J list word-number ranges match `design/予備調査２のデザイン.xlsx`.
- [x] Local counterbalance verification passes with placeholder materials.
- [x] Runtime counterbalance label is standardized to `ENG`, with legacy `AME` accepted only as an import alias.
- [x] `Stimuli/ENG` has been received; local audit found 497 audio files.
- [x] Three researcher-provided calibration WAVs and the selected synthetic Tingting `pizza.wav` exist in `Stimuli/Practice&Calibration`.
- [x] OSF rename crosswalks are generated for files, folders, and 30 speakers.
- [x] Draft production manifests are generated from the OSF crosswalk and validate against the app's counterbalance code for all 20 cells.
- [x] OSF-ready standardized stimulus package is generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`.
- [x] The v0.10 repository candidate keeps the four-item practice/calibration UI while limiting new persisted sessions to 100 main assignments/trials and no practice assignments, trials, events, or local rating CSV rows.
- [x] Production main audio is hosted in R2 and `COUNTERBALANCE_MANIFEST_URL`/`COUNTERBALANCE_ALLOWED_HOSTS` are configured as encrypted Pages secrets; the checked-in 12-row manifest remains an intentional demo fallback.
- [x] Placeholder practice tones and the retired ElevenLabs set are removed from the active flow; `app.js` now uses `appreciation` (1–3), `pesticide` (3–5), `quality` (5–7), and `pizza` (7–9).
- [x] Top-level `practice_manifest.csv` and dry-run placeholder audio point to the same direct production R2 WAV URLs.
- [x] Scalar expert Accentedness and Comprehensibility fields remain blank; only the documented `expert_accentedness_range` is presented.
- [x] Dictation and rating are separated into staged pages within each combined trial.
- [x] Practice and main response pages disable replay after successful playback; unlimited replay is available only on the post-response practice-feedback screen.
- [x] The Sheet2 talker-pattern constraints are explicitly enforced and exported.
- [x] Reloading a started session repeats all four browser-only practice items before continuing at the first unsaved main trial or later saved-session state without changing v0.10 server progress.
- [x] All background fields remain stored once on `sessions`; the questionnaire columns stay nullable so pre-questionnaire sessions remain readable/resumable.
- [x] Historical practice rows remain readable/resumable. The v0.10 behavior change requires no new D1 migration and does not delete or backfill legacy data.

## P0: Must Finish Before Any Participant Launch

- [x] Host production audio in Cloudflare R2 and provide the authoritative manifest through `COUNTERBALANCE_MANIFEST_URL`.
  - Option A: public static files committed/deployed with the Pages project.
  - Option B: private Cloudflare R2 or another approved host, referenced through `COUNTERBALANCE_MANIFEST_URL`.
  - Selected path: Option B, Cloudflare R2 for the 2,497 main stimuli and four active practice objects.
  - Deployment guide: `DEPLOY_CLOUDFLARE.md` section "Host Production Audio".
  - R2 upload plan generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/r2_upload_plan.csv`.
  - R2 upload command script generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/upload_to_r2_accentedness_production_stimuli.sh`.
  - Hosted manifest builder: `scripts/build_hosted_manifest.mjs` fills HTTPS `audio_url` values from the validated OSF package manifest after the R2/custom-domain base URL is known.
  - The historical upload plan contains 2,545 objects; the newly selected Tingting `pizza.wav` was uploaded separately as `practice/calibration/chn_female_pizza_practice.wav` and must be added to the next regenerated OSF/R2 plan.
  - `npx wrangler whoami` confirms the Cloudflare account is authenticated; refresh login only if a future scope check requires it.
  - Completion: document the chosen approach and confirm audio URLs are accessible from the live Pages app.
  - Verification command after HTTPS URLs are generated: `node scripts/validate_audio_hosting.mjs --sample 80`.
  - Final full-row check before launch: `node scripts/validate_audio_hosting.mjs --sample 0`.

- [x] Record the historical v0.8 Cloudflare deployment verification.
  - Live deployment check script: `scripts/check_live_deployment.mjs`.
  - Current live report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LIVE_DEPLOYMENT_CHECK_20260703.md`.
  - PR #3 was merged as `99f3872` and deployed to the stable host on 2026-07-13. The static and live-API deployment gates passed with v0.8, all four R2 WAVs, protected admin routes, the external production manifest, duplicate-start resume, and non-overwriting practice replay.
  - The Prolific stable-URL change remains a separate manual study-setting action.
  - Remote D1 already contains the staged-flow, speaker-pattern, background-questionnaire, and word-familiarity schema.
  - Migration `0014_archived_session_locks.sql` was applied on 2026-07-13 so archived preview rows retain full Prolific IDs without blocking a replacement active session; active/completed participant locks remain strict.
  - Historical live passes after the v0.8 deployment:
    - Live `/app.js` includes staged combined flow, Sheet2 speaker-pattern metadata, the four R2 practice/calibration WAV paths, `response_flow`, and completion-code hardening.
    - All four practice URLs return `audio/wav`, including the new `chn_female_pizza_practice.wav` object.
    - Historical assignment metadata identifies item 4 as `macos_tts_tingting`, `spoken_form=披萨`, and `source_format=macos_say_tingting_tts_wav`.
  - Run after every deployment:
    - `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off` after Wrangler authentication is available.
    - `node scripts/check_live_deployment.mjs --allow-turnstile-off --api-dry-run-start` during pilot/no-Turnstile checks.
    - `node scripts/check_live_deployment.mjs --api-dry-run-start` before production if Turnstile is required.
    - `node scripts/stress_live_counterbalance_concurrency.mjs --participants 40` after the live API dry-run passes.
    - `node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off --live-concurrency-stress` for the final no-Turnstile pilot gate.
    - If `COUNTERBALANCE_MANIFEST_URL` is configured and static `remote_manifest.csv` intentionally remains demo-only, add `--allow-demo-static-manifest` and rely on `--api-dry-run-start` to verify the server-side manifest path.
  - Completion: the live report passes, or any intentionally disabled Turnstile state is documented for the pilot phase only.

- [x] Deploy the v0.10 candidate and verify the stable Cloudflare URL.
  - PR #8 was merged as `d58a81a`; the Cloudflare Pages production check completed successfully on 2026-07-15.
  - The stable-host live check passed with `--allow-turnstile-off --allow-demo-static-manifest --api-dry-run-start` and observed `platform_version=pronunciation_rating_v0.10.0`, `sessions.trial_count=100`, exactly 100 main assignments, four canonical browser practice items, and `practice_recording_required=false`.
  - A direct remote-D1 read of the synthetic session confirmed 100 main assignments, zero practice assignments/trials/events, and all 11 background values on `sessions`.
  - Local integration fixtures confirm seeded pre-v0.10 practice rows remain readable/resumable and nullable historical questionnaire values do not block resume.
  - The served app retains all four practice items, feedback, and unlimited feedback-stage replay while omitting practice from the local rating CSV.
  - Turnstile was intentionally disabled for this deployment check. Complete the separate security review, full live-stress gate, and end-to-end pilot below before recruitment.

- [x] Verify ENG/native English production stimulus coverage.
  - Source folder: `/Users/tohokusla/Dropbox/Accentedness/Stimuli/ENG`.
  - Current local audit found 497 audio files.
  - The design requires ENG/native natural reference slots for word numbers 1-50.
  - Draft manifest confirms at least one valid ENG natural candidate exists for each word number 1-50.
  - Speaker-level note: `E12 -> eng_s08` is missing word numbers 10, 11, and 16, so the final manifest must not require that speaker for those words.
  - Completion: at least one valid ENG natural audio candidate exists for each required A-J slot.

- [x] Build draft production manifests from the OSF rename crosswalk.
  - Generated OSF-standardized manifest: `/Users/tohokusla/Dropbox/Accentedness/Stimuli/remote_manifest_production_osf_20260703.csv`.
  - Generated current-path manifest: `/Users/tohokusla/Dropbox/Accentedness/Stimuli/remote_manifest_production_current_paths_20260703.csv`.
  - App-side manifest readers now accept `osf_audio_file`, `standardized_audio_file`, `new_relative_path`, `global_speaker_id`, `old_speaker_id`, and `proposed_speaker_id`.
  - `participant_id` is the L1-specific speaker ID such as `eng_s01`; `talker` is the global speaker ID such as `spk001`.
  - Required fields: `target_word`, `participant_id` or speaker id, `l1_condition`, `pronunciation_condition`, `stimulus_list`, `word_number`, `talker`, `take_number`.
  - Use `ENG/natural`, `JPN/natural`, `JPN/accented`, `CHN/natural`, and `CHN/accented` labels exactly.
  - Do not use `AME` in newly generated manifests or exports.
  - Completion: the server can construct all 20 counterbalance cells without missing-material errors.
  - Remaining deployment step: choose audio hosting, then publish the chosen manifest as `remote_manifest.csv` or set `COUNTERBALANCE_MANIFEST_URL`.

- [x] Materialize the OSF-ready standardized stimulus package.
  - Script: `scripts/materialize_osf_stimuli_package.py`.
  - Package root: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`.
  - Includes `main/`, `practice/`, `metadata/`, `README.md`, and app-ready `remote_manifest.csv`.
  - Includes `metadata/osf_package_checksums_sha256.csv` and `metadata/osf_package_copy_log.csv`.
  - Copied audio counts: 2497 main, 4 practice/calibration, 44 ElevenLabs practice candidates.
  - Verified package manifest:
    - `node scripts/validate_production_manifest.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest.csv --audio-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`

- [x] Add a manifest validator script for the final stimulus pool.
  - Script: `scripts/validate_production_manifest.mjs`.
  - Check A-J coverage for ENG/JPN/CHN.
  - Check natural/accented availability for JPN and CHN.
  - Check that no required `word_number` is missing.
  - Check that all referenced audio files/URLs exist.
  - Check per-cell totals: 100 trials, 4 blocks, 25 trials per block.
  - Check that no runtime/export label contains `AME`; only import normalization may accept legacy `AME`.
  - Completion: validator exits 0 on the final production manifest.
  - Verified:
    - `node scripts/validate_production_manifest.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli/remote_manifest_production_osf_20260703.csv`
    - `node scripts/validate_production_manifest.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli/remote_manifest_production_current_paths_20260703.csv --audio-root /Users/tohokusla/Dropbox/Accentedness/Stimuli`

- [x] Replace placeholder/ElevenLabs practice trials with the requested 4 calibration WAVs.
  - Direct R2 base: `https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration/`.
  - Selected app trials in fixed low-to-high reference order:
    - `eng_female_appreciation_practice.wav`: `ENG` female, Accentedness range 1–3.
    - `jpn_male_pesticide_practice.wav`: `JPN` male, Accentedness range 3–5.
    - `jpn_female_quality_practice.wav`: `JPN` female, Accentedness range 5–7.
    - `chn_female_pizza_practice.wav`: synthetic macOS Tingting Mandarin `披萨`, researcher-assigned Accentedness range 7–9.
  - `practice_manifest.csv` points to these direct URLs and leaves `expert_comprehensibility_1_9` and `expert_accentedness_1_9` blank.
  - Completion: live practice uses these four WAVs and shows ranges without inventing scalar expert ratings.

- [x] Explicit methodological acceptance for the selected Tingting `pizza.wav` was received on 2026-07-13.
  - The file is byte-identical to the legacy macOS `say -v Tingting` output generated from Mandarin `披萨`; it is not a human CHN-female production of English `pizza`.
  - If retained, document that the fourth practice item calibrates an intentionally synthetic/native-language-shaped endpoint rather than ordinary L2 English speech.
  - If rejected, provide a genuine CHN-female English `pizza` WAV and update R2, the canonical server assignment, client metadata, manifest, OSF package, and tests together.

- [x] Archive: generate alternative practice words with ElevenLabs candidates. These files are retained for reproducibility but are not the active practice set.
  - Current `.env` has ElevenLabs API credentials and voice IDs.
  - Use `scripts/generate_elevenlabs_practice_audio.py` for reproducible generation.
  - Default `--word-set` is now `selected-practice`; the older `appreciation`/`pesticide`/`quality`/`shelter` set is available only by explicitly requesting `--word-set legacy-calibration`.
  - The requested gTTS replacement target words are `chocolate`, `coffee`, `pizza`, and `sofa`.
  - Canonical multi-voice MP3 candidate set is stored at `/Users/tohokusla/Dropbox/Accentedness/Stimuli/Practice_ElevenLabs/chocolate_coffee_pizza_sofa_multi_20260703_mp3_norm`.
  - Generated set contains 24 candidates: 4 target words x 6 voice variants.
  - Stronger Japanese/Chinese accent candidate set is stored at `/Users/tohokusla/Dropbox/Accentedness/Stimuli/Practice_ElevenLabs/chocolate_coffee_pizza_sofa_stronger_jpn_chn_20260703_mp3_norm_v2`.
  - Stronger set contains 20 candidates: 4 target words x 5 voice variants.
  - No WAV files are generated in this candidate set.
  - MP3 files were loudness-normalized with ffmpeg `loudnorm` target `I=-23`, `LRA=7`, `TP=-2`.
  - Measured integrated loudness range after normalization: -23.50 to -23.41 LUFS.
  - Measured integrated loudness range for the stronger set: -23.47 to -23.41 LUFS.
  - Current voice variants:
    - `eng_bella`, `eng_roger`
    - `jpn_yusuke`, `jpn_lia`
    - `chn_deep_bass`, `chn_joan`
  - Stronger-set voice variants:
    - `jpn_lia_stronger`, `jpn_yusuke_stronger`
    - `chn_ziyu_stronger`, `chn_deep_bass_stronger`, `chn_joan_stronger`
  - Existing generic `ELEVENLABS_MALE_VOICE_ID` and `ELEVENLABS_FEMALE_VOICE_ID` can be fallbacks, but they are unlikely to guarantee Japanese-like or Chinese-like accentedness.
  - Search ElevenLabs shared voices by accent/gender when condition-specific voice IDs are not yet selected.
  - For English accentedness/comprehensibility practice, send only the English target word to ElevenLabs and control accent primarily by voice selection.
  - Save audio plus `generation_manifest.csv` and `generation_metadata.json`.
  - Completion for generation: candidate audio is generated, normalized, packaged, and a selected app set is connected.

- [ ] Confirm the selected calibration WAV ranges with collaborators.
  - Confirm the four documented Accentedness bands and whether exact scalar ratings should ever replace them.
  - Keep scalar fields blank unless exact expert Accentedness and Comprehensibility ratings are formally established.
  - Review packet generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/stimulus_review_packet.html`.
  - Review templates:
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/practice_reference_rating_review_template.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/audio_repair_review_template.csv`.
  - The older review/apply scripts target the retired ElevenLabs manifest and must not be run against the active range-only practice set without first being updated for `expert_accentedness_range`.
  - Completion: the four current WAVs and documented ranges are reviewed and accepted as practice material.

- [x] Implement one-play-only behavior.
  - Current UI changes `Play audio` to `Audio played` after successful playback and disables the playback button.
  - Design note says intelligibility and Acc/Comp pages each allow one playback.
  - Unlimited replay is intentionally available only on the post-response practice-feedback screen; it is not available while entering a response or anywhere in the main task.
  - A playback error does not consume the response-page attempt, so participants are not blocked by a failed audio load.

- [x] Split dictation and rating into separate pages.
  - Task mode remains `combined`, but each trial now flows through `dictation` then `ratings`.
  - Each stage allows one playback; the ratings stage replays the same audio once without counting as a within-stage replay.
  - Saved main rows include `response_flow`, `dictation_played_at`, `rating_played_at`, `dictation_submit_rt_ms`, `rating_submit_rt_ms`, and stage-specific audio durations; v0.10 practice rows are not saved.
  - New migration: `db/migrations/0010_staged_response_flow.sql`.

## P1: Experimental-Design Hardening

- [x] Implement Sheet2 talker-pattern balancing.
  - Each 25-trial block receives one deterministic Sheet2 pattern index from 1-10.
  - The server maps block word positions to `eng_s01`-`eng_s05`, `jpn_s01`-`jpn_s10`, and `chn_s01`-`chn_s10` before selecting a concrete audio file.
  - Saved assignments/trials include `speaker_pattern_index` and `speaker_pattern_speaker`.
  - New migration: `db/migrations/0011_speaker_pattern.sql`.
  - Verification: `node scripts/verify_counterbalance.mjs` and `node scripts/validate_production_manifest.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest.csv --audio-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`.

- [x] Stress-test simultaneous counterbalance allocation.
  - Script: `scripts/stress_counterbalance_concurrency.py`.
  - Live script: `scripts/stress_live_counterbalance_concurrency.mjs`.
  - Current report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md`.
  - Current result: 200 simultaneous starts produced exactly 10 assignments per cell; duplicate `participant_key` insertion was rejected.
  - Same-count cell ties now use a session-derived offset rather than fixed `cell_id` order.
  - This local SQLite-compatible stress test is now paired with a live D1-backed dry-run stress command before launch.

- [x] Audit lexical balance for style `a` versus style `b` assignments.
  - Reproducible script: `scripts/audit_lexical_balance.py`.
  - Critical fix: production `remote_manifest.csv` now uses `word_number` as the CounterBalance lexical item number; the filename-derived recording-order value is preserved as `source_word_number`.
  - Validator guard: `scripts/validate_production_manifest.mjs` now fails if one `word_number` maps to multiple `target_word` values.
  - Current QC tables:
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_word_metrics.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_by_slot.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_by_cell.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_summary.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/lexical_balance_pairwise_differences.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LEXICAL_BALANCE_REPORT_20260703.md`.
  - Current result: local proxy metrics show no pairwise lexical imbalance at `|standardized_diff| >= 0.25`.
  - Remaining reviewer-facing metadata gap: neighborhood density, concreteness, familiarity, and Japanese/Chinese loanword exposure are not yet available.

- [ ] Audit acoustic properties for all final audio.
  - Check duration, sample rate, bit depth, RMS/intensity, peak level, leading/trailing silence, and clipping.
  - Confirm preprocessing matches the design notes: peak amplitude 0.99 and intensity 70.0 if that remains the agreed standard.
  - Reproducible script: `scripts/audit_audio_qc.py`.
  - Current QC tables:
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_qc_by_file.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_qc_summary.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_qc_issues.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/AUDIO_QC_REPORT_20260703.md`.
  - Current result: 2549 audited rows; no missing/unreadable files; 0 launch-blocking audio failure rows.
  - Repaired file: `main/jpn/natural/jpn_s06/jpn_s06_natural_pass01_word018_capelin_take04_trial0018.wav`.
  - Repair applied from `scripts/repair_clipped_audio.py` candidate at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_repair_candidates/jpn_s06_natural_pass01_word018_capelin_take04_trial0018__linear_declip_candidate.wav`.
  - Original package copy backup: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/audio_repair_applied_20260703/original_backup/`.
  - Review before launch: decide whether peak amplitude 0.99 is still required, whether JPN sample-rate variation is acceptable, and whether ENG `eng_s01`/`eng_s04` intensity should be normalized.
  - The first three selected calibration WAVs have RMS about -23.98 dBFS; the selected synthetic Tingting `pizza.wav` is 44.1 kHz mono, 0.570794 s, with mean -19.2 dBFS and peak -2.8 dBFS. Confirm that this level difference is acceptable before launch.
  - Completion: all launch-blocking audio QC flags are resolved or explicitly accepted by the research team.

- [ ] Confirm main-task duration with real audio.
  - Design estimate: questionnaire 5 min, instruction/practice 5 min, main rating 50 min.
  - Audio-duration lower-bound script: `scripts/estimate_task_duration.mjs`.
  - Current output:
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/duration_estimate_by_cell_seed.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/duration_estimate_summary.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/DURATION_ESTIMATE_REPORT_20260703.md`.
  - Current result: required audio playback lower bound is about 161 s on average across 1000 sampled cell/seed assignments, range 155-165 s.
  - This does not include instructions, typing, rating decisions, distractors, questionnaires, pauses, or network latency.
  - Completion: dry-run timing with real audio supports the Prolific time estimate and compensation.

- [ ] Confirm the complete background questionnaire covers the required content.
  - Current app includes age, first-language English variety, gender, English-teaching experience, relevant linguistics knowledge, and two 6-point daily-life Japanese/Chinese familiarity questions.
  - The nine background-questionnaire columns remain on `sessions` and nullable for legacy compatibility; new sessions require the applicable values and conditional detail fields.
  - Design notes mention "事前アンケート1bの内容".
  - Completion: collaborators confirm no additional questionnaire fields are required.

## P2: Deployment And Data-Collection Readiness

- [ ] Run Cloudflare dry run with the production manifest.
  - Use `/admin/dry-run.html`.
  - Confirm session start, four-item browser-only practice, four main blocks, distractors, main-trial save calls, completion, and admin exports.
  - Production preflight script: `scripts/preflight_production.mjs`.
  - Live deployment check script: `scripts/check_live_deployment.mjs`.
  - Standard persistent preflight report path: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/PREFLIGHT_REPORT_20260703.md`.
  - Standard persistent live report path: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LIVE_DEPLOYMENT_CHECK_20260703.md`.
  - The v0.10 preflight and stable-host live API deployment check passed on 2026-07-15 with the external production manifest assumptions documented above.
  - Source-level Prolific guards pass locally: server-issued completion redirect, assignment-level completion coverage, per-trial saves, duplicate starts, active-or-completed counterbalance allocation with distributed same-count tie-breaks, and stale/dropout finalization.
  - Started-session resume guards must confirm that duplicate starts return the saved continuation state, all four browser-only practice items repeat without creating v0.10 practice rows, pending block distractors are preserved, familiarity covariates stay fixed, and the browser then continues at the first unsaved main item or later state.
  - The current stable application contract is v0.10; its application changes were introduced by merge commit `d58a81a`. The 2026-07-13 live API gate and its persisted practice metadata remain historical compatibility evidence.
  - Completion: a v0.10 dry run produces valid exports with 100 main assignments, zero current-version practice rows/events/local rating CSV rows, session-level background fields, and readable historical practice rows.

- [ ] Review production secrets and access controls.
  - Confirm `ADMIN_TOKEN`, Prolific completion settings, D1 binding, and Cloudflare Access protection for `/admin/*` and `/api/admin/*`.
  - 2026-07-12: `PROLIFIC_COMPLETION_CODE` Pages secret is configured for production (Prolific "Copy and paste code" completion path); the completion URL is derived server-side by `prolificCompletionConfig`.
  - Confirm `.env`, `.dev.vars`, private manifests, and private audio URLs are not committed.
  - Completion: production deployment has no secret leakage and admin routes are protected.

- [ ] Run a small soft launch before full recruitment.
  - Use a limited Prolific batch.
  - Check completion rate, missing trials, audio errors, distractor performance, RT distributions, and response-quality flags.
  - Completion: no blocking UI, audio, saving, or export issue appears in the soft-launch data.

- [ ] Finalize recruitment plan.
  - Target: 200 American English native listener completions.
  - Use rolling recruitment if dropouts must be compensated to preserve completed-cell balance.
  - Completion: final completed count per counterbalance cell is acceptable.

## Reference Commands

```sh
node scripts/verify_counterbalance.mjs
node scripts/simulate_counterbalance_design.mjs
python3 scripts/stress_counterbalance_concurrency.py --participants 200
node scripts/stress_live_counterbalance_concurrency.mjs --participants 40
node scripts/apply_d1_schema_updates.mjs --database accentedness-comprehensibility
node scripts/build_hosted_manifest.mjs --audio-base-url https://stimuli.example.edu --out /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv
node scripts/audit_cloudflare_readiness.mjs --allow-turnstile-off --production-manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest_production_r2_20260703.csv --using-external-manifest-secret --live-concurrency-stress
node scripts/validate_audio_hosting.mjs --sample 80
node scripts/preflight_production.mjs --package-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703
node scripts/check_live_deployment.mjs --allow-turnstile-off --api-dry-run-start
python3 scripts/generate_elevenlabs_practice_audio.py --dry-run
python3 scripts/generate_elevenlabs_practice_audio.py --search-shared-voices --accent japanese --gender male --voice-search english
python3 scripts/generate_elevenlabs_practice_audio.py --search-shared-voices --accent chinese --gender male --voice-search english
python3 scripts/generate_elevenlabs_practice_audio.py --word-set demo-practice --output-dir /Users/tohokusla/Dropbox/Accentedness/Stimuli/Practice_ElevenLabs/chocolate_coffee_pizza_sofa_multi_20260703_mp3_norm --normalize-loudness --voice-variant ALL=LABEL=VOICE_ID
```
