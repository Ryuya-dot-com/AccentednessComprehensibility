#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULTS = {
  productionManifest: path.join(PACKAGE_ROOT, "remote_manifest.csv"),
  deployedManifest: path.join(REPO_ROOT, "remote_manifest.csv"),
  audioQcIssues: path.join(PACKAGE_ROOT, "metadata", "audio_qc_issues.csv"),
  lexicalPairwise: path.join(PACKAGE_ROOT, "metadata", "lexical_balance_pairwise_differences.csv"),
  selectedPracticeManifest: path.join(PACKAGE_ROOT, "metadata", "selected_practice_manifest.csv"),
  durationSummary: path.join(PACKAGE_ROOT, "metadata", "duration_estimate_summary.csv"),
  appJs: path.join(REPO_ROOT, "app.js"),
  completeApi: path.join(REPO_ROOT, "functions", "api", "session", "complete.js"),
  trialApi: path.join(REPO_ROOT, "functions", "api", "trial.js"),
  startApi: path.join(REPO_ROOT, "functions", "api", "session", "start.js"),
  counterbalanceApi: path.join(REPO_ROOT, "functions", "api", "_counterbalance.js"),
  finalizeStaleApi: path.join(REPO_ROOT, "functions", "api", "admin", "finalize-stale.js"),
  schema: path.join(REPO_ROOT, "db", "schema.sql"),
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
  const selected = rows.filter((row) => String(row.status || "").startsWith("selected"));
  if (selected.length !== 4) problems.push(`expected 4 selected practice rows, found ${selected.length}`);
  const provisional = selected.filter((row) => /provisional/i.test(row.status || row.note || ""));
  if (provisional.length && !options.allowProvisionalPracticeRatings) {
    problems.push(`${provisional.length} selected practice row(s) still have provisional reference ratings`);
  }
  const missing = selected.filter((row) => row.package_file_exists !== "1");
  if (missing.length) problems.push(`${missing.length} selected practice package file(s) are missing`);
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
  for (const token of [
    "Content-Security-Policy",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Permissions-Policy",
  ]) {
    if (!headers.includes(token)) problems.push(`_headers missing ${token}`);
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

function checkProlificFlowSourceGuards(options) {
  const problems = [];
  const app = readTextIfExists(options.appJs);
  const complete = readTextIfExists(options.completeApi);
  const trial = readTextIfExists(options.trialApi);
  const start = readTextIfExists(options.startApi);
  const counterbalance = readTextIfExists(options.counterbalanceApi);
  const finalizeStale = readTextIfExists(options.finalizeStaleApi);
  const schema = readTextIfExists(options.schema);
  for (const [label, text] of [
    ["app.js", app],
    ["session/complete.js", complete],
    ["trial.js", trial],
    ["session/start.js", start],
    ["_counterbalance.js", counterbalance],
    ["admin/finalize-stale.js", finalizeStale],
    ["db/schema.sql", schema],
  ]) {
    if (!text) problems.push(`${label} is missing or empty`);
  }

  requireSnippet(problems, "app.js", app, "window.location.assign(completionUrl)");
  requireSnippet(problems, "app.js", app, "Your response could not be saved. Please try Continue again.");
  requireSnippet(problems, "app.js", app, "error.data?.retryable === true");
  requireSnippet(problems, "app.js", app, "Confirming saved responses...");
  forbidSnippet(problems, "app.js", app, 'params.get("completion_code")');
  forbidSnippet(problems, "app.js", app, 'params.get("PROLIFIC_CODE")');
  requireSnippet(problems, "session/complete.js", complete, "LEFT JOIN rating_trials rt");
  requireSnippet(problems, "session/complete.js", complete, "missingAssignmentCount === 0");
  requireSnippet(problems, "session/complete.js", complete, "prolificCompletionConfig(context.env)");
  requireSnippet(problems, "session/complete.js", complete, "completion_missing_trials");
  requireSnippet(problems, "session/complete.js", complete, "retryable: true");
  requireSnippet(problems, "session/complete.js", complete, "completed_too_fast");
  requireSnippet(problems, "session/complete.js", complete, "insertNonCriticalEvent");
  requireSnippet(problems, "trial.js", trial, "await requireSessionToken(context.request, body, session)");
  requireSnippet(problems, "trial.js", trial, "INSERT OR IGNORE INTO rating_trials");
  requireSnippet(problems, "trial.js", trial, "insertNonCriticalEvent");
  requireSnippet(problems, "session/start.js", start, "duplicateStartResponse");
  requireSnippet(problems, "session/start.js", start, "participantKey(client, raterId, sessionLabel)");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "SELECT COUNT(*)");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "ca.status IN (?, ?)");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "ca.status = ?");
  requireSnippet(problems, "_counterbalance.js", counterbalance, "ca.status NOT LIKE 'dry_run_%'");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "incomplete_dropout");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "abandoned");
  requireSnippet(problems, "admin/finalize-stale.js", finalizeStale, "orphan_allocation_finalized_total");
  requireSnippet(problems, "db/schema.sql", schema, "idx_sessions_participant_key_unique");
  requireSnippet(problems, "db/schema.sql", schema, "idx_sessions_prolific_session_unique");
  requireSnippet(problems, "db/schema.sql", schema, "UNIQUE(session_id, phase, trial_index)");

  return problems;
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
    `- Lexical balance: \`${options.lexicalPairwise}\``,
    `- Selected practice manifest: \`${options.selectedPracticeManifest}\``,
    `- Duration summary: \`${options.durationSummary}\``,
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
  lexicalPairwise: path.resolve(argValue("--lexical-pairwise", DEFAULTS.lexicalPairwise)),
  selectedPracticeManifest: path.resolve(argValue("--selected-practice-manifest", DEFAULTS.selectedPracticeManifest)),
  durationSummary: path.resolve(argValue("--duration-summary", DEFAULTS.durationSummary)),
  appJs: path.resolve(argValue("--app-js", DEFAULTS.appJs)),
  completeApi: path.resolve(argValue("--complete-api", DEFAULTS.completeApi)),
  trialApi: path.resolve(argValue("--trial-api", DEFAULTS.trialApi)),
  startApi: path.resolve(argValue("--start-api", DEFAULTS.startApi)),
  counterbalanceApi: path.resolve(argValue("--counterbalance-api", DEFAULTS.counterbalanceApi)),
  finalizeStaleApi: path.resolve(argValue("--finalize-stale-api", DEFAULTS.finalizeStaleApi)),
  schema: path.resolve(argValue("--schema", DEFAULTS.schema)),
  out: path.resolve(argValue("--out", DEFAULTS.out)),
  usingExternalManifestSecret: hasFlag("--using-external-manifest-secret"),
  requireAudioUrls: !hasFlag("--allow-relative-audio-files"),
  allowAudioFailures: hasFlag("--allow-audio-failures"),
  allowProvisionalPracticeRatings: hasFlag("--allow-provisional-practice-ratings"),
};

const productionRows = readCsv(options.productionManifest);
const deployedRows = readCsv(options.deployedManifest);
const audioQcRows = readCsv(options.audioQcIssues);
const lexicalRows = readCsv(options.lexicalPairwise);
const practiceRows = readCsv(options.selectedPracticeManifest);
const durationRows = readCsv(options.durationSummary);
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
      ...audioQc.problems,
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
      ...csvInputProblems("Selected practice manifest", options.selectedPracticeManifest, practiceRows),
      ...checkPractice(practiceRows, options),
    ],
    summary: `${practiceRows.length} selected-practice manifest row(s)`,
  },
  {
    name: "Duration lower-bound estimate",
    problems: [
      ...csvInputProblems("Duration summary", options.durationSummary, durationRows),
      ...duration.problems,
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
