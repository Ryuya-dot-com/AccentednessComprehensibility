#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://accentednesscomprehensibility.pages.dev";
const DEFAULT_OUT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "Stimuli_OSF_Release_20260703",
  "metadata",
  "LIVE_DEPLOYMENT_CHECK_20260703.md",
);

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
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
  const response = await fetch(url, { redirect: "manual" });
  const text = await response.text();
  return { url: url.toString(), response, text };
}

async function fetchHead(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { method: "HEAD", redirect: "manual" });
  return { url: url.toString(), response };
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
    problems: checkSecurityHeaders(index.response, "index"),
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

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, markdown(checks, { baseUrl }));
const blockers = checks.flatMap((check) => check.problems.map((problem) => `${check.name}: ${problem}`));
console.log(`live deployment report: ${out}`);
console.log(`result: ${blockers.length ? "FAIL" : "PASS"}`);
if (blockers.length) {
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}
