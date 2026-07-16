#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT = "accentednesscomprehensibility";
const DEFAULT_DATABASE = "accentedness-comprehensibility";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULT_OUT = path.join(PACKAGE_ROOT, "metadata", "CLOUDFLARE_READINESS_REPORT_20260703.md");

const REQUIRED_SECRET_NAMES = [
  "ADMIN_TOKEN",
];
const COMPLETION_SECRET_NAMES = [
  "PROLIFIC_COMPLETION_URL",
  "PROLIFIC_COMPLETION_CODE",
];
const CONDITIONAL_SECRET_NAMES = [
  "COUNTERBALANCE_MANIFEST_URL",
  "TURNSTILE_SECRET_KEY",
];

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    ok: result.status === 0,
    stdout,
    stderr,
    output: stripAnsi([stdout, stderr].filter(Boolean).join("\n").trim()),
    ...options,
  };
}

function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function outputExcerpt(result, maxLength = 900) {
  const text = result.output || "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function secretPresence(secretOutput, name) {
  return new RegExp(`(^|[^A-Z0-9_])${name}([^A-Z0-9_]|$)`).test(secretOutput);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function checkWranglerAuth() {
  const result = run("npx", ["wrangler", "whoami"]);
  const unauthenticated =
    !result.ok ||
    /not authenticated/i.test(result.output) ||
    /CLOUDFLARE_API_TOKEN/i.test(result.output);
  return {
    name: "Wrangler authentication",
    problems: unauthenticated ? ["Wrangler is not authenticated; run `npx wrangler login` or set `CLOUDFLARE_API_TOKEN`."] : [],
    summary: unauthenticated ? "not authenticated" : "authenticated",
    details: outputExcerpt(result),
  };
}

function checkPagesSecrets(project) {
  const result = run("npx", [
    "wrangler",
    "pages",
    "secret",
    "list",
    "--project-name",
    project,
  ]);
  const problems = [];
  if (!result.ok) {
    problems.push(`Could not list Pages secrets for ${project}.`);
  }
  const output = result.output || "";
  for (const name of REQUIRED_SECRET_NAMES) {
    if (result.ok && !secretPresence(output, name)) {
      problems.push(`Missing required Pages secret: ${name}`);
    }
  }
  const completionSecretPresent = COMPLETION_SECRET_NAMES.some((name) =>
    result.ok && secretPresence(output, name)
  );
  if (result.ok && !completionSecretPresent) {
    problems.push(
      `Missing Prolific completion secret: set one of ${COMPLETION_SECRET_NAMES.join(", ")}`,
    );
  }
  const optionalPresent = Object.fromEntries(
    CONDITIONAL_SECRET_NAMES.map((name) => [name, result.ok && secretPresence(output, name)]),
  );
  return {
    name: "Pages secrets",
    problems,
    summary: JSON.stringify({
      project,
      required_checked: REQUIRED_SECRET_NAMES,
      completion_checked: COMPLETION_SECRET_NAMES,
      optional_present: optionalPresent,
    }),
    details: outputExcerpt(result),
  };
}

function checkPagesDeployments(project) {
  const result = run("npx", [
    "wrangler",
    "pages",
    "deployment",
    "list",
    "--project-name",
    project,
    "--environment",
    "production",
    "--json",
  ]);
  const problems = [];
  if (!result.ok) problems.push(`Could not list production Pages deployments for ${project}.`);
  const parsed = parseJson(result.stdout);
  const deployments = Array.isArray(parsed) ? parsed : [];
  const latest = deployments[0] || {};
  const latestId = latest.id || latest.Id || "";
  const latestBranch = latest.branch || latest.Branch || "";
  const latestSource = latest.source || latest.Source || "";
  const latestStatus = latest.status || latest.Status || "";
  const expectedSource = argValue("--expected-source", process.env.EXPECTED_PAGES_SOURCE || "");
  const normalizedSource = String(latestSource).toLowerCase();
  const normalizedExpectedSource = String(expectedSource).toLowerCase();
  const sourceMatches = !expectedSource || Boolean(
    normalizedSource &&
      (normalizedSource.startsWith(normalizedExpectedSource) ||
        normalizedExpectedSource.startsWith(normalizedSource)),
  );
  if (result.ok && !deployments.length) problems.push("No production Pages deployment was returned.");
  if (result.ok && latestBranch !== "main") {
    problems.push(`Latest production Pages deployment is from ${latestBranch || "(missing branch)"}, not main.`);
  }
  if (result.ok && expectedSource && !sourceMatches) {
    problems.push(
      `Latest production Pages source ${latestSource || "(missing)"} does not match expected ${expectedSource}.`,
    );
  }
  return {
    name: "Pages production deployment",
    problems,
    summary: JSON.stringify({
      project,
      deployments_seen: deployments.length,
      latest_id: latestId,
      latest_created_on: latest.created_on || latest.createdOn || "",
      latest_branch: latestBranch,
      latest_source: latestSource,
      expected_source: expectedSource,
      latest_status: latestStatus,
      latest_stage: latest.latest_stage?.name || latest.latestStage?.name || latest.stage || "",
    }),
    details: outputExcerpt(result),
  };
}

function checkD1Info(database) {
  const result = run("npx", ["wrangler", "d1", "info", database, "--json"]);
  const problems = [];
  if (!result.ok) problems.push(`Could not load D1 info for ${database}.`);
  const parsed = parseJson(result.stdout) || {};
  return {
    name: "D1 database info",
    problems,
    summary: JSON.stringify({
      database,
      uuid: parsed.uuid || parsed.id || "",
      name: parsed.name || "",
      version: parsed.version || "",
      file_size: parsed.file_size || parsed.fileSize || "",
    }),
    details: outputExcerpt(result),
  };
}

function checkD1Schema(database) {
  const result = run("node", [
    "scripts/apply_d1_schema_updates.mjs",
    "--database",
    database,
  ]);
  const problems = [];
  if (!result.ok) {
    problems.push("D1 schema updater did not complete; inspect details and apply missing schema updates before launch.");
  }
  if (/missing_column_statements:\s*(?!0\b)\d+/i.test(result.output)) {
    problems.push("D1 has missing required columns; rerun the updater with `--apply --backup-before-apply` after review.");
  }
  return {
    name: "D1 schema drift",
    problems,
    summary: result.ok ? "schema updater completed" : `schema updater exited ${result.status}`,
    details: outputExcerpt(result, 1400),
  };
}

function checkLocalPreflight() {
  const args = ["scripts/preflight_production.mjs", "--package-root", PACKAGE_ROOT];
  const productionManifest = argValue("--production-manifest", process.env.PRODUCTION_MANIFEST || "");
  if (productionManifest) args.push("--production-manifest", productionManifest);
  if (hasFlag("--using-external-manifest-secret")) args.push("--using-external-manifest-secret");
  const result = run("node", args);
  const problems = result.ok ? [] : ["Production preflight still has launch blockers."];
  return {
    name: "Local production preflight",
    problems,
    summary: result.ok ? "PASS" : "FAIL",
    details: outputExcerpt(result, 1400),
  };
}

function checkRandomizationDistribution() {
  const result = run("node", ["scripts/verify_randomization_distribution.mjs"]);
  const problems = result.ok ? [] : ["Constrained-randomization distribution audit failed."];
  return {
    name: "Constrained-randomization distribution",
    problems,
    summary: result.ok ? "PASS (50,000 blocks)" : "FAIL",
    details: outputExcerpt(result, 1400),
  };
}

function checkAudioHosting() {
  const args = [
    "scripts/validate_audio_hosting.mjs",
    "--sample",
    argValue("--audio-sample", "40"),
    "--timeout-ms",
    argValue("--audio-timeout-ms", "8000"),
  ];
  const productionManifest = argValue("--production-manifest", process.env.PRODUCTION_MANIFEST || "");
  if (productionManifest) args.push("--manifest", productionManifest);
  if (hasFlag("--allow-octet-stream")) args.push("--allow-octet-stream");
  if (hasFlag("--audio-structure-only")) args.push("--structure-only");
  const result = run("node", args);
  const problems = result.ok ? [] : ["Audio hosting check still has launch blockers."];
  return {
    name: "Production audio hosting",
    problems,
    summary: result.ok ? "PASS" : "FAIL",
    details: outputExcerpt(result, 1400),
  };
}

function checkLiveDeployment({ apiDryRunStart = false } = {}) {
  const args = ["scripts/check_live_deployment.mjs"];
  if (apiDryRunStart) args.push("--api-dry-run-start");
  if (hasFlag("--allow-turnstile-off")) args.push("--allow-turnstile-off");
  if (hasFlag("--allow-demo-static-manifest")) args.push("--allow-demo-static-manifest");
  const token = argValue("--turnstile-token", process.env.TURNSTILE_TEST_TOKEN || "");
  if (token) args.push("--turnstile-token", token);
  const result = run("node", args);
  const problems = result.ok ? [] : ["Live deployment check still has launch blockers."];
  return {
    name: apiDryRunStart ? "Live deployment and API dry-run" : "Live deployment (non-writing)",
    problems,
    summary: result.ok ? "PASS" : "FAIL",
    details: outputExcerpt(result, 1400),
  };
}

function skippedLiveApiDryRun(reason) {
  return {
    name: "Live deployment and API dry-run",
    problems: [],
    summary: "SKIPPED",
    details: reason,
  };
}

function checkLiveConcurrencyStress() {
  const args = [
    "scripts/stress_live_counterbalance_concurrency.mjs",
    "--participants",
    argValue("--live-stress-participants", "40"),
    "--timeout-ms",
    argValue("--live-stress-timeout-ms", "30000"),
  ];
  const result = run("node", args);
  const problems = result.ok ? [] : ["Live counterbalance concurrency stress test failed."];
  return {
    name: "Live counterbalance concurrency stress",
    problems,
    summary: result.ok ? "PASS" : "FAIL",
    details: outputExcerpt(result, 1800),
  };
}

function blockedTurnstileConcurrencyStress() {
  return {
    name: "Live counterbalance concurrency stress",
    problems: [
      "Concurrency stress cannot reuse a single-use Turnstile token. Run it only in an explicitly documented --allow-turnstile-off pilot/test environment, and keep the Turnstile-required live dry-run as a separate gate.",
    ],
    summary: "BLOCKED",
    details: "No stress requests were sent.",
  };
}

function skippedLiveConcurrencyStress(reason) {
  return {
    name: "Live counterbalance concurrency stress",
    problems: [],
    summary: "SKIPPED",
    details: reason,
  };
}

function markdown(checks, context) {
  const blockers = checks.flatMap((check) => check.problems.map((problem) => ({ ...check, problem })));
  const lines = [
    "# Cloudflare Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Project: \`${context.project}\``,
    `D1 database: \`${context.database}\``,
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
    lines.push("", "## Launch Blockers", "");
    for (const blocker of blockers) lines.push(`- ${blocker.name}: ${blocker.problem}`);
  }
  lines.push("", "## Command Details", "");
  for (const check of checks) {
    if (!check.details) continue;
    lines.push(`### ${check.name}`, "", "```text", check.details, "```", "");
  }
  return `${lines.join("\n")}\n`;
}

const project = argValue("--project-name", DEFAULT_PROJECT);
const database = argValue("--database", DEFAULT_DATABASE);
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const checks = [
  checkWranglerAuth(),
  checkPagesSecrets(project),
  checkPagesDeployments(project),
  checkD1Info(database),
  checkD1Schema(database),
  checkRandomizationDistribution(),
  checkLocalPreflight(),
  checkAudioHosting(),
];
const nonWritingLiveDeploymentCheck = checkLiveDeployment();
checks.push(nonWritingLiveDeploymentCheck);
let liveApiDryRunCheck = null;
if (hasFlag("--api-dry-run-start")) {
  const prewriteBlockers = checks.flatMap((check) => check.problems);
  liveApiDryRunCheck = prewriteBlockers.length
    ? skippedLiveApiDryRun("No production write was attempted because an earlier readiness check failed.")
    : checkLiveDeployment({ apiDryRunStart: true });
} else {
  liveApiDryRunCheck = skippedLiveApiDryRun(
    "Non-writing readiness only. Pass --api-dry-run-start explicitly for the authorized final D1-writing gate.",
  );
}
checks.push(liveApiDryRunCheck);
if (hasFlag("--live-concurrency-stress")) {
  checks.push(
    !hasFlag("--api-dry-run-start") || liveApiDryRunCheck.summary === "SKIPPED" || liveApiDryRunCheck.problems.length
      ? skippedLiveConcurrencyStress("Skipped because the explicitly authorized live API dry-run check did not pass.")
      : hasFlag("--allow-turnstile-off")
        ? checkLiveConcurrencyStress()
        : blockedTurnstileConcurrencyStress(),
  );
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, markdown(checks, { project, database }));
const blockers = checks.flatMap((check) => check.problems.map((problem) => `${check.name}: ${problem}`));
console.log(`cloudflare readiness report: ${out}`);
console.log(`result: ${blockers.length ? "FAIL" : "PASS"}`);
if (blockers.length) {
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}
