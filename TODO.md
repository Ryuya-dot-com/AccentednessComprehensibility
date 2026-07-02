# Project TODO

Updated: 2026-07-03 JST

This list tracks the remaining work before using
`https://accentednesscomprehensibility.pages.dev/` for Prolific data collection.

## Current Audit Summary

- [x] Counterbalance cell design is implemented: 10 list combinations x 2 pronunciation styles.
- [x] A-J list word-number ranges match `design/予備調査２のデザイン.xlsx`.
- [x] Local counterbalance verification passes with placeholder materials.
- [x] Runtime counterbalance label is standardized to `ENG`, with legacy `AME` accepted only as an import alias.
- [x] `Stimuli/ENG` has been received; local audit found 497 audio files.
- [x] Four collaborator-supplied practice/calibration WAV files exist in `Stimuli/Practice&Calibration`.
- [x] OSF rename crosswalks are generated for files, folders, and 30 speakers.
- [x] Draft production manifests are generated from the OSF crosswalk and validate against the app's counterbalance code for all 20 cells.
- [x] OSF-ready standardized stimulus package is generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703`.
- [ ] Live Cloudflare deployment is currently behind the local implementation: deployed `app.js` still lacks staged-flow, Sheet2 speaker-pattern, selected ElevenLabs practice, and completion-code hardening changes.
- [ ] Deployed `remote_manifest.csv` still points to demo materials until the production audio host/path is chosen.
- [x] Placeholder practice tones are removed; `app.js` now uses 4 selected ElevenLabs MP3 practice items: `chocolate`, `coffee`, `pizza`, and `sofa`.
- [x] Top-level local `practice_manifest.csv` and dry-run placeholder audio now point to the selected ElevenLabs MP3 set, not the legacy macOS TTS WAV set.
- [ ] The selected practice reference ratings still need collaborator listening review before participant launch.
- [x] Dictation and rating are separated into staged pages within each combined trial.
- [x] Audio replay is disabled after successful playback.
- [x] The Sheet2 talker-pattern constraints are explicitly enforced and exported.

## P0: Must Finish Before Any Participant Launch

- [ ] Decide where production audio will be hosted.
  - Option A: public static files committed/deployed with the Pages project.
  - Option B: private Cloudflare R2 or another approved host, referenced through `COUNTERBALANCE_MANIFEST_URL`.
  - Recommended path is now Option B: Cloudflare R2/custom domain for the 2,497 main stimuli.
  - Deployment guide: `DEPLOY_CLOUDFLARE.md` section "Host Production Audio".
  - R2 upload plan generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/r2_upload_plan.csv`.
  - R2 upload command script generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/upload_to_r2_accentedness_production_stimuli.sh`.
  - Upload plan rows: 2,545 audio files total; 2,497 main WAV, 4 calibration WAV, 44 ElevenLabs MP3 candidates.
  - Current external-state blocker: `npx wrangler whoami` reports not authenticated; run `npx wrangler login` before upload or Cloudflare dry run.
  - Completion: document the chosen approach and confirm audio URLs are accessible from the live Pages app.

- [ ] Redeploy the current app and verify the live Cloudflare URL.
  - Live deployment check script: `scripts/check_live_deployment.mjs`.
  - Current live report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LIVE_DEPLOYMENT_CHECK_20260703.md`.
  - Current result: FAIL.
  - Current live blockers:
    - `/app.js` is older than the local implementation; it is missing staged combined flow, Sheet2 speaker-pattern metadata, selected ElevenLabs practice paths, and `response_flow`.
    - Live `/app.js` still reads `completion_code` / `PROLIFIC_CODE` from URL query parameters.
    - Live `/remote_manifest.csv` is still a 12-row demo manifest.
    - Live selected practice MP3 path falls through to HTML instead of returning `audio/mpeg`.
  - Run after every deployment:
    - `node scripts/check_live_deployment.mjs --allow-turnstile-off` during pilot/no-Turnstile checks.
    - `node scripts/check_live_deployment.mjs` before production if Turnstile is required.
  - Completion: the live report passes, or any intentionally disabled Turnstile state is documented for the pilot phase only.

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

- [x] Replace placeholder practice trials with the requested 4 ElevenLabs MP3 items.
  - App asset folder: `practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/`.
  - Selected app trials:
    - `chocolate__eng_bella.mp3`: `ENG/natural`, reference comprehensibility 1, accentedness 1.
    - `coffee__jpn_yusuke_stronger.mp3`: `JPN/accented`, reference comprehensibility 3, accentedness 4.
    - `pizza__jpn_lia_stronger.mp3`: `JPN/accented`, reference comprehensibility 5, accentedness 6.
    - `sofa__chn_deep_bass_stronger.mp3`: `CHN/accented`, reference comprehensibility 7, accentedness 8.
  - Source manifest: `practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/practice_manifest.csv`.
  - Local demo manifest: `practice_manifest.csv` now points to the same selected MP3 files.
  - Older collaborator-supplied calibration WAV files remain in the OSF package for reproducibility, but they are not the current app practice set because the requested target words are `chocolate`, `coffee`, `pizza`, and `sofa`.
  - Completion: live practice uses real MP3 files, not placeholder tones.

- [x] Regenerate the 4 requested practice words with ElevenLabs candidates.
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

- [ ] Blind-review selected ElevenLabs practice ratings with collaborators.
  - Confirm that the Japanese-like and Chinese-like accents are strong enough for practice.
  - Confirm or revise the provisional reference ratings stored in `app.js` and `practice_manifest.csv`.
  - Review packet generated at `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/stimulus_review_packet.html`.
  - Review templates:
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/practice_reference_rating_review_template.csv`.
    - `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/review_packet_20260703/audio_repair_review_template.csv`.
  - Apply completed practice review with `python3 scripts/apply_practice_review.py --review-csv PATH_TO_COMPLETED_REVIEW_CSV`.
  - Generate additional variants if collaborators reject any selected item.
  - Completion: generated audio is reviewed by researchers and accepted as practice material.

- [x] Implement one-play-only behavior.
  - Current UI changes `Play audio` to `Audio played` after successful playback and disables the playback button.
  - Design note says intelligibility and Acc/Comp pages each allow one playback.
  - Replay is still possible only after a playback error, so participants are not blocked by a failed audio load.

- [x] Split dictation and rating into separate pages.
  - Task mode remains `combined`, but each trial now flows through `dictation` then `ratings`.
  - Each stage allows one playback; the ratings stage replays the same audio once without counting as a within-stage replay.
  - Saved rows include `response_flow`, `dictation_played_at`, `rating_played_at`, `dictation_submit_rt_ms`, `rating_submit_rt_ms`, and stage-specific audio durations.
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
  - Current report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md`.
  - Current result: 200 simultaneous starts produced exactly 10 assignments per cell; duplicate `participant_key` insertion was rejected.
  - This is a local SQLite-compatible stress test, not a replacement for a live Cloudflare D1 dry run.

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
  - Selected ElevenLabs practice MP3s pass the loudness check at -23.4 LUFS.
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

- [ ] Confirm the Japanese/Chinese familiarity questions cover the required questionnaire content.
  - Current app includes two 6-point daily-life familiarity questions.
  - Design notes mention "事前アンケート1bの内容".
  - Completion: collaborators confirm no additional questionnaire fields are required.

## P2: Deployment And Data-Collection Readiness

- [ ] Run Cloudflare dry run with the production manifest.
  - Use `/admin/dry-run.html`.
  - Confirm session start, practice, four main blocks, distractors, save calls, completion, and admin exports.
  - Production preflight script: `scripts/preflight_production.mjs`.
  - Live deployment check script: `scripts/check_live_deployment.mjs`.
  - Current preflight report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/PREFLIGHT_REPORT_20260703.md`.
  - Current live report: `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/LIVE_DEPLOYMENT_CHECK_20260703.md`.
  - Current preflight result: FAIL, as intended before launch, because production audio hosting is not configured and three practice reference ratings remain provisional.
  - Source-level Prolific guards pass locally: server-issued completion redirect, assignment-level completion coverage, per-trial saves, duplicate starts, active-or-completed counterbalance allocation, and stale/dropout finalization.
  - Current live result: FAIL, because Cloudflare Pages is still serving the old app bundle and demo/static practice paths.
  - Completion: dry run produces valid `ratings.csv`, `analysis.csv`, `quality.csv`, `assignments.csv`, and `events.csv`.

- [ ] Review production secrets and access controls.
  - Confirm `ADMIN_TOKEN`, Prolific completion settings, D1 binding, and Cloudflare Access protection for `/admin/*` and `/api/admin/*`.
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
node scripts/preflight_production.mjs
node scripts/check_live_deployment.mjs --allow-turnstile-off
python3 scripts/generate_elevenlabs_practice_audio.py --dry-run
python3 scripts/generate_elevenlabs_practice_audio.py --search-shared-voices --accent japanese --gender male --voice-search english
python3 scripts/generate_elevenlabs_practice_audio.py --search-shared-voices --accent chinese --gender male --voice-search english
python3 scripts/generate_elevenlabs_practice_audio.py --word-set demo-practice --output-dir /Users/tohokusla/Dropbox/Accentedness/Stimuli/Practice_ElevenLabs/chocolate_coffee_pizza_sofa_multi_20260703_mp3_norm --normalize-loudness --voice-variant ALL=LABEL=VOICE_ID
```
