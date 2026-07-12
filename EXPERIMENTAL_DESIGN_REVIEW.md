# Rating Platform Experimental Design Review

This document states the current Cloudflare-delivered rating-task design from the perspective of a critical psycholinguistics reviewer. It uses placeholders because the final stimulus set is still under preparation.

## Reviewer Position

The current design is defensible only if the following distinction is maintained throughout the implementation, documentation, export files, and statistical model:

- `ENG` is a native-speaker natural reference condition. It is not an accented condition.
- `JPN` and `CHN` are nonnative-speaker groups with two pronunciation conditions: `natural` and `accented`.
- The primary pronunciation contrast is therefore within `JPN` and `CHN`; `ENG` should be used as a reference baseline, not as one level of the same accentedness manipulation.

A reviewer would reject a design that labels `ENG` as `accented`, because that would collapse native-speaker status and pronunciation condition into an incoherent factor.

## Current Task Structure

Participants complete a browser-based word-level listening task delivered through Cloudflare Pages, Pages Functions, and D1.

Main measures:

- Accentedness rating, 1-9.
- Comprehensibility rating, 1-9.
- Intelligibility response, typed word.
- Response-time and event metadata.
- Required Japanese and Chinese familiarity ratings.

Each participant completes:

1. Setup and familiarity ratings.
2. Four practice/calibration trials.
3. Four main stimulus-list blocks.
4. A short arithmetic distractor task between Blocks 1-3.
5. Completion and D1 persistence checks.

The main task is fixed to a combined-trial format: the participant hears one audio token and then provides intelligibility, accentedness, and comprehensibility responses for that token. On the rating page, accentedness is displayed above comprehensibility. If the word cannot be identified, the participant can explicitly mark `I could not identify the word` rather than entering a forced guess.

## Placeholder Stimulus Universe

Until final stimuli are ready, the design assumes 50 lexical items:

```text
word001, word002, ..., word050
```

The final manifest must replace these placeholders with actual target words and audio paths while preserving the same slot structure:

```csv
audio_file,audio_url,target_word,participant_id,l1_condition,pronunciation_condition,stimulus_list,word_number,condition,talker,take_number,spoken_form,practice_note
```

Required labels:

- `l1_condition`: `ENG`, `JPN`, or `CHN`.
- `pronunciation_condition`:
  - `ENG`: `natural`.
  - `JPN`: `natural` or `accented`.
  - `CHN`: `natural` or `accented`.
- `stimulus_list`: `A` through `J`.
- `word_number`: integer 1-50.

Minimum slot coverage for the production manifest:

| L1 | Pronunciation | Required per list | Required across A-J |
| --- | --- | ---: | ---: |
| ENG | natural | 5 | 50 |
| JPN | natural | 10 | 100 |
| JPN | accented | 10 | 100 |
| CHN | natural | 10 | 100 |
| CHN | accented | 10 | 100 |

The table gives the minimum number of selectable slots, not necessarily the number of unique speakers. If multiple recordings are available for a slot, the server chooses one deterministically from the participant/session seed.

## Counterbalancing Cells

The server assigns each participant to 1 of 20 cells:

- 10 list combinations: `ABCD`, `BCDE`, `CDEF`, `DEFG`, `EFGH`, `FGHI`, `GHIJ`, `HIJA`, `IJAB`, `JABC`.
- 2 pronunciation styles: `a`, `b`.

The list combination is also the block order. Example:

```text
Cell 1: ABCD, style a
Block 1: List A, 25 trials
Distractor
Block 2: List B, 25 trials
Distractor
Block 3: List C, 25 trials
Distractor
Block 4: List D, 25 trials
```

Across the 20 cells, each list appears twice in each block position. This is necessary because otherwise list identity would be confounded with fatigue, practice, or adaptation.

## Within-Participant Exposure

Each participant receives 100 main trials:

| Unit | Count |
| --- | ---: |
| Blocks | 4 |
| Trials per block | 25 |
| Main trials total | 100 |
| ENG natural trials | 20 |
| JPN natural trials | 20 |
| JPN accented trials | 20 |
| CHN natural trials | 20 |
| CHN accented trials | 20 |

Each block contains:

| Condition | Count per block |
| --- | ---: |
| ENG natural | 5 |
| JPN natural | 5 |
| JPN accented | 5 |
| CHN natural | 5 |
| CHN accented | 5 |

This block-level balance is important. If the first two blocks were mostly or entirely natural, participants could recalibrate their rating scale before hearing accented tokens. The current design prevents that: every block contains all five analytic cells.

## Pronunciation Style A/B

For `JPN` and `CHN`, each list supplies 10 word-number positions per L1 group. Style `a` assigns positions 1, 3, 5, 7, and 9 within that list to `natural`; positions 2, 4, 6, 8, and 10 are `accented`. Style `b` reverses this mapping.

This means:

- Every participant sees equal `natural` and `accented` counts for `JPN` and `CHN` within every block.
- Across participants, each nonnative word slot can appear in both pronunciation conditions.
- The design does not rely on raw odd/even word numbers, because list ranges wrap around and would otherwise create local imbalances.

Reviewer concern:

- A/B assignment is still deterministic within list. The final stimulus set must therefore be checked for lexical imbalance across odd/even positions within each list.

Required final check:

- For every list and L1 group, compare positions assigned to style `a` natural vs style `a` accented on lexical frequency, word length, syllable count, neighborhood density, concreteness/familiarity, and phonological complexity.
- If any large imbalance remains, reorder `word_number` within the list before launch, then rerun the simulation.

Current implementation guard:

- In the production manifest, `word_number` is the CounterBalance lexical item number from `stimuli/CounterBalance.xlsx`.
- The source-audio filename value, such as `word018`, is stored separately as `source_word_number` because it reflects source recording order, not the experiment's lexical item ID.
- `scripts/validate_production_manifest.mjs` rejects manifests where one `word_number` maps to multiple `target_word` values.
- `scripts/audit_lexical_balance.py` writes lexical balance tables and `LEXICAL_BALANCE_REPORT_20260703.md`. Current local proxy metrics show no style `a`/`b` lexical imbalance at `|standardized_diff| >= 0.25`, but neighborhood density, concreteness, familiarity, and Japanese/Chinese loanword exposure still require external metadata if the team wants those reported before launch.

## Randomization

The 100 main trials are not globally shuffled. They are presented as four list blocks. Within each 25-trial block, trials are randomized.

The randomizer enforces:

- No 3 or more consecutive trials from the same L1 group.
- Fixed block size of 25.
- Fixed per-block counts for all five analytic cells.
- One deterministic Sheet2 speaker pattern per 25-trial block.
- Stable assignment from participant/session seed.

Each block's Sheet2 pattern index is saved as `speaker_pattern_index`. The expected speaker for each pre-shuffle word position is saved as `speaker_pattern_speaker`; the concrete selected stimulus still carries `participant_id` and `talker`.

This is a reviewer-facing advantage over unconstrained randomization: it prevents accidental stretches such as several `JPN` or several `CHN` items in a row, which could encourage short-term adaptation or response anchoring.

Reviewer concern:

- Constrained randomization is not pure randomization. The manuscript should state the constraint explicitly and include `trial_index`, `block_index`, and possibly previous-trial L1 as covariates or sensitivity checks.

## Distractor Task

The distractor is placed between Blocks 1-3. Its purpose is to reduce carryover from one stimulus list to the next, especially adaptation to speakers, words, and accent patterns.

Current implementation:

- Arithmetic distractor after Blocks 1, 2, and 3.
- Completion, accuracy, responses, and response time are saved in `event_logs`.

Reviewer concern:

- A distractor does not fully erase adaptation. It only makes the block transition less continuous.
- The distractor must be brief enough not to introduce large fatigue, but difficult enough to interrupt phonological rehearsal.

Recommended placeholder rule:

- `[PLACEHOLDER_DISTRACTOR_COUNT] = 6` arithmetic problems.
- Exclude or flag participants with very low distractor accuracy only if this rule is preregistered.
- Do not tune the distractor after looking at outcome data.

## Participant Allocation

The Cloudflare server balances cells by completed sessions. If completed counts are tied, it uses assigned/start counts as a secondary criterion.

This is stronger than participant-ID parity:

- Prolific IDs are not guaranteed to be numeric.
- Recruitment waves can make deterministic parity assignment uneven.
- Completion-balanced allocation handles dropout better.
- Rolling recruitment to a completed-session target can restore completed cell balance after ordinary dropout.

Reviewer concern:

- If a fixed batch is launched and recruitment stops before replacing dropouts, assigned counts can remain balanced while completed counts are uneven.
- If dropout correlates with cell, the final completed sample may still be uneven unless recruitment continues until each cell catches up. Report the final assigned, completed, and excluded count per cell.

Minimum reporting:

```text
cell_id, list_comb, pronunciation_style, assigned_count, completed_count, excluded_count
```

## Stimulus Validity Requirements

The final stimuli must satisfy more than file availability. A critical reviewer will ask whether ratings reflect pronunciation rather than lexical, acoustic, or speaker confounds.

### Lexical Controls

For each target word, record:

- Orthographic form.
- Phonemic transcription.
- Syllable count.
- Stress pattern.
- Word frequency.
- Word length in letters and phonemes.
- Neighborhood density or a defensible proxy.
- Concreteness/familiarity rating if available.
- Whether the word has high familiarity through Japanese or Chinese loanword exposure.

Required checks:

- No systematic lexical imbalance across `JPN natural`, `JPN accented`, `CHN natural`, and `CHN accented` slots.
- No systematic lexical imbalance across block positions.
- `ENG natural` reference words should be drawn from the same target-word universe, not a simpler or acoustically cleaner subset.

### Acoustic Controls

For every audio file, record:

- Duration.
- RMS intensity or LUFS.
- Peak amplitude.
- Sampling rate and bit depth.
- Leading/trailing silence.
- Clipping flag.
- Signal-to-noise estimate if available.
- Recording device or recording batch if relevant.

Required preprocessing:

- Normalize format across all files.
- Trim excessive leading/trailing silence consistently.
- Avoid clipping.
- Do not over-normalize in a way that removes natural speech cues relevant to accentedness.

Recommended analysis sensitivity:

- Add duration and intensity as covariates, or show that results are robust without them.

### Speaker Controls

The manifest has both `participant_id` and `talker`. These must be treated as meaningful experimental metadata.

Reviewer concern:

- If each L1/pronunciation condition is represented by only one speaker, the study cannot separate pronunciation condition from speaker identity.

Minimum defensible requirement:

- Multiple speakers per nonnative L1 group and pronunciation condition.
- Speaker IDs included in the exported data.
- Sheet2 speaker-pattern metadata included in assignment and trial exports.
- Mixed-effects models with random intercepts for rater, target word, and speaker whenever the data support them.

If the final design intentionally uses a small number of speakers, the manuscript must describe the study as stimulus-specific and avoid broad claims about L1 groups.

## Practice Trials

Practice trials use four researcher-selected calibration WAVs in ascending documented Accentedness-reference bands:

1. `appreciation`, `ENG` female, 1–3.
2. `pesticide`, `JPN` male, 3–5.
3. `quality`, `JPN` female, 5–7.
4. `pizza`, synthetic macOS `say` voice `Tingting` using Mandarin `披萨`, 7–9.

These are reference ranges rather than exact scalar ratings. No scalar expert Comprehensibility value has been established for these items. Before production launch:

- Confirm the selected practice audio by collaborator listening review.
- The Mandarin TTS lexical form was explicitly accepted for this practice endpoint on 2026-07-13. Preserve its synthetic Tingting/`披萨` provenance in exports and reporting.
- Confirm the documented Accentedness ranges; leave scalar expert fields blank unless exact ratings are formally established.
- Ensure practice words are not part of the main 50-word set.
- Ensure practice does not reveal the main experimental manipulation.
- Keep practice feedback separate from main-trial data.
- Keep practice short and main-task-like: each practice item should require word typing plus both ratings.
- Permit unlimited replay only while the post-response practice feedback is visible. Practice response pages and all main-task pages retain one playback per page.
- On reload, repeat all four practice items before continuing to the saved main-trial/checklist/completion position; do not overwrite previously saved practice responses.
- Avoid free-text explanations during practice unless they are theoretically necessary and preregistered.

Reviewer concern:

- If practice teaches participants to map specific acoustic properties to high or low accentedness ratings, it can bias the main task. Practice should teach the interface and scale anchors, not train the experimental contrast.

## Dependent Variables

Primary outcome:

- `accentedness_1_9`.

Secondary outcomes:

- `comprehensibility_1_9`.
- `intelligibility`, preferably manually cleaned after exact-match preflagging.

Intelligibility coding should distinguish at least four states:

- Exact match: `intelligibility_exact = 1`.
- Non-exact typed response: `intelligibility_exact = 0` and `intelligibility_needs_manual_review = 1`.
- Explicitly unidentified word: `intelligibility_response_status = unidentified`, `intelligibility_unidentified = 1`, and `intelligibility_exact = 0`.
- Missing/blank response without the unidentified marker: data-quality problem, not a valid intelligibility category.

The explicit unidentified state is theoretically different from misspelling. It should not be folded into manual spelling review, although it can be analyzed as an incorrect intelligibility response.

Secondary process and quality outcomes:

- First-key response time.
- Submit response time.
- Audio replay count.
- Response-order and rating-order process fields.
- First/last selection RTs and selection counts for each 9-point rating scale.
- Distractor accuracy and response time, as attention/process indicators.

Scale direction must be reported:

- Accentedness: 1 = no accent, 9 = extremely strong accent.
- Comprehensibility: 1 = easy to understand, 9 = extremely difficult to understand.

## Analysis Plan

The analysis should preserve trial-level data. Aggregating to participant means should be used only for descriptive plots or robustness checks.

Recommended primary models:

- Accentedness and comprehensibility, both required on every combined/rating trial:
  - Cumulative-link mixed model if feasible.
  - Linear mixed-effects model as a transparent robustness check.
- Intelligibility:
  - Logistic mixed-effects model.

Candidate fixed effects:

- L1/pronunciation cell:
  - `ENG natural`.
  - `JPN natural`.
  - `JPN accented`.
  - `CHN natural`.
  - `CHN accented`.
- Block index.
- Trial index within block.
- Full trial index and block position as fatigue/adaptation covariates.
- Replay count, first-response RT, first-rating RT, and rating selection counts as process/fatigue covariates.
- The displayed rating order is fixed as accentedness followed by comprehensibility. The saved `rating_order` records the participant's actual first interactions and may be used as a process diagnostic or sensitivity variable, but not as a randomized causal order effect.
- Japanese familiarity rating.
- Chinese familiarity rating.
- Audio duration and intensity if available.
- Counterbalance style.
- List or block-list identity if needed.

Candidate random effects:

- Rater.
- Target word.
- Speaker/talker.
- By-rater slopes for pronunciation cell, if supported.
- By-word slopes for L1/pronunciation cell, if supported.

Critical modeling point:

- Do not model `ENG accented`. That condition does not exist.
- Do not treat `ENG natural`, `JPN natural`, and `CHN natural` as equivalent levels of one simple nativeness factor without acknowledging that `JPN/CHN natural` are nonnative productions judged to be more natural, whereas `ENG natural` is native-speaker reference speech.

## Exclusion And Quality Rules

These rules should be preregistered before production data collection:

- Exclude incomplete sessions from primary analysis.
- Exclude sessions with server-save failures or missing trial blocks.
- Exclude participants with extreme nonresponse or invalid typed responses.
- Flag participants with implausibly short listening/response times.
- Flag participants who fail practice or distractor criteria, if criteria are set.
- Decide whether high Japanese/Chinese familiarity is exclusionary or a covariate.

Do not change exclusion thresholds after looking at condition effects.

## Reviewer Risk Register

| Risk | Severity | Current mitigation | Remaining action |
| --- | --- | --- | --- |
| ENG mislabeled as accented | High | Server and templates now require ENG natural | Audit final manifest before launch |
| Global 100-trial shuffle would destroy block design | High | Current implementation uses 4 fixed list blocks | Keep verification in deployment checklist |
| Early blocks dominated by natural tokens | High | Every block has 5 cells x 5 trials | Verify with placeholder and final manifests |
| List identity confounded with fatigue | Medium | Cyclic list combinations balance list position | Report final cell counts |
| A/B word-position lexical imbalance | Medium | Complementary style assignment | Run lexical checks after final word list |
| Speaker identity confounded with condition | High | Speaker metadata exported | Ensure multiple speakers and model speaker effects |
| Acoustic quality confounded with condition | High | Manifest can store metadata | Run acoustic audit before launch |
| Public deployment differs from reviewed local app | High | Live deployment check script compares deployed app, manifest, practice audio, config, and admin protection | Run after every deployment and before Prolific launch |
| Adaptation within blocks | Medium | No 3 same-L1 run; distractors between blocks | Include order covariates/sensitivity checks |
| Fatigue or repeated listening changes rating behavior | Medium | Trial order, response order, rating RTs, and replay count are exported | Model process covariates and inspect late-trial sensitivity |
| Dropout-induced cell imbalance | Medium | Completion-balanced allocation | Use rolling recruitment to completed target; report assigned/completed/excluded by cell |
| Unidentified words conflated with missing data | Medium | Explicit unidentified response and export fields | Report unidentified rates by condition |
| Practice feedback biases main ratings | Medium | Practice is separate | Replace placeholders and avoid condition training |

## Verification Commands

Run these before each production deployment:

```sh
node --check app.js
node --check functions/api/_counterbalance.js
node --check scripts/verify_counterbalance.mjs
node --check scripts/simulate_counterbalance_design.mjs
node scripts/verify_counterbalance.mjs
node scripts/simulate_counterbalance_design.mjs
python3 scripts/stress_counterbalance_concurrency.py --participants 200
node scripts/validate_production_manifest.mjs --manifest /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/remote_manifest.csv --audio-root /Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703
python3 scripts/audit_lexical_balance.py
python3 scripts/audit_audio_qc.py
node scripts/estimate_task_duration.mjs
node scripts/preflight_production.mjs
node scripts/check_live_deployment.mjs --allow-turnstile-off
```

The production manifest validator confirms that the real manifest satisfies the same slot, balance, lexical item ID, and Sheet2 speaker-pattern requirements. The concurrency stress script verifies the SQL-level allocation invariant under a same-timestamp start wave; the current 200-participant local result is exactly 10 assignments per cell. The lexical, acoustic, and duration scripts write tables under `/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703/metadata/`; the current reports are `LEXICAL_BALANCE_REPORT_20260703.md`, `AUDIO_QC_REPORT_20260703.md`, `DURATION_ESTIMATE_REPORT_20260703.md`, and `COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md`.

The live deployment check writes `LIVE_DEPLOYMENT_CHECK_20260703.md` to the same metadata directory. Use `--allow-turnstile-off` only for pilot phases where Turnstile is intentionally disabled; omit it for the final production check if Turnstile is required.

Current acoustic QC has no launch-blocking failure after the `main/jpn/natural/jpn_s06/jpn_s06_natural_pass01_word018_capelin_take04_trial0018.wav` OSF package copy was repaired by linear interpolation across 11 full-scale samples. Before launch, still decide whether peak amplitude 0.99 remains an enforceable preprocessing target, because most main files are consistent with intensity normalization rather than peak normalization.

## Final-Stimulus Placeholder Checklist

Before launch, replace or complete:

- `[PLACEHOLDER_WORD001]` through `[PLACEHOLDER_WORD050]`.
- `[PLACEHOLDER_AUDIO_URL]` for every required slot.
- `[PLACEHOLDER_SPEAKER_ID]` and `[PLACEHOLDER_TALKER_ID]`.
- `[PLACEHOLDER_LEXICAL_METADATA]`.
- `[PLACEHOLDER_ACOUSTIC_METADATA]`.
- `[PLACEHOLDER_PRACTICE_AUDIO]`.
- `[PLACEHOLDER_EXPERT_RATINGS]`.
- `[PLACEHOLDER_EXCLUSION_THRESHOLDS]`.
- `[PLACEHOLDER_TARGET_SAMPLE_SIZE]`.

The study should not be launched until the final manifest passes both software verification and a design-level audit of these placeholders.
