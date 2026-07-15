#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://accentednesscomprehensibility.pages.dev";
const PLATFORM_VERSION = "pronunciation_rating_v0.10.0";
const PRACTICE_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
const PRACTICE_ITEMS = Object.freeze([
  Object.freeze({ target_word: "appreciation", audio_file: "eng_female_appreciation_practice.wav", l1: "ENG", pronunciation: "natural", talker: "practice_eng_female", spoken_form: "appreciation", source_format: "researcher_provided_calibration_wav", range: "1–3" }),
  Object.freeze({ target_word: "pesticide", audio_file: "jpn_male_pesticide_practice.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_male", spoken_form: "pesticide", source_format: "researcher_provided_calibration_wav", range: "3–5" }),
  Object.freeze({ target_word: "quality", audio_file: "jpn_female_quality_practice.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_female", spoken_form: "quality", source_format: "researcher_provided_calibration_wav", range: "5–7" }),
  Object.freeze({ target_word: "pizza", audio_file: "chn_female_pizza_practice.wav", l1: "CHN", pronunciation: "accented", talker: "macos_tts_tingting", spoken_form: "披萨", source_format: "macos_say_tingting_tts_wav", range: "7–9" }),
]);
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULT_OUT = path.join(
  PACKAGE_ROOT,
  "metadata",
  "LIVE_COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md",
);
const CELL_COUNT = 20;
const BUNDLE_COUNT = 10;
const MICROCELL_COUNT = CELL_COUNT * BUNDLE_COUNT;
const ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1";
const DRY_RUN_ALLOCATION_COHORT = "dry_run:speaker_bundle_latin_v1";

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

function positiveInt(name, fallback) {
  const value = Number.parseInt(argValue(name, String(fallback)), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function startsValue() {
  const starts = argValue("--starts", "");
  const legacyParticipants = argValue("--participants", "");
  if (starts && legacyParticipants && starts !== legacyParticipants) {
    throw new Error("--starts and legacy --participants disagree; pass only --starts.");
  }
  const value = Number.parseInt(starts || legacyParticipants || "40", 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--starts must be a positive integer.");
  }
  return value;
}

function practiceAssignment() {
  return PRACTICE_ITEMS.map((item, index) => ({
    phase: "practice",
    trial_index: index + 1,
    source_path: `${PRACTICE_AUDIO_ROOT}/${item.audio_file}`,
    audio_url: `${PRACTICE_AUDIO_ROOT}/${item.audio_file}`,
    file_name: item.audio_file,
    target_word: item.target_word,
    participant_id: item.talker,
    native_language: item.l1,
    accent_condition: item.pronunciation,
    condition: `practice_${item.pronunciation}`,
    talker: item.talker,
    word_number: String(index + 1),
    trial_number: String(index + 1),
    spoken_form: item.spoken_form,
    practice_note: item.source_format === "macos_say_tingting_tts_wav"
      ? `Synthetic macOS say Tingting Mandarin form 披萨; expert Accentedness reference range: ${item.range}.`
      : `Researcher-provided calibration WAV; expert Accentedness reference range: ${item.range}.`,
    source_format: item.source_format,
    practice_kind: "combined",
    practice_group: `accent_band_${item.range.replace("–", "_")}`,
  }));
}

function basePayload(label, index, turnstileToken) {
  return {
    rater_id: label,
    session_label: label,
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    seed: label,
    dry_run: "1",
    prolific_pid: `LIVE_STRESS_${label}_${String(index).padStart(4, "0")}`,
    prolific_study_id: "DRY_RUN",
    prolific_session_id: `LIVE_STRESS_SESSION_${label}_${String(index).padStart(4, "0")}`,
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
    practice_assignment: practiceAssignment(),
    turnstile_token: turnstileToken || "",
  };
}

async function postJson(baseUrl, pathname, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(pathname, baseUrl);
  try {
    const startedAtMs = Date.now();
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { parse_error: true, text: text.slice(0, 240) };
    }
    return {
      ok: response.ok && data.ok === true,
      status: response.status,
      elapsed_ms: Date.now() - startedAtMs,
      data,
      text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsed_ms: 0,
      data: {},
      text: String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeMainAssignment(result) {
  const assignment = Array.isArray(result.data?.main_assignment)
    ? result.data.main_assignment
    : [];
  return {
    assignment_count: assignment.length,
    trial_count: Number(result.data?.trial_count || 0),
    practice_recording_required: result.data?.practice_recording_required === true,
    placeholder_rows: assignment.filter((row) => row.source_format === "dry_run_placeholder").length,
    non_https_rows: assignment.filter((row) => !/^https:\/\//i.test(row.audio_url || "")).length,
  };
}

function allocationMetadata(result) {
  const counterbalance = result.data?.counterbalance || {};
  return {
    session_id: String(result.data?.session_id || ""),
    cell_id: Number(counterbalance.counterbalance_cell || 0),
    speaker_pattern_bundle: Number(counterbalance.speaker_pattern_bundle || 0),
    allocation_strategy_version: String(counterbalance.allocation_strategy_version || ""),
    allocation_cohort: String(counterbalance.allocation_cohort || ""),
    speaker_pattern_indexes: Array.isArray(counterbalance.speaker_pattern_indexes)
      ? counterbalance.speaker_pattern_indexes.map(Number)
      : [],
  };
}

function initializedCounts(size) {
  return new Map(Array.from({ length: size }, (_, index) => [index + 1, 0]));
}

function allocationCounts(results) {
  const cells = initializedCounts(CELL_COUNT);
  const bundles = initializedCounts(BUNDLE_COUNT);
  const microcells = new Map();
  for (let cell = 1; cell <= CELL_COUNT; cell += 1) {
    for (let bundle = 1; bundle <= BUNDLE_COUNT; bundle += 1) {
      microcells.set(`${cell}:${bundle}`, 0);
    }
  }
  for (const result of results) {
    if (!result.ok) continue;
    const metadata = allocationMetadata(result);
    if (cells.has(metadata.cell_id)) cells.set(metadata.cell_id, cells.get(metadata.cell_id) + 1);
    if (bundles.has(metadata.speaker_pattern_bundle)) {
      bundles.set(
        metadata.speaker_pattern_bundle,
        bundles.get(metadata.speaker_pattern_bundle) + 1,
      );
    }
    const key = `${metadata.cell_id}:${metadata.speaker_pattern_bundle}`;
    if (microcells.has(key)) microcells.set(key, microcells.get(key) + 1);
  }
  return {
    cells: [...cells.entries()],
    bundles: [...bundles.entries()],
    microcells: [...microcells.entries()].map(([key, count]) => {
      const [cell, bundle] = key.split(":").map(Number);
      return [cell, bundle, count];
    }),
  };
}

function validateResponseMetadata(result, index) {
  const problems = [];
  const metadata = allocationMetadata(result);
  const assignment = Array.isArray(result.data?.main_assignment)
    ? result.data.main_assignment
    : [];
  if (!Number.isInteger(metadata.cell_id) || metadata.cell_id < 1 || metadata.cell_id > CELL_COUNT) {
    problems.push(`request ${index + 1}: invalid counterbalance_cell ${metadata.cell_id || "missing"}`);
  }
  if (
    !Number.isInteger(metadata.speaker_pattern_bundle) ||
    metadata.speaker_pattern_bundle < 1 ||
    metadata.speaker_pattern_bundle > BUNDLE_COUNT
  ) {
    problems.push(
      `request ${index + 1}: invalid speaker_pattern_bundle ${metadata.speaker_pattern_bundle || "missing"}`,
    );
  }
  if (metadata.allocation_strategy_version !== ALLOCATION_STRATEGY_VERSION) {
    problems.push(
      `request ${index + 1}: expected strategy ${ALLOCATION_STRATEGY_VERSION}, got ${metadata.allocation_strategy_version || "missing"}`,
    );
  }
  if (metadata.allocation_cohort !== DRY_RUN_ALLOCATION_COHORT) {
    problems.push(
      `request ${index + 1}: expected dry-run cohort ${DRY_RUN_ALLOCATION_COHORT}, got ${metadata.allocation_cohort || "missing"}`,
    );
  }
  if (
    metadata.speaker_pattern_indexes.length !== 4 ||
    metadata.speaker_pattern_indexes.some((value) => !Number.isInteger(value) || value < 1 || value > 10)
  ) {
    problems.push(`request ${index + 1}: invalid four-block speaker_pattern_indexes`);
  }

  for (const row of assignment) {
    if (
      Number(row.counterbalance_cell) !== metadata.cell_id ||
      Number(row.speaker_pattern_bundle) !== metadata.speaker_pattern_bundle ||
      String(row.allocation_strategy_version || "") !== metadata.allocation_strategy_version ||
      String(row.allocation_cohort || "") !== metadata.allocation_cohort
    ) {
      problems.push(`request ${index + 1}: assignment allocation metadata does not match response`);
      break;
    }
  }
  for (let block = 1; block <= 4; block += 1) {
    const blockPatterns = new Set(
      assignment
        .filter((row) => Number(row.block_index) === block)
        .map((row) => Number(row.speaker_pattern_index)),
    );
    const expectedPattern = metadata.speaker_pattern_indexes[block - 1];
    if (blockPatterns.size !== 1 || !blockPatterns.has(expectedPattern)) {
      problems.push(`request ${index + 1}: block ${block} does not match its bundled pattern`);
    }
  }
  for (const l1 of ["JPN", "CHN"]) {
    for (let speaker = 1; speaker <= 10; speaker += 1) {
      const label = `${l1}${speaker}`;
      const rows = assignment.filter(
        (row) => row.l1_condition === l1 && row.speaker_pattern_speaker === label,
      );
      const natural = rows.filter((row) => row.pronunciation_condition === "natural").length;
      const accented = rows.filter((row) => row.pronunciation_condition === "accented").length;
      if (rows.length !== 4 || natural !== 2 || accented !== 2) {
        problems.push(
          `request ${index + 1}: ${label} expected 4 trials (2 natural/2 accented), got ${rows.length} (${natural}/${accented})`,
        );
      }
    }
  }
  return problems;
}

async function duplicateParticipantCheck(baseUrl, batchLabel, timeoutMs, turnstileToken) {
  const label = `${batchLabel}_duplicate`;
  const payload = basePayload(label, 1, turnstileToken);
  payload.prolific_pid = `LIVE_STRESS_DUP_${batchLabel}`;
  payload.prolific_session_id = `LIVE_STRESS_DUP_SESSION_${batchLabel}`;
  const [first, second] = await Promise.all([
    postJson(baseUrl, "/api/session/start", payload, timeoutMs),
    postJson(baseUrl, "/api/session/start", payload, timeoutMs),
  ]);
  const sameSession = first.data?.session_id && first.data.session_id === second.data?.session_id;
  const bothOk = first.ok && second.ok;
  const resumed = first.data?.existing_session === true
    ? first
    : second.data?.existing_session === true
      ? second
      : null;
  const resume = resumed?.data?.resume || {};
  const resumedPractice = Array.isArray(resumed?.data?.practice_assignment)
    ? resumed.data.practice_assignment
    : [];
  const practiceMatches = resumedPractice.length === PRACTICE_ITEMS.length &&
    PRACTICE_ITEMS.every((expected, index) => {
      const actual = resumedPractice[index] || {};
      return actual.target_word === expected.target_word &&
        actual.audio_url === `${PRACTICE_AUDIO_ROOT}/${expected.audio_file}`;
    });
  const firstMetadata = allocationMetadata(first);
  const secondMetadata = allocationMetadata(second);
  const persistedMetadataMatches = [
    "session_id",
    "cell_id",
    "speaker_pattern_bundle",
    "allocation_strategy_version",
    "allocation_cohort",
  ].every((key) => firstMetadata[key] === secondMetadata[key]) &&
    JSON.stringify(firstMetadata.speaker_pattern_indexes) ===
      JSON.stringify(secondMetadata.speaker_pattern_indexes) &&
    firstMetadata.speaker_pattern_indexes.length === 4 &&
    firstMetadata.allocation_strategy_version === ALLOCATION_STRATEGY_VERSION &&
    firstMetadata.allocation_cohort === DRY_RUN_ALLOCATION_COHORT;
  return {
    ok:
      bothOk &&
      sameSession &&
      Boolean(resumed) &&
      resume.practice_replay_required === true &&
      resume.next_phase === "main" &&
      Number(resume.next_trial_index) === 1 &&
      resumed.data?.practice_recording_required === false &&
      practiceMatches &&
      persistedMetadataMatches,
    first,
    second,
    same_session: Boolean(sameSession),
    resume_practice_required: resume.practice_replay_required === true,
    resume_phase: resume.next_phase || "",
    resume_trial_index: resume.next_trial_index || "",
    practice_recording_required: resumed?.data?.practice_recording_required === true,
    practice_assignment_count: resumedPractice.length,
    practice_matches: practiceMatches,
    persisted_metadata_matches: persistedMetadataMatches,
  };
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
  if (row.some((value) => value)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((value) => String(value || "").trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function persistedD1MetadataCheck(baseUrl, batchLabel, results, adminToken, timeoutMs) {
  if (!adminToken) {
    return {
      ok: true,
      skipped: true,
      row_count: 0,
      problems: [],
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL("/api/admin/export/counterbalance.csv", baseUrl);
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        origin: url.origin,
        "x-admin-token": adminToken,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        row_count: 0,
        problems: [`D1 counterbalance export returned HTTP ${response.status}`],
      };
    }
    const expectedBySession = new Map(
      results
        .filter((result) => result.ok)
        .map((result) => {
          const metadata = allocationMetadata(result);
          return [metadata.session_id, metadata];
        }),
    );
    const rows = parseCsv(text).filter((row) =>
      String(row.prolific_pid || "").startsWith(`LIVE_STRESS_${batchLabel}_`),
    );
    const problems = [];
    if (rows.length !== expectedBySession.size) {
      problems.push(
        `D1 export expected ${expectedBySession.size} batch rows, got ${rows.length}`,
      );
    }
    const seen = new Set();
    for (const row of rows) {
      const expected = expectedBySession.get(String(row.session_id || ""));
      if (!expected) {
        problems.push(`D1 export contains unexpected batch session ${row.session_id || "missing"}`);
        continue;
      }
      seen.add(expected.session_id);
      const persistedPatterns = [1, 2, 3, 4].map((block) =>
        Number(row[`block_${block}_pattern`] || 0),
      );
      if (
        Number(row.cell_id) !== expected.cell_id ||
        Number(row.speaker_pattern_bundle) !== expected.speaker_pattern_bundle ||
        String(row.allocation_strategy_version || "") !== expected.allocation_strategy_version ||
        String(row.allocation_cohort || "") !== expected.allocation_cohort ||
        String(row.status || "") !== "dry_run_started" ||
        JSON.stringify(persistedPatterns) !== JSON.stringify(expected.speaker_pattern_indexes)
      ) {
        problems.push(`D1 metadata mismatch for session ${expected.session_id}`);
      }
    }
    for (const sessionId of expectedBySession.keys()) {
      if (!seen.has(sessionId)) problems.push(`D1 export is missing session ${sessionId}`);
    }
    return {
      ok: problems.length === 0,
      skipped: false,
      row_count: rows.length,
      problems,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      row_count: 0,
      problems: [`D1 metadata verification failed: ${error?.message || error}`],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function markdown(context) {
  const {
    generatedAt,
    baseUrl,
    starts,
    concurrency,
    timeoutMs,
    batchLabel,
    results,
    allocationCounts: counts,
    duplicate,
    persistedD1,
    problems,
  } = context;
  const successful = results.filter((result) => result.ok);
  const cellValues = counts.cells.map(([, count]) => count);
  const bundleValues = counts.bundles.map(([, count]) => count);
  const populatedMicrocells = counts.microcells.filter(([, , count]) => count > 0).length;
  const duplicateMicrocells = counts.microcells.filter(([, , count]) => count > 1).length;
  const lines = [
    "# Live Counterbalance Concurrency Stress Test",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Scenario",
    "",
    `- Base URL: ${baseUrl}`,
    `- Dry-run starts: ${starts}`,
    `- Concurrent workers: ${concurrency}`,
    `- Timeout: ${timeoutMs} ms`,
    `- Batch label: \`${batchLabel}\``,
    "- Study ID: `DRY_RUN`",
    "",
    "## Result",
    "",
    `- Result: ${problems.length ? "FAIL" : "PASS"}`,
    `- Successful starts: ${successful.length} / ${starts}`,
    `- cell_min: ${cellValues.length ? Math.min(...cellValues) : 0}`,
    `- cell_max: ${cellValues.length ? Math.max(...cellValues) : 0}`,
    `- cell_spread: ${cellValues.length ? Math.max(...cellValues) - Math.min(...cellValues) : 0}`,
    `- bundle_min: ${bundleValues.length ? Math.min(...bundleValues) : 0}`,
    `- bundle_max: ${bundleValues.length ? Math.max(...bundleValues) : 0}`,
    `- bundle_spread: ${bundleValues.length ? Math.max(...bundleValues) - Math.min(...bundleValues) : 0}`,
    `- populated_microcells: ${populatedMicrocells} / ${MICROCELL_COUNT}`,
    `- duplicate_microcells_in_wave: ${duplicateMicrocells}`,
    `- exact_200_microcell_gate: ${starts === MICROCELL_COUNT ? (problems.length ? "FAIL" : "PASS") : "NOT APPLICABLE"}`,
    `- duplicate_participant_check: ${duplicate ? (duplicate.ok ? "PASS" : "FAIL") : "SKIPPED"}`,
    `- duplicate_resume_D1_metadata: ${duplicate ? duplicate.persisted_metadata_matches : "SKIPPED"}`,
    `- duplicate_resume_practice_required: ${duplicate ? duplicate.resume_practice_required : "SKIPPED"}`,
    `- duplicate_resume_target: ${duplicate ? `${duplicate.resume_phase}:${duplicate.resume_trial_index}` : "SKIPPED"}`,
    `- duplicate_resume_practice_items: ${duplicate ? duplicate.practice_assignment_count : "SKIPPED"}`,
    `- full_D1_export_metadata_check: ${persistedD1.skipped ? "SKIPPED (set LIVE_STRESS_ADMIN_TOKEN or ADMIN_TOKEN)" : persistedD1.ok ? `PASS (${persistedD1.row_count} rows)` : "FAIL"}`,
    "",
    "## Cell Counts",
    "",
    "| cell_id | dry_run_started_count |",
    "| ---: | ---: |",
  ];
  for (const [cell, count] of counts.cells) lines.push(`| ${cell} | ${count} |`);

  lines.push(
    "",
    "## Speaker-pattern Bundle Counts",
    "",
    "| speaker_pattern_bundle | dry_run_started_count |",
    "| ---: | ---: |",
  );
  for (const [bundle, count] of counts.bundles) lines.push(`| ${bundle} | ${count} |`);

  if (starts === MICROCELL_COUNT) {
    lines.push(
      "",
      "## Exact Microcell Coverage",
      "",
      "The 200-start launch gate requires every one of the 20 cells × 10 speaker-pattern bundles exactly once in this wave.",
      "",
      "| cell_id | speaker_pattern_bundle | count |",
      "| ---: | ---: | ---: |",
    );
    for (const [cell, bundle, count] of counts.microcells) {
      lines.push(`| ${cell} | ${bundle} | ${count} |`);
    }
  }

  if (problems.length) {
    lines.push("", "## Problems", "");
    for (const problem of problems) lines.push(`- ${problem}`);
  }

  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => !result.ok)
    .slice(0, 12);
  if (failures.length) {
    lines.push("", "## Failure Samples", "");
    for (const { result, index } of failures) {
      lines.push(
        `- request ${index + 1}: status=${result.status}; error=${result.data?.error || result.text.slice(0, 180)}`,
      );
    }
  }

  lines.push(
    "",
    "## Interpretation",
    "",
    starts === MICROCELL_COUNT
      ? "For the 200-start gate, each response must include the current strategy, dry-run cohort, bundle, and four block patterns, and every cell×bundle microcell must occur exactly once. Run this gate before smaller v0.9 dry-run waves, or against a fresh deployment/D1 scope, because prior allocations in the shared dry-run cohort intentionally influence later balancing."
      : "For a smaller wave, cell and bundle spreads of 0 or 1 are required. Microcell coverage is reported descriptively and is not claimed to be complete. Dry-run statuses are isolated from production allocation counts.",
    persistedD1.skipped
      ? "The duplicate-resume check verifies that one allocation's metadata was persisted and reloaded from D1. Set LIVE_STRESS_ADMIN_TOKEN or ADMIN_TOKEN to cross-check every batch row through the restricted counterbalance CSV export."
      : "Every batch allocation was cross-checked against the restricted D1 counterbalance CSV export.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const baseUrl = argValue("--base-url", DEFAULT_BASE_URL).replace(/\/+$/, "/");
const starts = startsValue();
const concurrency = positiveInt("--concurrency", starts);
const timeoutMs = positiveInt("--timeout-ms", 30000);
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const turnstileToken = argValue("--turnstile-token", process.env.TURNSTILE_TEST_TOKEN || "");
const adminToken = String(
  process.env.LIVE_STRESS_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "",
).trim();
const skipDuplicateCheck = hasFlag("--skip-duplicate-check");
const allowPlaceholder = hasFlag("--allow-placeholder");
const allowNonHttps = hasFlag("--allow-non-https");

if (concurrency < starts) {
  throw new Error("--concurrency must be at least --starts for a single simultaneous-start wave.");
}

const batchLabel = `stress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const payloads = Array.from({ length: starts }, (_, index) =>
  basePayload(batchLabel, index + 1, turnstileToken)
);
const startedAt = Date.now();
const results = await runPool(payloads, concurrency, (payload) =>
  postJson(baseUrl, "/api/session/start", payload, timeoutMs)
);
const counts = allocationCounts(results);
const cellValues = counts.cells.map(([, count]) => count);
const bundleValues = counts.bundles.map(([, count]) => count);
const successful = results.filter((result) => result.ok);
const problems = [];

if (successful.length !== starts) {
  problems.push(`expected ${starts} successful starts, got ${successful.length}`);
}
for (const [index, result] of results.entries()) {
  const summary = summarizeMainAssignment(result);
  if (result.ok && summary.assignment_count !== 100) {
    problems.push(`request ${index + 1}: expected 100 main assignments, got ${summary.assignment_count}`);
  }
  if (result.ok && summary.trial_count !== 100) {
    problems.push(`request ${index + 1}: expected trial_count 100, got ${summary.trial_count}`);
  }
  if (result.ok && summary.practice_recording_required) {
    problems.push(`request ${index + 1}: new session unexpectedly requires practice recording`);
  }
  if (result.ok && !allowPlaceholder && summary.placeholder_rows) {
    problems.push(`request ${index + 1}: ${summary.placeholder_rows} dry_run_placeholder rows`);
  }
  if (result.ok && !allowNonHttps && summary.non_https_rows) {
    problems.push(`request ${index + 1}: ${summary.non_https_rows} non-HTTPS audio rows`);
  }
  if (result.ok) problems.push(...validateResponseMetadata(result, index));
}
if (successful.length === starts) {
  const cellSpread = Math.max(...cellValues) - Math.min(...cellValues);
  const bundleSpread = Math.max(...bundleValues) - Math.min(...bundleValues);
  if (cellSpread > 1) {
    problems.push(`cell allocation spread is too large: ${cellSpread}`);
  }
  if (bundleSpread > 1) {
    problems.push(`speaker-pattern bundle spread is too large: ${bundleSpread}`);
  }
  if (starts === MICROCELL_COUNT) {
    const invalidMicrocells = counts.microcells.filter(([, , count]) => count !== 1);
    if (invalidMicrocells.length) {
      problems.push(
        `exact 200-start gate failed: ${invalidMicrocells.length} of ${MICROCELL_COUNT} cell×bundle microcells were not assigned exactly once`,
      );
    }
  }
}

const duplicate = skipDuplicateCheck
  ? null
  : await duplicateParticipantCheck(baseUrl, batchLabel, timeoutMs, turnstileToken);
if (duplicate && !duplicate.ok) {
  problems.push(
    "duplicate participant start did not resume the same D1 session with matching bundle metadata and four-item practice replay before main trial 1",
  );
}

const persistedD1 = await persistedD1MetadataCheck(
  baseUrl,
  batchLabel,
  results,
  adminToken,
  timeoutMs,
);
if (!persistedD1.ok) problems.push(...persistedD1.problems);

const report = markdown({
  generatedAt: new Date().toISOString(),
  baseUrl,
  starts,
  concurrency,
  timeoutMs,
  batchLabel,
  elapsedMs: Date.now() - startedAt,
  results,
  allocationCounts: counts,
  duplicate,
  persistedD1,
  problems,
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, report, "utf8");

console.log(`live dry-run starts: ${starts}`);
console.log(`successful starts: ${successful.length}`);
console.log(`cell_min: ${Math.min(...cellValues)}`);
console.log(`cell_max: ${Math.max(...cellValues)}`);
console.log(`cell_spread: ${Math.max(...cellValues) - Math.min(...cellValues)}`);
console.log(`bundle_min: ${Math.min(...bundleValues)}`);
console.log(`bundle_max: ${Math.max(...bundleValues)}`);
console.log(`bundle_spread: ${Math.max(...bundleValues) - Math.min(...bundleValues)}`);
console.log(
  `populated_microcells: ${counts.microcells.filter(([, , count]) => count > 0).length}/${MICROCELL_COUNT}`,
);
console.log("cell_counts:", counts.cells.map(([cell, count]) => `${cell}:${count}`).join(" "));
console.log(
  "bundle_counts:",
  counts.bundles.map(([bundle, count]) => `${bundle}:${count}`).join(" "),
);
console.log(
  `exact_200_microcell_gate: ${starts === MICROCELL_COUNT ? (counts.microcells.every(([, , count]) => count === 1) ? "passed" : "failed") : "not_applicable"}`,
);
console.log(`duplicate_participant_check: ${duplicate ? (duplicate.ok ? "passed" : "failed") : "skipped"}`);
console.log(
  `full_D1_export_metadata_check: ${persistedD1.skipped ? "skipped" : persistedD1.ok ? "passed" : "failed"}`,
);
console.log(`report: ${out}`);

if (problems.length) {
  console.error("problems:");
  for (const problem of problems.slice(0, 20)) console.error(`- ${problem}`);
  process.exit(1);
}
