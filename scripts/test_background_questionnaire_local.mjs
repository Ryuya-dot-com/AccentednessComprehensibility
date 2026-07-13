#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { TARGET_WORDS } from "../functions/api/_word-familiarity.js";

const PLATFORM_VERSION = "pronunciation_rating_v0.9.0";
const PRACTICE_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
const PRACTICE_ITEMS = Object.freeze([
  Object.freeze({ word: "appreciation", file: "eng_female_appreciation_practice.wav", l1: "ENG", pronunciation: "natural", talker: "practice_eng_female", spokenForm: "appreciation", sourceFormat: "researcher_provided_calibration_wav", range: "1–3" }),
  Object.freeze({ word: "pesticide", file: "jpn_male_pesticide_practice.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_male", spokenForm: "pesticide", sourceFormat: "researcher_provided_calibration_wav", range: "3–5" }),
  Object.freeze({ word: "quality", file: "jpn_female_quality_practice.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_female", spokenForm: "quality", sourceFormat: "researcher_provided_calibration_wav", range: "5–7" }),
  Object.freeze({ word: "pizza", file: "chn_female_pizza_practice.wav", l1: "CHN", pronunciation: "accented", talker: "macos_tts_tingting", spokenForm: "披萨", sourceFormat: "macos_say_tingting_tts_wav", range: "7–9" }),
]);

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function responseBody(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function postJson(baseUrl, pathname, payload, headers = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { response, ...(await responseBody(response)) };
}

async function get(baseUrl, pathname, headers = {}) {
  const response = await fetch(new URL(pathname, baseUrl), {
    cache: "no-store",
    headers,
  });
  return { response, ...(await responseBody(response)) };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((values) => values.some((value) => value !== ""))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function practiceAssignment() {
  return PRACTICE_ITEMS.map((item, index) => ({
    phase: "practice",
    trial_index: index + 1,
    source_path: `${PRACTICE_AUDIO_ROOT}/${item.file}`,
    audio_url: `${PRACTICE_AUDIO_ROOT}/${item.file}`,
    file_name: item.file,
    target_word: item.word,
    participant_id: item.talker,
    native_language: item.l1,
    accent_condition: item.pronunciation,
    condition: `practice_${item.pronunciation}`,
    talker: item.talker,
    word_number: String(index + 1),
    trial_number: String(index + 1),
    spoken_form: item.spokenForm,
    practice_note: item.sourceFormat === "macos_say_tingting_tts_wav"
      ? `Synthetic macOS say Tingting Mandarin form 披萨; expert Accentedness reference range: ${item.range}.`
      : `Researcher-provided calibration WAV; expert Accentedness reference range: ${item.range}.`,
    source_format: item.sourceFormat,
    practice_kind: "combined",
    practice_group: `accent_band_${item.range.replace("–", "_")}`,
    l1_condition: item.l1,
    pronunciation_condition: item.pronunciation,
  }));
}

function mainAssignment(trialIndex = 1, targetWord = "capelin", wordNumber = 23) {
  return {
    phase: "main",
    trial_index: trialIndex,
    source_path: `local/background-test-${trialIndex}.mp3`,
    audio_url: `https://example.invalid/local/background-test-${trialIndex}.mp3`,
    file_name: `background-test-${trialIndex}.mp3`,
    target_word: targetWord,
    participant_id: "local_speaker",
    native_language: "ENG",
    accent_condition: "natural",
    condition: "local_test",
    talker: "local_speaker",
    word_number: String(wordNumber),
    trial_number: String(trialIndex),
    spoken_form: targetWord,
    source_format: "local_test",
    stimulus_list: "A",
    l1_condition: "ENG",
    pronunciation_condition: "natural",
  };
}

function assignment() {
  return [...practiceAssignment(), mainAssignment()];
}

function trialRow(item, overrides = {}) {
  const practice = item.phase === "practice";
  return {
    phase: item.phase,
    trial_index: item.trial_index,
    trial_total: practice ? PRACTICE_ITEMS.length : 100,
    completed_at: new Date().toISOString(),
    typed_response: item.target_word,
    intelligibility_response_status: "typed",
    comprehensibility_1_9: 4,
    accentedness_1_9: practice ? item.trial_index * 2 : 3,
    response_flow: "staged_dictation_then_ratings",
    ...overrides,
  };
}

function identity(suffix) {
  return {
    rater_id: `LOCAL_BG_${suffix}`,
    session_label: `LOCAL_BG_SESSION_${suffix}`,
    prolific_pid: `LOCAL_BG_PID_${suffix}`,
    prolific_study_id: "LOCAL_BACKGROUND_TEST",
    prolific_session_id: `LOCAL_BG_PROLIFIC_SESSION_${suffix}`,
  };
}

function validStartPayload(suffix) {
  return {
    ...identity(suffix),
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    participant_age_years: "34",
    english_variety: "other",
    english_variety_other: '=HYPERLINK("https://example.invalid","Irish English")',
    gender: "other",
    gender_other: "Test response",
    english_teaching_experience: "yes",
    english_teaching_experience_details: "5 years, adults\nJapan",
    linguistics_knowledge: "yes",
    linguistics_knowledge_details: "English phonetics; university coursework",
    japanese_familiarity_1_6: "3",
    chinese_familiarity_1_6: "4",
    assignment: assignment(),
  };
}

async function expectRejectedStart(baseUrl, payload, expectedMessage) {
  const result = await postJson(baseUrl, "/api/session/start", payload);
  assert(result.response.status === 400, `Expected 400, received ${result.response.status}: ${result.text}`);
  assert(
    String(result.json?.error || "").includes(expectedMessage),
    `Expected error containing ${expectedMessage}: ${result.text}`,
  );
}

async function expectRejectedWordFamiliarity(baseUrl, sessionId, sessionToken, responses, expectedMessage) {
  const result = await postJson(baseUrl, "/api/session/word-familiarity", {
    session_id: sessionId,
    session_token: sessionToken,
    word_familiarity: responses,
  });
  assert(result.response.status === 400, `Expected 400, received ${result.response.status}: ${result.text}`);
  assert(
    String(result.json?.error || "").includes(expectedMessage),
    `Expected word familiarity error containing ${expectedMessage}: ${result.text}`,
  );
}

function allUnknownWordFamiliarity() {
  return TARGET_WORDS.map((word) => ({ ...word, known: false }));
}

async function main() {
  const baseUrl = new URL(argValue("--base-url", "http://127.0.0.1:8788/"));
  const adminToken = argValue("--admin-token", process.env.LOCAL_ADMIN_TOKEN || "");
  if (!adminToken) {
    throw new Error("Pass --admin-token or set LOCAL_ADMIN_TOKEN for the local Pages server.");
  }

  const indexPage = await get(baseUrl, "/");
  assert(indexPage.response.status === 200, `Participant page failed: ${indexPage.response.status}`);
  assert(indexPage.text.includes('id="word-familiarity-panel"'), "Participant page is missing the checklist panel.");
  assert(indexPage.text.includes("Review all 50 words"), "Participant page is missing the 50-word instruction.");
  assert(indexPage.text.includes("If you were unfamiliar with it"), "Participant page has the wrong checklist instruction.");
  assert(indexPage.text.includes('src="audio-lifecycle.js?v=0.9.0"'), "Participant page does not load the audio lifecycle guard.");
  assert(indexPage.text.includes('src="app.js?v=0.9.0"'), "Participant page does not cache-bust app.js v0.9.0.");
  assert(indexPage.text.includes('id="practice-feedback-replay-btn"'), "Practice feedback replay control is missing.");
  assert(
    indexPage.text.includes("You may replay the audio while reviewing this practice feedback."),
    "Practice instructions do not allow feedback-stage replay.",
  );
  assert(
    indexPage.text.indexOf("Rate how strong the speaker's") <
      indexPage.text.indexOf("Rate how easy the word was"),
    "Participant instructions are not Accentedness-first.",
  );
  const appPage = await get(baseUrl, "/app.js");
  assert(appPage.response.status === 200, `Participant app failed: ${appPage.response.status}`);
  const audioLifecyclePage = await get(baseUrl, "/audio-lifecycle.js");
  assert(audioLifecyclePage.response.status === 200, `Audio lifecycle helper failed: ${audioLifecyclePage.response.status}`);
  assert(
    audioLifecyclePage.text.includes("createFeedbackReplayLifecycle") &&
      audioLifecyclePage.text.includes("isPlaybackCurrent") &&
      audioLifecyclePage.text.includes('complete("timeupdate")'),
    "Audio lifecycle helper is missing replay completion or stale-audio guards.",
  );
  assert(appPage.text.includes(`const VERSION = "${PLATFORM_VERSION}"`), "Participant app has the wrong platform version.");
  assert(appPage.text.includes("showWordFamiliarityChecklist"), "Deployed app is missing checklist behavior.");
  assert(appPage.text.includes('"capelin"'), "Deployed app is missing Capelin from the canonical list.");
  assert(
    appPage.text.includes("state.wordFamiliarityRequired = data.word_familiarity_required !== false"),
    "Participant app does not restore the version-specific checklist requirement.",
  );
  assert(
    appPage.text.includes("if (state.wordFamiliarityRequired)"),
    "Participant app does not bypass the checklist for compatible legacy sessions.",
  );
  assert(
    appPage.text.includes("error.data?.reload_required === true"),
    "Participant app does not handle a stale-version reload response.",
  );
  for (const item of PRACTICE_ITEMS) {
    assert(appPage.text.includes(`word: "${item.word}"`), `Participant app is missing practice word ${item.word}.`);
    assert(appPage.text.includes(item.file), `Participant app is missing practice audio ${item.file}.`);
    assert(appPage.text.includes(`"${item.range}"`), `Participant app is missing practice range ${item.range}.`);
  }
  for (const snippet of [
    "resumeAfterPractice",
    "practice_replay_required",
    "continueAfterPractice",
    "replayedSavedPractice",
    "replayPracticeFeedbackAudio",
    "practiceFeedbackReplayGeneration",
    "audioPlaybackGeneration",
    "playbackSettled",
    "AUDIO_LIFECYCLE.isPlaybackCurrent",
    "AUDIO_LIFECYCLE.createFeedbackReplayLifecycle",
    "You may replay this practice audio as many times as needed.",
    "Expert raters rated this as:",
    "Comprehensibility: — (Your rating:",
    "These reference ratings are only for practice.",
    "practice_feedback_replay_start",
    "practice_feedback_replay_end",
  ]) {
    assert(appPage.text.includes(snippet), `Participant app is missing resume/replay contract: ${snippet}`);
  }
  assert(
    !appPage.text.includes("practiceFeedbackReplayCount >="),
    "Practice feedback replay has an unintended hard limit.",
  );
  assert(
    !appPage.text.includes("elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703") &&
      !appPage.text.includes("CHN_Male_shelter_Practice.wav") &&
      !appPage.text.includes("practice_elevenlabs_mp3_norm"),
    "Participant app still contains the superseded practice set.",
  );

  const runId = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const decimalAge = validStartPayload(`${runId}_decimal`);
  decimalAge.participant_age_years = "30.9";
  await expectRejectedStart(baseUrl, decimalAge, "must be an integer");

  const trailingAge = validStartPayload(`${runId}_trailing`);
  trailingAge.participant_age_years = "30years";
  await expectRejectedStart(baseUrl, trailingAge, "must be an integer");

  const missingConditional = validStartPayload(`${runId}_conditional`);
  missingConditional.english_variety_other = "";
  await expectRejectedStart(baseUrl, missingConditional, "english_variety_other is required");

  const payload = validStartPayload(runId);

  const countBeforeResumeMiss = await get(
    baseUrl,
    "/api/admin/summary?recent_limit=1&recent_offset=0",
    { "x-admin-token": adminToken },
  );
  assert(countBeforeResumeMiss.response.status === 200, `Admin pre-count failed: ${countBeforeResumeMiss.text}`);
  const missingResume = await postJson(baseUrl, "/api/session/start", {
    ...identity(`${runId}_missing_resume`),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    missingResume.response.status === 200 && missingResume.json?.existing_session === false,
    `Missing resume_only did not return a clean miss: ${missingResume.text}`,
  );
  const countAfterResumeMiss = await get(
    baseUrl,
    "/api/admin/summary?recent_limit=1&recent_offset=0",
    { "x-admin-token": adminToken },
  );
  assert(countAfterResumeMiss.response.status === 200, `Admin post-count failed: ${countAfterResumeMiss.text}`);
  assert(
    countAfterResumeMiss.json?.counts?.sessions === countBeforeResumeMiss.json?.counts?.sessions,
    "A missing resume_only probe created a session.",
  );

  const started = await postJson(baseUrl, "/api/session/start", payload);
  assert(started.response.status === 200, `Valid start failed: ${started.response.status} ${started.text}`);
  assert(started.json?.ok === true && started.json?.session_id, `Start response is incomplete: ${started.text}`);
  assert(started.json?.session_token, "Start response did not issue a session token.");
  assert(started.json?.word_familiarity_required === true, "New v0.8 session did not require the checklist.");
  const sessionId = started.json.session_id;

  const mismatchedIdentity = await postJson(baseUrl, "/api/session/start", {
    ...identity(runId),
    prolific_session_id: `WRONG_${runId}`,
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    mismatchedIdentity.response.status === 401 && !mismatchedIdentity.json?.session_token,
    `Mismatched Prolific identity received a session token: ${mismatchedIdentity.text}`,
  );
  const checklistBeforeTrials = await postJson(baseUrl, "/api/session/word-familiarity", {
    session_id: sessionId,
    session_token: started.json.session_token,
    word_familiarity: allUnknownWordFamiliarity(),
  });
  assert(
    checklistBeforeTrials.response.status === 409 &&
      String(checklistBeforeTrials.json?.error || "").includes("Complete all rating trials"),
    `Checklist was accepted before rating completion or the identity mismatch rotated the token: ${checklistBeforeTrials.text}`,
  );

  const resumed = await postJson(baseUrl, "/api/session/start", {
    ...identity(runId),
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(resumed.response.status === 200, `Resume probe failed: ${resumed.response.status} ${resumed.text}`);
  assert(resumed.json?.existing_session === true, `Resume did not find the session: ${resumed.text}`);
  assert(resumed.json?.session_id === sessionId, "Resume returned a different session ID.");
  assert(resumed.json?.participant_age_years === 34, "Resume did not return the saved age.");
  assert(resumed.json?.english_variety_other === payload.english_variety_other, "Resume did not return background text.");
  assert(resumed.json?.resume?.practice_replay_required === true, "Resume did not require all four practice items to replay.");
  assert(
    resumed.json?.resume?.next_phase === "main" && Number(resumed.json?.resume?.next_trial_index) === 1,
    `Fresh resume did not preserve the post-practice target at main trial 1: ${resumed.text}`,
  );
  assert(resumed.json?.practice_assignment?.length === 4, "Resume did not return all four practice assignments.");
  for (const [index, expected] of practiceAssignment().entries()) {
    const actual = resumed.json.practice_assignment[index] || {};
    assert(
      actual.target_word === expected.target_word && actual.audio_url === expected.audio_url,
      `Resume practice ${index + 1} does not match ${expected.target_word}.`,
    );
  }
  const sessionToken = resumed.json.session_token;
  assert(sessionToken, "Resume did not rotate the session token.");

  for (const practice of practiceAssignment()) {
    const savedPractice = await postJson(baseUrl, "/api/trial", {
      session_id: sessionId,
      session_token: sessionToken,
      row: trialRow(practice),
    });
    assert(
      savedPractice.response.status === 200 && savedPractice.json?.ok === true,
      `Practice ${practice.trial_index} save failed: ${savedPractice.text}`,
    );
  }

  const trial = await postJson(baseUrl, "/api/trial", {
    session_id: sessionId,
    session_token: sessionToken,
    row: {
      phase: "main",
      trial_index: 1,
      trial_total: 100,
      completed_at: new Date().toISOString(),
      typed_response: "capelin",
      intelligibility_response_status: "typed",
      comprehensibility_1_9: 2,
      accentedness_1_9: 3,
      response_flow: "staged_dictation_then_ratings",
      participant_age_years: "DO_NOT_DUPLICATE",
      english_variety: "DO_NOT_DUPLICATE",
      japanese_familiarity_1_6: "DO_NOT_DUPLICATE",
    },
  });
  assert(trial.response.status === 200 && trial.json?.ok === true, `Trial save failed: ${trial.text}`);

  const completionBeforeChecklist = await postJson(baseUrl, "/api/session/complete", {
    session_id: sessionId,
    session_token: sessionToken,
  });
  assert(
    completionBeforeChecklist.response.status === 409 &&
      completionBeforeChecklist.json?.status === "word_familiarity_required" &&
      !completionBeforeChecklist.json?.completion_code,
    `Completion was not blocked before the checklist: ${completionBeforeChecklist.text}`,
  );

  const resumeBeforeChecklist = await postJson(baseUrl, "/api/session/start", {
    ...identity(runId),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    resumeBeforeChecklist.response.status === 200 &&
      resumeBeforeChecklist.json?.resume?.next_phase === "word_familiarity" &&
      resumeBeforeChecklist.json?.resume?.practice_replay_required === true &&
      resumeBeforeChecklist.json?.practice_assignment?.length === 4 &&
      resumeBeforeChecklist.json?.saved_trials?.length === 5,
    `Resume did not route to the checklist: ${resumeBeforeChecklist.text}`,
  );
  const checklistToken = resumeBeforeChecklist.json.session_token;
  const duplicatePractice = await postJson(baseUrl, "/api/trial", {
    session_id: sessionId,
    session_token: checklistToken,
    row: trialRow(practiceAssignment()[0], {
      typed_response: "must-not-overwrite",
      comprehensibility_1_9: 9,
      accentedness_1_9: 9,
    }),
  });
  assert(
    duplicatePractice.response.status === 200 &&
      duplicatePractice.json?.ok === true &&
      duplicatePractice.json?.duplicate === true,
    `Replayed saved practice was not idempotent: ${duplicatePractice.text}`,
  );
  const wordFamiliarity = allUnknownWordFamiliarity();
  await expectRejectedWordFamiliarity(
    baseUrl,
    sessionId,
    checklistToken,
    wordFamiliarity.slice(0, 49),
    "exactly 50",
  );
  const duplicateWordNumber = wordFamiliarity.map((row) => ({ ...row }));
  duplicateWordNumber[49] = { ...duplicateWordNumber[0] };
  await expectRejectedWordFamiliarity(
    baseUrl,
    sessionId,
    checklistToken,
    duplicateWordNumber,
    "duplicate word_number",
  );
  const stringBoolean = wordFamiliarity.map((row) => ({ ...row }));
  stringBoolean[22].known = "false";
  await expectRejectedWordFamiliarity(
    baseUrl,
    sessionId,
    checklistToken,
    stringBoolean,
    "boolean known",
  );

  const savedChecklist = await postJson(baseUrl, "/api/session/word-familiarity", {
    session_id: sessionId,
    session_token: checklistToken,
    word_familiarity: wordFamiliarity,
  });
  assert(
    savedChecklist.response.status === 200 &&
      savedChecklist.json?.response_count === 50 &&
      savedChecklist.json?.known_word_count === 0,
    `All-unfamiliar checklist was not accepted: ${savedChecklist.text}`,
  );
  const savedChecklistAgain = await postJson(baseUrl, "/api/session/word-familiarity", {
    session_id: sessionId,
    session_token: checklistToken,
    word_familiarity: wordFamiliarity,
  });
  assert(
    savedChecklistAgain.response.status === 200 && savedChecklistAgain.json?.response_count === 50,
    `Checklist upsert was not idempotent: ${savedChecklistAgain.text}`,
  );

  const resumeAfterChecklist = await postJson(baseUrl, "/api/session/start", {
    ...identity(runId),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    resumeAfterChecklist.response.status === 200 &&
      resumeAfterChecklist.json?.resume?.next_phase === "complete" &&
      resumeAfterChecklist.json?.resume?.practice_replay_required === true &&
      resumeAfterChecklist.json?.practice_assignment?.length === 4 &&
      resumeAfterChecklist.json?.word_familiarity?.length === 50,
    `Resume did not restore the completed checklist: ${resumeAfterChecklist.text}`,
  );
  const completionToken = resumeAfterChecklist.json.session_token;

  const completed = await postJson(baseUrl, "/api/session/complete", {
    session_id: sessionId,
    session_token: completionToken,
  });
  assert(completed.response.status === 200 && completed.json?.ok === true, `Completion failed: ${completed.text}`);
  assert(completed.json?.status === "completed", `Expected completed status: ${completed.text}`);

  const legacySuffix = `${runId}_legacy`;
  const legacyPayload = validStartPayload(legacySuffix);
  legacyPayload.platform_version = "pronunciation_rating_v0.6.0";
  const legacyStarted = await postJson(baseUrl, "/api/session/start", legacyPayload);
  assert(legacyStarted.response.status === 200, `Legacy start failed: ${legacyStarted.text}`);
  assert(
    legacyStarted.json?.word_familiarity_required === false,
    "A v0.6 compatibility session unexpectedly requires the checklist.",
  );
  const legacySessionId = legacyStarted.json.session_id;
  const legacyResumedMidTask = await postJson(baseUrl, "/api/session/start", {
    ...identity(legacySuffix),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    legacyResumedMidTask.response.status === 200 &&
      legacyResumedMidTask.json?.existing_session === true &&
      legacyResumedMidTask.json?.resume?.next_phase === "main" &&
      legacyResumedMidTask.json?.resume?.practice_replay_required === true &&
      legacyResumedMidTask.json?.practice_assignment?.length === 4 &&
      legacyResumedMidTask.json?.word_familiarity_required === false,
    `A mid-task v0.6 resume did not preserve the checklist exemption: ${legacyResumedMidTask.text}`,
  );
  for (const practice of practiceAssignment()) {
    const legacyPractice = await postJson(baseUrl, "/api/trial", {
      session_id: legacySessionId,
      session_token: legacyResumedMidTask.json.session_token,
      row: trialRow(practice),
    });
    assert(legacyPractice.response.status === 200, `Legacy practice failed: ${legacyPractice.text}`);
  }
  const legacyTrial = await postJson(baseUrl, "/api/trial", {
    session_id: legacySessionId,
    session_token: legacyResumedMidTask.json.session_token,
    row: {
      phase: "main",
      trial_index: 1,
      trial_total: 100,
      completed_at: new Date().toISOString(),
      typed_response: "capelin",
      intelligibility_response_status: "typed",
      comprehensibility_1_9: 2,
      accentedness_1_9: 3,
      response_flow: "staged_dictation_then_ratings",
    },
  });
  assert(legacyTrial.response.status === 200, `Legacy trial failed: ${legacyTrial.text}`);
  const legacyCompleted = await postJson(baseUrl, "/api/session/complete", {
    session_id: legacySessionId,
    session_token: legacyResumedMidTask.json.session_token,
  });
  assert(
    legacyCompleted.response.status === 200 && legacyCompleted.json?.status === "completed",
    `Legacy session could not complete without a checklist: ${legacyCompleted.text}`,
  );

  const progressSuffix = `${runId}_resume_progress`;
  const progressPayload = validStartPayload(progressSuffix);
  progressPayload.assignment = [
    ...practiceAssignment(),
    mainAssignment(1, "capelin", 23),
    mainAssignment(2, "persimmon", 2),
  ];
  const progressStarted = await postJson(baseUrl, "/api/session/start", progressPayload);
  assert(progressStarted.response.status === 200, `Progress-contract start failed: ${progressStarted.text}`);
  const progressSessionId = progressStarted.json.session_id;
  const initiallySaved = [practiceAssignment()[0], practiceAssignment()[1], mainAssignment(1, "capelin", 23)];
  for (const item of initiallySaved) {
    const saved = await postJson(baseUrl, "/api/trial", {
      session_id: progressSessionId,
      session_token: progressStarted.json.session_token,
      row: trialRow(item),
    });
    assert(saved.response.status === 200 && saved.json?.ok === true, `Progress-contract save failed: ${saved.text}`);
  }
  const progressResumed = await postJson(baseUrl, "/api/session/start", {
    ...identity(progressSuffix),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    progressResumed.response.status === 200 &&
      progressResumed.json?.resume?.practice_replay_required === true &&
      progressResumed.json?.resume?.next_phase === "main" &&
      Number(progressResumed.json?.resume?.next_trial_index) === 2 &&
      progressResumed.json?.practice_assignment?.length === 4 &&
      progressResumed.json?.saved_trials?.length === 3,
    `Resume did not replay practice before exact first unsaved main trial 2: ${progressResumed.text}`,
  );
  const repeatedPractice = await postJson(baseUrl, "/api/trial", {
    session_id: progressSessionId,
    session_token: progressResumed.json.session_token,
    row: trialRow(practiceAssignment()[0], {
      typed_response: "must-not-overwrite-progress",
      accentedness_1_9: 9,
    }),
  });
  assert(
    repeatedPractice.response.status === 200 && repeatedPractice.json?.duplicate === true,
    `Saved practice replay was not idempotent in the progress session: ${repeatedPractice.text}`,
  );
  for (const practice of practiceAssignment().slice(2)) {
    const saved = await postJson(baseUrl, "/api/trial", {
      session_id: progressSessionId,
      session_token: progressResumed.json.session_token,
      row: trialRow(practice),
    });
    assert(saved.response.status === 200 && saved.json?.ok === true, `Missing practice save failed: ${saved.text}`);
  }
  const progressResumedAgain = await postJson(baseUrl, "/api/session/start", {
    ...identity(progressSuffix),
    platform_version: PLATFORM_VERSION,
    resume_only: true,
  });
  assert(
    progressResumedAgain.response.status === 200 &&
      progressResumedAgain.json?.resume?.practice_replay_required === true &&
      progressResumedAgain.json?.resume?.next_phase === "main" &&
      Number(progressResumedAgain.json?.resume?.next_trial_index) === 2 &&
      progressResumedAgain.json?.saved_trials?.length === 5,
    `Repeated reopen changed saved main progress or duplicated practice rows: ${progressResumedAgain.text}`,
  );

  const adminHeaders = { "x-admin-token": adminToken };
  const summary = await get(baseUrl, "/api/admin/summary?recent_limit=100&recent_offset=0", adminHeaders);
  assert(summary.response.status === 200 && summary.json?.ok === true, `Admin summary failed: ${summary.text}`);
  const recent = (summary.json.recent_sessions || []).find((row) => row.session_id === sessionId);
  assert(recent, "Completed test session is missing from the protected admin response.");
  assert(recent.prolific_pid === payload.prolific_pid, "Admin response did not preserve the full Prolific ID.");
  assert(recent.english_teaching_experience_details === payload.english_teaching_experience_details, "Admin background details differ from the submitted value.");
  assert(recent.english_variety_other === payload.english_variety_other, "Admin changed formula-like free text.");
  assert(Number(recent.word_familiarity_response_count) === 50, "Admin checklist count is not 50.");
  assert(Number(recent.known_word_count) === 0, "Admin known-word count is not 0.");

  const sessionsExport = await get(baseUrl, "/api/admin/export/sessions.csv", adminHeaders);
  assert(sessionsExport.response.status === 200, `Sessions export failed: ${sessionsExport.text}`);
  const sessionRow = parseCsv(sessionsExport.text).find((row) => row.id === sessionId);
  assert(sessionRow, "sessions.csv is missing the test session.");
  assert(sessionRow.prolific_pid === payload.prolific_pid, "sessions.csv did not preserve the full Prolific ID.");
  assert(sessionRow.participant_age_years === "34", "sessions.csv is missing the background age.");
  assert(
    sessionRow.english_variety_other === `'${payload.english_variety_other}`,
    "sessions.csv did not neutralize formula-like free text.",
  );
  assert(sessionRow.word_familiarity_response_count === "50", "sessions.csv is missing checklist coverage.");
  assert(sessionRow.known_word_count === "0", "sessions.csv has the wrong known-word count.");

  const ratingsExport = await get(baseUrl, "/api/admin/export/ratings.csv", adminHeaders);
  assert(ratingsExport.response.status === 200, `Ratings export failed: ${ratingsExport.text}`);
  const ratingRows = parseCsv(ratingsExport.text);
  const primaryPracticeRows = ratingRows.filter(
    (row) => row.session_id === sessionId && row.phase === "practice",
  );
  assert(primaryPracticeRows.length === 4, `Primary session has ${primaryPracticeRows.length} practice rows instead of 4.`);
  const primaryPracticeOne = primaryPracticeRows.find((row) => row.trial_index === "1");
  assert(
    primaryPracticeOne?.typed_response === "appreciation" &&
      primaryPracticeOne?.comprehensibility_1_9 === "4" &&
      primaryPracticeOne?.accentedness_1_9 === "2",
    "Replaying saved practice overwrote the original primary-session response.",
  );
  const primaryPracticeFour = primaryPracticeRows.find((row) => row.trial_index === "4");
  assert(
    primaryPracticeFour?.target_word === "pizza" &&
      primaryPracticeFour?.participant_id === "macos_tts_tingting" &&
      primaryPracticeFour?.talker === "macos_tts_tingting" &&
      primaryPracticeFour?.spoken_form === "披萨" &&
      primaryPracticeFour?.source_format === "macos_say_tingting_tts_wav" &&
      primaryPracticeFour?.accent_condition === "accented" &&
      primaryPracticeFour?.condition === "practice_accented",
    "Tingting pizza provenance is not preserved in ratings.csv.",
  );
  const progressPracticeRows = ratingRows.filter(
    (row) => row.session_id === progressSessionId && row.phase === "practice",
  );
  assert(progressPracticeRows.length === 4, `Progress session has ${progressPracticeRows.length} practice rows instead of 4.`);
  const progressPracticeOne = progressPracticeRows.find((row) => row.trial_index === "1");
  assert(
    progressPracticeOne?.typed_response === "appreciation" && progressPracticeOne?.accentedness_1_9 === "2",
    "Repeated reopen overwrote the original progress-session practice response.",
  );

  const wordFamiliarityExport = await get(baseUrl, "/api/admin/export/word-familiarity.csv", adminHeaders);
  assert(wordFamiliarityExport.response.status === 200, `Word familiarity export failed: ${wordFamiliarityExport.text}`);
  const wordRows = parseCsv(wordFamiliarityExport.text).filter((row) => row.session_id === sessionId);
  assert(wordRows.length === 50, `word_familiarity.csv has ${wordRows.length} rows instead of 50.`);
  const capelinRow = wordRows.find((row) => row.word_number === "23" && row.target_word === "capelin");
  assert(capelinRow?.word_known === "0", "Capelin was not exported as unfamiliar.");

  const analysisExport = await get(baseUrl, "/api/admin/export/analysis.csv", adminHeaders);
  assert(analysisExport.response.status === 200, `Analysis export failed: ${analysisExport.text}`);
  const analysisRow = parseCsv(analysisExport.text).find((row) => row.session_id === sessionId);
  assert(analysisRow, "analysis_main_completed.csv is missing the stable session join key.");
  assert(analysisRow.participant_age_years === "34", "analysis export is missing the background age.");
  assert(analysisRow.linguistics_knowledge_details === payload.linguistics_knowledge_details, "Analysis background details differ from the submitted value.");
  assert(analysisRow.target_word === "capelin", "Analysis test row is not Capelin.");
  assert(analysisRow.word_known === "0", "Analysis export did not join Capelin familiarity.");
  const legacyAnalysisRow = parseCsv(analysisExport.text).find((row) => row.session_id === legacySessionId);
  assert(legacyAnalysisRow, "Analysis export is missing the v0.6 compatibility session.");
  assert(legacyAnalysisRow.word_known === "", "A legacy session without a checklist was exported as unfamiliar.");

  const qualityExport = await get(baseUrl, "/api/admin/export/quality.csv", adminHeaders);
  assert(qualityExport.response.status === 200, `Quality export failed: ${qualityExport.text}`);
  const qualityRow = parseCsv(qualityExport.text).find(
    (row) => row.word_familiarity_response_count === "50" && row.known_word_count === "0",
  );
  assert(qualityRow?.word_familiarity_response_count === "50", "Quality export is missing checklist coverage.");
  assert(qualityRow?.known_word_count === "0", "Quality export has the wrong known-word count.");
  assert(qualityRow?.missing_word_familiarity_count === "0", "Quality export reports missing checklist rows.");

  console.log(JSON.stringify({
    ok: true,
    base_url: baseUrl.toString(),
    session_id: sessionId,
    validation_cases: 10,
    resume_without_questionnaire: true,
    resume_miss_does_not_write: true,
    resume_identity_triple_match: true,
    admin_full_prolific_id: true,
    csv_formula_neutralized: true,
    sessions_export_background: true,
    analysis_export_stable_join: true,
    word_familiarity_all_false_valid: true,
    word_familiarity_rows: 50,
    participant_ui_contract: true,
    legacy_v060_compatibility: true,
    legacy_v060_mid_task_resume: true,
    stale_client_reload_handled: true,
    practice_set_v081_exact: true,
    practice_feedback_unlimited_replay_contract: true,
    resume_replays_all_practice: true,
    resume_preserves_first_unsaved_main: true,
    replayed_practice_idempotent: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
