import fs from "node:fs";
import path from "node:path";
import {
  COUNTERBALANCE_CELLS,
  CURRENT_ALLOCATION_STRATEGY_VERSION,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
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
  const headers = rows[0].map(normalizeHeader);
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function materialFromRow(row, index) {
  return {
    ...row,
    id: index + 1,
    audio_url: row.audio_url || row.audio_file || row.osf_audio_file || row.new_relative_path,
    file_name: path.basename(row.audio_file || row.osf_audio_file || row.new_relative_path || ""),
  };
}

function rowContainsAme(row) {
  return Object.values(row).some((value) => /\bAME\b/i.test(String(value || "")));
}

function validateRows(rows, options) {
  assert(rows.length > 0, "manifest has no rows");
  const required = [
    "audio_file",
    "target_word",
    "participant_id",
    "l1_condition",
    "pronunciation_condition",
    "word_number",
    "talker",
    "take_number",
  ];
  const missingColumns = required.filter((column) => !(column in rows[0]));
  assert(!missingColumns.length, `missing required columns: ${missingColumns.join(", ")}`);

  const badLabels = [];
  const missingFiles = [];
  rows.forEach((row, index) => {
    const l1 = row.l1_condition;
    const pronunciation = row.pronunciation_condition;
    if (!["ENG", "JPN", "CHN"].includes(l1)) {
      badLabels.push(`row ${index + 2}: l1_condition=${l1}`);
    }
    if (!["natural", "accented"].includes(pronunciation)) {
      badLabels.push(`row ${index + 2}: pronunciation_condition=${pronunciation}`);
    }
    if (l1 === "ENG" && pronunciation !== "natural") {
      badLabels.push(`row ${index + 2}: ENG must be natural, got ${pronunciation}`);
    }
    if (rowContainsAme(row)) {
      badLabels.push(`row ${index + 2}: contains legacy AME label`);
    }
    const wordNumber = Number.parseInt(row.word_number, 10);
    if (!Number.isInteger(wordNumber) || wordNumber < 1 || wordNumber > 50) {
      badLabels.push(`row ${index + 2}: word_number=${row.word_number}`);
    }
    if (options.audioRoot) {
      const source = row.audio_file || row.osf_audio_file || row.new_relative_path;
      if (source && !/^https?:\/\//i.test(source)) {
        const resolved = path.resolve(options.audioRoot, source);
        if (!fs.existsSync(resolved)) missingFiles.push(source);
      }
    }
  });
  assert(!badLabels.length, `label problems:\n${badLabels.slice(0, 30).join("\n")}`);
  assert(
    !missingFiles.length,
    `missing audio files:\n${missingFiles.slice(0, 30).join("\n")}`,
  );
}

function validateWordNumberMapping(rows) {
  const wordsByNumber = new Map();
  for (const row of rows) {
    const wordNumber = String(Number.parseInt(row.word_number, 10));
    const targetWord = String(row.target_word || "").trim().toLowerCase();
    if (!wordsByNumber.has(wordNumber)) wordsByNumber.set(wordNumber, new Set());
    wordsByNumber.get(wordNumber).add(targetWord);
  }
  const bad = [];
  for (const [wordNumber, words] of [...wordsByNumber.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (words.size !== 1) {
      bad.push(`word_number ${wordNumber}: ${[...words].sort().join(", ")}`);
    }
  }
  assert(
    !bad.length,
    `word_number must be the CounterBalance lexical item number, but multiple target words were found:\n${bad.slice(0, 20).join("\n")}`,
  );
}

function assertNoLongL1Run(items, label) {
  let previous = "";
  let runLength = 0;
  for (const item of items) {
    const current = item.l1_condition;
    runLength = current === previous ? runLength + 1 : 1;
    previous = current;
    if (["ENG", "JPN", "CHN"].includes(current) && runLength > 2) {
      throw new Error(`${label}: found ${current} run of ${runLength}`);
    }
  }
}

function speakerIdFromPatternLabel(label) {
  const match = String(label || "").match(/^(ENG|JPN|CHN)(\d+)$/);
  if (!match) return "";
  return `${match[1].toLowerCase()}_s${String(Number(match[2])).padStart(2, "0")}`;
}

function assertSpeakerPattern(block, label) {
  const patternIndexes = new Set(block.map((item) => String(item.speaker_pattern_index || "")));
  assert(
    patternIndexes.size === 1 && !patternIndexes.has(""),
    `${label}: block does not have exactly one Sheet2 speaker_pattern_index`,
  );
  for (const item of block) {
    const expectedSpeakerId = speakerIdFromPatternLabel(item.speaker_pattern_speaker);
    assert(expectedSpeakerId, `${label}: missing speaker_pattern_speaker`);
    assert(
      String(item.participant_id || "").toLowerCase() === expectedSpeakerId,
      `${label}: expected ${expectedSpeakerId} for ${item.speaker_pattern_speaker}, got ${item.participant_id}`,
    );
  }
}

function validateAssignments(materials) {
  for (const cell of COUNTERBALANCE_CELLS) {
    for (let speakerPatternBundle = 1; speakerPatternBundle <= 10; speakerPatternBundle += 1) {
      const bundledCell = {
        ...cell,
        speaker_pattern_bundle: speakerPatternBundle,
        allocation_strategy_version: CURRENT_ALLOCATION_STRATEGY_VERSION,
      };
      const assignment = buildCounterbalancedAssignment(
        materials,
        bundledCell,
        `production-validator:${cell.cell_id}:bundle:${speakerPatternBundle}`,
      );
      assert(
        assignment.length === 100,
        `cell ${cell.cell_id} bundle ${speakerPatternBundle}: expected 100 trials, got ${assignment.length}`,
      );
      const blocks = new Map();
      assignment.forEach((item) => {
        const key = String(item.block_index);
        if (!blocks.has(key)) blocks.set(key, []);
        blocks.get(key).push(item);
      });
      assert(
        blocks.size === 4,
        `cell ${cell.cell_id} bundle ${speakerPatternBundle}: expected 4 blocks, got ${blocks.size}`,
      );
      for (let blockIndex = 1; blockIndex <= 4; blockIndex += 1) {
        const block = blocks.get(String(blockIndex)) || [];
        const label = `cell ${cell.cell_id} bundle ${speakerPatternBundle} block ${blockIndex}`;
        assert(block.length === 25, `${label}: expected 25 trials, got ${block.length}`);
        assertNoLongL1Run(block, label);
        assertSpeakerPattern(block, label);
        const counts = block.reduce((acc, item) => {
          acc[item.l1_condition] = (acc[item.l1_condition] || 0) + 1;
          return acc;
        }, {});
        assert(
          counts.ENG === 5 && counts.JPN === 10 && counts.CHN === 10,
          `${label}: wrong L1 counts ${JSON.stringify(counts)}`,
        );
      }
    }
  }
}

const manifest = argValue("--manifest");
if (!manifest) {
  console.error("Usage: node scripts/validate_production_manifest.mjs --manifest PATH [--audio-root PATH]");
  process.exit(2);
}

const rows = parseCsv(fs.readFileSync(manifest, "utf8"));
const options = {
  audioRoot: argValue("--audio-root", ""),
  strictFiles: hasFlag("--strict-files"),
};

validateRows(rows, options);
validateWordNumberMapping(rows);
validateAssignments(rows.map(materialFromRow));

console.log(`manifest: ${path.resolve(manifest)}`);
console.log(`rows: ${rows.length}`);
console.log(`cells_validated: ${COUNTERBALANCE_CELLS.length}`);
console.log(`speaker_pattern_bundles_validated: 10`);
console.log(`cell_bundle_allocations_validated: ${COUNTERBALANCE_CELLS.length * 10}`);
console.log("production manifest validation ok");
