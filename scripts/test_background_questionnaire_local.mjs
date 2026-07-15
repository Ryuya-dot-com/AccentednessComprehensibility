#!/usr/bin/env node
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { onRequestPost as saveEventHandler } from "../functions/api/event.js";
import { onRequestPost as completeSessionHandler } from "../functions/api/session/complete.js";
import { onRequestPost as startSessionHandler } from "../functions/api/session/start.js";
import { onRequestPost as saveTrialHandler } from "../functions/api/trial.js";
import { CANONICAL_PRACTICE_ASSIGNMENT } from "../functions/api/_counterbalance.js";
import { TARGET_WORDS } from "../functions/api/_word-familiarity.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM_VERSION = "pronunciation_rating_v0.10.0";
const LEGACY_PLATFORM_VERSION = "pronunciation_rating_v0.6.0";
const LEGACY_FIXTURE_ORIGIN = "https://legacy-background-fixture.invalid";
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

function parseJsonObject(text) {
  try {
    const value = JSON.parse(String(text || ""));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

class LocalD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new LocalD1Statement(this.database, this.sql, bindings);
  }

  native() {
    return this.database.sqlite.prepare(this.sql);
  }

  async first(column) {
    const row = this.native().get(...this.bindings);
    if (column !== undefined) return row?.[column] ?? null;
    return row || null;
  }

  async all() {
    const statement = this.native();
    return { success: true, results: statement.all(...this.bindings), meta: { changes: 0 } };
  }

  async run() {
    const result = this.native().run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }

  executeForBatch() {
    const statement = this.native();
    if (statement.columns().length) {
      return { success: true, results: statement.all(...this.bindings), meta: { changes: 0 } };
    }
    const result = statement.run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }
}

class LocalD1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new LocalD1Statement(this, sql);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.executeForBatch());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

async function invokeLocalHandler(handler, env, pathname, payload, sessionToken = "") {
  const headers = { "content-type": "application/json", origin: LEGACY_FIXTURE_ORIGIN };
  if (sessionToken) headers["x-session-token"] = sessionToken;
  const request = new Request(`${LEGACY_FIXTURE_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const response = await handler({ request, env });
  return { response, ...(await responseBody(response)) };
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

const DEMOGRAPHIC_FIELDS = Object.freeze([
  "participant_age_years",
  "english_variety",
  "english_variety_other",
  "gender",
  "gender_other",
  "english_teaching_experience",
  "english_teaching_experience_details",
  "linguistics_knowledge",
  "linguistics_knowledge_details",
  "japanese_familiarity_1_6",
  "chinese_familiarity_1_6",
]);

function assertSavedDemographics(actual, expected, label) {
  for (const field of DEMOGRAPHIC_FIELDS) {
    const actualValue = actual?.[field];
    const expectedValue = expected[field];
    const matches = [
      "participant_age_years",
      "japanese_familiarity_1_6",
      "chinese_familiarity_1_6",
    ].includes(field)
      ? Number(actualValue) === Number(expectedValue)
      : actualValue === expectedValue;
    assert(matches, `${label} did not preserve ${field}.`);
  }
}

function assertCanonicalPracticeUiRows(rows, label) {
  assert(
    Array.isArray(rows) && rows.length === CANONICAL_PRACTICE_ASSIGNMENT.length,
    `${label} did not return all four canonical practice rows.`,
  );
  const fields = [
    "phase",
    "trial_index",
    "target_word",
    "audio_url",
    "file_name",
    "participant_id",
    "native_language",
    "accent_condition",
    "condition",
    "talker",
    "word_number",
    "trial_number",
    "spoken_form",
    "source_format",
    "practice_kind",
    "practice_group",
    "l1_condition",
    "pronunciation_condition",
  ];
  CANONICAL_PRACTICE_ASSIGNMENT.forEach((expected, index) => {
    const actual = rows[index] || {};
    for (const field of fields) {
      assert(
        actual[field] === expected[field],
        `${label} practice ${index + 1} has the wrong ${field}.`,
      );
    }
    assert(
      actual.source_path === expected.audio_url,
      `${label} practice ${index + 1} has the wrong source_path.`,
    );
  });
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

async function exercisePersistedPracticeLegacyFixture(suffix) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(fs.readFileSync(path.join(ROOT, "db/schema.sql"), "utf8"));
  const db = new LocalD1(sqlite);
  const env = {
    DB: db,
    ENVIRONMENT: "development",
    REQUIRE_TURNSTILE: "0",
    PROLIFIC_COMPLETION_CODE: "LOCAL-LEGACY-COMPLETE",
  };
  const legacyIdentity = identity(suffix);
  const sessionId = `legacy-fixture-${suffix}`;
  const participantKey = `prolific:${legacyIdentity.prolific_study_id.toLowerCase()}:${legacyIdentity.prolific_pid.toLowerCase()}`;
  const startedAtMs = Date.now() - 60_000;
  const startedAt = new Date(startedAtMs).toISOString();

  try {
    sqlite.prepare(
      `INSERT INTO sessions (
        id, rater_id, session_label, task_mode, platform_version,
        prolific_pid, prolific_study_id, prolific_session_id, participant_key,
        participant_age_years, english_variety, english_variety_other,
        gender, gender_other,
        english_teaching_experience, english_teaching_experience_details,
        linguistics_knowledge, linguistics_knowledge_details,
        japanese_familiarity_1_6, chinese_familiarity_1_6,
        word_familiarity_required, screen_json,
        started_at, started_at_ms, last_seen_at, last_seen_at_ms,
        status, trial_count, completed_trial_count
      ) VALUES (
        ?, ?, ?, 'combined', ?, ?, ?, ?, ?,
        34, 'other', 'Irish English', 'other', 'Test response',
        'yes', '5 years, adults', 'yes', 'English phonetics',
        3, 4, 0, '{}', ?, ?, ?, ?, 'started', 5, 0
      )`,
    ).run(
      sessionId,
      legacyIdentity.rater_id,
      legacyIdentity.session_label,
      LEGACY_PLATFORM_VERSION,
      legacyIdentity.prolific_pid,
      legacyIdentity.prolific_study_id,
      legacyIdentity.prolific_session_id,
      participantKey,
      startedAt,
      startedAtMs,
      startedAt,
      startedAtMs,
    );

    const insertAssignment = sqlite.prepare(
      `INSERT INTO rating_assignments (
        id, session_id, phase, trial_index, source_path, audio_url, file_name,
        target_word, participant_id, native_language, accent_condition,
        condition, talker, word_number, trial_number, spoken_form,
        practice_note, source_format, practice_kind, practice_group,
        stimulus_list, l1_condition, pronunciation_condition, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    );
    for (const item of assignment()) {
      insertAssignment.run(
        `${sessionId}:${item.phase}:${item.trial_index}`,
        sessionId,
        item.phase,
        item.trial_index,
        item.source_path || null,
        item.audio_url || null,
        item.file_name || null,
        item.target_word || null,
        item.participant_id || null,
        item.native_language || null,
        item.accent_condition || null,
        item.condition || null,
        item.talker || null,
        item.word_number || null,
        item.trial_number || null,
        item.spoken_form || null,
        item.practice_note || null,
        item.source_format || null,
        item.practice_kind || null,
        item.practice_group || null,
        item.stimulus_list || null,
        item.l1_condition || null,
        item.pronunciation_condition || null,
        startedAt,
      );
    }

    const persistedAssignments = sqlite.prepare(
      `SELECT phase, COUNT(*) AS count
       FROM rating_assignments WHERE session_id = ? GROUP BY phase`,
    ).all(sessionId);
    assert(
      persistedAssignments.find((row) => row.phase === "practice")?.count === 4 &&
        persistedAssignments.find((row) => row.phase === "main")?.count === 1,
      "The legacy fixture does not contain four persisted practice assignments plus one main assignment.",
    );

    const resumed = await invokeLocalHandler(startSessionHandler, env, "/api/session/start", {
      ...legacyIdentity,
      task_mode: "combined",
      platform_version: PLATFORM_VERSION,
      resume_only: true,
    });
    assert(resumed.response.status === 200, `Legacy fixture resume failed: ${resumed.text}`);
    assert(
      resumed.json?.existing_session === true &&
        resumed.json?.session_id === sessionId &&
        resumed.json?.practice_recording_required === true &&
        resumed.json?.practice_assignment?.length === 4 &&
        resumed.json?.main_assignment?.length === 1 &&
        resumed.json?.saved_trials?.length === 0 &&
        resumed.json?.resume?.next_phase === "main" &&
        resumed.json?.resume?.practice_replay_required === true &&
        resumed.json?.word_familiarity_required === false,
      `The persisted-practice legacy fixture did not retain its resume contract: ${resumed.text}`,
    );
    const sessionToken = resumed.json.session_token;
    assert(sessionToken, "Legacy fixture resume did not issue a session token.");

    const legacyPracticeEvent = await invokeLocalHandler(
      saveEventHandler,
      env,
      "/api/event",
      {
        session_id: sessionId,
        event_type: "practice_feedback_replay_start",
        trial_index: 1,
        event_at: new Date().toISOString(),
        payload: { phase: "practice", compatibility_fixture: true },
      },
      sessionToken,
    );
    assert(
      legacyPracticeEvent.response.status === 200 &&
        legacyPracticeEvent.json?.ok === true &&
        legacyPracticeEvent.json?.ignored !== true &&
        legacyPracticeEvent.json?.id,
      `A persisted-practice legacy event was not recorded: ${legacyPracticeEvent.text}`,
    );

    for (const practice of practiceAssignment()) {
      const saved = await invokeLocalHandler(
        saveTrialHandler,
        env,
        "/api/trial",
        { session_id: sessionId, row: trialRow(practice) },
        sessionToken,
      );
      assert(
        saved.response.status === 200 && saved.json?.ok === true && saved.json?.ignored !== true,
        `Legacy practice ${practice.trial_index} was not saved: ${saved.text}`,
      );
    }

    const duplicatePractice = await invokeLocalHandler(
      saveTrialHandler,
      env,
      "/api/trial",
      {
        session_id: sessionId,
        row: trialRow(practiceAssignment()[0], {
          typed_response: "must-not-overwrite-legacy",
          comprehensibility_1_9: 9,
          accentedness_1_9: 9,
        }),
      },
      sessionToken,
    );
    assert(
      duplicatePractice.response.status === 200 &&
        duplicatePractice.json?.ok === true &&
        duplicatePractice.json?.duplicate === true,
      `A persisted legacy practice replay was not idempotent: ${duplicatePractice.text}`,
    );

    const savedMain = await invokeLocalHandler(
      saveTrialHandler,
      env,
      "/api/trial",
      { session_id: sessionId, row: trialRow(mainAssignment()) },
      sessionToken,
    );
    assert(
      savedMain.response.status === 200 && savedMain.json?.ok === true,
      `The legacy fixture main trial was not saved: ${savedMain.text}`,
    );

    const savedState = sqlite.prepare(
      `SELECT phase, trial_index, typed_response, comprehensibility_1_9, accentedness_1_9
       FROM rating_trials WHERE session_id = ?
       ORDER BY CASE phase WHEN 'practice' THEN 0 ELSE 1 END, trial_index`,
    ).all(sessionId);
    assert(
      savedState.length === 5 && savedState.filter((row) => row.phase === "practice").length === 4,
      "The legacy fixture did not persist all four practice ratings and its main rating.",
    );
    const savedPracticeOne = savedState.find(
      (row) => row.phase === "practice" && row.trial_index === 1,
    );
    assert(
      savedPracticeOne?.typed_response === "appreciation" &&
        savedPracticeOne?.comprehensibility_1_9 === 4 &&
        savedPracticeOne?.accentedness_1_9 === 2,
      "A duplicate legacy practice save overwrote the existing response.",
    );

    const eventRows = sqlite.prepare(
      "SELECT event_type, payload_json FROM event_logs WHERE session_id = ?",
    ).all(sessionId);
    const persistedPracticeEvents = eventRows.filter((row) => {
      const payload = parseJsonObject(row.payload_json);
      return row.event_type.startsWith("practice_") || payload.phase === "practice";
    });
    assert(
      persistedPracticeEvents.length === 5,
      `The legacy fixture persisted ${persistedPracticeEvents.length} practice events instead of 5.`,
    );

    const resumedAfterSaves = await invokeLocalHandler(startSessionHandler, env, "/api/session/start", {
      ...legacyIdentity,
      task_mode: "combined",
      platform_version: PLATFORM_VERSION,
      resume_only: true,
    });
    assert(
      resumedAfterSaves.response.status === 200 &&
        resumedAfterSaves.json?.practice_recording_required === true &&
        resumedAfterSaves.json?.saved_trials?.length === 5 &&
        resumedAfterSaves.json?.saved_trials?.filter((row) => row.phase === "practice").length === 4 &&
        resumedAfterSaves.json?.resume?.next_phase === "complete",
      `Legacy saved practice progress was not restored: ${resumedAfterSaves.text}`,
    );

    const completed = await invokeLocalHandler(
      completeSessionHandler,
      env,
      "/api/session/complete",
      { session_id: sessionId },
      resumedAfterSaves.json.session_token,
    );
    assert(
      completed.response.status === 200 && completed.json?.status === "completed",
      `The persisted-practice legacy fixture did not complete: ${completed.text}`,
    );
  } finally {
    sqlite.close();
  }
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
  assert(indexPage.text.includes('src="audio-lifecycle.js?v=0.10.0"'), "Participant page does not load the audio lifecycle guard.");
  assert(indexPage.text.includes('src="app.js?v=0.10.0"'), "Participant page does not cache-bust app.js v0.10.0.");
  assert(
    indexPage.text.includes("In this practice session, you will transcribe and rate four sample words.") &&
      indexPage.text.includes("familiarize you with the task procedure; and") &&
      indexPage.text.includes("help you calibrate your Accentedness ratings by comparing them with expert reference ranges.") &&
      indexPage.text.includes("listen to the sample again as many times as you like."),
    "Participant page is missing the pre-practice purpose and replay instructions.",
  );
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
    "practiceRecordingRequired",
    "practice_recording_required",
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
    "responsePhase !== \"practice\" || state.practiceRecordingRequired",
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
  assert(started.json?.word_familiarity_required === true, "New v0.10 session did not require the checklist.");
  assert(started.json?.practice_recording_required === false, "New v0.10 session unexpectedly records practice.");
  assert(
    Number(started.json?.trial_count) === 1 &&
      started.json?.practice_assignment?.length === 4 &&
      started.json?.main_assignment?.length === 1,
    `New v0.10 start did not return four client-only practice items plus one recorded main trial: ${started.text}`,
  );
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
  assertSavedDemographics(resumed.json, payload, "Fresh resume");
  assert(resumed.json?.resume?.practice_replay_required === true, "Resume did not require all four practice items to replay.");
  assert(resumed.json?.practice_recording_required === false, "New v0.10 resume unexpectedly records practice.");
  assert(
    resumed.json?.resume?.next_phase === "main" &&
      Number(resumed.json?.resume?.next_trial_index) === 1 &&
      resumed.json?.saved_trials?.length === 0,
    `Fresh resume did not preserve the post-practice target at main trial 1: ${resumed.text}`,
  );
  assertCanonicalPracticeUiRows(resumed.json?.practice_assignment, "Fresh resume");
  const sessionToken = resumed.json.session_token;
  assert(sessionToken, "Resume did not rotate the session token.");

  for (const practice of practiceAssignment()) {
    const ignoredPractice = await postJson(baseUrl, "/api/trial", {
      session_id: sessionId,
      session_token: sessionToken,
      row: trialRow(practice),
    });
    assert(
      ignoredPractice.response.status === 200 &&
        ignoredPractice.json?.ok === true &&
        ignoredPractice.json?.ignored === true &&
        ignoredPractice.json?.reason === "practice_not_recorded",
      `New v0.10 practice ${practice.trial_index} POST was not ignored: ${ignoredPractice.text}`,
    );
  }

  for (const event of [
    { event_type: "trial_shown", trial_index: 1, payload: { phase: "practice" } },
    { event_type: "practice_feedback_replay_start", trial_index: 1, payload: {} },
  ]) {
    const ignoredEvent = await postJson(baseUrl, "/api/event", {
      session_id: sessionId,
      session_token: sessionToken,
      event_at: new Date().toISOString(),
      ...event,
    });
    assert(
      ignoredEvent.response.status === 200 &&
        ignoredEvent.json?.ok === true &&
        ignoredEvent.json?.ignored === true &&
        ignoredEvent.json?.reason === "practice_not_recorded",
      `New v0.10 practice event ${event.event_type} was not ignored: ${ignoredEvent.text}`,
    );
  }
  const mainShownEvent = await postJson(baseUrl, "/api/event", {
    session_id: sessionId,
    session_token: sessionToken,
    event_type: "trial_shown",
    trial_index: 1,
    event_at: new Date().toISOString(),
    payload: { phase: "main" },
  });
  assert(
    mainShownEvent.response.status === 200 &&
      mainShownEvent.json?.ok === true &&
      mainShownEvent.json?.ignored !== true &&
      mainShownEvent.json?.id,
    `New v0.10 main event was not recorded: ${mainShownEvent.text}`,
  );

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
      resumeBeforeChecklist.json?.practice_recording_required === false &&
      resumeBeforeChecklist.json?.practice_assignment?.length === 4 &&
      resumeBeforeChecklist.json?.saved_trials?.length === 1 &&
      resumeBeforeChecklist.json?.saved_trials?.every(
        (row) => row.phase === "main" && Number(row.trial_index) === 1,
      ),
    `Resume did not route to the checklist: ${resumeBeforeChecklist.text}`,
  );
  assertCanonicalPracticeUiRows(
    resumeBeforeChecklist.json?.practice_assignment,
    "Pre-checklist resume",
  );
  assertSavedDemographics(resumeBeforeChecklist.json, payload, "Pre-checklist resume");
  const checklistToken = resumeBeforeChecklist.json.session_token;
  const ignoredPracticeReplay = await postJson(baseUrl, "/api/trial", {
    session_id: sessionId,
    session_token: checklistToken,
    row: trialRow(practiceAssignment()[0], {
      typed_response: "must-not-overwrite",
      comprehensibility_1_9: 9,
      accentedness_1_9: 9,
    }),
  });
  assert(
    ignoredPracticeReplay.response.status === 200 &&
      ignoredPracticeReplay.json?.ok === true &&
      ignoredPracticeReplay.json?.ignored === true &&
      ignoredPracticeReplay.json?.reason === "practice_not_recorded",
    `Replayed new-session practice was not ignored: ${ignoredPracticeReplay.text}`,
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
      resumeAfterChecklist.json?.practice_recording_required === false &&
      resumeAfterChecklist.json?.practice_assignment?.length === 4 &&
      resumeAfterChecklist.json?.saved_trials?.length === 1 &&
      resumeAfterChecklist.json?.saved_trials?.every((row) => row.phase === "main") &&
      resumeAfterChecklist.json?.word_familiarity?.length === 50,
    `Resume did not restore the completed checklist: ${resumeAfterChecklist.text}`,
  );
  assertCanonicalPracticeUiRows(
    resumeAfterChecklist.json?.practice_assignment,
    "Post-checklist resume",
  );
  assertSavedDemographics(resumeAfterChecklist.json, payload, "Post-checklist resume");
  const completionToken = resumeAfterChecklist.json.session_token;

  const completed = await postJson(baseUrl, "/api/session/complete", {
    session_id: sessionId,
    session_token: completionToken,
  });
  assert(completed.response.status === 200 && completed.json?.ok === true, `Completion failed: ${completed.text}`);
  assert(completed.json?.status === "completed", `Expected completed status: ${completed.text}`);

  await exercisePersistedPracticeLegacyFixture(`${runId}_legacy`);

  const progressSuffix = `${runId}_resume_progress`;
  const progressPayload = validStartPayload(progressSuffix);
  progressPayload.assignment = [
    ...practiceAssignment(),
    mainAssignment(1, "capelin", 23),
    mainAssignment(2, "persimmon", 2),
  ];
  const progressStarted = await postJson(baseUrl, "/api/session/start", progressPayload);
  assert(progressStarted.response.status === 200, `Progress-contract start failed: ${progressStarted.text}`);
  assert(
    progressStarted.json?.practice_recording_required === false &&
      Number(progressStarted.json?.trial_count) === 2 &&
      progressStarted.json?.practice_assignment?.length === 4 &&
      progressStarted.json?.main_assignment?.length === 2,
    `Progress-contract start persisted practice or returned the wrong trial totals: ${progressStarted.text}`,
  );
  const progressSessionId = progressStarted.json.session_id;
  const initiallyPosted = [practiceAssignment()[0], practiceAssignment()[1], mainAssignment(1, "capelin", 23)];
  for (const item of initiallyPosted) {
    const result = await postJson(baseUrl, "/api/trial", {
      session_id: progressSessionId,
      session_token: progressStarted.json.session_token,
      row: trialRow(item),
    });
    assert(
      result.response.status === 200 &&
        result.json?.ok === true &&
        (item.phase === "main"
          ? result.json?.ignored !== true
          : result.json?.ignored === true && result.json?.reason === "practice_not_recorded"),
      `Progress-contract ${item.phase} POST had the wrong result: ${result.text}`,
    );
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
      progressResumed.json?.practice_recording_required === false &&
      progressResumed.json?.practice_assignment?.length === 4 &&
      progressResumed.json?.saved_trials?.length === 1 &&
      progressResumed.json?.saved_trials?.every(
        (row) => row.phase === "main" && Number(row.trial_index) === 1,
      ),
    `Resume did not replay practice before exact first unsaved main trial 2: ${progressResumed.text}`,
  );
  assertCanonicalPracticeUiRows(progressResumed.json?.practice_assignment, "Progress resume");
  const repeatedPractice = await postJson(baseUrl, "/api/trial", {
    session_id: progressSessionId,
    session_token: progressResumed.json.session_token,
    row: trialRow(practiceAssignment()[0], {
      typed_response: "must-not-overwrite-progress",
      accentedness_1_9: 9,
    }),
  });
  assert(
    repeatedPractice.response.status === 200 &&
      repeatedPractice.json?.ok === true &&
      repeatedPractice.json?.ignored === true &&
      repeatedPractice.json?.reason === "practice_not_recorded",
    `Repeated practice was not ignored in the progress session: ${repeatedPractice.text}`,
  );
  for (const practice of practiceAssignment().slice(2)) {
    const ignored = await postJson(baseUrl, "/api/trial", {
      session_id: progressSessionId,
      session_token: progressResumed.json.session_token,
      row: trialRow(practice),
    });
    assert(
      ignored.response.status === 200 &&
        ignored.json?.ok === true &&
        ignored.json?.ignored === true &&
        ignored.json?.reason === "practice_not_recorded",
      `Progress practice ${practice.trial_index} was not ignored: ${ignored.text}`,
    );
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
      progressResumedAgain.json?.practice_recording_required === false &&
      progressResumedAgain.json?.saved_trials?.length === 1 &&
      progressResumedAgain.json?.saved_trials?.every((row) => row.phase === "main"),
    `Repeated reopen changed saved main progress or exposed practice rows: ${progressResumedAgain.text}`,
  );
  assertCanonicalPracticeUiRows(
    progressResumedAgain.json?.practice_assignment,
    "Repeated progress resume",
  );

  const adminHeaders = { "x-admin-token": adminToken };
  const summary = await get(baseUrl, "/api/admin/summary?recent_limit=100&recent_offset=0", adminHeaders);
  assert(summary.response.status === 200 && summary.json?.ok === true, `Admin summary failed: ${summary.text}`);
  const recent = (summary.json.recent_sessions || []).find((row) => row.session_id === sessionId);
  assert(recent, "Completed test session is missing from the protected admin response.");
  assert(recent.prolific_pid === payload.prolific_pid, "Admin response did not preserve the full Prolific ID.");
  assertSavedDemographics(recent, payload, "Admin summary");
  assert(Number(recent.word_familiarity_response_count) === 50, "Admin checklist count is not 50.");
  assert(Number(recent.known_word_count) === 0, "Admin known-word count is not 0.");

  const sessionsExport = await get(baseUrl, "/api/admin/export/sessions.csv", adminHeaders);
  assert(sessionsExport.response.status === 200, `Sessions export failed: ${sessionsExport.text}`);
  const sessionRow = parseCsv(sessionsExport.text).find((row) => row.id === sessionId);
  assert(sessionRow, "sessions.csv is missing the test session.");
  assert(sessionRow.prolific_pid === payload.prolific_pid, "sessions.csv did not preserve the full Prolific ID.");
  assertSavedDemographics(
    sessionRow,
    { ...payload, english_variety_other: `'${payload.english_variety_other}` },
    "sessions.csv",
  );
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
  assert(
    primaryPracticeRows.length === 0,
    `New primary session unexpectedly persisted ${primaryPracticeRows.length} practice rating rows.`,
  );
  const primaryMainRows = ratingRows.filter(
    (row) => row.session_id === sessionId && row.phase === "main",
  );
  assert(
    primaryMainRows.length === 1 &&
      primaryMainRows[0].trial_index === "1" &&
      primaryMainRows[0].target_word === "capelin" &&
      primaryMainRows[0].typed_response === "capelin",
    "The primary session did not persist exactly its one saved main rating.",
  );
  const progressPracticeRows = ratingRows.filter(
    (row) => row.session_id === progressSessionId && row.phase === "practice",
  );
  assert(
    progressPracticeRows.length === 0,
    `New progress session unexpectedly persisted ${progressPracticeRows.length} practice rating rows.`,
  );
  const progressMainRows = ratingRows.filter(
    (row) => row.session_id === progressSessionId && row.phase === "main",
  );
  assert(
    progressMainRows.length === 1 &&
      progressMainRows[0].trial_index === "1" &&
      progressMainRows[0].target_word === "capelin",
    "The progress session did not persist only its saved main trial.",
  );

  const assignmentsExport = await get(baseUrl, "/api/admin/export/assignments.csv", adminHeaders);
  assert(assignmentsExport.response.status === 200, `Assignments export failed: ${assignmentsExport.text}`);
  const assignmentRows = parseCsv(assignmentsExport.text);
  const primaryAssignments = assignmentRows.filter((row) => row.session_id === sessionId);
  assert(
    primaryAssignments.length === 1 &&
      primaryAssignments[0].phase === "main" &&
      primaryAssignments[0].trial_index === "1" &&
      primaryAssignments[0].target_word === "capelin",
    "The new primary session did not persist exactly one main assignment and zero practice assignments.",
  );
  const progressAssignments = assignmentRows.filter((row) => row.session_id === progressSessionId);
  assert(
    progressAssignments.length === 2 &&
      progressAssignments.every((row) => row.phase === "main") &&
      progressAssignments.map((row) => row.trial_index).join(",") === "1,2",
    "The new progress session did not persist exactly its two main assignments.",
  );

  const eventsExport = await get(baseUrl, "/api/admin/export/events.csv", adminHeaders);
  assert(eventsExport.response.status === 200, `Events export failed: ${eventsExport.text}`);
  const primaryEventRows = parseCsv(eventsExport.text).filter((row) => row.session_id === sessionId);
  const primaryPracticeEvents = primaryEventRows.filter((row) => {
    const eventPayload = parseJsonObject(row.payload_json);
    return row.event_type.startsWith("practice_") || eventPayload.phase === "practice";
  });
  assert(
    primaryPracticeEvents.length === 0,
    `New primary session unexpectedly persisted ${primaryPracticeEvents.length} practice event rows.`,
  );
  const persistedMainShown = primaryEventRows.find((row) => {
    const eventPayload = parseJsonObject(row.payload_json);
    return row.event_type === "trial_shown" && eventPayload.phase === "main";
  });
  const persistedMainSave = primaryEventRows.find((row) => {
    const eventPayload = parseJsonObject(row.payload_json);
    return row.event_type === "trial_saved" && eventPayload.phase === "main";
  });
  const persistedStart = primaryEventRows.find((row) => row.event_type === "session_start");
  assert(persistedMainShown, "The explicit main trial_shown event was not persisted.");
  assert(persistedMainSave, "The saved main trial did not persist its trial_saved event.");
  assert(
    parseJsonObject(persistedStart?.payload_json).practice_persisted === false,
    "The session_start event does not mark practice as client-only.",
  );
  const progressPracticeEvents = parseCsv(eventsExport.text)
    .filter((row) => row.session_id === progressSessionId)
    .filter((row) => {
      const eventPayload = parseJsonObject(row.payload_json);
      return row.event_type.startsWith("practice_") || eventPayload.phase === "practice";
    });
  assert(
    progressPracticeEvents.length === 0,
    `New progress session unexpectedly persisted ${progressPracticeEvents.length} practice event rows.`,
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
    new_v010_main_only_persistence: true,
    new_v010_practice_assignments_0: true,
    new_v010_practice_trials_0: true,
    new_v010_practice_events_0: true,
    all_demographic_session_columns_roundtrip: true,
    legacy_practice_contract_compatible: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
