#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import {
  CANONICAL_PRACTICE_ASSIGNMENT,
  CURRENT_PRACTICE_SET_ID,
} from "../functions/api/_counterbalance.js";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const PLATFORM_VERSION = "pronunciation_rating_v0.10.2";
const PRACTICE_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
const EXPECTED_PRACTICE_ITEMS = Object.freeze([
  Object.freeze({ word: "appreciation", file: "eng_female_appreciation_practice.wav", fileName: "ENG_Female_appreciation_Practice.wav", l1: "ENG", pronunciation: "natural", talker: "practice_eng_female", spokenForm: "appreciation", sourceFormat: "researcher_provided_calibration_wav", practiceGroup: "reference_acc_1_2_comp_1_2", compRange: "1–2", accentRange: "1–2", sizeBytes: 203920, sha256: "69aee95815630ec2e5563473eb3e7c4b4e1606134beb44910676e2f1e901c1bd" }),
  Object.freeze({ word: "pesticide", file: "jpn_male_pesticide_practice.wav", fileName: "JPN_Male_pesticide.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_male", spokenForm: "pesticide", sourceFormat: "researcher_provided_calibration_wav", practiceGroup: "reference_acc_2_3_comp_1_2", compRange: "1–2", accentRange: "2–3", sizeBytes: 154808, sha256: "3ef097d287d04a8f5e300917727abd5f28f55e8e1f2abcb66fc0f210ec6c30d4" }),
  Object.freeze({ word: "quality", file: "jpn_female_quality_practice.wav", fileName: "JPN_Female_quality_Practice.wav", l1: "JPN", pronunciation: "accented", talker: "practice_jpn_female", spokenForm: "quality", sourceFormat: "researcher_provided_calibration_wav", practiceGroup: "reference_acc_4_5_comp_2_3", compRange: "2–3", accentRange: "4–5", sizeBytes: 164088, sha256: "8b01e13b47f45f8efda480339c15876a2d4594000b07454a177a1d4b78ea9763" }),
  Object.freeze({ word: "organizer", file: "chn_female_organizer_practice.wav", fileName: "CHN_Female_Organizer_Practice.wav", l1: "CHN", pronunciation: "accented", talker: "practice_chn_female", spokenForm: "organizer", sourceFormat: "researcher_provided_calibration_wav", practiceGroup: "reference_acc_4_6_comp_5_7", compRange: "5–7", accentRange: "4–6", sizeBytes: 184152, sha256: "1336b859808f091e6cc31a3247695f56e197bacedd9d4ca9b48f4b4cef859ac1" }),
  Object.freeze({ word: "balloon", file: "chn_male_balloon_practice.wav", fileName: "CHN_Male_Balloon_Practice.wav", l1: "CHN", pronunciation: "accented", talker: "practice_chn_male", spokenForm: "balloon", sourceFormat: "researcher_provided_calibration_wav", practiceGroup: "reference_acc_6_8_comp_4_6", compRange: "4–6", accentRange: "6–8", sizeBytes: 124440, sha256: "5803d3d56eaba60cabfe8aed51570a4905216ae7a1876131709c3fd671586ba4" }),
]);
const DEFAULTS = {
  productionManifest: path.join(PACKAGE_ROOT, "remote_manifest.csv"),
  deployedManifest: path.join(REPO_ROOT, "remote_manifest.csv"),
  audioQcIssues: path.join(PACKAGE_ROOT, "metadata", "audio_qc_issues.csv"),
  audioQcDetail: path.join(PACKAGE_ROOT, "metadata", "audio_qc_by_file.csv"),
  lexicalPairwise: path.join(PACKAGE_ROOT, "metadata", "lexical_balance_pairwise_differences.csv"),
  selectedPracticeManifest: path.join(REPO_ROOT, "practice_manifest.csv"),
  durationSummary: path.join(PACKAGE_ROOT, "metadata", "duration_estimate_summary.csv"),
  durationDetail: path.join(PACKAGE_ROOT, "metadata", "duration_estimate_by_cell_seed.csv"),
  indexHtml: path.join(REPO_ROOT, "index.html"),
  appJs: path.join(REPO_ROOT, "app.js"),
  audioLifecycle: path.join(REPO_ROOT, "audio-lifecycle.js"),
  audioLifecycleTest: path.join(REPO_ROOT, "scripts", "test_audio_lifecycle.cjs"),
  utilsApi: path.join(REPO_ROOT, "functions", "api", "_utils.js"),
  wordFamiliarityModule: path.join(REPO_ROOT, "functions", "api", "_word-familiarity.js"),
  wordFamiliarityApi: path.join(REPO_ROOT, "functions", "api", "session", "word-familiarity.js"),
  completeApi: path.join(REPO_ROOT, "functions", "api", "session", "complete.js"),
  trialApi: path.join(REPO_ROOT, "functions", "api", "trial.js"),
  eventApi: path.join(REPO_ROOT, "functions", "api", "event.js"),
  startApi: path.join(REPO_ROOT, "functions", "api", "session", "start.js"),
  counterbalanceApi: path.join(REPO_ROOT, "functions", "api", "_counterbalance.js"),
  finalizeStaleApi: path.join(REPO_ROOT, "functions", "api", "admin", "finalize-stale.js"),
  adminSummaryApi: path.join(REPO_ROOT, "functions", "api", "admin", "summary.js"),
  adminExportApi: path.join(REPO_ROOT, "functions", "api", "admin", "export", "[dataset].js"),
  adminIndex: path.join(REPO_ROOT, "admin", "index.html"),
  adminJs: path.join(REPO_ROOT, "admin", "admin.js"),
  schema: path.join(REPO_ROOT, "db", "schema.sql"),
  backgroundQuestionnaireMigration: path.join(REPO_ROOT, "db", "migrations", "0012_background_questionnaire.sql"),
  wordFamiliarityMigration: path.join(REPO_ROOT, "db", "migrations", "0013_word_familiarity.sql"),
  archivedSessionMigration: path.join(REPO_ROOT, "db", "migrations", "0014_archived_session_locks.sql"),
  schemaUpdater: path.join(REPO_ROOT, "scripts", "apply_d1_schema_updates.mjs"),
  archivedSessionLockTest: path.join(REPO_ROOT, "scripts", "test_archived_session_lock.py"),
  backgroundLocalTest: path.join(REPO_ROOT, "scripts", "test_background_questionnaire_local.mjs"),
  randomizationDistributionTest: path.join(
    REPO_ROOT,
    "scripts",
    "verify_randomization_distribution.mjs",
  ),
  readinessAudit: path.join(REPO_ROOT, "scripts", "audit_cloudflare_readiness.mjs"),
  liveCheck: path.join(REPO_ROOT, "scripts", "check_live_deployment.mjs"),
  stressCheck: path.join(REPO_ROOT, "scripts", "stress_live_counterbalance_concurrency.mjs"),
  smokeGenerator: path.join(REPO_ROOT, "scripts", "generate_smoke_test_200.py"),
  out: path.join(PACKAGE_ROOT, "metadata", "PREFLIGHT_REPORT_20260703.md"),
};

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
  const source = String(text || "");
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    const next = source[index + 1];
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
  const headers = rows[0].map((header) => String(header || "").replace(/^\uFEFF/, "").trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function normalizeRuntimePracticeItem(item, index) {
  return {
    practiceSetId: String(item.practice_set_id || "").trim(),
    trialIndex: Number(item.trial_index || index + 1),
    word: String(item.word || item.target_word || "").trim().toLowerCase(),
    fileName: String(item.file_name || "").trim(),
    audioUrl: String(item.audio_url || "").trim(),
    l1: String(item.l1_condition || "").trim(),
    pronunciation: String(item.pronunciation_condition || "").trim(),
    talker: String(item.talker || "").trim(),
    spokenForm: String(item.spoken_form || "").trim(),
    sourceFormat: String(item.source_format || "").trim(),
    practiceGroup: String(item.practice_group || "").trim(),
    compRange: String(item.expert_comprehensibility_range || "").trim(),
    accentRange: String(item.expert_accentedness_range || "").trim(),
  };
}

function practiceContractProblems(items, label) {
  const problems = [];
  if (!Array.isArray(items) || items.length !== EXPECTED_PRACTICE_ITEMS.length) {
    return [`${label}: expected ${EXPECTED_PRACTICE_ITEMS.length} practice items, found ${items?.length ?? "(invalid)"}`];
  }
  items.forEach((item, index) => {
    const actual = normalizeRuntimePracticeItem(item, index);
    const expected = EXPECTED_PRACTICE_ITEMS[index];
    const expectedValues = {
      practiceSetId: CURRENT_PRACTICE_SET_ID,
      trialIndex: index + 1,
      word: expected.word,
      fileName: expected.fileName,
      audioUrl: `${PRACTICE_AUDIO_ROOT}/${expected.file}`,
      l1: expected.l1,
      pronunciation: expected.pronunciation,
      talker: expected.talker,
      spokenForm: expected.spokenForm,
      sourceFormat: expected.sourceFormat,
      practiceGroup: expected.practiceGroup,
      compRange: expected.compRange,
      accentRange: expected.accentRange,
    };
    for (const [field, expectedValue] of Object.entries(expectedValues)) {
      if (actual[field] !== expectedValue) {
        problems.push(`${label} item ${index + 1} (${expected.word}): ${field} is ${actual[field] || "(missing)"}, expected ${expectedValue}`);
      }
    }
  });
  return problems;
}

function clientPracticeItems(appText) {
  const start = appText.indexOf("  const PRACTICE_AUDIO_ROOT");
  const end = appText.indexOf("\n  ];", start);
  if (start < 0 || end < 0) throw new Error("could not locate PRACTICE_ITEMS in app.js");
  const source = appText.slice(start, end + 5).replace(/^  /gm, "");
  return vm.runInNewContext(`${source}\nPRACTICE_ITEMS;`, Object.create(null), { timeout: 1000 });
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function csvInputProblems(label, filePath, rows) {
  if (!fileExists(filePath)) return [`${label} file is missing: ${filePath}`];
  if (!rows.length) return [`${label} has no data rows: ${filePath}`];
  return [];
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function uniqueValues(rows, column) {
  return new Set(rows.map((row) => String(row[column] || "").trim()).filter(Boolean));
}

function rowHasAme(row) {
  return Object.values(row).some((value) => /\bAME\b/i.test(String(value || "")));
}

function checkProductionManifest(rows) {
  const problems = [];
  if (rows.length !== 2497) {
    problems.push(`expected 2497 production manifest rows, found ${rows.length}`);
  }
  const required = [
    "audio_file",
    "target_word",
    "participant_id",
    "l1_condition",
    "pronunciation_condition",
    "word_number",
    "counterbalance_word_number",
    "source_word_number",
  ];
  for (const column of required) {
    if (!rows[0] || !(column in rows[0])) problems.push(`missing column ${column}`);
  }
  const wordsByNumber = new Map();
  for (const [index, row] of rows.entries()) {
    if (!["ENG", "JPN", "CHN"].includes(row.l1_condition)) {
      problems.push(`row ${index + 2}: invalid l1_condition=${row.l1_condition}`);
    }
    if (!["natural", "accented"].includes(row.pronunciation_condition)) {
      problems.push(`row ${index + 2}: invalid pronunciation_condition=${row.pronunciation_condition}`);
    }
    if (row.l1_condition === "ENG" && row.pronunciation_condition !== "natural") {
      problems.push(`row ${index + 2}: ENG must be natural`);
    }
    if (row.word_number !== row.counterbalance_word_number) {
      problems.push(`row ${index + 2}: word_number != counterbalance_word_number`);
    }
    if (rowHasAme(row)) problems.push(`row ${index + 2}: contains legacy AME label`);
    const wordNumber = String(Number.parseInt(row.word_number, 10));
    if (!wordsByNumber.has(wordNumber)) wordsByNumber.set(wordNumber, new Set());
    wordsByNumber.get(wordNumber).add(String(row.target_word || "").toLowerCase());
  }
  for (const [wordNumber, words] of wordsByNumber) {
    if (words.size !== 1) {
      problems.push(`word_number ${wordNumber} maps to multiple words: ${[...words].sort().join(", ")}`);
    }
  }
  for (const [index, expectedWord] of CANONICAL_TARGET_WORDS.entries()) {
    const wordNumber = String(index + 1);
    const actualWords = wordsByNumber.get(wordNumber) || new Set();
    if (actualWords.size !== 1 || !actualWords.has(expectedWord)) {
      problems.push(
        `word_number ${wordNumber} must map to canonical target ${expectedWord}; found ${
          [...actualWords].sort().join(", ") || "none"
        }`,
      );
    }
  }
  const unexpectedWordNumbers = [...wordsByNumber.keys()].filter((wordNumber) => {
    const number = Number.parseInt(wordNumber, 10);
    return !Number.isInteger(number) || number < 1 || number > CANONICAL_TARGET_WORDS.length;
  });
  if (unexpectedWordNumbers.length) {
    problems.push(`unexpected canonical word_number value(s): ${unexpectedWordNumbers.sort().join(", ")}`);
  }
  return problems;
}

function checkAudioHosting(rows, deployedRows, options) {
  const problems = [];
  const repoLooksDemo = deployedRows.length < 2497 || deployedRows.some((row) =>
    String(row.practice_note || "").toLowerCase().includes("demo")
    || String(row.participant_id || "").toLowerCase().startsWith("practice_")
  );
  const productionRowsHaveHttpsAudio = rows.every((row) => /^https:\/\//i.test(row.audio_url || ""));

  if (!options.usingExternalManifestSecret && repoLooksDemo) {
    problems.push(
      "repo remote_manifest.csv is still demo-sized; set COUNTERBALANCE_MANIFEST_URL or replace repo remote_manifest.csv with production URLs",
    );
  }
  if (options.requireAudioUrls && !productionRowsHaveHttpsAudio) {
    problems.push("production manifest does not contain HTTPS audio_url values for every row");
  }
  return problems;
}

function checkAudioQc(rows, options) {
  const failures = rows.filter((row) => String(row.failure_flags || "").trim());
  const reviews = rows.filter((row) => String(row.review_flags || "").trim());
  const problems = [];
  if (failures.length && !options.allowAudioFailures) {
    problems.push(`${failures.length} audio QC failure row(s), e.g. ${failures[0].relative_path}: ${failures[0].failure_flags}`);
  }
  return {
    problems,
    summary: `${failures.length} failure row(s), ${reviews.length} review row(s)`,
  };
}

function checkLexical(rows) {
  const flagged = rows.filter((row) => String(row.imbalance_flag || "") === "1");
  return {
    problems: flagged.length ? [`${flagged.length} lexical imbalance row(s) flagged`] : [],
    summary: `${flagged.length} flagged row(s)`,
  };
}

function checkPractice(rows, options) {
  const problems = [];
  if (rows.length !== EXPECTED_PRACTICE_ITEMS.length) {
    problems.push(`expected ${EXPECTED_PRACTICE_ITEMS.length} current practice rows, found ${rows.length}`);
  }
  for (const [index, expected] of EXPECTED_PRACTICE_ITEMS.entries()) {
    const row = rows[index] || {};
    const expectedUrl = `${PRACTICE_AUDIO_ROOT}/${expected.file}`;
    const actualUrl = String(row.audio_url || row.audio_file || "").trim();
    if (String(row.target_word || "").trim().toLowerCase() !== expected.word) {
      problems.push(`practice row ${index + 1}: expected target ${expected.word}, found ${row.target_word || "(missing)"}`);
    }
    if (actualUrl !== expectedUrl) {
      problems.push(`practice row ${index + 1}: expected audio ${expectedUrl}, found ${actualUrl || "(missing)"}`);
    }
    if (String(row.l1_condition || "").trim() !== expected.l1) {
      problems.push(`practice row ${index + 1}: expected L1 ${expected.l1}, found ${row.l1_condition || "(missing)"}`);
    }
    if (String(row.pronunciation_condition || "").trim() !== expected.pronunciation) {
      problems.push(
        `practice row ${index + 1}: expected pronunciation ${expected.pronunciation}, found ${row.pronunciation_condition || "(missing)"}`,
      );
    }
    if (String(row.accent_condition || "").trim() !== expected.pronunciation) {
      problems.push(`practice row ${index + 1}: expected accent_condition ${expected.pronunciation}`);
    }
    if (String(row.condition || "").trim() !== `practice_${expected.pronunciation}`) {
      problems.push(`practice row ${index + 1}: expected condition practice_${expected.pronunciation}`);
    }
    if (String(row.practice_set_id || "").trim() !== CURRENT_PRACTICE_SET_ID) {
      problems.push(`practice row ${index + 1}: expected practice_set_id ${CURRENT_PRACTICE_SET_ID}`);
    }
    if (String(row.expert_comprehensibility_range || "").trim() !== expected.compRange) {
      problems.push(`practice row ${index + 1}: expected Comprehensibility range ${expected.compRange}`);
    }
    if (String(row.expert_accentedness_range || "").trim() !== expected.accentRange) {
      problems.push(`practice row ${index + 1}: expected Accentedness range ${expected.accentRange}`);
    }
    if (String(row.talker || "").trim() !== expected.talker || String(row.participant_id || "").trim() !== expected.talker) {
      problems.push(`practice row ${index + 1}: expected talker/participant_id ${expected.talker}`);
    }
    if (String(row.spoken_form || "").trim() !== expected.spokenForm) {
      problems.push(`practice row ${index + 1}: expected spoken_form ${expected.spokenForm}`);
    }
    if (String(row.expert_comprehensibility_1_9 || "").trim() || String(row.expert_accentedness_1_9 || "").trim()) {
      problems.push(`practice row ${index + 1}: scalar expert ratings must remain blank when only a range is available`);
    }
    if (String(row.source_format || "").trim() !== expected.sourceFormat) {
      problems.push(`practice row ${index + 1}: source_format must be ${expected.sourceFormat}`);
    }
    if (Number(row.size_bytes) !== expected.sizeBytes) {
      problems.push(`practice row ${index + 1}: expected size_bytes ${expected.sizeBytes}`);
    }
    if (String(row.sha256 || "").trim().toLowerCase() !== expected.sha256) {
      problems.push(`practice row ${index + 1}: expected SHA-256 ${expected.sha256}`);
    }
  }
  if (rows.some((row) => /elevenlabs|chocolate|coffee|sofa|shelter|chn_female_pizza|macos_tts_tingting/i.test(JSON.stringify(row)))) {
    problems.push("practice manifest still contains a superseded practice item or ElevenLabs source");
  }
  return problems;
}

function checkCurrentPracticeAudioQc(rows) {
  const problems = [];
  const currentRows = rows.filter(
    (row) =>
      String(row.current_app_practice || "").trim() === "1" ||
      String(row.asset_role || "").trim() === "current_practice_package_asset",
  );
  if (currentRows.length !== EXPECTED_PRACTICE_ITEMS.length) {
    problems.push(
      `audio QC must contain exactly ${EXPECTED_PRACTICE_ITEMS.length} current-practice rows, found ${currentRows.length}`,
    );
  }
  const byPath = new Map(currentRows.map((row) => [String(row.relative_path || "").trim(), row]));
  for (const expected of EXPECTED_PRACTICE_ITEMS) {
    const expectedPath = `practice/calibration/${expected.file}`;
    const row = byPath.get(expectedPath);
    if (!row) {
      problems.push(`audio QC is missing current practice ${expectedPath}`);
      continue;
    }
    if (String(row.target_word || "").trim().toLowerCase() !== expected.word) {
      problems.push(`audio QC ${expectedPath}: target_word must be ${expected.word}`);
    }
    if (String(row.asset_role || "").trim() !== "current_practice_package_asset") {
      problems.push(`audio QC ${expectedPath}: asset_role must be current_practice_package_asset`);
    }
    if (String(row.file_exists || "").trim() !== "1" || String(row.decode_ok || "").trim() !== "1") {
      problems.push(`audio QC ${expectedPath}: file must exist and decode successfully`);
    }
    if (Number(row.size_bytes) !== expected.sizeBytes) {
      problems.push(`audio QC ${expectedPath}: expected size ${expected.sizeBytes}`);
    }
    if (String(row.sha256 || "").trim().toLowerCase() !== expected.sha256) {
      problems.push(`audio QC ${expectedPath}: SHA-256 does not match the reviewed file`);
    }
    if (String(row.failure_flags || "").trim()) {
      problems.push(`audio QC ${expectedPath}: failure_flags=${row.failure_flags}`);
    }
  }
  return problems;
}

function checkDurationDetail(rows) {
  const problems = [];
  if (!rows.length) return ["duration detail has no rows"];
  const practiceCounts = new Set(rows.map((row) => String(row.practice_trial_count || "").trim()));
  if (practiceCounts.size !== 1 || !practiceCounts.has(String(EXPECTED_PRACTICE_ITEMS.length))) {
    problems.push(
      `duration detail practice_trial_count values are ${[...practiceCounts].join(", ") || "(missing)"}; expected only ${EXPECTED_PRACTICE_ITEMS.length}`,
    );
  }
  const practiceDurations = rows
    .map((row) => Number.parseFloat(row.practice_audio_unique_s || ""))
    .filter(Number.isFinite);
  if (practiceDurations.length !== rows.length || practiceDurations.some((value) => value <= 0)) {
    problems.push("duration detail has a missing or nonpositive practice_audio_unique_s value");
  }
  if (new Set(practiceDurations.map((value) => value.toFixed(3))).size !== 1) {
    problems.push("duration detail does not use one stable current-practice duration across all cells/seeds");
  }
  return problems;
}

function checkDuration(rows) {
  const overall = rows.find((row) => row.scope === "overall");
  const problems = [];
  if (!overall) problems.push("duration estimate summary is missing overall row");
  return {
    problems,
    summary: overall
      ? `mean lower-bound playback ${overall.required_audio_playback_mean_s}s (${overall.required_audio_playback_mean_min} min)`
      : "missing",
  };
}

function checkRepoStatic() {
  const problems = [];
  const headers = fileExists(path.join(REPO_ROOT, "_headers"))
    ? fs.readFileSync(path.join(REPO_ROOT, "_headers"), "utf8")
    : "";
  const rules = new Map();
  let route = "";
  for (const line of headers.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      route = line.trim();
      if (!rules.has(route)) rules.set(route, new Map());
      continue;
    }
    const separator = line.indexOf(":");
    if (!route || separator < 0) continue;
    rules.get(route).set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  const globalHeaders = rules.get("/*") || new Map();
  for (const name of [
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "permissions-policy",
  ]) {
    if (!globalHeaders.has(name)) problems.push(`_headers /* rule missing ${name}`);
  }
  for (const [expectedRoute, expectedValue] of [
    ["/", "no-cache, no-store, must-revalidate"],
    ["/index.html", "no-cache, no-store, must-revalidate"],
    ["/app.js", "no-cache, must-revalidate"],
  ]) {
    const actual = rules.get(expectedRoute)?.get("cache-control") || "";
    if (actual.toLowerCase() !== expectedValue) {
      problems.push(`_headers ${expectedRoute} cache-control is ${actual || "(missing)"}; expected ${expectedValue}`);
    }
  }
  if (!fileExists(path.join(REPO_ROOT, "wrangler.toml.example"))) {
    problems.push("wrangler.toml.example is missing");
  }
  return problems;
}

function readTextIfExists(filePath) {
  return fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function requireSnippet(problems, label, text, snippet) {
  if (!text.includes(snippet)) problems.push(`${label} missing required snippet: ${snippet}`);
}

function forbidSnippet(problems, label, text, snippet) {
  if (text.includes(snippet)) problems.push(`${label} still contains forbidden snippet: ${snippet}`);
}

function requireBefore(problems, label, text, first, second) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    problems.push(`${label} must contain ${first} before ${second}`);
  }
}

function requireOccurrenceCount(problems, label, text, snippet, expected) {
  const count = text.split(snippet).length - 1;
  if (count !== expected) {
    problems.push(`${label} must contain ${snippet} exactly ${expected} time(s), found ${count}`);
  }
}

const CANONICAL_TARGET_WORDS = [
  "tweezers", "persimmon", "thermometer", "razor", "mantis",
  "pacifier", "podium", "labyrinth", "loquat", "scapula",
  "burdock", "protractor", "acorn", "scalpel", "cocoon",
  "cicada", "toboggan", "chisel", "casket", "detergent",
  "nostril", "rickshaw", "capelin", "lotus", "tadpole",
  "burglar", "xylophone", "walrus", "icicle", "abalone",
  "porcupine", "carousel", "faucet", "cobweb", "pylon",
  "pupa", "binoculars", "spatula", "lawnmower", "ladle",
  "raccoon", "syringe", "catapult", "treadmill", "wardrobe",
  "strainer", "parakeet", "scallop", "toupee", "abacus",
];

function checkCanonicalWordSources(app, serverModule) {
  const problems = [];
  const appBlock = app.match(/const TARGET_WORDS = Object\.freeze\(\[([\s\S]*?)\]\.map/);
  const appWords = appBlock
    ? [...appBlock[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1])
    : [];
  const serverBlock = serverModule.match(/export const TARGET_WORDS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const serverWords = serverBlock
    ? [...serverBlock[1].matchAll(/target_word:\s*"([a-z]+)"/g)].map((match) => match[1])
    : [];
  if (JSON.stringify(appWords) !== JSON.stringify(CANONICAL_TARGET_WORDS)) {
    problems.push(`app.js TARGET_WORDS does not match the canonical 50-word order (${appWords.length} found)`);
  }
  if (JSON.stringify(serverWords) !== JSON.stringify(CANONICAL_TARGET_WORDS)) {
    problems.push(`_word-familiarity.js TARGET_WORDS does not match the canonical 50-word order (${serverWords.length} found)`);
  }
  return problems;
}

function checkProlificFlowSourceGuards(options) {
  const problems = [];
  const index = readTextIfExists(options.indexHtml);
  const app = readTextIfExists(options.appJs);
  const audioLifecycle = readTextIfExists(options.audioLifecycle);
  const audioLifecycleTest = readTextIfExists(options.audioLifecycleTest);
  const utils = readTextIfExists(options.utilsApi);
  const wordFamiliarityModule = readTextIfExists(options.wordFamiliarityModule);
  const wordFamiliarityApi = readTextIfExists(options.wordFamiliarityApi);
  const complete = readTextIfExists(options.completeApi);
  const trial = readTextIfExists(options.trialApi);
  const event = readTextIfExists(options.eventApi);
  const start = readTextIfExists(options.startApi);
  const counterbalance = readTextIfExists(options.counterbalanceApi);
  const finalizeStale = readTextIfExists(options.finalizeStaleApi);
  const adminSummary = readTextIfExists(options.adminSummaryApi);
  const adminExport = readTextIfExists(options.adminExportApi);
  const adminIndex = readTextIfExists(options.adminIndex);
  const adminJs = readTextIfExists(options.adminJs);
  const schema = readTextIfExists(options.schema);
  const backgroundQuestionnaireMigration = readTextIfExists(options.backgroundQuestionnaireMigration);
  const wordFamiliarityMigration = readTextIfExists(options.wordFamiliarityMigration);
  const archivedSessionMigration = readTextIfExists(options.archivedSessionMigration);
  const schemaUpdater = readTextIfExists(options.schemaUpdater);
  const archivedSessionLockTest = readTextIfExists(options.archivedSessionLockTest);
  const backgroundLocalTest = readTextIfExists(options.backgroundLocalTest);
  const randomizationDistributionTest = readTextIfExists(options.randomizationDistributionTest);
  const readinessAudit = readTextIfExists(options.readinessAudit);
  const liveCheck = readTextIfExists(options.liveCheck);
  const stressCheck = readTextIfExists(options.stressCheck);
  const smokeGenerator = readTextIfExists(options.smokeGenerator);
  for (const [label, text] of [
    ["index.html", index],
    ["app.js", app],
    ["audio-lifecycle.js", audioLifecycle],
    ["scripts/test_audio_lifecycle.cjs", audioLifecycleTest],
    ["_utils.js", utils],
    ["_word-familiarity.js", wordFamiliarityModule],
    ["session/word-familiarity.js", wordFamiliarityApi],
    ["session/complete.js", complete],
    ["trial.js", trial],
    ["event.js", event],
    ["session/start.js", start],
    ["_counterbalance.js", counterbalance],
    ["admin/finalize-stale.js", finalizeStale],
    ["admin/summary.js", adminSummary],
    ["admin/export/[dataset].js", adminExport],
    ["admin/index.html", adminIndex],
    ["admin/admin.js", adminJs],
    ["db/schema.sql", schema],
    ["db/migrations/0012_background_questionnaire.sql", backgroundQuestionnaireMigration],
    ["db/migrations/0013_word_familiarity.sql", wordFamiliarityMigration],
    ["db/migrations/0014_archived_session_locks.sql", archivedSessionMigration],
    ["scripts/apply_d1_schema_updates.mjs", schemaUpdater],
    ["scripts/test_archived_session_lock.py", archivedSessionLockTest],
    ["scripts/test_background_questionnaire_local.mjs", backgroundLocalTest],
    ["scripts/verify_randomization_distribution.mjs", randomizationDistributionTest],
    ["scripts/audit_cloudflare_readiness.mjs", readinessAudit],
    ["scripts/check_live_deployment.mjs", liveCheck],
    ["scripts/stress_live_counterbalance_concurrency.mjs", stressCheck],
    ["scripts/generate_smoke_test_200.py", smokeGenerator],
  ]) {
    if (!text) problems.push(`${label} is missing or empty`);
  }

  problems.push(...practiceContractProblems(CANONICAL_PRACTICE_ASSIGNMENT, "server canonical practice"));
  try {
    problems.push(...practiceContractProblems(clientPracticeItems(app), "client canonical practice"));
  } catch (error) {
    problems.push(`client canonical practice could not be evaluated: ${error.message}`);
  }

  requireSnippet(problems, "app.js", app, "window.location.assign(completionUrl)");
  requireSnippet(problems, "app.js", app, `const VERSION = "${PLATFORM_VERSION}"`);
  requireSnippet(problems, "app.js", app, "Your response could not be saved. Please try Continue again.");
  requireSnippet(problems, "app.js", app, "error.data?.retryable === true");
  requireSnippet(problems, "app.js", app, "Confirming saved responses...");
  requireSnippet(problems, "app.js", app, "resumeExistingServerSessionIfNeeded");
  requireSnippet(problems, "app.js", app, "serverCompletedTrialKeys");
  requireSnippet(problems, "app.js", app, "serverCompletedDistractorIndexes");
  requireSnippet(problems, "app.js", app, "showWordFamiliarityChecklist");
  requireSnippet(problems, "app.js", app, 'postJson("/api/session/word-familiarity"');
  requireSnippet(
    problems,
    "app.js",
    app,
    "state.wordFamiliarityRequired = data.word_familiarity_required !== false",
  );
  requireSnippet(problems, "app.js", app, "if (state.wordFamiliarityRequired)");
  requireSnippet(problems, "app.js", app, "error.data?.reload_required === true");
  requireSnippet(problems, "app.js", app, "The word played:");
  requireSnippet(problems, "app.js", app, "Expert Accentedness reference range:");
  requireSnippet(problems, "app.js", app, "Expert Comprehensibility reference range:");
  requireSnippet(problems, "app.js", app, "resumeAfterPractice");
  requireSnippet(problems, "app.js", app, "replayingPractice");
  requireSnippet(problems, "app.js", app, "practiceRecordingRequired");
  requireSnippet(problems, "app.js", app, "if (practiceEvent && !state.practiceRecordingRequired) return");
  requireSnippet(problems, "app.js", app, 'const recordResponse = responsePhase !== "practice" || state.practiceRecordingRequired');
  requireSnippet(problems, "app.js", app, "recordedTrialOrder");
  requireSnippet(problems, "app.js", app, "return mainRows");
  requireSnippet(problems, "app.js", app, "practice_replay_required");
  requireSnippet(problems, "app.js", app, "continueAfterPractice");
  requireSnippet(problems, "app.js", app, "replayedSavedPractice");
  requireSnippet(problems, "app.js", app, "saveResult?.duplicate !== true");
  requireSnippet(problems, "app.js", app, "replayPracticeFeedbackAudio");
  requireSnippet(problems, "app.js", app, "practiceFeedbackReplayGeneration");
  requireSnippet(problems, "app.js", app, "audioPlaybackGeneration");
  requireSnippet(problems, "app.js", app, "playbackSettled");
  requireSnippet(problems, "app.js", app, "AUDIO_LIFECYCLE.isPlaybackCurrent");
  requireSnippet(problems, "app.js", app, "AUDIO_LIFECYCLE.createFeedbackReplayLifecycle");
  requireSnippet(problems, "audio-lifecycle.js", audioLifecycle, "createFeedbackReplayLifecycle");
  requireSnippet(problems, "audio-lifecycle.js", audioLifecycle, "isPlaybackCurrent");
  requireSnippet(problems, "audio-lifecycle.js", audioLifecycle, 'complete("timeupdate")');
  requireSnippet(problems, "audio-lifecycle.js", audioLifecycle, '"timeout"');
  requireSnippet(problems, "scripts/test_audio_lifecycle.cjs", audioLifecycleTest, "practice_feedback_three_sequential_replays: true");
  requireSnippet(problems, "scripts/test_audio_lifecycle.cjs", audioLifecycleTest, "stale_audio_error_guard: true");
  requireSnippet(problems, "app.js", app, "You may replay this practice audio as many times as needed.");
  requireSnippet(problems, "app.js", app, "Expert raters rated this as:");
  requireSnippet(problems, "app.js", app, "Comprehensibility: ${expertCompRange} (Your rating:");
  forbidSnippet(problems, "app.js", app, "Comprehensibility: — (Your rating:");
  requireSnippet(problems, "app.js", app, "These reference ratings are only for practice.");
  requireSnippet(problems, "app.js", app, "LEGACY_BROWSER_PRACTICE_SETS");
  requireSnippet(problems, "app.js", app, "historicalBrowserPractice");
  requireSnippet(problems, "app.js", app, '"practice_feedback_replay_start"');
  requireSnippet(problems, "app.js", app, '"practice_feedback_replay_end"');
  forbidSnippet(problems, "app.js", app, "practiceFeedbackReplayCount >=");
  for (const expected of EXPECTED_PRACTICE_ITEMS) {
    requireSnippet(problems, "app.js", app, `word: "${expected.word}"`);
    requireSnippet(problems, "app.js", app, expected.file);
    requireSnippet(problems, "app.js", app, `expert_comprehensibility_range: "${expected.compRange}"`);
    requireSnippet(problems, "app.js", app, `expert_accentedness_range: "${expected.accentRange}"`);
    requireSnippet(problems, "app.js", app, expected.talker);
    requireSnippet(problems, "app.js", app, expected.spokenForm);
    requireSnippet(problems, "app.js", app, expected.sourceFormat);
  }
  requireSnippet(problems, "app.js", app, "^\\s*[=+\\-@]");
  requireSnippet(problems, "index.html", index, 'src="audio-lifecycle.js?v=0.10.2"');
  requireSnippet(problems, "index.html", index, 'src="app.js?v=0.10.2"');
  requireSnippet(problems, "index.html", index, "In this practice session, you will transcribe and rate five sample words.");
  requireSnippet(problems, "index.html", index, "familiarize you with the task procedure; and");
  requireSnippet(problems, "index.html", index, "help you calibrate your Accentedness and Comprehensibility ratings by comparing them with expert reference ranges.");
  requireSnippet(problems, "index.html", index, "rate 5 words. The word played and expert Accentedness and Comprehensibility reference ranges will be shown after each");
  requireSnippet(problems, "index.html", index, "compare your response with the expert Accentedness and Comprehensibility reference ranges");
  requireSnippet(problems, "index.html", index, "listen to the sample again as many times as you like.");
  requireSnippet(problems, "index.html", index, 'id="practice-feedback-replay-btn"');
  requireSnippet(problems, "index.html", index, 'id="practice-feedback-replay-status"');
  requireSnippet(problems, "index.html", index, "You may replay the audio while reviewing this practice feedback.");
  requireSnippet(problems, "index.html", index, 'id="word-familiarity-panel"');
  requireSnippet(problems, "index.html", index, "Review all 50 words");
  requireSnippet(problems, "index.html", index, "If you were unfamiliar with it");
  requireBefore(
    problems,
    "index.html",
    index,
    "Rate how strong the speaker's",
    "Rate how easy the word was",
  );
  problems.push(...checkCanonicalWordSources(app, wordFamiliarityModule));
  requireSnippet(problems, "index.html", index, 'id="background-validation-message"');
  requireSnippet(problems, "index.html", index, 'id="participant-age"');
  requireSnippet(problems, "index.html", index, 'maxlength="80"');
  requireSnippet(problems, "index.html", index, 'maxlength="1000"');
  requireBefore(problems, "index.html", index, "<span>Accentedness</span>", "<span>Comprehensibility</span>");
  requireSnippet(problems, "app.js", app, "function backgroundValues()");
  requireSnippet(problems, "app.js", app, "function backgroundValidationIssue()");
  requireSnippet(problems, "app.js", app, "applyServerBackgroundValues");
  requireSnippet(problems, "app.js", app, "Checking for saved session...");
  requireSnippet(problems, "app.js", app, "Number.isInteger(age)");
  requireSnippet(problems, "app.js", app, "Object.assign(payload, backgroundValues())");
  requireOccurrenceCount(problems, "app.js", app, "...backgroundValues()", 1);
  requireSnippet(problems, "app.js", app, "resume_only: resumeOnly");
  requireSnippet(problems, "app.js", app, "startServerSession({ resumeOnly: true })");
  forbidSnippet(problems, "app.js", app, 'params.get("completion_code")');
  forbidSnippet(problems, "app.js", app, 'params.get("PROLIFIC_CODE")');
  requireSnippet(problems, "session/complete.js", complete, "LEFT JOIN rating_trials rt");
  requireSnippet(problems, "session/complete.js", complete, "missingAssignmentCount === 0");
  requireSnippet(problems, "session/complete.js", complete, "prolificCompletionConfig(context.env)");
  requireSnippet(problems, "session/complete.js", complete, "completion_missing_trials");
  requireSnippet(problems, "session/complete.js", complete, "retryable: true");
  requireSnippet(problems, "session/complete.js", complete, "completed_too_fast");
  requireSnippet(problems, "session/complete.js", complete, "insertNonCriticalEvent");
  requireSnippet(problems, "session/complete.js", complete, "word_familiarity_required");
  requireSnippet(problems, "session/complete.js", complete, "TARGET_WORD_COUNT");
  requireSnippet(problems, "session/word-familiarity.js", wordFamiliarityApi, "validateWordFamiliarityResponses");
  requireSnippet(problems, "session/word-familiarity.js", wordFamiliarityApi, "Complete all rating trials before the word checklist.");
  requireSnippet(problems, "session/word-familiarity.js", wordFamiliarityApi, "ON CONFLICT(session_id, word_number) DO UPDATE");
  requireSnippet(problems, "trial.js", trial, "await requireSessionToken(context.request, body, session)");
  requireSnippet(problems, "trial.js", trial, "INSERT OR IGNORE INTO rating_trials");
  requireSnippet(problems, "trial.js", trial, "insertNonCriticalEvent");
  requireSnippet(problems, "trial.js", trial, "session.japanese_familiarity_1_6");
  requireSnippet(problems, "trial.js", trial, 'reason: "practice_not_recorded"');
  requireSnippet(problems, "event.js", event, "practice_recording_required");
  requireSnippet(problems, "event.js", event, 'reason: "practice_not_recorded"');
  requireSnippet(problems, "session/start.js", start, "duplicateStartResponse");
  requireSnippet(problems, "session/start.js", start, "participantKey(client, raterId, sessionLabel)");
  requireSnippet(problems, "session/start.js", start, "saved_trials");
  requireSnippet(problems, "session/start.js", start, "distractor_completed_trial_indexes");
  requireSnippet(problems, "session/start.js", start, "pending_distractor");
  requireSnippet(problems, "session/start.js", start, "prolificIdentityMatches");
  requireSnippet(problems, "session/start.js", start, "constantTimeEqual");
  requireSnippet(problems, "session/start.js", start, '"word_familiarity"');
  requireSnippet(problems, "session/start.js", start, `CURRENT_PLATFORM_VERSION = "${PLATFORM_VERSION}"`);
  requireSnippet(
    problems,
    "session/start.js",
    start,
    'PREVIOUS_CANONICAL_PRACTICE_PLATFORM_VERSION = "pronunciation_rating_v0.10.1"',
  );
  requireSnippet(problems, "session/start.js", start, "reload_required: true");
  requireSnippet(problems, "session/start.js", start, "const nextAssignment = mainRows.find");
  requireSnippet(problems, "session/start.js", start, "resume.practice_replay_required = true");
  requireSnippet(problems, "session/start.js", start, "practiceAssignment = CANONICAL_PRACTICE_ASSIGNMENT.map");
  requireSnippet(problems, "session/start.js", start, "assignment = mainAssignment");
  requireSnippet(problems, "session/start.js", start, "practice_recording_required: false");
  requireSnippet(problems, "session/start.js", start, "practice_persisted: false");
  requireSnippet(problems, "session/start.js", start, "japanese_familiarity_1_6: nullableInt(session.japanese_familiarity_1_6)");
  requireSnippet(problems, "session/start.js", start, 'requiredIntegerInRange(\n      "participant_age_years"');
  requireSnippet(problems, "session/start.js", start, 'optionalText(\n      "english_variety_other"');
  requireBefore(
    problems,
    "session/start.js",
    start,
    "const existing = await findExistingProlificSession",
    "const participantAgeYears = requiredIntegerInRange",
  );
  requireBefore(
    problems,
    "session/start.js",
    start,
    "const existing = await findExistingProlificSession",
    "const turnstileVerified = await verifyTurnstile",
  );
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "participant_age_years: 30");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, 'english_variety: "other"');
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, 'english_variety_other: "live check variety"');
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, 'english_teaching_experience_details: "live check teaching details"');
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "resume_only: true");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, PLATFORM_VERSION);
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "practice_replay_required");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "resumedPracticeSave");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "savedPracticeEvent");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "practice_event_ignored");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "checkDeployedClientPracticeContract");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "checkMainAssignmentOrder");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "maximumSameL1Run");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "exact persisted main assignment order");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "session_id: result.data.session_id");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "parsed statically");
  requireSnippet(problems, "scripts/audit_cloudflare_readiness.mjs", readinessAudit, 'argValue("--expected-source"');
  requireSnippet(problems, "scripts/audit_cloudflare_readiness.mjs", readinessAudit, "prewriteBlockers");
  requireSnippet(problems, "scripts/audit_cloudflare_readiness.mjs", readinessAudit, "Non-writing readiness only");
  requireSnippet(
    problems,
    "scripts/audit_cloudflare_readiness.mjs",
    readinessAudit,
    "checkLiveDeployment({ apiDryRunStart: true })",
  );
  if (liveCheck.includes('from "node:vm"') || liveCheck.includes("runInNewContext")) {
    problems.push("scripts/check_live_deployment.mjs must statically parse remote app.js without executing it");
  }
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "checkCacheControl");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, 'x-frame-options');
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "TURNSTILE_TEST_TOKEN");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "chn_female_organizer_practice.wav");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "chn_male_balloon_practice.wav");
  requireSnippet(problems, "scripts/check_live_deployment.mjs", liveCheck, "expert_comprehensibility_range");
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, "participant_age_years: 30");
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, PLATFORM_VERSION);
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, "resume_practice_required");
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, "chn_female_organizer_practice.wav");
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, "chn_male_balloon_practice.wav");
  requireSnippet(problems, "scripts/stress_live_counterbalance_concurrency.mjs", stressCheck, "if (turnstileToken)");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "legacyPracticeSix");
  requireSnippet(
    problems,
    "scripts/test_background_questionnaire_local.mjs",
    backgroundLocalTest,
    "legacy_v0101_browser_only_resume_exact: true",
  );
  requireSnippet(problems, "functions/api/trial.js", trial, "Number.MAX_SAFE_INTEGER");
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, "pronunciation_rating_v0.10.2_smoke");
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, "chn_female_organizer_practice.wav");
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, "chn_male_balloon_practice.wav");
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, '"practice_assignments": 0');
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, '"practice_phase_events": 0');
  requireSnippet(problems, "scripts/generate_smoke_test_200.py", smokeGenerator, '"invalid_demographic_sessions": 0');
  requireSnippet(problems, "_counterbalance.js", counterbalance, PRACTICE_AUDIO_ROOT);
  requireSnippet(problems, "_counterbalance.js", counterbalance, "chn_female_organizer_practice.wav");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "chn_male_balloon_practice.wav");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "expert_comprehensibility_range");
  forbidSnippet(problems, "_counterbalance.js", counterbalance, "chn_female_pizza_practice.wav");
  requireSnippet(problems, "_counterbalance.js", counterbalance, 'CURRENT_ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1"');
  requireSnippet(problems, "_counterbalance.js", counterbalance, "MAX_CONSTRAINED_SHUFFLE_ATTEMPTS = 200");
  requireSnippet(problems, "_counterbalance.js", counterbalance, ":rejection:${attempt}");
  forbidSnippet(problems, "_counterbalance.js", counterbalance, "chooseConstrainedL1");
  forbidSnippet(problems, "_counterbalance.js", counterbalance, "pressure * 1000");
  requireSnippet(
    problems,
    "scripts/verify_randomization_distribution.mjs",
    randomizationDistributionTest,
    "EXPECTED_FIRST_L1_PROBABILITY",
  );
  requireSnippet(
    problems,
    "scripts/verify_randomization_distribution.mjs",
    randomizationDistributionTest,
    "reversal symmetry",
  );
  requireSnippet(problems, "_counterbalance.js", counterbalance, "CROSS JOIN speaker_pattern_bundles");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "WHERE allocation_cohort = ?");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "AND allocation_strategy_version = ?");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "db.batch([allocationInsert, allocationSelect])");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "Stored speaker-pattern bundles do not match");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "tieBreakerOffset");
  requireSnippet(problems, "session/start.js", start, "trustedAllocationCohort");
  requireSnippet(problems, "session/start.js", start, "COUNTERBALANCE_COHORTS_JSON");
  requireSnippet(problems, "session/start.js", start, "db.batch([sessionInsert, ...statements])");
  requireBefore(
    problems,
    "session/start.js",
    start,
    "const existing = await findExistingProlificSession",
    "const allocationCohort = counterbalanceEnabled",
  );
  requireSnippet(problems, "session/complete.js", complete, "await db.batch(completionStatements)");
  requireSnippet(problems, "trial.js", trial, "allocation_strategy_version");
  requireSnippet(problems, "db/schema.sql", schema, "CREATE TABLE IF NOT EXISTS speaker_pattern_bundles");
  requireSnippet(problems, "db/schema.sql", schema, "speaker_pattern_bundle INTEGER");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "incomplete_dropout");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "abandoned");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "orphan_allocation_finalized_total");
  requireSnippet(problems, "admin/index.html", adminIndex, 'id="recent-sessions-body"');
  requireSnippet(problems, "admin/index.html", adminIndex, 'id="recent-include-dry-run"');
  requireSnippet(problems, "admin/admin.js", adminJs, "function renderRecentSessions");
  requireSnippet(problems, "admin/admin.js", adminJs, "cell.textContent = displayValue(value)");
  forbidSnippet(problems, "admin/admin.js", adminJs, "innerHTML");
  requireSnippet(problems, "admin/summary.js", adminSummary, "const accessPayload = await requireAdmin");
  requireSnippet(problems, "admin/summary.js", adminSummary, "LIMIT ? OFFSET ?");
  requireSnippet(problems, "admin/summary.js", adminSummary, "s.participant_age_years");
  requireSnippet(problems, "admin/summary.js", adminSummary, "s.japanese_familiarity_1_6");
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, '"session_id"');
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, '"participant_age_years"');
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, "s.id AS session_id");
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, '"word-familiarity"');
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, '"word_known"');
  requireSnippet(problems, "admin/export/[dataset].js", adminExport, "AVG(CASE WHEN rt.phase = 'main' THEN rt.submit_rt_ms END)");
  requireSnippet(problems, "_utils.js", utils, "typeof value === \"string\"");
  requireSnippet(problems, "_utils.js", utils, "^\\s*[=+\\-@]");
  requireSnippet(problems, "scripts/apply_d1_schema_updates.mjs", schemaUpdater, '["participant_age_years", "INTEGER"]');
  requireSnippet(problems, "scripts/apply_d1_schema_updates.mjs", schemaUpdater, 'word_familiarity_required');
  requireSnippet(problems, "scripts/apply_d1_schema_updates.mjs", schemaUpdater, 'CREATE TABLE IF NOT EXISTS word_familiarity_responses');
  for (const field of [
    "participant_age_years",
    "english_variety",
    "english_variety_other",
    "gender",
    "gender_other",
    "english_teaching_experience",
    "english_teaching_experience_details",
    "linguistics_knowledge",
    "linguistics_knowledge_details",
  ]) {
    requireSnippet(problems, "db/schema.sql", schema, field);
    requireSnippet(
      problems,
      "db/migrations/0012_background_questionnaire.sql",
      backgroundQuestionnaireMigration,
      field,
    );
    requireSnippet(problems, "scripts/apply_d1_schema_updates.mjs", schemaUpdater, field);
    requireSnippet(problems, "session/start.js", start, field);
    requireSnippet(problems, "admin/export/[dataset].js", adminExport, field);
  }
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "resume_without_questionnaire: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "resume_identity_triple_match: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "csv_formula_neutralized: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "word_familiarity_rows: 50");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "practice_set_v0101_exact: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "practice_feedback_unlimited_replay_contract: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "resume_replays_all_practice: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "resume_preserves_first_unsaved_main: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "replayed_practice_idempotent: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "new_v010_main_only_persistence: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "new_v010_practice_assignments_0: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "new_v010_practice_trials_0: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "new_v010_practice_events_0: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "all_demographic_session_columns_roundtrip: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "legacy_practice_contract_compatible: true");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "lost its historical Accentedness ranges");
  requireSnippet(problems, "session/start.js", start, "legacyAccentRange");
  requireSnippet(problems, "session/start.js", start, "browserPracticeAssignmentForPlatformVersion");
  requireSnippet(problems, "session/start.js", start, "practice_calibration_v0.10.0");
  requireSnippet(problems, "scripts/test_background_questionnaire_local.mjs", backgroundLocalTest, "legacy_v0100_browser_only_resume_exact: true");
  requireSnippet(
    problems,
    "scripts/test_background_questionnaire_local.mjs",
    backgroundLocalTest,
    "legacy_v060_mid_task_resume: true",
  );
  requireSnippet(problems, "db/schema.sql", schema, "idx_sessions_participant_key_unique");
  requireSnippet(problems, "db/schema.sql", schema, "idx_sessions_prolific_session_unique");
  requireSnippet(problems, "db/schema.sql", schema, "UNIQUE(session_id, phase, trial_index)");
  requireSnippet(problems, "db/schema.sql", schema, "participant_age_years INTEGER");
  requireSnippet(problems, "db/schema.sql", schema, "english_teaching_experience_details TEXT");
  requireSnippet(problems, "db/schema.sql", schema, "word_familiarity_required INTEGER NOT NULL DEFAULT 0");
  requireSnippet(problems, "db/schema.sql", schema, "CREATE TABLE IF NOT EXISTS word_familiarity_responses");
  requireSnippet(problems, "db/migrations/0013_word_familiarity.sql", wordFamiliarityMigration, "ALTER TABLE sessions ADD COLUMN word_familiarity_required");
  requireSnippet(problems, "db/schema.sql", schema, "AND status != 'start_failed'");
  requireSnippet(problems, "db/migrations/0014_archived_session_locks.sql", archivedSessionMigration, "DROP INDEX IF EXISTS idx_sessions_prolific_pid_study_unique");
  requireSnippet(problems, "db/migrations/0014_archived_session_locks.sql", archivedSessionMigration, "AND status != 'start_failed'");
  requireSnippet(problems, "scripts/test_archived_session_lock.py", archivedSessionLockTest, "archived_session_releases_lock: true");
  requireSnippet(problems, "scripts/test_archived_session_lock.py", archivedSessionLockTest, "active_session_lock_preserved: true");

  return problems;
}

function checkRandomizationDistribution(options) {
  if (!fileExists(options.randomizationDistributionTest)) {
    return {
      name: "Constrained-randomization distribution",
      problems: [`Missing randomization distribution test: ${options.randomizationDistributionTest}`],
      summary: "not run",
    };
  }
  const result = spawnSync(process.execPath, [options.randomizationDistributionTest], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120_000,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  const problems = [];
  if (result.error) problems.push(`Could not run the distribution audit: ${result.error.message}`);
  if (result.status !== 0) {
    problems.push(
      `Distribution audit exited ${result.status ?? "without a status"}: ${output.slice(0, 800) || "no output"}`,
    );
  }
  return {
    name: "Constrained-randomization distribution",
    problems,
    summary: problems.length ? "FAIL" : "PASS (50,000 blocks)",
  };
}

function markdownReport(checks, options) {
  const blockers = checks.flatMap((check) => check.problems.map((problem) => ({ ...check, problem })));
  const lines = [
    "# Production Preflight Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Result: ${blockers.length ? "FAIL" : "PASS"}`,
    "",
    "## Inputs",
    "",
    `- Production manifest: \`${options.productionManifest}\``,
    `- Deployed/repo manifest: \`${options.deployedManifest}\``,
    `- Audio QC issues: \`${options.audioQcIssues}\``,
    `- Audio QC detail: \`${options.audioQcDetail}\``,
    `- Lexical balance: \`${options.lexicalPairwise}\``,
    `- Current practice manifest: \`${options.selectedPracticeManifest}\``,
    `- Duration summary: \`${options.durationSummary}\``,
    `- Duration detail: \`${options.durationDetail}\``,
    "",
    "## Checks",
    "",
  ];
  for (const check of checks) {
    lines.push(`- ${check.problems.length ? "FAIL" : "PASS"} ${check.name}${check.summary ? `: ${check.summary}` : ""}`);
    for (const problem of check.problems) lines.push(`  - ${problem}`);
  }
  if (blockers.length) {
    lines.push("", "## Launch Blockers", "");
    for (const item of blockers) lines.push(`- ${item.name}: ${item.problem}`);
  }
  return `${lines.join("\n")}\n`;
}

const options = {
  productionManifest: path.resolve(argValue("--production-manifest", DEFAULTS.productionManifest)),
  deployedManifest: path.resolve(argValue("--deployed-manifest", DEFAULTS.deployedManifest)),
  audioQcIssues: path.resolve(argValue("--audio-qc-issues", DEFAULTS.audioQcIssues)),
  audioQcDetail: path.resolve(argValue("--audio-qc-detail", DEFAULTS.audioQcDetail)),
  lexicalPairwise: path.resolve(argValue("--lexical-pairwise", DEFAULTS.lexicalPairwise)),
  selectedPracticeManifest: path.resolve(argValue("--selected-practice-manifest", DEFAULTS.selectedPracticeManifest)),
  durationSummary: path.resolve(argValue("--duration-summary", DEFAULTS.durationSummary)),
  durationDetail: path.resolve(argValue("--duration-detail", DEFAULTS.durationDetail)),
  indexHtml: path.resolve(argValue("--index-html", DEFAULTS.indexHtml)),
  appJs: path.resolve(argValue("--app-js", DEFAULTS.appJs)),
  audioLifecycle: path.resolve(argValue("--audio-lifecycle", DEFAULTS.audioLifecycle)),
  audioLifecycleTest: path.resolve(argValue("--audio-lifecycle-test", DEFAULTS.audioLifecycleTest)),
  utilsApi: path.resolve(argValue("--utils-api", DEFAULTS.utilsApi)),
  wordFamiliarityModule: path.resolve(argValue("--word-familiarity-module", DEFAULTS.wordFamiliarityModule)),
  wordFamiliarityApi: path.resolve(argValue("--word-familiarity-api", DEFAULTS.wordFamiliarityApi)),
  completeApi: path.resolve(argValue("--complete-api", DEFAULTS.completeApi)),
  trialApi: path.resolve(argValue("--trial-api", DEFAULTS.trialApi)),
  eventApi: path.resolve(argValue("--event-api", DEFAULTS.eventApi)),
  startApi: path.resolve(argValue("--start-api", DEFAULTS.startApi)),
  counterbalanceApi: path.resolve(argValue("--counterbalance-api", DEFAULTS.counterbalanceApi)),
  finalizeStaleApi: path.resolve(argValue("--finalize-stale-api", DEFAULTS.finalizeStaleApi)),
  adminSummaryApi: path.resolve(argValue("--admin-summary-api", DEFAULTS.adminSummaryApi)),
  adminExportApi: path.resolve(argValue("--admin-export-api", DEFAULTS.adminExportApi)),
  adminIndex: path.resolve(argValue("--admin-index", DEFAULTS.adminIndex)),
  adminJs: path.resolve(argValue("--admin-js", DEFAULTS.adminJs)),
  schema: path.resolve(argValue("--schema", DEFAULTS.schema)),
  backgroundQuestionnaireMigration: path.resolve(argValue("--background-questionnaire-migration", DEFAULTS.backgroundQuestionnaireMigration)),
  wordFamiliarityMigration: path.resolve(argValue("--word-familiarity-migration", DEFAULTS.wordFamiliarityMigration)),
  archivedSessionMigration: path.resolve(argValue("--archived-session-migration", DEFAULTS.archivedSessionMigration)),
  schemaUpdater: path.resolve(argValue("--schema-updater", DEFAULTS.schemaUpdater)),
  archivedSessionLockTest: path.resolve(argValue("--archived-session-lock-test", DEFAULTS.archivedSessionLockTest)),
  backgroundLocalTest: path.resolve(argValue("--background-local-test", DEFAULTS.backgroundLocalTest)),
  randomizationDistributionTest: path.resolve(
    argValue("--randomization-distribution-test", DEFAULTS.randomizationDistributionTest),
  ),
  readinessAudit: path.resolve(argValue("--readiness-audit", DEFAULTS.readinessAudit)),
  liveCheck: path.resolve(argValue("--live-check", DEFAULTS.liveCheck)),
  stressCheck: path.resolve(argValue("--stress-check", DEFAULTS.stressCheck)),
  smokeGenerator: path.resolve(argValue("--smoke-generator", DEFAULTS.smokeGenerator)),
  out: path.resolve(argValue("--out", DEFAULTS.out)),
  usingExternalManifestSecret: hasFlag("--using-external-manifest-secret"),
  requireAudioUrls: !hasFlag("--allow-relative-audio-files"),
  allowAudioFailures: hasFlag("--allow-audio-failures"),
  allowProvisionalPracticeRatings: hasFlag("--allow-provisional-practice-ratings"),
};

const productionRows = readCsv(options.productionManifest);
const deployedRows = readCsv(options.deployedManifest);
const audioQcRows = readCsv(options.audioQcIssues);
const audioQcDetailRows = readCsv(options.audioQcDetail);
const lexicalRows = readCsv(options.lexicalPairwise);
const practiceRows = readCsv(options.selectedPracticeManifest);
const durationRows = readCsv(options.durationSummary);
const durationDetailRows = readCsv(options.durationDetail);
const audioQc = checkAudioQc(audioQcRows, options);
const lexical = checkLexical(lexicalRows);
const duration = checkDuration(durationRows);
const checks = [
  {
    name: "Production manifest structure",
    problems: [
      ...csvInputProblems("Production manifest", options.productionManifest, productionRows),
      ...checkProductionManifest(productionRows),
    ],
    summary: `${productionRows.length} row(s), ${uniqueValues(productionRows, "target_word").size} target word(s)`,
  },
  {
    name: "Production audio hosting",
    problems: [
      ...(options.usingExternalManifestSecret
        ? []
        : csvInputProblems("Deployed/repo manifest", options.deployedManifest, deployedRows)),
      ...checkAudioHosting(productionRows, deployedRows, options),
    ],
    summary: options.usingExternalManifestSecret
      ? "external COUNTERBALANCE_MANIFEST_URL assumed"
      : `${deployedRows.length} repo remote_manifest row(s)`,
  },
  {
    name: "Audio QC",
    problems: [
      ...csvInputProblems("Audio QC issues", options.audioQcIssues, audioQcRows),
      ...csvInputProblems("Audio QC detail", options.audioQcDetail, audioQcDetailRows),
      ...audioQc.problems,
      ...checkCurrentPracticeAudioQc(audioQcDetailRows),
    ],
    summary: audioQc.summary,
  },
  {
    name: "Lexical balance QC",
    problems: [
      ...csvInputProblems("Lexical balance", options.lexicalPairwise, lexicalRows),
      ...lexical.problems,
    ],
    summary: lexical.summary,
  },
  {
    name: "Selected practice ratings",
    problems: [
      ...csvInputProblems("Current practice manifest", options.selectedPracticeManifest, practiceRows),
      ...checkPractice(practiceRows, options),
    ],
    summary: `${practiceRows.length} current practice manifest row(s)`,
  },
  {
    name: "Duration lower-bound estimate",
    problems: [
      ...csvInputProblems("Duration summary", options.durationSummary, durationRows),
      ...csvInputProblems("Duration detail", options.durationDetail, durationDetailRows),
      ...duration.problems,
      ...checkDurationDetail(durationDetailRows),
    ],
    summary: duration.summary,
  },
  {
    name: "Repository static security files",
    problems: checkRepoStatic(),
    summary: "_headers and wrangler example",
  },
  {
    name: "Prolific flow source guards",
    problems: checkProlificFlowSourceGuards(options),
    summary: "completion redirect, trial save, duplicate start, counterbalance, and dropout guards",
  },
  checkRandomizationDistribution(options),
];

fs.mkdirSync(path.dirname(options.out), { recursive: true });
fs.writeFileSync(options.out, markdownReport(checks, options));

const blockers = checks.flatMap((check) => check.problems.map((problem) => `${check.name}: ${problem}`));
console.log(`preflight report: ${options.out}`);
console.log(`result: ${blockers.length ? "FAIL" : "PASS"}`);
if (blockers.length) {
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}
