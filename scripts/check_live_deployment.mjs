#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://accentednesscomprehensibility.pages.dev";
const PLATFORM_VERSION = "pronunciation_rating_v0.10.0";
const ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1";
const PRACTICE_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
const PRACTICE_ITEMS = Object.freeze([
  Object.freeze({
    trial_index: 1,
    target_word: "appreciation",
    file_name: "ENG_Female_appreciation_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/eng_female_appreciation_practice.wav`,
    l1_condition: "ENG",
    pronunciation_condition: "natural",
    talker: "practice_eng_female",
    spoken_form: "appreciation",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "accent_band_1_3",
    expert_accentedness_range: "1–3",
  }),
  Object.freeze({
    trial_index: 2,
    target_word: "pesticide",
    file_name: "JPN_Male_pesticide.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/jpn_male_pesticide_practice.wav`,
    l1_condition: "JPN",
    pronunciation_condition: "accented",
    talker: "practice_jpn_male",
    spoken_form: "pesticide",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "accent_band_3_5",
    expert_accentedness_range: "3–5",
  }),
  Object.freeze({
    trial_index: 3,
    target_word: "quality",
    file_name: "JPN_Female_quality_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/jpn_female_quality_practice.wav`,
    l1_condition: "JPN",
    pronunciation_condition: "accented",
    talker: "practice_jpn_female",
    spoken_form: "quality",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "accent_band_5_7",
    expert_accentedness_range: "5–7",
  }),
  Object.freeze({
    trial_index: 4,
    target_word: "pizza",
    file_name: "chn_female_pizza_practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/chn_female_pizza_practice.wav`,
    l1_condition: "CHN",
    pronunciation_condition: "accented",
    talker: "macos_tts_tingting",
    spoken_form: "披萨",
    source_format: "macos_say_tingting_tts_wav",
    practice_group: "accent_band_7_9",
    expert_accentedness_range: "7–9",
  }),
]);
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULT_OUT = path.join(PACKAGE_ROOT, "metadata", "LIVE_DEPLOYMENT_CHECK_20260703.md");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function defaultPackageRoot() {
  const adjacentRoot = path.join(PROJECT_ROOT, "Stimuli_OSF_Release_20260703");
  if (packageRootLooksUsable(DROPBOX_PACKAGE_ROOT)) return DROPBOX_PACKAGE_ROOT;
  if (packageRootLooksUsable(adjacentRoot)) return adjacentRoot;
  return adjacentRoot;
}

function packageRootLooksUsable(packageRoot) {
  return fs.existsSync(path.join(packageRoot, "remote_manifest.csv")) ||
    fs.existsSync(path.join(packageRoot, "metadata", "selected_practice_manifest.csv"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value || "").trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function fetchText(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { redirect: "manual", cache: "no-store" });
  const text = await response.text();
  return { url: url.toString(), response, text };
}

async function fetchHead(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store" });
  return { url: url.toString(), response };
}

async function postJson(baseUrl, pathname, payload) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { parse_error: true, text: text.slice(0, 240) };
  }
  return { url: url.toString(), response, data, text };
}

function header(response, name) {
  return response.headers.get(name) || "";
}

function checkRequiredAppSnippets(appText) {
  const required = [
    `const VERSION = "${PLATFORM_VERSION}"`,
    "const STAGED_COMBINED_FLOW = true",
    "speaker_pattern_index",
    PRACTICE_AUDIO_ROOT,
    ...PRACTICE_ITEMS.flatMap((item) => [
      item.target_word,
      item.audio_url.split("/").at(-1),
      item.expert_accentedness_range,
    ]),
    "response_flow",
    "error.data?.retryable === true",
    "Confirming saved responses...",
    "resumeExistingServerSessionIfNeeded",
    "applyServerBackgroundValues",
    "showWordFamiliarityChecklist",
    'postJson("/api/session/word-familiarity"',
    "state.wordFamiliarityRequired = data.word_familiarity_required !== false",
    "if (state.wordFamiliarityRequired)",
    "error.data?.reload_required === true",
    "serverCompletedTrialKeys",
    "serverCompletedDistractorIndexes",
    "resumeAfterPractice",
    "replayingPractice",
    "practiceRecordingRequired",
    "practice_replay_required",
    "continueAfterPractice",
    "replayedSavedPractice",
    "practiceFeedbackReplayCount",
    "practiceFeedbackReplayGeneration",
    "audioPlaybackGeneration",
    "playbackSettled",
    "AUDIO_LIFECYCLE.isPlaybackCurrent",
    "AUDIO_LIFECYCLE.createFeedbackReplayLifecycle",
    "replayPracticeFeedbackAudio",
    "You may replay this practice audio as many times as needed.",
    "Expert raters rated this as:",
    "Comprehensibility: — (Your rating:",
    "These reference ratings are only for practice.",
    "practice_feedback_replay_start",
    "practice_feedback_replay_end",
  ];
  const forbidden = [
    'params.get("completion_code")',
    'params.get("PROLIFIC_CODE")',
    "elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703",
    "CHN_Male_shelter_Practice.wav",
    "practiceFeedbackReplayCount >=",
  ];
  const problems = [];
  for (const snippet of required) {
    if (!appText.includes(snippet)) problems.push(`live app.js missing snippet: ${snippet}`);
  }
  for (const snippet of forbidden) {
    if (appText.includes(snippet)) problems.push(`live app.js still contains forbidden snippet: ${snippet}`);
  }
  return problems;
}

function checkRequiredAudioLifecycleSnippets(helperText) {
  return [
    "createFeedbackReplayLifecycle",
    "isPlaybackCurrent",
    'complete("timeupdate")',
    '"timeout"',
  ]
    .filter((snippet) => !helperText.includes(snippet))
    .map((snippet) => `live audio-lifecycle.js missing snippet: ${snippet}`);
}

function checkRequiredIndexSnippets(indexText) {
  const required = [
    'src="audio-lifecycle.js?v=0.10.0"',
    'src="app.js?v=0.10.0"',
    "In this practice session, you will transcribe and rate four sample words.",
    "familiarize you with the task procedure; and",
    "help you calibrate your Accentedness ratings by comparing them with expert reference ranges.",
    "listen to the sample again as many times as you like.",
    'id="word-familiarity-panel"',
    'id="word-familiarity-grid"',
    "Review all 50 words",
    "If you were unfamiliar with it",
    "Rate how strong the speaker's <strong>accent</strong> sounded.",
    "Rate how easy the word was to <strong>understand</strong>.",
    'id="practice-feedback-replay-btn"',
    'id="practice-feedback-replay-status"',
    "You may replay the audio while reviewing this practice feedback.",
  ];
  const problems = required
    .filter((snippet) => !indexText.includes(snippet))
    .map((snippet) => `live index.html missing snippet: ${snippet}`);
  const accentIndex = indexText.indexOf("Rate how strong the speaker's");
  const understandingIndex = indexText.indexOf("Rate how easy the word was");
  if (accentIndex < 0 || understandingIndex < 0 || accentIndex > understandingIndex) {
    problems.push("live task instructions are not Accentedness-first");
  }
  return problems;
}

function practiceAssignment() {
  return PRACTICE_ITEMS.map((item) => ({
    phase: "practice",
    trial_index: item.trial_index,
    source_path: item.audio_url,
    audio_url: item.audio_url,
    file_name: item.file_name,
    target_word: item.target_word,
    participant_id: item.talker,
    native_language: item.l1_condition,
    accent_condition: item.pronunciation_condition,
    condition: `practice_${item.pronunciation_condition}`,
    talker: item.talker,
    word_number: String(item.trial_index),
    trial_number: String(item.trial_index),
    spoken_form: item.spoken_form,
    practice_note: item.source_format === "macos_say_tingting_tts_wav"
      ? `Researcher-selected synthetic macOS say voice Tingting using the Mandarin form 披萨. Expert Accentedness reference range: ${item.expert_accentedness_range}.`
      : `Researcher-provided calibration WAV. Expert Accentedness reference range: ${item.expert_accentedness_range}.`,
    source_format: item.source_format,
    practice_kind: "combined",
    practice_group: item.practice_group,
  }));
}

function trialSavePayload(sessionId, sessionToken, assignment, overrides = {}) {
  return {
    session_id: sessionId,
    session_token: sessionToken,
    row: {
      phase: assignment.phase || "main",
      trial_index: Number(assignment.trial_index),
      trial_total: assignment.phase === "practice" ? PRACTICE_ITEMS.length : 100,
      completed_at: new Date().toISOString(),
      typed_response: assignment.target_word,
      intelligibility_response_status: "typed",
      comprehensibility_1_9: 4,
      accentedness_1_9: 4,
      response_flow: "staged_dictation_then_ratings",
      ...overrides,
    },
  };
}

function checkSecurityHeaders(response, label) {
  const problems = [];
  for (const name of ["content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    if (!header(response, name)) problems.push(`${label} missing ${name}`);
  }
  return problems;
}

function summarizeHeaders(response) {
  return {
    status: String(response.status),
    content_type: header(response, "content-type"),
    content_length: header(response, "content-length"),
    cache_control: header(response, "cache-control"),
    csp: header(response, "content-security-policy") ? "present" : "",
  };
}

async function liveApiDryRunStartCheck(baseUrl) {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    rater_id: `live_check_${nonce}`,
    session_label: `live_check_${nonce}`,
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    seed: `live_check_${nonce}`,
    dry_run: "1",
    prolific_pid: `LIVE_CHECK_${nonce}`,
    prolific_study_id: "DRY_RUN",
    prolific_session_id: `LIVE_CHECK_SESSION_${nonce}`,
    participant_age_years: 30,
    english_variety: "other",
    english_variety_other: "live check variety",
    gender: "other",
    gender_other: "live check gender",
    english_teaching_experience: "yes",
    english_teaching_experience_details: "live check teaching details",
    linguistics_knowledge: "yes",
    linguistics_knowledge_details: "live check linguistics details",
    japanese_familiarity_1_6: 3,
    chinese_familiarity_1_6: 3,
    counterbalance: { enabled: true },
    practice_assignment: practiceAssignment(),
  };
  const resumePayload = {
    rater_id: payload.rater_id,
    session_label: payload.session_label,
    platform_version: PLATFORM_VERSION,
    dry_run: "1",
    resume_only: true,
    prolific_pid: payload.prolific_pid,
    prolific_study_id: payload.prolific_study_id,
    prolific_session_id: payload.prolific_session_id,
    counterbalance: { enabled: true },
  };
  const result = await postJson(baseUrl, "/api/session/start", payload);
  const assignment = Array.isArray(result.data.main_assignment)
    ? result.data.main_assignment
    : [];
  const assignedCounterbalance = result.data.counterbalance || {};
  const savedPractice = [];
  let savedMain = null;
  if (result.response.status === 200 && result.data.ok === true && result.data.session_token) {
    for (const practice of practiceAssignment()) {
      savedPractice.push(
        await postJson(
          baseUrl,
          "/api/trial",
          trialSavePayload(result.data.session_id, result.data.session_token, practice),
        ),
      );
    }
    if (assignment[0]) {
      savedMain = await postJson(
        baseUrl,
        "/api/trial",
        trialSavePayload(result.data.session_id, result.data.session_token, assignment[0]),
      );
    }
  }
  const duplicate = result.response.status === 200 && result.data.ok === true
    ? await postJson(baseUrl, "/api/session/start", resumePayload)
    : null;
  const duplicateResume = duplicate?.data?.resume || {};
  const duplicatePracticeRows = Array.isArray(duplicate?.data?.practice_assignment)
    ? duplicate.data.practice_assignment
    : [];
  const resumedPracticeSave = duplicate?.data?.session_token && duplicatePracticeRows[0]
    ? await postJson(
        baseUrl,
        "/api/trial",
        trialSavePayload(
          duplicate.data.session_id,
          duplicate.data.session_token,
          duplicatePracticeRows[0],
          { typed_response: "must-not-overwrite", accentedness_1_9: 9 },
        ),
      )
    : null;
  const placeholderRows = assignment.filter((row) => row.source_format === "dry_run_placeholder");
  const nonHttpsRows = assignment.filter((row) => !/^https:\/\//i.test(row.audio_url || ""));
  const engAccentedRows = assignment.filter((row) =>
    row.l1_condition === "ENG" && row.pronunciation_condition !== "natural"
  );
  const invalidL1Rows = assignment.filter((row) => !["ENG", "JPN", "CHN"].includes(row.l1_condition));
  const invalidPronunciationRows = assignment.filter((row) =>
    !["natural", "accented"].includes(row.pronunciation_condition)
  );
  const problems = [
    ...(result.response.status === 200 ? [] : [`/api/session/start returned ${result.response.status}`]),
    ...(result.data.ok === true ? [] : [`/api/session/start response was not ok: ${result.data.error || result.text.slice(0, 160)}`]),
    ...(assignment.length === 100 ? [] : [`expected 100 main assignments, got ${assignment.length}`]),
    ...(Number(result.data.trial_count) === 100 ? [] : [`expected trial_count 100, got ${result.data.trial_count}`]),
    ...(result.data.practice_recording_required === false
      ? []
      : ["new session did not disable practice recording"]),
    ...(Number(assignedCounterbalance.counterbalance_cell) >= 1 &&
      Number(assignedCounterbalance.counterbalance_cell) <= 20
      ? []
      : ["counterbalance response is missing a valid cell 1-20"]),
    ...(Number(assignedCounterbalance.speaker_pattern_bundle) >= 1 &&
      Number(assignedCounterbalance.speaker_pattern_bundle) <= 10
      ? []
      : ["counterbalance response is missing a valid speaker bundle 1-10"]),
    ...(assignedCounterbalance.allocation_strategy_version === ALLOCATION_STRATEGY_VERSION
      ? []
      : ["counterbalance response has the wrong allocation strategy version"]),
    ...(assignedCounterbalance.allocation_cohort === "dry_run:speaker_bundle_latin_v1"
      ? []
      : ["counterbalance response has the wrong dry-run allocation cohort"]),
    ...(Array.isArray(assignedCounterbalance.speaker_pattern_indexes) &&
      assignedCounterbalance.speaker_pattern_indexes.length === 4
      ? []
      : ["counterbalance response is missing the four speaker pattern indexes"]),
    ...savedPractice.flatMap((save, index) =>
      save.response.status === 200 &&
      save.data.ok === true &&
      save.data.ignored === true &&
      save.data.reason === "practice_not_recorded"
        ? []
        : [`practice ${index + 1} was not explicitly ignored: ${save.response.status} ${save.data.error || save.text.slice(0, 120)}`],
    ),
    ...(savedMain && savedMain.response.status === 200 && savedMain.data.ok === true
      ? []
      : ["first main-trial save did not succeed"]),
    ...(placeholderRows.length ? [`${placeholderRows.length} assignment row(s) used dry_run_placeholder fallback`] : []),
    ...(nonHttpsRows.length ? [`${nonHttpsRows.length} assignment row(s) do not have HTTPS audio_url`] : []),
    ...(engAccentedRows.length ? [`${engAccentedRows.length} ENG row(s) are not natural`] : []),
    ...(invalidL1Rows.length ? [`${invalidL1Rows.length} row(s) have invalid l1_condition`] : []),
    ...(invalidPronunciationRows.length
      ? [`${invalidPronunciationRows.length} row(s) have invalid pronunciation_condition`]
      : []),
    ...(duplicate
      ? [
          ...(duplicate.response.status === 200 ? [] : [`duplicate start returned ${duplicate.response.status}`]),
          ...(duplicate.data.ok === true ? [] : [`duplicate start response was not ok: ${duplicate.data.error || duplicate.text.slice(0, 160)}`]),
          ...(duplicate.data.existing_session === true ? [] : ["duplicate start did not report existing_session: true"]),
          ...(duplicate.data.practice_recording_required === false
            ? []
            : ["duplicate start did not preserve the no-practice-recording contract"]),
          ...(duplicate.data.session_id === result.data.session_id ? [] : ["duplicate start did not return the same session_id"]),
          ...(duplicate.data.session_token ? [] : ["duplicate start did not issue a fresh session_token"]),
          ...(JSON.stringify(duplicate.data.counterbalance) === JSON.stringify(assignedCounterbalance)
            ? []
            : ["duplicate start did not preserve the complete counterbalance allocation"]),
          ...(Array.isArray(duplicate.data.saved_trials) ? [] : ["duplicate start did not return saved_trials"]),
          ...(Array.isArray(duplicate.data.distractor_completed_trial_indexes) ? [] : ["duplicate start did not return distractor_completed_trial_indexes"]),
          ...(duplicateResume.practice_replay_required === true ? [] : ["duplicate start did not require all practice items to replay"]),
          ...(duplicateResume.next_phase === "main" ? [] : [`duplicate resume phase must be main, got ${duplicateResume.next_phase || "(missing)"}`]),
          ...(Number(duplicateResume.next_trial_index) === 2 ? [] : [`duplicate resume must preserve progress at main trial 2, got ${duplicateResume.next_trial_index || "(missing)"}`]),
          ...(duplicatePracticeRows.length === PRACTICE_ITEMS.length ? [] : [`duplicate start returned ${duplicatePracticeRows.length} practice assignments instead of 4`]),
          ...PRACTICE_ITEMS.flatMap((expected, index) => {
            const actual = duplicatePracticeRows[index] || {};
            return actual.target_word === expected.target_word &&
              actual.audio_url === expected.audio_url &&
              actual.participant_id === expected.talker &&
              actual.talker === expected.talker &&
              actual.spoken_form === expected.spoken_form &&
              actual.source_format === expected.source_format &&
              actual.accent_condition === expected.pronunciation_condition &&
              actual.condition === `practice_${expected.pronunciation_condition}`
              ? []
              : [`practice assignment ${index + 1} does not match authoritative metadata for ${expected.target_word}`];
          }),
          ...(Array.isArray(duplicate.data.saved_trials) && duplicate.data.saved_trials.length === 1
            ? []
            : [`duplicate start should report 1 saved main row, got ${duplicate.data.saved_trials?.length ?? "(missing)"}`]),
          ...(duplicate.data.word_familiarity_required === true ? [] : ["duplicate start did not preserve word_familiarity_required"]),
          ...(Array.isArray(duplicate.data.word_familiarity) ? [] : ["duplicate start did not return word_familiarity"]),
          ...(Number(duplicate.data.japanese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original japanese_familiarity_1_6"]),
          ...(Number(duplicate.data.chinese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original chinese_familiarity_1_6"]),
          ...(Number(duplicate.data.participant_age_years) === 30 ? [] : ["duplicate start did not return original participant_age_years"]),
          ...(duplicate.data.english_variety === "other" ? [] : ["duplicate start did not return original english_variety"]),
          ...(duplicate.data.english_variety_other === "live check variety" ? [] : ["duplicate start did not return original english_variety_other"]),
          ...(duplicate.data.gender === "other" ? [] : ["duplicate start did not return original gender"]),
          ...(duplicate.data.gender_other === "live check gender" ? [] : ["duplicate start did not return original gender_other"]),
          ...(duplicate.data.english_teaching_experience === "yes" ? [] : ["duplicate start did not return original english_teaching_experience"]),
          ...(duplicate.data.english_teaching_experience_details === "live check teaching details" ? [] : ["duplicate start did not return original english_teaching_experience_details"]),
          ...(duplicate.data.linguistics_knowledge === "yes" ? [] : ["duplicate start did not return original linguistics_knowledge"]),
          ...(duplicate.data.linguistics_knowledge_details === "live check linguistics details" ? [] : ["duplicate start did not return original linguistics_knowledge_details"]),
        ]
      : []),
    ...(resumedPracticeSave?.response.status === 200 &&
      resumedPracticeSave.data.ok === true &&
      resumedPracticeSave.data.ignored === true &&
      resumedPracticeSave.data.reason === "practice_not_recorded"
      ? []
      : ["replayed practice was not ignored by the no-recording contract"]),
  ];
  return {
    problems,
    summary: JSON.stringify({
      status: result.response.status,
      ok: result.data.ok === true,
      dry_run: result.data.dry_run === true,
      trial_count: result.data.trial_count,
      main_assignment: assignment.length,
      counterbalance_cell: assignedCounterbalance.counterbalance_cell || "",
      speaker_pattern_bundle: assignedCounterbalance.speaker_pattern_bundle || "",
      allocation_strategy_version: assignedCounterbalance.allocation_strategy_version || "",
      allocation_cohort: assignedCounterbalance.allocation_cohort || "",
      speaker_pattern_indexes: assignedCounterbalance.speaker_pattern_indexes || [],
      placeholder_rows: placeholderRows.length,
      non_https_rows: nonHttpsRows.length,
      duplicate_existing_session: duplicate?.data?.existing_session === true,
      duplicate_resume_phase: duplicateResume.next_phase || "",
      duplicate_resume_trial_index: duplicateResume.next_trial_index || "",
      practice_replay_required: duplicateResume.practice_replay_required === true,
      practice_assignment: duplicatePracticeRows.length,
      practice_recording_required: duplicate?.data?.practice_recording_required === true,
      resumed_practice_save_ignored: resumedPracticeSave?.data?.ignored === true,
    }),
  };
}

function markdown(checks, context) {
  const blockers = checks.flatMap((check) => check.problems.map((problem) => ({ ...check, problem })));
  const lines = [
    "# Live Deployment Check",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Base URL: ${context.baseUrl}`,
    "",
    `Result: ${blockers.length ? "FAIL" : "PASS"}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of checks) {
    lines.push(`- ${check.problems.length ? "FAIL" : "PASS"} ${check.name}: ${check.summary}`);
    for (const problem of check.problems) lines.push(`  - ${problem}`);
  }
  if (blockers.length) {
    lines.push("", "## Blockers", "");
    for (const blocker of blockers) lines.push(`- ${blocker.name}: ${blocker.problem}`);
  }
  return `${lines.join("\n")}\n`;
}

const baseUrl = argValue("--base-url", DEFAULT_BASE_URL).replace(/\/+$/, "/");
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const allowDemoStaticManifest = hasFlag("--allow-demo-static-manifest");
const allowTurnstileOff = hasFlag("--allow-turnstile-off");
const apiDryRunStart = hasFlag("--api-dry-run-start");

const index = await fetchText(baseUrl, "/");
const app = await fetchText(baseUrl, "/app.js");
const audioLifecycle = await fetchText(baseUrl, "/audio-lifecycle.js");
const manifest = await fetchText(baseUrl, "/remote_manifest.csv");
const config = await fetchText(baseUrl, "/api/config");
const selectedPractice = await Promise.all(
  PRACTICE_ITEMS.map((item) => fetchHead(baseUrl, item.audio_url)),
);
const adminDryRun = await fetchHead(baseUrl, "/admin/dry-run.html");

let configJson = {};
try {
  configJson = JSON.parse(config.text);
} catch {
  configJson = {};
}
const manifestRows = parseCsv(manifest.text);
const repoManifestLooksDemo = manifestRows.length < 2497 || manifestRows.some((row) =>
  String(row.practice_note || "").toLowerCase().includes("demo")
  || String(row.participant_id || "").toLowerCase().startsWith("practice_")
);
const checks = [
  {
    name: "Index security headers",
    problems: [
      ...checkSecurityHeaders(index.response, "index"),
      ...checkRequiredIndexSnippets(index.text),
    ],
    summary: JSON.stringify(summarizeHeaders(index.response)),
  },
  {
    name: "Live app.js version",
    problems: [
      ...(app.response.status === 200 ? [] : [`app.js returned ${app.response.status}`]),
      ...checkRequiredAppSnippets(app.text),
    ],
    summary: `${app.text.length} bytes`,
  },
  {
    name: "Live audio replay lifecycle",
    problems: [
      ...(audioLifecycle.response.status === 200
        ? []
        : [`audio-lifecycle.js returned ${audioLifecycle.response.status}`]),
      ...checkRequiredAudioLifecycleSnippets(audioLifecycle.text),
    ],
    summary: `${audioLifecycle.text.length} bytes`,
  },
  {
    name: "Live static remote_manifest.csv",
    problems: repoManifestLooksDemo && !allowDemoStaticManifest
      ? [`static remote_manifest.csv appears to be demo/incomplete (${manifestRows.length} rows)`]
      : [],
    summary: `${manifestRows.length} row(s)`,
  },
  {
    name: "Live /api/config",
    problems: [
      ...(configJson.production === true ? [] : ["production mode is not true"]),
      ...(!allowTurnstileOff && configJson.require_turnstile !== true ? ["Turnstile is not required"] : []),
    ],
    summary: JSON.stringify(configJson),
  },
  {
    name: "Selected practice audio deployed",
    problems: selectedPractice.flatMap((result, index) =>
      result.response.status >= 200 &&
      result.response.status < 300 &&
      /^audio\//i.test(header(result.response, "content-type"))
        ? []
        : [
            `${PRACTICE_ITEMS[index].target_word} practice WAV returned ${result.response.status} / ` +
              `${header(result.response, "content-type") || "(no content-type)"}`,
          ],
    ),
    summary: JSON.stringify(
      Object.fromEntries(
        selectedPractice.map((result, index) => [
          PRACTICE_ITEMS[index].target_word,
          summarizeHeaders(result.response),
        ]),
      ),
    ),
  },
  {
    name: "Admin dry-run protected",
    problems: [302, 401, 403].includes(adminDryRun.response.status)
      ? []
      : [`admin dry-run path returned ${adminDryRun.response.status}, expected Access challenge/deny`],
    summary: JSON.stringify(summarizeHeaders(adminDryRun.response)),
  },
];

if (apiDryRunStart) {
  checks.push({
    name: "Live API dry-run start",
    ...(await liveApiDryRunStartCheck(baseUrl)),
  });
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, markdown(checks, { baseUrl }));
const blockers = checks.flatMap((check) => check.problems.map((problem) => `${check.name}: ${problem}`));
console.log(`live deployment report: ${out}`);
console.log(`result: ${blockers.length ? "FAIL" : "PASS"}`);
if (blockers.length) {
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}
