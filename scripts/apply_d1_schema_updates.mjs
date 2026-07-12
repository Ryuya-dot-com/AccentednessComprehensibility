#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_DATABASE = "accentedness-comprehensibility";

const REQUIRED_COLUMNS = {
  sessions: [
    ["counterbalance_allocation_id", "TEXT"],
    ["counterbalance_cell", "INTEGER"],
    ["list_comb", "TEXT"],
    ["pronunciation_style", "TEXT"],
    ["session_token_hash", "TEXT"],
    ["turnstile_verified", "INTEGER NOT NULL DEFAULT 0"],
    ["completion_url_issued_at", "TEXT"],
    ["completion_url_issued_count", "INTEGER NOT NULL DEFAULT 0"],
    ["participant_key", "TEXT"],
    ["started_at_ms", "INTEGER NOT NULL DEFAULT 0"],
    ["completed_at_ms", "INTEGER"],
    ["last_seen_at_ms", "INTEGER NOT NULL DEFAULT 0"],
    ["completion_url_issued_at_ms", "INTEGER"],
    ["duplicate_start_count", "INTEGER NOT NULL DEFAULT 0"],
    ["duplicate_start_last_at", "TEXT"],
    ["duplicate_start_last_at_ms", "INTEGER"],
    ["participant_age_years", "INTEGER"],
    ["english_variety", "TEXT"],
    ["english_variety_other", "TEXT"],
    ["gender", "TEXT"],
    ["gender_other", "TEXT"],
    ["english_teaching_experience", "TEXT"],
    ["english_teaching_experience_details", "TEXT"],
    ["linguistics_knowledge", "TEXT"],
    ["linguistics_knowledge_details", "TEXT"],
    ["word_familiarity_required", "INTEGER NOT NULL DEFAULT 0"],
  ],
  rating_assignments: [
    ["counterbalance_cell", "INTEGER"],
    ["list_comb", "TEXT"],
    ["pronunciation_style", "TEXT"],
    ["stimulus_list", "TEXT"],
    ["l1_condition", "TEXT"],
    ["pronunciation_condition", "TEXT"],
    ["block_index", "INTEGER"],
    ["block_list", "TEXT"],
    ["within_block_index", "INTEGER"],
    ["block_trial_count", "INTEGER"],
    ["speaker_pattern_index", "INTEGER"],
    ["speaker_pattern_speaker", "TEXT"],
  ],
  rating_trials: [
    ["counterbalance_cell", "INTEGER"],
    ["list_comb", "TEXT"],
    ["pronunciation_style", "TEXT"],
    ["stimulus_list", "TEXT"],
    ["l1_condition", "TEXT"],
    ["pronunciation_condition", "TEXT"],
    ["block_index", "INTEGER"],
    ["block_list", "TEXT"],
    ["within_block_index", "INTEGER"],
    ["block_trial_count", "INTEGER"],
    ["intelligibility_response_status", "TEXT"],
    ["intelligibility_unidentified", "INTEGER NOT NULL DEFAULT 0"],
    ["response_order", "TEXT"],
    ["first_response_field", "TEXT"],
    ["first_response_rt_ms", "REAL"],
    ["rating_order", "TEXT"],
    ["rating_interaction_sequence", "TEXT"],
    ["first_rating_field", "TEXT"],
    ["first_rating_rt_ms", "REAL"],
    ["comprehensibility_first_rt_ms", "REAL"],
    ["comprehensibility_last_rt_ms", "REAL"],
    ["comprehensibility_selection_count", "INTEGER NOT NULL DEFAULT 0"],
    ["accentedness_first_rt_ms", "REAL"],
    ["accentedness_last_rt_ms", "REAL"],
    ["accentedness_selection_count", "INTEGER NOT NULL DEFAULT 0"],
    ["unidentified_selected_rt_ms", "REAL"],
    ["response_flow", "TEXT"],
    ["dictation_played_at", "TEXT"],
    ["rating_played_at", "TEXT"],
    ["dictation_submit_rt_ms", "REAL"],
    ["rating_submit_rt_ms", "REAL"],
    ["dictation_audio_duration_s", "REAL"],
    ["rating_audio_duration_s", "REAL"],
    ["speaker_pattern_index", "INTEGER"],
    ["speaker_pattern_speaker", "TEXT"],
  ],
};

const REQUIRED_SETUP_SQL = [
  `CREATE TABLE IF NOT EXISTS counterbalance_cells (
  cell_id INTEGER PRIMARY KEY,
  list_comb TEXT NOT NULL,
  pronunciation_style TEXT NOT NULL CHECK(pronunciation_style IN ('a', 'b')),
  UNIQUE(list_comb, pronunciation_style)
)`,
  `CREATE TABLE IF NOT EXISTS counterbalance_allocations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  cell_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  assigned_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(cell_id) REFERENCES counterbalance_cells(cell_id)
)`,
  `INSERT OR IGNORE INTO counterbalance_cells (cell_id, list_comb, pronunciation_style) VALUES
  (1, 'ABCD', 'a'),
  (2, 'BCDE', 'a'),
  (3, 'CDEF', 'a'),
  (4, 'DEFG', 'a'),
  (5, 'EFGH', 'a'),
  (6, 'FGHI', 'a'),
  (7, 'GHIJ', 'a'),
  (8, 'HIJA', 'a'),
  (9, 'IJAB', 'a'),
  (10, 'JABC', 'a'),
  (11, 'ABCD', 'b'),
  (12, 'BCDE', 'b'),
  (13, 'CDEF', 'b'),
  (14, 'DEFG', 'b'),
  (15, 'EFGH', 'b'),
  (16, 'FGHI', 'b'),
  (17, 'GHIJ', 'b'),
  (18, 'HIJA', 'b'),
  (19, 'IJAB', 'b'),
  (20, 'JABC', 'b')`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_status_last_seen_ms
  ON sessions(status, last_seen_at_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_counterbalance
  ON sessions(counterbalance_cell, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_session_unique
  ON sessions(prolific_session_id)
  WHERE prolific_session_id IS NOT NULL AND prolific_session_id != ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_prolific_pid_study_unique
  ON sessions(prolific_pid, prolific_study_id)
  WHERE prolific_pid IS NOT NULL AND prolific_pid != ''
    AND prolific_study_id IS NOT NULL AND prolific_study_id != ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_participant_key_unique
  ON sessions(participant_key)
  WHERE participant_key IS NOT NULL AND participant_key != ''`,
  `CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_cell
  ON counterbalance_allocations(cell_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_counterbalance_allocations_updated
  ON counterbalance_allocations(status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS word_familiarity_responses (
  session_id TEXT NOT NULL,
  word_number INTEGER NOT NULL CHECK(word_number BETWEEN 1 AND 50),
  target_word TEXT NOT NULL,
  word_known INTEGER NOT NULL CHECK(word_known IN (0, 1)),
  submitted_at TEXT NOT NULL,
  submitted_at_ms INTEGER NOT NULL,
  PRIMARY KEY(session_id, word_number),
  FOREIGN KEY(session_id) REFERENCES sessions(id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_word_familiarity_target
  ON word_familiarity_responses(target_word, word_known)`,
];

const REQUIRED_SETUP_TABLES = ["word_familiarity_responses"];

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function usage() {
  return `Usage:
  node scripts/apply_d1_schema_updates.mjs [--database accentedness-comprehensibility] [--remote|--local] [--apply]
  node scripts/apply_d1_schema_updates.mjs --print-sql

Options:
  --database NAME   D1 database name or binding. Default: ${DEFAULT_DATABASE}
  --remote          Use remote D1. Default unless --local is passed.
  --local           Use local D1.
  --apply           Execute missing ALTER/CREATE statements. Without this, report only.
  --backup-before-apply
                   Export D1 to a timestamped SQL backup before applying changes.
  --backup-output PATH
                   Backup SQL path. Default: ./d1-backup-<database>-<timestamp>.sql
  --yes             Pass --yes to wrangler d1 execute.
  --print-sql       Print all guarded schema SQL candidates without contacting Cloudflare.
`;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function wranglerGlobalArgs() {
  const args = [];
  for (const flag of ["--config", "--cwd", "--env", "--profile"]) {
    const value = argValue(flag, "");
    if (value) args.push(flag, value);
  }
  return args;
}

function wranglerModeArgs() {
  return hasFlag("--local") ? ["--local"] : ["--remote"];
}

function wranglerBaseArgs(database, sql, json = true) {
  const args = [
    "wrangler",
    ...wranglerGlobalArgs(),
    "d1",
    "execute",
    database,
    ...wranglerModeArgs(),
    "--command",
    sql,
  ];
  if (json) args.push("--json");
  if (hasFlag("--yes") || hasFlag("--apply")) args.push("--yes");
  return args;
}

function runNpxWrangler(args) {
  return spawnSync("npx", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function requireWranglerAuth() {
  if (hasFlag("--local")) return;
  const result = runNpxWrangler(["wrangler", ...wranglerGlobalArgs(), "whoami"]);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (
    result.status !== 0 ||
    /not authenticated/i.test(output) ||
    /CLOUDFLARE_API_TOKEN/i.test(output)
  ) {
    throw new Error(
      "Wrangler is not authenticated. Run `npx wrangler login` or set `CLOUDFLARE_API_TOKEN` before inspecting or applying remote D1 schema updates.",
    );
  }
}

function runWrangler(database, sql, json = true) {
  const result = runNpxWrangler(wranglerBaseArgs(database, sql, json));
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `wrangler exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function runWranglerFile(database, filePath) {
  const args = [
    "wrangler",
    ...wranglerGlobalArgs(),
    "d1",
    "execute",
    database,
    ...wranglerModeArgs(),
    "--file",
    filePath,
    "--yes",
  ];
  const result = runNpxWrangler(args);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `wrangler exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function backupDatabase(database) {
  const output = path.resolve(
    argValue("--backup-output", `d1-backup-${database}-${timestampForFile()}.sql`),
  );
  const args = [
    "wrangler",
    ...wranglerGlobalArgs(),
    "d1",
    "export",
    database,
    ...wranglerModeArgs(),
    "--output",
    output,
    "--skip-confirmation",
  ];
  const result = runNpxWrangler(args);
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `wrangler d1 export exited with status ${result.status}`);
  }
  console.log(`backup: ${output}`);
}

function extractRows(value) {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === "object" && !Array.isArray(item) && "name" in item)) {
      return value;
    }
    return value.flatMap((item) => extractRows(item));
  }
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.results)) return extractRows(value.results);
  if (Array.isArray(value.result)) return extractRows(value.result);
  if (Array.isArray(value.rows)) return extractRows(value.rows);
  return [];
}

function parseJsonRows(stdout) {
  const parsed = JSON.parse(stdout);
  return extractRows(parsed);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function addColumnSql(table, column, definition) {
  return `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(column)} ${definition}`;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(usage());
    return;
  }

  const database = argValue("--database", DEFAULT_DATABASE);
  const apply = hasFlag("--apply");
  const printSql = hasFlag("--print-sql");
  const allColumnSql = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
    columns.map(([column, definition]) => addColumnSql(table, column, definition)),
  );
  const allSql = [...allColumnSql, ...REQUIRED_SETUP_SQL];

  if (printSql) {
    console.log(allSql.map((sql) => `${sql};`).join("\n\n"));
    return;
  }

  requireWranglerAuth();

  const missingStatements = [];
  const missingTables = [];
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const stdout = runWrangler(database, `PRAGMA table_info(${quoteIdent(table)});`, true);
    const rows = parseJsonRows(stdout);
    if (!rows.length) {
      missingTables.push(table);
      continue;
    }
    const existingColumns = new Set(rows.map((row) => String(row.name || "").toLowerCase()));
    for (const [column, definition] of columns) {
      if (!existingColumns.has(column.toLowerCase())) {
        missingStatements.push(addColumnSql(table, column, definition));
      }
    }
  }

  if (missingTables.length) {
    throw new Error(
      `Core D1 table(s) missing: ${missingTables.join(", ")}. Apply db/schema.sql to the correct database before running this updater.`,
    );
  }

  const missingSetupTables = [];
  for (const table of REQUIRED_SETUP_TABLES) {
    const stdout = runWrangler(database, `PRAGMA table_info(${quoteIdent(table)});`, true);
    if (!parseJsonRows(stdout).length) missingSetupTables.push(table);
  }

  const statements = [...missingStatements, ...REQUIRED_SETUP_SQL];
  console.log(`database: ${database}`);
  console.log(`mode: ${hasFlag("--local") ? "local" : "remote"}`);
  console.log(`missing_column_statements: ${missingStatements.length}`);
  console.log(`missing_setup_tables: ${missingSetupTables.length ? missingSetupTables.join(",") : "none"}`);
  console.log(`setup_statements: ${REQUIRED_SETUP_SQL.length}`);

  if (!missingStatements.length && !apply) {
    console.log(
      missingSetupTables.length
        ? "schema_status: setup tables pending; rerun with --apply after reviewing the statements"
        : "schema_status: no missing columns or setup tables; setup SQL is idempotent",
    );
    for (const statement of REQUIRED_SETUP_SQL) console.log(`${statement};`);
    return;
  }

  if (!apply) {
    console.log("schema_status: pending updates; rerun with --apply after reviewing the statements");
    for (const statement of statements) console.log(`${statement};`);
    return;
  }

  if (hasFlag("--backup-before-apply")) {
    backupDatabase(database);
  } else if (!hasFlag("--local")) {
    console.log("backup: skipped; pass --backup-before-apply to export D1 before applying schema updates");
  }

  const tmpFile = path.join(
    os.tmpdir(),
    `accentedness-d1-schema-updates-${process.pid}-${Date.now()}.sql`,
  );
  fs.writeFileSync(tmpFile, `${statements.map((statement) => `${statement};`).join("\n\n")}\n`, "utf8");
  for (const [index, statement] of statements.entries()) {
    console.log(`planned ${index + 1}/${statements.length}: ${statement.split("\n")[0]}`);
  }
  runWranglerFile(database, tmpFile);
  fs.rmSync(tmpFile, { force: true });
  console.log("schema_status: updates applied");

  let remainingMissing = 0;
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const stdout = runWrangler(database, `PRAGMA table_info(${quoteIdent(table)});`, true);
    const existingColumns = new Set(parseJsonRows(stdout).map((row) => String(row.name || "").toLowerCase()));
    remainingMissing += columns.filter(([column]) => !existingColumns.has(column.toLowerCase())).length;
  }
  console.log(`remaining_missing_columns: ${remainingMissing}`);
  if (remainingMissing) {
    throw new Error("Schema update finished but required columns are still missing.");
  }
  const remainingSetupTables = [];
  for (const table of REQUIRED_SETUP_TABLES) {
    const stdout = runWrangler(database, `PRAGMA table_info(${quoteIdent(table)});`, true);
    if (!parseJsonRows(stdout).length) remainingSetupTables.push(table);
  }
  console.log(
    `remaining_missing_setup_tables: ${remainingSetupTables.length ? remainingSetupTables.join(",") : "none"}`,
  );
  if (remainingSetupTables.length) {
    throw new Error("Schema update finished but required setup tables are still missing.");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
