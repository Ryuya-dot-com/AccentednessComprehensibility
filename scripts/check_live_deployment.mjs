#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://accentednesscomprehensibility.pages.dev";
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
    "const STAGED_COMBINED_FLOW = true",
    "speaker_pattern_index",
    "elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703",
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
  ];
  const forbidden = [
    'params.get("completion_code")',
    'params.get("PROLIFIC_CODE")',
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

function checkRequiredIndexSnippets(indexText) {
  const required = [
    'id="word-familiarity-panel"',
    'id="word-familiarity-grid"',
    "Review all 50 words",
    "If you were unfamiliar with it",
    "Rate how strong the speaker's <strong>accent</strong> sounded.",
    "Rate how easy the word was to <strong>understand</strong>.",
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
    platform_version: "pronunciation_rating_v0.7.0",
    seed: `live_check_${nonce}`,
    dry_run: "1",
    prolific_pid: `LIVE_CHECK_${nonce}`,
    prolific_study_id: "DRY_RUN",
    prolific_session_id: `LIVE_CHECK_SESSION_${nonce}`,
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
    practice_assignment: [],
  };
  const resumePayload = {
    rater_id: payload.rater_id,
    session_label: payload.session_label,
    platform_version: "pronunciation_rating_v0.7.0",
    dry_run: "1",
    resume_only: true,
    prolific_pid: payload.prolific_pid,
    prolific_study_id: payload.prolific_study_id,
    prolific_session_id: payload.prolific_session_id,
    counterbalance: { enabled: true },
  };
  const result = await postJson(baseUrl, "/api/session/start", payload);
  const duplicate = result.response.status === 200 && result.data.ok === true
    ? await postJson(baseUrl, "/api/session/start", resumePayload)
    : null;
  const assignment = Array.isArray(result.data.main_assignment)
    ? result.data.main_assignment
    : [];
  const duplicateResume = duplicate?.data?.resume || {};
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
          ...(duplicate.data.session_id === result.data.session_id ? [] : ["duplicate start did not return the same session_id"]),
          ...(duplicate.data.session_token ? [] : ["duplicate start did not issue a fresh session_token"]),
          ...(Array.isArray(duplicate.data.saved_trials) ? [] : ["duplicate start did not return saved_trials"]),
          ...(Array.isArray(duplicate.data.distractor_completed_trial_indexes) ? [] : ["duplicate start did not return distractor_completed_trial_indexes"]),
          ...(["practice", "main", "word_familiarity", "complete"].includes(duplicateResume.next_phase) ? [] : ["duplicate start did not return a valid resume.next_phase"]),
          ...(duplicate.data.word_familiarity_required === true ? [] : ["duplicate start did not preserve word_familiarity_required"]),
          ...(Array.isArray(duplicate.data.word_familiarity) ? [] : ["duplicate start did not return word_familiarity"]),
          ...(Number(duplicate.data.japanese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original japanese_familiarity_1_6"]),
          ...(Number(duplicate.data.chinese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original chinese_familiarity_1_6"]),
          ...(Number(duplicate.data.participant_age_years) === 30 ? [] : ["duplicate start did not return original participant_age_years"]),
          ...(duplicate.data.english_variety === "american" ? [] : ["duplicate start did not return original english_variety"]),
          ...(duplicate.data.gender === "no_answer" ? [] : ["duplicate start did not return original gender"]),
          ...(duplicate.data.english_teaching_experience === "no" ? [] : ["duplicate start did not return original english_teaching_experience"]),
          ...(duplicate.data.linguistics_knowledge === "no" ? [] : ["duplicate start did not return original linguistics_knowledge"]),
        ]
      : []),
  ];
  return {
    problems,
    summary: JSON.stringify({
      status: result.response.status,
      ok: result.data.ok === true,
      dry_run: result.data.dry_run === true,
      trial_count: result.data.trial_count,
      main_assignment: assignment.length,
      counterbalance_cell: result.data.counterbalance?.cell_id || "",
      placeholder_rows: placeholderRows.length,
      non_https_rows: nonHttpsRows.length,
      duplicate_existing_session: duplicate?.data?.existing_session === true,
      duplicate_resume_phase: duplicateResume.next_phase || "",
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
const manifest = await fetchText(baseUrl, "/remote_manifest.csv");
const config = await fetchText(baseUrl, "/api/config");
const selectedPractice = await fetchHead(
  baseUrl,
  "/practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/chocolate__eng_bella.mp3",
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
    problems: /^audio\//i.test(header(selectedPractice.response, "content-type"))
      ? []
      : [`selected practice MP3 returned content-type ${header(selectedPractice.response, "content-type") || "(none)"}`],
    summary: JSON.stringify(summarizeHeaders(selectedPractice.response)),
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
