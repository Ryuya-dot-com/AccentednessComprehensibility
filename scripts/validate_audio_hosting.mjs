#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULT_MANIFEST = path.join(PACKAGE_ROOT, "remote_manifest.csv");
const DEFAULT_R2_PLAN = path.join(PACKAGE_ROOT, "metadata", "r2_upload_plan.csv");
const DEFAULT_OUT = path.join(PACKAGE_ROOT, "metadata", "AUDIO_HOSTING_CHECK_20260703.md");

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
  const headers = rows[0].map((header) =>
    String(header || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_"),
  );
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function readR2Plan(filePath) {
  if (!fs.existsSync(filePath)) return new Map();
  const rows = readCsv(filePath);
  return new Map(
    rows
      .filter((row) => row.r2_key)
      .map((row) => [row.r2_key, row]),
  );
}

function deterministicSample(rows, size, seedText) {
  if (!size || size >= rows.length) return rows;
  const scored = rows.map((row, index) => ({
    row,
    score: hashString(`${seedText}:${index}:${row.audio_url || row.audio_file || ""}`),
  }));
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, size)
    .map((item) => item.row);
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(row, options) {
  const url = row.audio_url || "";
  const result = {
    audio_file: row.audio_file || "",
    audio_url: url,
    status: "",
    method: "",
    content_type: "",
    content_length: "",
    ok: false,
    problem: "",
  };
  if (!/^https:\/\//i.test(url)) {
    result.problem = "audio_url is missing or not HTTPS";
    return result;
  }

  try {
    let response = await fetchWithTimeout(url, { method: "HEAD", redirect: "manual", cache: "no-store" }, options.timeoutMs);
    result.method = "HEAD";
    if (![200, 206, 304].includes(response.status)) {
      response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          headers: { range: "bytes=0-0" },
        },
        options.timeoutMs,
      );
      result.method = "GET range";
    }
    result.status = String(response.status);
    result.content_type = response.headers.get("content-type") || "";
    result.content_length = response.headers.get("content-length") || "";
    if (![200, 206, 304].includes(response.status)) {
      result.problem = `HTTP ${response.status}`;
      return result;
    }
    const contentTypeOk = /^audio\//i.test(result.content_type) ||
      (options.allowOctetStream && /^application\/octet-stream/i.test(result.content_type));
    if (!contentTypeOk) {
      result.problem = `unexpected content-type: ${result.content_type || "(none)"}`;
      return result;
    }
    result.ok = true;
    return result;
  } catch (error) {
    result.problem = error?.name === "AbortError"
      ? `request timed out after ${options.timeoutMs}ms`
      : String(error?.message || error);
    return result;
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function markdownReport(context, checks, probes) {
  const failures = probes.filter((row) => !row.ok);
  const lines = [
    "# Audio Hosting Check",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Manifest: \`${context.manifest}\``,
    `Rows: ${context.totalRows}`,
    `Checked rows: ${probes.length}`,
    "",
    `Result: ${checks.length || failures.length ? "FAIL" : "PASS"}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of checks) lines.push(`- FAIL ${check}`);
  if (!checks.length) lines.push("- PASS manifest audio_url structure");
  lines.push(`- ${failures.length ? "FAIL" : "PASS"} network probes: ${failures.length} failure row(s)`);
  for (const failure of failures.slice(0, 25)) {
    lines.push(`  - ${failure.audio_file || failure.audio_url}: ${failure.problem}`);
  }
  lines.push("", "## Probe Summary", "");
  const statusCounts = new Map();
  const contentTypeCounts = new Map();
  for (const probe of probes) {
    statusCounts.set(probe.status || "not_requested", (statusCounts.get(probe.status || "not_requested") || 0) + 1);
    contentTypeCounts.set(probe.content_type || "(none)", (contentTypeCounts.get(probe.content_type || "(none)") || 0) + 1);
  }
  lines.push(`- status: ${[...statusCounts.entries()].map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`);
  lines.push(`- content_type: ${[...contentTypeCounts.entries()].map(([key, value]) => `${key}=${value}`).join(", ") || "(none)"}`);
  if (probes.length) {
    lines.push("", "## Checked URLs", "", "| audio_file | status | method | content_type | problem |", "| --- | ---: | --- | --- | --- |");
    for (const probe of probes.slice(0, 200)) {
      lines.push(`| ${probe.audio_file} | ${probe.status} | ${probe.method} | ${probe.content_type} | ${probe.problem} |`);
    }
    if (probes.length > 200) lines.push(`| ... | ... | ... | ... | ${probes.length - 200} more row(s) omitted |`);
  }
  return `${lines.join("\n")}\n`;
}

const manifest = path.resolve(argValue("--manifest", DEFAULT_MANIFEST));
const r2Plan = path.resolve(argValue("--r2-plan", DEFAULT_R2_PLAN));
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const sampleSize = Number.parseInt(argValue("--sample", "0"), 10) || 0;
const limit = Number.parseInt(argValue("--limit", "0"), 10) || 0;
const concurrency = Math.max(1, Number.parseInt(argValue("--concurrency", "8"), 10) || 8);
const timeoutMs = Math.max(1000, Number.parseInt(argValue("--timeout-ms", "15000"), 10) || 15000);
const allowOctetStream = hasFlag("--allow-octet-stream");
const structureOnly = hasFlag("--structure-only");

if (!fs.existsSync(manifest)) {
  console.error(`manifest not found: ${manifest}`);
  process.exit(2);
}

const rows = readCsv(manifest);
const planByKey = readR2Plan(r2Plan);
const checks = [];
if (!rows.length) checks.push("manifest has no rows");
const missingAudioUrl = rows.filter((row) => !row.audio_url);
const nonHttps = rows.filter((row) => row.audio_url && !/^https:\/\//i.test(row.audio_url));
if (missingAudioUrl.length) checks.push(`${missingAudioUrl.length} row(s) have blank audio_url`);
if (nonHttps.length) checks.push(`${nonHttps.length} row(s) have non-HTTPS audio_url`);
if (planByKey.size) {
  const missingFromUploadPlan = rows.filter((row) => row.audio_file && !planByKey.has(row.audio_file));
  if (missingFromUploadPlan.length) {
    checks.push(`${missingFromUploadPlan.length} row(s) are missing from r2_upload_plan.csv`);
  }
}

let probeRows = rows;
if (sampleSize) probeRows = deterministicSample(probeRows, sampleSize, argValue("--seed", "audio-hosting-check"));
if (limit) probeRows = probeRows.slice(0, limit);
let probes = [];
if (!structureOnly) {
  probes = await mapWithConcurrency(probeRows, concurrency, (row) =>
    probeUrl(row, { timeoutMs, allowOctetStream }),
  );
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, markdownReport({ manifest, totalRows: rows.length }, checks, probes), "utf8");

const failures = probes.filter((row) => !row.ok);
console.log(`audio hosting report: ${out}`);
console.log(`result: ${checks.length || failures.length ? "FAIL" : "PASS"}`);
for (const check of checks) console.log(`- ${check}`);
if (failures.length) console.log(`- ${failures.length} network probe failure row(s)`);
if (checks.length || failures.length) process.exit(1);
