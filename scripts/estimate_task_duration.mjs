#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  COUNTERBALANCE_CELLS,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DEFAULT_PACKAGE_ROOT = path.join(PROJECT_ROOT, "Stimuli_OSF_Release_20260703");
const DEFAULT_MANIFEST = path.join(DEFAULT_PACKAGE_ROOT, "remote_manifest.csv");
const DEFAULT_AUDIO_QC = path.join(DEFAULT_PACKAGE_ROOT, "metadata", "audio_qc_by_file.csv");
const DEFAULT_OUT_DIR = path.join(DEFAULT_PACKAGE_ROOT, "metadata");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
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
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function writeCsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function fmt(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits);
}

function materialFromRow(row, index) {
  return {
    ...row,
    id: index + 1,
    audio_url: row.audio_url || row.audio_file || row.osf_audio_file || row.new_relative_path,
    file_name: path.basename(row.audio_file || row.osf_audio_file || row.new_relative_path || ""),
  };
}

function durationLookup(audioQcRows) {
  const lookup = new Map();
  for (const row of audioQcRows) {
    const duration = Number.parseFloat(row.duration_s || row.decoded_duration_s || "");
    if (!Number.isFinite(duration)) continue;
    if (row.relative_path) lookup.set(row.relative_path, duration);
  }
  return lookup;
}

function selectedPracticeDuration(audioQcRows) {
  const selected = audioQcRows.filter((row) => row.asset_role === "selected_practice_app_asset");
  return selected.reduce((sum, row) => sum + Number.parseFloat(row.duration_s || "0"), 0);
}

function assignmentAudioDuration(assignment, durations) {
  let total = 0;
  const missing = [];
  for (const item of assignment) {
    const key = item.audio_file || item.osf_audio_file || item.source_path || "";
    const duration = durations.get(key);
    if (!Number.isFinite(duration)) {
      missing.push(key);
    } else {
      total += duration;
    }
  }
  return { total, missing };
}

function summarize(rows, keyColumns) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyColumns.map((column) => row[column]).join("\u001f");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const [key, group] of groups) {
    const values = group.map((row) => Number.parseFloat(row.required_audio_playback_s));
    out.push({
      ...Object.fromEntries(keyColumns.map((column, index) => [column, key.split("\u001f")[index] || ""])),
      sample_count: String(group.length),
      required_audio_playback_min_s: fmt(Math.min(...values)),
      required_audio_playback_mean_s: fmt(mean(values)),
      required_audio_playback_p50_s: fmt(quantile(values, 0.5)),
      required_audio_playback_p95_s: fmt(quantile(values, 0.95)),
      required_audio_playback_max_s: fmt(Math.max(...values)),
      required_audio_playback_mean_min: fmt(mean(values) / 60, 2),
    });
  }
  return out.sort((a, b) => {
    for (const column of keyColumns) {
      const diff = Number(a[column]) - Number(b[column]);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      const textDiff = String(a[column]).localeCompare(String(b[column]));
      if (textDiff) return textDiff;
    }
    return 0;
  });
}

function reportText(summaryRows, options) {
  const all = summaryRows.find((row) => row.scope === "overall");
  const lines = [
    "# Task Duration Estimate",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Basis",
    "",
    `- Manifest: \`${options.manifest}\`.`,
    `- Audio QC table: \`${options.audioQc}\`.`,
    `- Seeds per cell: ${options.seedsPerCell}.`,
    `- Required plays per main trial: ${options.mainPlaysPerTrial}.`,
    `- Required plays per practice trial: ${options.practicePlaysPerTrial}.`,
    "",
    "The staged implementation requires one playback for dictation and one playback for rating. This estimate is therefore an audio-playback lower bound; it excludes instructions, reading time, typing, rating decisions, pauses, distractors, network latency, and questionnaires.",
    "",
    "## Overall Audio Lower Bound",
    "",
  ];
  if (all) {
    lines.push(
      `- Mean required audio playback: ${all.required_audio_playback_mean_s} s (${all.required_audio_playback_mean_min} min).`,
      `- Range across sampled cell/seed assignments: ${all.required_audio_playback_min_s}-${all.required_audio_playback_max_s} s.`,
      `- 95th percentile: ${all.required_audio_playback_p95_s} s.`,
    );
  }
  lines.push(
    "",
    "## Interpretation",
    "",
    "The design estimate of about 50 minutes for the main rating task is not contradicted by audio duration alone, because required audio playback is only a small fraction of total participant time. A Cloudflare/Prolific dry run is still required to set `MIN_COMPLETION_SECONDS` and compensation using real typing, rating, distractor, and questionnaire behavior.",
    "",
    "## Outputs",
    "",
    "- `duration_estimate_by_cell_seed.csv`",
    "- `duration_estimate_summary.csv`",
  );
  return `${lines.join("\n")}\n`;
}

const manifest = path.resolve(argValue("--manifest", DEFAULT_MANIFEST));
const audioQc = path.resolve(argValue("--audio-qc", DEFAULT_AUDIO_QC));
const outDir = path.resolve(argValue("--out-dir", DEFAULT_OUT_DIR));
const seedsPerCell = Number.parseInt(argValue("--seeds-per-cell", "50"), 10);
const mainPlaysPerTrial = Number.parseFloat(argValue("--main-plays-per-trial", "2"));
const practicePlaysPerTrial = Number.parseFloat(argValue("--practice-plays-per-trial", "2"));

const manifestRows = parseCsv(fs.readFileSync(manifest, "utf8"));
const materials = manifestRows.map(materialFromRow);
const audioQcRows = parseCsv(fs.readFileSync(audioQc, "utf8"));
const durations = durationLookup(audioQcRows);
const practiceAudioDuration = selectedPracticeDuration(audioQcRows);
const rows = [];
const missingDurations = new Set();

for (const cell of COUNTERBALANCE_CELLS) {
  for (let seedIndex = 1; seedIndex <= seedsPerCell; seedIndex += 1) {
    const seed = `duration-estimate:${cell.cell_id}:${seedIndex}`;
    const assignment = buildCounterbalancedAssignment(materials, cell, seed);
    const { total, missing } = assignmentAudioDuration(assignment, durations);
    for (const key of missing) missingDurations.add(key);
    const mainRequired = total * mainPlaysPerTrial;
    const practiceRequired = practiceAudioDuration * practicePlaysPerTrial;
    rows.push({
      scope: "cell_seed",
      counterbalance_cell: String(cell.cell_id),
      list_comb: cell.list_comb,
      pronunciation_style: cell.pronunciation_style,
      seed_index: String(seedIndex),
      main_trial_count: String(assignment.length),
      practice_trial_count: "4",
      main_audio_unique_s: fmt(total),
      practice_audio_unique_s: fmt(practiceAudioDuration),
      main_required_audio_playback_s: fmt(mainRequired),
      practice_required_audio_playback_s: fmt(practiceRequired),
      required_audio_playback_s: fmt(mainRequired + practiceRequired),
      required_audio_playback_min: fmt((mainRequired + practiceRequired) / 60, 2),
    });
  }
}

if (missingDurations.size) {
  throw new Error(`Missing audio durations: ${[...missingDurations].slice(0, 10).join(", ")}`);
}

const detailColumns = [
  "scope",
  "counterbalance_cell",
  "list_comb",
  "pronunciation_style",
  "seed_index",
  "main_trial_count",
  "practice_trial_count",
  "main_audio_unique_s",
  "practice_audio_unique_s",
  "main_required_audio_playback_s",
  "practice_required_audio_playback_s",
  "required_audio_playback_s",
  "required_audio_playback_min",
];
const summaryRows = [
  ...summarize(rows, ["counterbalance_cell", "pronunciation_style"]).map((row) => ({
    scope: "cell",
    ...row,
  })),
  ...summarize(rows, ["pronunciation_style"]).map((row) => ({
    scope: "style",
    ...row,
  })),
  ...summarize(rows.map((row) => ({ ...row, overall: "all" })), ["overall"]).map((row) => ({
    scope: "overall",
    ...row,
  })),
];
const summaryColumns = [
  "scope",
  "counterbalance_cell",
  "pronunciation_style",
  "overall",
  "sample_count",
  "required_audio_playback_min_s",
  "required_audio_playback_mean_s",
  "required_audio_playback_p50_s",
  "required_audio_playback_p95_s",
  "required_audio_playback_max_s",
  "required_audio_playback_mean_min",
];

writeCsv(path.join(outDir, "duration_estimate_by_cell_seed.csv"), rows, detailColumns);
writeCsv(path.join(outDir, "duration_estimate_summary.csv"), summaryRows, summaryColumns);
fs.writeFileSync(
  path.join(outDir, "DURATION_ESTIMATE_REPORT_20260703.md"),
  reportText(summaryRows, { manifest, audioQc, seedsPerCell, mainPlaysPerTrial, practicePlaysPerTrial }),
);

const overall = summaryRows.find((row) => row.scope === "overall");
console.log(`detail: ${path.join(outDir, "duration_estimate_by_cell_seed.csv")}`);
console.log(`summary: ${path.join(outDir, "duration_estimate_summary.csv")}`);
console.log(`report: ${path.join(outDir, "DURATION_ESTIMATE_REPORT_20260703.md")}`);
console.log(`samples: ${rows.length}`);
if (overall) {
  console.log(`audio playback mean seconds: ${overall.required_audio_playback_mean_s}`);
  console.log(`audio playback range seconds: ${overall.required_audio_playback_min_s}-${overall.required_audio_playback_max_s}`);
}
