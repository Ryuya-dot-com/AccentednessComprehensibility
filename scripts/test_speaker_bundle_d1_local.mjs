#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { onRequestPost as startSession } from "../functions/api/session/start.js";
import { onRequestPost as saveTrial } from "../functions/api/trial.js";
import { onRequestPost as completeSession } from "../functions/api/session/complete.js";
import {
  CANONICAL_PRACTICE_ASSIGNMENT,
  CURRENT_ALLOCATION_STRATEGY_VERSION,
  SPEAKER_PATTERN_BUNDLES,
} from "../functions/api/_counterbalance.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PLATFORM_VERSION = "pronunciation_rating_v0.9.0";
const ALLOWED_STUDY = "STUDY_ALLOWED";
const ALLOCATION_COHORT = "pilot_bundle_v1";
const TEST_ORIGIN = "https://bundle-test.invalid";

const LIST_SPECS = Object.freeze({
  A: { ENG: range(1, 5), JPN: range(6, 15), CHN: range(16, 25) },
  B: { ENG: range(26, 30), JPN: range(31, 40), CHN: range(41, 50) },
  C: { ENG: range(6, 10), JPN: range(11, 20), CHN: [...range(21, 25), ...range(1, 5)] },
  D: { ENG: range(31, 35), JPN: range(36, 45), CHN: [...range(46, 50), ...range(26, 30)] },
  E: { ENG: range(11, 15), JPN: range(16, 25), CHN: range(1, 10) },
  F: { ENG: range(36, 40), JPN: range(41, 50), CHN: range(26, 35) },
  G: { ENG: range(16, 20), JPN: [...range(21, 25), ...range(1, 5)], CHN: range(6, 15) },
  H: { ENG: range(41, 45), JPN: [...range(46, 50), ...range(26, 30)], CHN: range(31, 40) },
  I: { ENG: range(21, 25), JPN: range(1, 10), CHN: range(11, 20) },
  J: { ENG: range(46, 50), JPN: range(26, 35), CHN: range(36, 45) },
});

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
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
    return this.executeForBatch();
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

  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }
}

function openFreshDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(sqlText("db/schema.sql"));
  return { sqlite, d1: new LocalD1(sqlite) };
}

function legacySchemaFromCurrent() {
  return sqlText("db/schema.sql")
    .replace(/^  (speaker_pattern_bundle INTEGER|allocation_strategy_version TEXT|allocation_cohort TEXT),?\n/gm, "")
    .replace(/\nCREATE TABLE IF NOT EXISTS speaker_pattern_bundles \([\s\S]*?\n\);\n/, "\n")
    .replace(/\nINSERT OR IGNORE INTO speaker_pattern_bundles \([\s\S]*?;\n/, "\n")
    .replace(/\nCREATE INDEX IF NOT EXISTS idx_sessions_counterbalance_bundle[\s\S]*?;\n/, "\n")
    .replace(/\nCREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_bundle[\s\S]*?;\n/, "\n");
}

function tableColumns(sqlite, table) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function assertBundleSchema(sqlite, label) {
  for (const table of ["sessions", "rating_assignments", "rating_trials", "counterbalance_allocations"]) {
    const columns = new Set(tableColumns(sqlite, table));
    for (const column of ["speaker_pattern_bundle", "allocation_strategy_version", "allocation_cohort"]) {
      assert(columns.has(column), `${label}: ${table}.${column} is missing`);
    }
  }
  const bundleCount = sqlite
    .prepare("SELECT COUNT(*) AS count FROM speaker_pattern_bundles WHERE allocation_strategy_version = ?")
    .get(CURRENT_ALLOCATION_STRATEGY_VERSION).count;
  assert(bundleCount === 10, `${label}: expected 10 bundle definitions, got ${bundleCount}`);
}

function seedLegacySession(sqlite) {
  const now = new Date().toISOString();
  sqlite.prepare(
    `INSERT INTO sessions (
      id, rater_id, session_label, task_mode, platform_version,
      prolific_pid, prolific_study_id, prolific_session_id, participant_key,
      started_at, started_at_ms, last_seen_at, last_seen_at_ms,
      status, trial_count, completed_trial_count, counterbalance_cell,
      list_comb, pronunciation_style
    ) VALUES (?, ?, ?, 'combined', 'pronunciation_rating_v0.8.1',
      ?, ?, ?, ?, ?, ?, ?, ?, 'started', 2, 0, 1, 'ABCD', 'a')`,
  ).run(
    "legacy-session",
    "LEGACY_RATER",
    "LEGACY_LABEL",
    "PID_LEGACY",
    "STUDY_LEGACY",
    "SESSION_LEGACY",
    "prolific:study_legacy:pid_legacy",
    now,
    Date.now(),
    now,
    Date.now(),
  );
  const insert = sqlite.prepare(
    `INSERT INTO rating_assignments (
      id, session_id, phase, trial_index, audio_url, target_word,
      participant_id, native_language, accent_condition, condition, talker,
      word_number, trial_number, source_format,
      counterbalance_cell, list_comb, pronunciation_style, stimulus_list,
      l1_condition, pronunciation_condition, block_index, block_list,
      within_block_index, block_trial_count, speaker_pattern_index,
      speaker_pattern_speaker, created_at
    ) VALUES (?, 'legacy-session', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      1, 'ABCD', 'a', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(
    "legacy-session:practice:1", "practice", 1,
    CANONICAL_PRACTICE_ASSIGNMENT[0].audio_url, "appreciation", "practice_eng_female",
    "ENG", "natural", "practice_natural", "practice_eng_female", "1", "1",
    "legacy", null, "ENG", "natural", null, null, null, null, null, null, now,
  );
  insert.run(
    "legacy-session:main:1", "main", 1, `${TEST_ORIGIN}/legacy.wav`, "legacy",
    "eng_s01", "ENG", "natural", "main", "eng_s01", "1", "1", "legacy",
    "A", "ENG", "natural", 1, "A", 1, 25, 1, "ENG1", now,
  );
}

async function testFreshAndMigratedSchema() {
  const fresh = openFreshDatabase();
  assertBundleSchema(fresh.sqlite, "fresh schema");
  fresh.sqlite.close();

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(legacySchemaFromCurrent());
  assert(!tableColumns(sqlite, "sessions").includes("speaker_pattern_bundle"), "legacy fixture still has bundle columns");
  seedLegacySession(sqlite);
  sqlite.exec(sqlText("db/migrations/0015_speaker_pattern_bundles.sql"));
  assertBundleSchema(sqlite, "migrated legacy schema");
  const legacy = sqlite.prepare(
    `SELECT speaker_pattern_bundle, allocation_strategy_version, allocation_cohort
     FROM sessions WHERE id = 'legacy-session'`,
  ).get();
  assert(
    legacy.speaker_pattern_bundle === null &&
      legacy.allocation_strategy_version === null &&
      legacy.allocation_cohort === null,
    "legacy bundle columns must remain NULL after migration",
  );
  return { sqlite, d1: new LocalD1(sqlite) };
}

function manifestCsv() {
  const rows = [[
    "audio_file", "target_word", "participant_id", "l1_condition",
    "pronunciation_condition", "stimulus_list", "word_number", "condition",
    "talker", "source_format",
  ]];
  for (const [stimulusList, spec] of Object.entries(LIST_SPECS)) {
    for (const l1 of ["ENG", "JPN", "CHN"]) {
      const speakers = l1 === "ENG" ? 5 : 10;
      const pronunciations = l1 === "ENG" ? ["natural"] : ["natural", "accented"];
      for (const wordNumber of spec[l1]) {
        for (const pronunciation of pronunciations) {
          for (let speaker = 1; speaker <= speakers; speaker += 1) {
            const speakerId = `${l1.toLowerCase()}_s${String(speaker).padStart(2, "0")}`;
            rows.push([
              `synthetic/${stimulusList}/${l1}/${pronunciation}/${speakerId}/word${wordNumber}.wav`,
              `word${wordNumber}`, speakerId, l1, pronunciation, stimulusList,
              String(wordNumber), "main", speakerId, "synthetic_bundle_test",
            ]);
          }
        }
      }
    }
  }
  return rows.map((row) => row.join(",")).join("\n");
}

function assets(csv) {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith("/remote_manifest.csv")) {
        return new Response(csv, { status: 200, headers: { "content-type": "text/csv" } });
      }
      return new Response("not found", { status: 404 });
    },
  };
}

function productionEnv(db, studyMap, csv = manifestCsv()) {
  return {
    DB: db,
    ASSETS: assets(csv),
    ENVIRONMENT: "production",
    COUNTERBALANCE_COHORTS_JSON: JSON.stringify(studyMap),
    PROLIFIC_COMPLETION_CODE: "LOCAL-TEST-CODE",
  };
}

function dryRunEnv(db) {
  return {
    DB: db,
    ASSETS: assets("audio_file,target_word\nmissing.wav,missing"),
    ENVIRONMENT: "development",
  };
}

function startPayload(suffix, studyId = ALLOWED_STUDY, dryRun = false) {
  return {
    rater_id: `RATER_${suffix}`,
    session_label: `LABEL_${suffix}`,
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    prolific_pid: `PID_${suffix}`,
    prolific_study_id: dryRun ? "DRY_RUN" : studyId,
    prolific_session_id: `SESSION_${suffix}`,
    dry_run: dryRun ? "1" : "",
    seed: `SEED_${suffix}`,
    participant_age_years: 30,
    english_variety: "american",
    english_variety_other: "",
    gender: "no_answer",
    gender_other: "",
    english_teaching_experience: "no",
    english_teaching_experience_details: "",
    linguistics_knowledge: "no",
    linguistics_knowledge_details: "",
    japanese_familiarity_1_6: 3,
    chinese_familiarity_1_6: 3,
    counterbalance: { enabled: true },
    practice_assignment: CANONICAL_PRACTICE_ASSIGNMENT.map((item) => ({ ...item })),
  };
}

function request(pathname, payload, token = "") {
  const headers = { "content-type": "application/json", origin: TEST_ORIGIN };
  if (token) headers["x-session-token"] = token;
  return new Request(`${TEST_ORIGIN}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function invoke(handler, env, pathname, payload, token = "") {
  const response = await handler({ request: request(pathname, payload, token), env });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

function assertParticipantSpeakerBalance(mainAssignment) {
  assert(mainAssignment.length === 100, `expected 100 main assignments; got ${mainAssignment.length}`);
  for (const l1 of ["JPN", "CHN"]) {
    for (let speaker = 1; speaker <= 10; speaker += 1) {
      const label = `${l1}${speaker}`;
      const rows = mainAssignment.filter((row) => row.speaker_pattern_speaker === label);
      const natural = rows.filter((row) => row.pronunciation_condition === "natural").length;
      const accented = rows.filter((row) => row.pronunciation_condition === "accented").length;
      assert(rows.length === 4 && natural === 2 && accented === 2, `${label} is not exactly 2 natural / 2 accented`);
    }
  }
}

async function testLegacyResumeBeforeCohortEnforcement(database) {
  const env = productionEnv(database.d1, { [ALLOWED_STUDY.toLowerCase()]: ALLOCATION_COHORT });
  const payload = startPayload("LEGACY", "STUDY_LEGACY");
  payload.rater_id = "LEGACY_RATER";
  payload.session_label = "LEGACY_LABEL";
  payload.prolific_pid = "PID_LEGACY";
  payload.prolific_session_id = "SESSION_LEGACY";
  const result = await invoke(startSession, env, "/api/session/start", payload);
  assert(result.status === 200, `legacy resume failed before cohort enforcement: ${result.status} ${JSON.stringify(result.body)}`);
  assert(result.body.existing_session === true, "legacy session was not resumed");
  assert(result.body.session_id === "legacy-session", "legacy resume returned the wrong session");
  assert(result.body.counterbalance.speaker_pattern_bundle === null, "legacy resume invented a bundle id");
}

async function testAllowlistAndNewSession(database) {
  const env = productionEnv(database.d1, { [ALLOWED_STUDY.toLowerCase()]: ALLOCATION_COHORT });
  const rejected = await invoke(
    startSession,
    env,
    "/api/session/start",
    startPayload("UNMAPPED", "STUDY_UNMAPPED"),
  );
  assert(rejected.status === 403, `unmapped study should be rejected with 403; got ${rejected.status}`);

  const started = await invoke(
    startSession,
    env,
    "/api/session/start",
    startPayload("ALLOWED"),
  );
  assert(started.status === 200 && started.body.ok === true, `allowed start failed: ${started.status} ${JSON.stringify(started.body)}`);
  assert(started.body.counterbalance.allocation_cohort === ALLOCATION_COHORT, "response cohort mismatch");
  assert(started.body.counterbalance.allocation_strategy_version === CURRENT_ALLOCATION_STRATEGY_VERSION, "response strategy mismatch");
  assertBundleAndPatterns(started.body.counterbalance);
  assertParticipantSpeakerBalance(started.body.main_assignment);

  const session = database.sqlite.prepare(
    `SELECT counterbalance_allocation_id, counterbalance_cell, speaker_pattern_bundle,
            allocation_strategy_version, allocation_cohort, trial_count
     FROM sessions WHERE id = ?`,
  ).get(started.body.session_id);
  assert(session.trial_count === 104, `session trial_count is ${session.trial_count}, not 104`);
  assert(session.speaker_pattern_bundle === started.body.counterbalance.speaker_pattern_bundle, "session bundle mismatch");
  assert(session.allocation_strategy_version === CURRENT_ALLOCATION_STRATEGY_VERSION, "session strategy not saved");
  assert(session.allocation_cohort === ALLOCATION_COHORT, "session cohort not saved");
  const assignmentMeta = database.sqlite.prepare(
    `SELECT COUNT(*) AS count,
            SUM(CASE WHEN speaker_pattern_bundle IS NOT NULL
                       AND allocation_strategy_version IS NOT NULL
                       AND allocation_cohort IS NOT NULL
                     THEN 1 ELSE 0 END) AS complete_metadata_count,
            COUNT(DISTINCT speaker_pattern_bundle) AS bundles,
            COUNT(DISTINCT allocation_strategy_version) AS strategies,
            COUNT(DISTINCT allocation_cohort) AS cohorts
     FROM rating_assignments WHERE session_id = ?`,
  ).get(started.body.session_id);
  assert(assignmentMeta.count === 104, `expected 104 persisted assignments; got ${assignmentMeta.count}`);
  assert(
    assignmentMeta.complete_metadata_count === 104,
    `expected bundle/version/cohort on all 104 assignments; got ${assignmentMeta.complete_metadata_count}`,
  );
  assert(assignmentMeta.bundles === 1 && assignmentMeta.strategies === 1 && assignmentMeta.cohorts === 1, "assignment bundle metadata is incomplete");
  return { env, started };
}

function assertBundleAndPatterns(counterbalance) {
  const bundle = SPEAKER_PATTERN_BUNDLES.find(
    (candidate) => candidate.speaker_pattern_bundle === Number(counterbalance.speaker_pattern_bundle),
  );
  assert(bundle, `unknown allocated bundle ${counterbalance.speaker_pattern_bundle}`);
  assert(
    JSON.stringify(counterbalance.speaker_pattern_indexes) === JSON.stringify(bundle.patterns),
    `bundle patterns do not match definition: ${JSON.stringify(counterbalance)}`,
  );
}

async function saveAllTrialsAndComplete(database, env, started) {
  const rows = [...started.body.practice_assignment, ...started.body.main_assignment];
  for (const assignment of rows) {
    const result = await invoke(
      saveTrial,
      env,
      "/api/trial",
      {
        session_id: started.body.session_id,
        row: {
          phase: assignment.phase,
          trial_index: assignment.trial_index,
          trial_total: 104,
          completed_at: new Date().toISOString(),
          typed_response: assignment.target_word || "heard",
          intelligibility_response_status: "typed",
          comprehensibility_1_9: 4,
          accentedness_1_9: 5,
          response_flow: "staged_dictation_then_ratings",
          replay_count: 1,
        },
      },
      started.body.session_token,
    );
    assert(result.status === 200 && result.body.ok === true, `trial save failed for ${assignment.phase}:${assignment.trial_index}: ${result.status} ${JSON.stringify(result.body)}`);
  }

  const propagated = database.sqlite.prepare(
    `SELECT speaker_pattern_bundle, allocation_strategy_version, allocation_cohort
     FROM rating_trials WHERE session_id = ? AND phase = 'main' AND trial_index = 1`,
  ).get(started.body.session_id);
  assert(propagated.speaker_pattern_bundle === started.body.counterbalance.speaker_pattern_bundle, "trial bundle was not propagated");
  assert(propagated.allocation_strategy_version === CURRENT_ALLOCATION_STRATEGY_VERSION, "trial strategy was not propagated");
  assert(propagated.allocation_cohort === ALLOCATION_COHORT, "trial cohort was not propagated");
  const trialMetadata = database.sqlite.prepare(
    `SELECT COUNT(*) AS count,
            SUM(CASE WHEN speaker_pattern_bundle IS NOT NULL
                       AND allocation_strategy_version IS NOT NULL
                       AND allocation_cohort IS NOT NULL
                     THEN 1 ELSE 0 END) AS complete_metadata_count
     FROM rating_trials WHERE session_id = ?`,
  ).get(started.body.session_id);
  assert(trialMetadata.count === 104, `expected 104 persisted trials; got ${trialMetadata.count}`);
  assert(
    trialMetadata.complete_metadata_count === 104,
    `expected bundle/version/cohort on all 104 trials; got ${trialMetadata.complete_metadata_count}`,
  );
  const practiceMetadata = database.sqlite.prepare(
    `SELECT speaker_pattern_bundle, allocation_strategy_version, allocation_cohort
     FROM rating_trials WHERE session_id = ? AND phase = 'practice' AND trial_index = 1`,
  ).get(started.body.session_id);
  assert(practiceMetadata.speaker_pattern_bundle === started.body.counterbalance.speaker_pattern_bundle, "practice trial bundle was not propagated");
  assert(practiceMetadata.allocation_strategy_version === CURRENT_ALLOCATION_STRATEGY_VERSION, "practice trial strategy was not propagated");
  assert(practiceMetadata.allocation_cohort === ALLOCATION_COHORT, "practice trial cohort was not propagated");

  const familiarityInsert = database.sqlite.prepare(
    `INSERT INTO word_familiarity_responses (
       session_id, word_number, target_word, word_known, submitted_at, submitted_at_ms
     ) VALUES (?, ?, ?, 1, ?, ?)`,
  );
  const submittedAt = new Date().toISOString();
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    familiarityInsert.run(started.body.session_id, wordNumber, `word${wordNumber}`, submittedAt, Date.now());
  }

  const completed = await invoke(
    completeSession,
    env,
    "/api/session/complete",
    { session_id: started.body.session_id },
    started.body.session_token,
  );
  assert(completed.status === 200 && completed.body.status === "completed", `completion failed: ${completed.status} ${JSON.stringify(completed.body)}`);
  const allocation = database.sqlite.prepare(
    "SELECT status FROM counterbalance_allocations WHERE id = ?",
  ).get(started.body.counterbalance.allocation_id);
  assert(allocation.status === "completed", `allocation status is ${allocation.status}, not completed`);

  database.sqlite.prepare(
    "UPDATE counterbalance_allocations SET status = 'started', completed_at = NULL WHERE id = ?",
  ).run(started.body.counterbalance.allocation_id);
  const reconciled = await invoke(
    completeSession,
    env,
    "/api/session/complete",
    { session_id: started.body.session_id },
    started.body.session_token,
  );
  assert(reconciled.status === 200 && reconciled.body.existing_completion === true, "repeat completion was not idempotent");
  const repaired = database.sqlite.prepare(
    "SELECT status FROM counterbalance_allocations WHERE id = ?",
  ).get(started.body.counterbalance.allocation_id);
  assert(repaired.status === "completed", "repeat completion did not reconcile allocation status");
}

async function testTwoHundredDryRunMicrocells(database) {
  const env = dryRunEnv(database.d1);
  const seen = new Set();
  for (let index = 1; index <= 200; index += 1) {
    const result = await invoke(
      startSession,
      env,
      "/api/session/start",
      startPayload(`DRY_${String(index).padStart(3, "0")}`, "DRY_RUN", true),
    );
    assert(result.status === 200 && result.body.ok === true, `dry start ${index} failed: ${result.status} ${JSON.stringify(result.body)}`);
    const cell = Number(result.body.counterbalance.counterbalance_cell);
    const bundle = Number(result.body.counterbalance.speaker_pattern_bundle);
    assertBundleAndPatterns(result.body.counterbalance);
    assertParticipantSpeakerBalance(result.body.main_assignment);
    const key = `${cell}:${bundle}`;
    assert(!seen.has(key), `microcell ${key} was allocated more than once before all 200 were used`);
    seen.add(key);
  }
  assert(seen.size === 200, `expected all 200 microcells; got ${seen.size}`);
  const counts = database.sqlite.prepare(
    `SELECT counterbalance_cell, speaker_pattern_bundle, COUNT(*) AS count
     FROM sessions
     WHERE allocation_cohort = 'dry_run:speaker_bundle_latin_v1'
       AND allocation_strategy_version = ?
     GROUP BY counterbalance_cell, speaker_pattern_bundle`,
  ).all(CURRENT_ALLOCATION_STRATEGY_VERSION);
  assert(counts.length === 200 && counts.every((row) => row.count === 1), "persisted dry-run microcells are not exactly one each");
}

async function main() {
  console.log("speaker bundle D1 integration: fresh + migration shape");
  const migrated = await testFreshAndMigratedSchema();
  try {
    console.log("speaker bundle D1 integration: legacy resume before cohort enforcement");
    await testLegacyResumeBeforeCohortEnforcement(migrated);
  } finally {
    migrated.sqlite.close();
  }

  const database = openFreshDatabase();
  try {
    console.log("speaker bundle D1 integration: production allowlist + persisted v0.9 flow");
    const production = await testAllowlistAndNewSession(database);
    console.log("speaker bundle D1 integration: trial propagation + atomic completion reconciliation");
    await saveAllTrialsAndComplete(database, production.env, production.started);
    console.log("speaker bundle D1 integration: 200 dry starts / 200 unique microcells");
    await testTwoHundredDryRunMicrocells(database);
  } finally {
    database.sqlite.close();
  }
  console.log("speaker bundle D1 integration: PASS");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
