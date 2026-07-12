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
const DEFAULT_OUT = path.join(
  PACKAGE_ROOT,
  "metadata",
  "LIVE_COUNTERBALANCE_CONCURRENCY_STRESS_20260703.md",
);
const CELL_COUNT = 20;

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

function basePayload(label, index, turnstileToken) {
  return {
    rater_id: label,
    session_label: label,
    task_mode: "combined",
    platform_version: "pronunciation_rating_v0.7.0",
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
    practice_assignment: [],
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
    placeholder_rows: assignment.filter((row) => row.source_format === "dry_run_placeholder").length,
    non_https_rows: assignment.filter((row) => !/^https:\/\//i.test(row.audio_url || "")).length,
  };
}

function cellCounts(results) {
  const counts = new Map(Array.from({ length: CELL_COUNT }, (_, index) => [index + 1, 0]));
  for (const result of results) {
    if (!result.ok) continue;
    const cell = Number(result.data?.counterbalance?.cell_id || 0);
    if (counts.has(cell)) counts.set(cell, counts.get(cell) + 1);
  }
  return [...counts.entries()];
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
  return {
    ok: bothOk && sameSession,
    first,
    second,
    same_session: Boolean(sameSession),
  };
}

function markdown(context) {
  const {
    generatedAt,
    baseUrl,
    participants,
    concurrency,
    timeoutMs,
    batchLabel,
    results,
    counts,
    duplicate,
    problems,
  } = context;
  const successful = results.filter((result) => result.ok);
  const values = counts.map(([, count]) => count);
  const lines = [
    "# Live Counterbalance Concurrency Stress Test",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Scenario",
    "",
    `- Base URL: ${baseUrl}`,
    `- Dry-run participants: ${participants}`,
    `- Concurrent workers: ${concurrency}`,
    `- Timeout: ${timeoutMs} ms`,
    `- Batch label: \`${batchLabel}\``,
    "- Study ID: `DRY_RUN`",
    "",
    "## Result",
    "",
    `- Result: ${problems.length ? "FAIL" : "PASS"}`,
    `- Successful starts: ${successful.length} / ${participants}`,
    `- assigned_min: ${values.length ? Math.min(...values) : 0}`,
    `- assigned_max: ${values.length ? Math.max(...values) : 0}`,
    `- assigned_spread: ${values.length ? Math.max(...values) - Math.min(...values) : 0}`,
    `- duplicate_participant_check: ${duplicate ? (duplicate.ok ? "PASS" : "FAIL") : "SKIPPED"}`,
    "",
    "## Cell Counts",
    "",
    "| cell_id | dry_run_started_count |",
    "| ---: | ---: |",
  ];
  for (const [cell, count] of counts) lines.push(`| ${cell} | ${count} |`);

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
    "A spread of 0 or 1 is expected when all dry-run starts are accepted in one wave. Dry-run allocation statuses are excluded from production completed-cell counts, but they remain visible in restricted raw audit exports.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

const baseUrl = argValue("--base-url", DEFAULT_BASE_URL).replace(/\/+$/, "/");
const participants = positiveInt("--participants", 40);
const concurrency = positiveInt("--concurrency", participants);
const timeoutMs = positiveInt("--timeout-ms", 30000);
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const turnstileToken = argValue("--turnstile-token", process.env.TURNSTILE_TEST_TOKEN || "");
const skipDuplicateCheck = hasFlag("--skip-duplicate-check");
const allowPlaceholder = hasFlag("--allow-placeholder");
const allowNonHttps = hasFlag("--allow-non-https");

if (participants < CELL_COUNT) {
  throw new Error(`--participants must be at least ${CELL_COUNT}.`);
}
if (concurrency < participants) {
  throw new Error("--concurrency must be at least --participants for a single simultaneous-start wave.");
}

const batchLabel = `stress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const payloads = Array.from({ length: participants }, (_, index) =>
  basePayload(batchLabel, index + 1, turnstileToken)
);
const startedAt = Date.now();
const results = await runPool(payloads, concurrency, (payload) =>
  postJson(baseUrl, "/api/session/start", payload, timeoutMs)
);
const counts = cellCounts(results);
const values = counts.map(([, count]) => count);
const successful = results.filter((result) => result.ok);
const problems = [];

if (successful.length !== participants) {
  problems.push(`expected ${participants} successful starts, got ${successful.length}`);
}
for (const [index, result] of results.entries()) {
  const summary = summarizeMainAssignment(result);
  if (result.ok && summary.assignment_count !== 100) {
    problems.push(`request ${index + 1}: expected 100 main assignments, got ${summary.assignment_count}`);
  }
  if (result.ok && !allowPlaceholder && summary.placeholder_rows) {
    problems.push(`request ${index + 1}: ${summary.placeholder_rows} dry_run_placeholder rows`);
  }
  if (result.ok && !allowNonHttps && summary.non_https_rows) {
    problems.push(`request ${index + 1}: ${summary.non_https_rows} non-HTTPS audio rows`);
  }
}
if (successful.length === participants) {
  const spread = Math.max(...values) - Math.min(...values);
  if (spread > 1) {
    problems.push(`allocation spread is too large: ${spread}`);
  }
}

const duplicate = skipDuplicateCheck
  ? null
  : await duplicateParticipantCheck(baseUrl, batchLabel, timeoutMs, turnstileToken);
if (duplicate && !duplicate.ok) {
  problems.push("duplicate participant start did not resume the same dry-run session");
}

const report = markdown({
  generatedAt: new Date().toISOString(),
  baseUrl,
  participants,
  concurrency,
  timeoutMs,
  batchLabel,
  elapsedMs: Date.now() - startedAt,
  results,
  counts,
  duplicate,
  problems,
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, report, "utf8");

console.log(`live dry-run starts: ${participants}`);
console.log(`successful starts: ${successful.length}`);
console.log(`assigned_min: ${Math.min(...values)}`);
console.log(`assigned_max: ${Math.max(...values)}`);
console.log(`assigned_spread: ${Math.max(...values) - Math.min(...values)}`);
console.log("cell_counts:", counts.map(([cell, count]) => `${cell}:${count}`).join(" "));
console.log(`duplicate_participant_check: ${duplicate ? (duplicate.ok ? "passed" : "failed") : "skipped"}`);
console.log(`report: ${out}`);

if (problems.length) {
  console.error("problems:");
  for (const problem of problems.slice(0, 20)) console.error(`- ${problem}`);
  process.exit(1);
}
