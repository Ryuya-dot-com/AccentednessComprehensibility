#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const DEFAULT_PACKAGE_ROOT = defaultPackageRoot();
const DEFAULT_SOURCE = path.join(DEFAULT_PACKAGE_ROOT, "remote_manifest.csv");
const DEFAULT_R2_PLAN = path.join(DEFAULT_PACKAGE_ROOT, "metadata", "r2_upload_plan.csv");
const DEFAULT_OUT = path.join(DEFAULT_PACKAGE_ROOT, "remote_manifest_production_hosted_20260703.csv");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function packageRootLooksUsable(packageRoot) {
  return fs.existsSync(path.join(packageRoot, "remote_manifest.csv")) ||
    fs.existsSync(path.join(packageRoot, "metadata", "selected_practice_manifest.csv"));
}

function defaultPackageRoot() {
  const adjacentRoot = path.join(PROJECT_ROOT, "Stimuli_OSF_Release_20260703");
  if (packageRootLooksUsable(DROPBOX_PACKAGE_ROOT)) return DROPBOX_PACKAGE_ROOT;
  if (packageRootLooksUsable(adjacentRoot)) return adjacentRoot;
  return adjacentRoot;
}

function parseCsvWithHeaders(text) {
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
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((header) => String(header || "").replace(/^\uFEFF/, "").trim());
  const data = rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  return { headers, rows: data };
}

function readCsv(filePath) {
  return parseCsvWithHeaders(fs.readFileSync(filePath, "utf8"));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(filePath, headers, rows) {
  const body = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(",")),
  ].join("\n");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${body}\n`, "utf8");
}

function readR2PlanKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const { rows } = readCsv(filePath);
  return new Set(rows.map((row) => row.r2_key).filter(Boolean));
}

function normalizeBaseUrl(value) {
  const baseUrl = String(value || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error("--audio-base-url must be an HTTPS URL.");
  }
  return baseUrl;
}

function buildHostedRows(rows, baseUrl) {
  const missingAudioFile = [];
  const hostedRows = rows.map((row, index) => {
    const audioFile = String(row.audio_file || "").trim().replace(/^\/+/, "");
    if (!audioFile) missingAudioFile.push(index + 2);
    return {
      ...row,
      audio_file: audioFile,
      audio_url: audioFile ? `${baseUrl}/${audioFile.split("/").map(encodeURIComponent).join("/")}` : "",
    };
  });
  if (missingAudioFile.length) {
    throw new Error(`audio_file is blank in row(s): ${missingAudioFile.slice(0, 20).join(", ")}`);
  }
  return hostedRows;
}

function main() {
  const source = path.resolve(argValue("--source", DEFAULT_SOURCE));
  const out = path.resolve(argValue("--out", DEFAULT_OUT));
  const r2Plan = path.resolve(argValue("--r2-plan", DEFAULT_R2_PLAN));
  const audioBaseUrl = normalizeBaseUrl(argValue("--audio-base-url"));
  const requireR2Plan = !hasFlag("--allow-missing-r2-plan");
  if (!fs.existsSync(source)) throw new Error(`source manifest not found: ${source}`);

  const { headers: sourceHeaders, rows } = readCsv(source);
  if (!rows.length) throw new Error(`source manifest has no rows: ${source}`);
  const headers = sourceHeaders.includes("audio_url")
    ? sourceHeaders
    : ["audio_url", ...sourceHeaders];
  const hostedRows = buildHostedRows(rows, audioBaseUrl);

  const planKeys = readR2PlanKeys(r2Plan);
  if (requireR2Plan && !planKeys.size) {
    throw new Error(`R2 upload plan is missing or empty: ${r2Plan}`);
  }
  if (planKeys.size) {
    const missingFromPlan = hostedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !planKeys.has(row.audio_file));
    if (missingFromPlan.length) {
      throw new Error(
        `${missingFromPlan.length} manifest row(s) are missing from R2 upload plan; first row number: ${missingFromPlan[0].index + 2}`,
      );
    }
  }

  writeCsv(out, headers, hostedRows);
  console.log(`source: ${source}`);
  console.log(`hosted manifest: ${out}`);
  console.log(`rows: ${hostedRows.length}`);
  console.log(`audio_base_url: ${audioBaseUrl}`);
  console.log(`r2_plan_keys: ${planKeys.size}`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
