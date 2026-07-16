import { cleanText, nullableText, safeJson } from "./_utils.js";

const L1_ORDER = ["ENG", "JPN", "CHN"];
const CONSTRAINED_RUN_L1 = new Set(L1_ORDER);
const MAX_CONSTRAINED_RUN = 2;
const MAX_CONSTRAINED_SHUFFLE_ATTEMPTS = 200;
const SPEAKER_PATTERN_COUNT = 10;
export const CURRENT_ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1";
const SPEAKER_PATTERN_SPEAKER_COUNT = {
  ENG: 5,
  JPN: 10,
  CHN: 10,
};
const SPEAKER_PATTERN_PREFIX = {
  ENG: "eng",
  JPN: "jpn",
  CHN: "chn",
};
const LIST_COMBINATIONS = [
  "ABCD",
  "BCDE",
  "CDEF",
  "DEFG",
  "EFGH",
  "FGHI",
  "GHIJ",
  "HIJA",
  "IJAB",
  "JABC",
];
const DEFAULT_COUNTERBALANCE_MANIFEST = "remote_manifest.csv";
const PRACTICE_CALIBRATION_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
export const CURRENT_PRACTICE_SET_ID = "practice_calibration_v0.10.1";
export const CANONICAL_PRACTICE_ASSIGNMENT = Object.freeze([
  Object.freeze({
    practice_set_id: CURRENT_PRACTICE_SET_ID,
    phase: "practice",
    trial_index: 1,
    target_word: "appreciation",
    audio_url: `${PRACTICE_CALIBRATION_AUDIO_ROOT}/eng_female_appreciation_practice.wav`,
    file_name: "ENG_Female_appreciation_Practice.wav",
    participant_id: "practice_eng_female",
    native_language: "ENG",
    l1_condition: "ENG",
    accent_condition: "natural",
    pronunciation_condition: "natural",
    condition: "practice_natural",
    talker: "practice_eng_female",
    word_number: "1",
    trial_number: "1",
    spoken_form: "appreciation",
    practice_note: "Researcher-provided calibration WAV. Expert Accentedness reference range: 1–2. Expert Comprehensibility reference range: 1–2.",
    source_format: "researcher_provided_calibration_wav",
    practice_kind: "combined",
    practice_group: "reference_acc_1_2_comp_1_2",
    expert_comprehensibility_range: "1–2",
    expert_accentedness_range: "1–2",
  }),
  Object.freeze({
    practice_set_id: CURRENT_PRACTICE_SET_ID,
    phase: "practice",
    trial_index: 2,
    target_word: "pesticide",
    audio_url: `${PRACTICE_CALIBRATION_AUDIO_ROOT}/jpn_male_pesticide_practice.wav`,
    file_name: "JPN_Male_pesticide.wav",
    participant_id: "practice_jpn_male",
    native_language: "JPN",
    l1_condition: "JPN",
    accent_condition: "accented",
    pronunciation_condition: "accented",
    condition: "practice_accented",
    talker: "practice_jpn_male",
    word_number: "2",
    trial_number: "2",
    spoken_form: "pesticide",
    practice_note: "Researcher-provided calibration WAV. Expert Accentedness reference range: 2–3. Expert Comprehensibility reference range: 1–2.",
    source_format: "researcher_provided_calibration_wav",
    practice_kind: "combined",
    practice_group: "reference_acc_2_3_comp_1_2",
    expert_comprehensibility_range: "1–2",
    expert_accentedness_range: "2–3",
  }),
  Object.freeze({
    practice_set_id: CURRENT_PRACTICE_SET_ID,
    phase: "practice",
    trial_index: 3,
    target_word: "quality",
    audio_url: `${PRACTICE_CALIBRATION_AUDIO_ROOT}/jpn_female_quality_practice.wav`,
    file_name: "JPN_Female_quality_Practice.wav",
    participant_id: "practice_jpn_female",
    native_language: "JPN",
    l1_condition: "JPN",
    accent_condition: "accented",
    pronunciation_condition: "accented",
    condition: "practice_accented",
    talker: "practice_jpn_female",
    word_number: "3",
    trial_number: "3",
    spoken_form: "quality",
    practice_note: "Researcher-provided calibration WAV. Expert Accentedness reference range: 4–5. Expert Comprehensibility reference range: 2–3.",
    source_format: "researcher_provided_calibration_wav",
    practice_kind: "combined",
    practice_group: "reference_acc_4_5_comp_2_3",
    expert_comprehensibility_range: "2–3",
    expert_accentedness_range: "4–5",
  }),
  Object.freeze({
    practice_set_id: CURRENT_PRACTICE_SET_ID,
    phase: "practice",
    trial_index: 4,
    target_word: "organizer",
    audio_url: `${PRACTICE_CALIBRATION_AUDIO_ROOT}/chn_female_organizer_practice.wav`,
    file_name: "CHN_Female_Organizer_Practice.wav",
    participant_id: "practice_chn_female",
    native_language: "CHN",
    l1_condition: "CHN",
    accent_condition: "accented",
    pronunciation_condition: "accented",
    condition: "practice_accented",
    talker: "practice_chn_female",
    word_number: "4",
    trial_number: "4",
    spoken_form: "organizer",
    practice_note: "Researcher-provided calibration WAV. Expert Accentedness reference range: 4–6. Expert Comprehensibility reference range: 5–7.",
    source_format: "researcher_provided_calibration_wav",
    practice_kind: "combined",
    practice_group: "reference_acc_4_6_comp_5_7",
    expert_comprehensibility_range: "5–7",
    expert_accentedness_range: "4–6",
  }),
  Object.freeze({
    practice_set_id: CURRENT_PRACTICE_SET_ID,
    phase: "practice",
    trial_index: 5,
    target_word: "balloon",
    audio_url: `${PRACTICE_CALIBRATION_AUDIO_ROOT}/chn_male_balloon_practice.wav`,
    file_name: "CHN_Male_Balloon_Practice.wav",
    participant_id: "practice_chn_male",
    native_language: "CHN",
    l1_condition: "CHN",
    accent_condition: "accented",
    pronunciation_condition: "accented",
    condition: "practice_accented",
    talker: "practice_chn_male",
    word_number: "5",
    trial_number: "5",
    spoken_form: "balloon",
    practice_note: "Researcher-provided calibration WAV. Expert Accentedness reference range: 6–8. Expert Comprehensibility reference range: 4–6.",
    source_format: "researcher_provided_calibration_wav",
    practice_kind: "combined",
    practice_group: "reference_acc_6_8_comp_4_6",
    expert_comprehensibility_range: "4–6",
    expert_accentedness_range: "6–8",
  }),
]);
const MANIFEST_FILE_COLUMNS = [
  "audio_file",
  "osf_audio_file",
  "standardized_audio_file",
  "new_relative_path",
  "file",
  "filename",
  "path",
];
const MANIFEST_URL_COLUMNS = ["audio_url", "url", "source_url", "raw_url"];
const DRY_RUN_PLACEHOLDER_AUDIO = {
  ENG: [
    CANONICAL_PRACTICE_ASSIGNMENT[0].audio_url,
  ],
  JPN: [
    CANONICAL_PRACTICE_ASSIGNMENT[1].audio_url,
    CANONICAL_PRACTICE_ASSIGNMENT[2].audio_url,
  ],
  CHN: [
    CANONICAL_PRACTICE_ASSIGNMENT[3].audio_url,
    CANONICAL_PRACTICE_ASSIGNMENT[4].audio_url,
  ],
};

const LIST_SPECS = {
  A: { ENG: range(1, 5), JPN: range(6, 15), CHN: range(16, 25) },
  B: { ENG: range(26, 30), JPN: range(31, 40), CHN: range(41, 50) },
  C: { ENG: range(6, 10), JPN: range(11, 20), CHN: [...range(21, 25), ...range(1, 5)] },
  D: { ENG: range(31, 35), JPN: range(36, 45), CHN: [...range(46, 50), ...range(26, 30)] },
  E: { ENG: range(11, 15), JPN: range(16, 25), CHN: range(1, 10) },
  F: { ENG: range(36, 40), JPN: range(41, 50), CHN: range(26, 35) },
  G: { ENG: range(16, 20), JPN: [...range(21, 25), ...range(1, 5)], CHN: range(6, 15) },
  H: { ENG: range(41, 45), JPN: [...range(46, 50), ...range(26, 30)], CHN: range(31, 40) },
  I: { ENG: range(21, 25), JPN: range(1, 10), CHN: range(11, 20) },
  J: { ENG: range(46, 50), JPN: range(26, 35), CHN: range(36, 45) },
};

export const COUNTERBALANCE_CELLS = [
  ...LIST_COMBINATIONS.map((listComb, index) => ({
    cell_id: index + 1,
    list_comb: listComb,
    pronunciation_style: "a",
  })),
  ...LIST_COMBINATIONS.map((listComb, index) => ({
    cell_id: index + 11,
    list_comb: listComb,
    pronunciation_style: "b",
  })),
];

export const SPEAKER_PATTERN_BUNDLES = Object.freeze([
  Object.freeze({ speaker_pattern_bundle: 1, patterns: Object.freeze([10, 8, 5, 9]) }),
  Object.freeze({ speaker_pattern_bundle: 2, patterns: Object.freeze([6, 1, 9, 10]) }),
  Object.freeze({ speaker_pattern_bundle: 3, patterns: Object.freeze([1, 6, 4, 3]) }),
  Object.freeze({ speaker_pattern_bundle: 4, patterns: Object.freeze([8, 10, 3, 7]) }),
  Object.freeze({ speaker_pattern_bundle: 5, patterns: Object.freeze([3, 5, 6, 2]) }),
  Object.freeze({ speaker_pattern_bundle: 6, patterns: Object.freeze([9, 4, 8, 1]) }),
  Object.freeze({ speaker_pattern_bundle: 7, patterns: Object.freeze([2, 9, 7, 6]) }),
  Object.freeze({ speaker_pattern_bundle: 8, patterns: Object.freeze([4, 7, 10, 5]) }),
  Object.freeze({ speaker_pattern_bundle: 9, patterns: Object.freeze([5, 2, 1, 8]) }),
  Object.freeze({ speaker_pattern_bundle: 10, patterns: Object.freeze([7, 3, 2, 4]) }),
]);

const SPEAKER_PATTERN_BUNDLE_BY_ID = new Map(
  SPEAKER_PATTERN_BUNDLES.map((bundle) => [bundle.speaker_pattern_bundle, bundle]),
);

export function speakerPatternIndexesForBundle(value) {
  const bundle = SPEAKER_PATTERN_BUNDLE_BY_ID.get(Number(value));
  return bundle ? bundle.patterns.slice() : null;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function hashString(value) {
  let h = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seedText) {
  const out = items.slice();
  const rng = mulberry32(hashString(seedText));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function itemL1(item) {
  return cleanText(item.l1_condition || item.native_language).toUpperCase();
}

function hasLongConstrainedRun(items) {
  let previous = "";
  let runLength = 0;
  for (const item of items) {
    const current = itemL1(item);
    if (current === previous) {
      runLength += 1;
    } else {
      previous = current;
      runLength = 1;
    }
    if (CONSTRAINED_RUN_L1.has(current) && runLength > MAX_CONSTRAINED_RUN) {
      return true;
    }
  }
  return false;
}

export function constrainedShuffleByL1(items, seedText) {
  for (let attempt = 0; attempt < MAX_CONSTRAINED_SHUFFLE_ATTEMPTS; attempt += 1) {
    const attemptSeed = attempt === 0 ? seedText : `${seedText}:rejection:${attempt}`;
    const candidate = shuffle(items, attemptSeed);
    if (!hasLongConstrainedRun(candidate)) return candidate;
  }

  throw new Error(
    `Could not create a randomized order without 3 consecutive same-L1 trials after ${MAX_CONSTRAINED_SHUFFLE_ATTEMPTS} attempts.`,
  );
}

function pickOne(items, seedText) {
  if (!items.length) return null;
  const rng = mulberry32(hashString(seedText));
  return items[Math.floor(rng() * items.length)];
}

function sheet2PatternIndex(seedText, cell, stimulusList, blockIndex) {
  const strategyVersion = cleanText(cell.allocation_strategy_version);
  const bundleId = Number(cell.speaker_pattern_bundle);
  if (strategyVersion === CURRENT_ALLOCATION_STRATEGY_VERSION) {
    if (!Number.isInteger(bundleId)) {
      throw new Error("The current allocation strategy requires a speaker-pattern bundle.");
    }
    const bundle = SPEAKER_PATTERN_BUNDLE_BY_ID.get(bundleId);
    if (!bundle) throw new Error(`Unknown speaker-pattern bundle: ${bundleId}`);
    return bundle.patterns[blockIndex - 1];
  }
  if (strategyVersion) {
    throw new Error(`Unsupported counterbalance allocation strategy: ${strategyVersion}`);
  }
  if (Number.isInteger(bundleId)) {
    throw new Error("A speaker-pattern bundle requires an allocation strategy version.");
  }
  return (hashString(`${seedText}:${cell.cell_id}:${stimulusList}:speaker-pattern:${blockIndex}`) % SPEAKER_PATTERN_COUNT) + 1;
}

function speakerPatternTarget(l1, wordPositionWithinL1, patternIndex) {
  const speakerCount = SPEAKER_PATTERN_SPEAKER_COUNT[l1] || 0;
  const prefix = SPEAKER_PATTERN_PREFIX[l1] || l1.toLowerCase();
  if (!speakerCount || !wordPositionWithinL1 || !patternIndex) return null;
  const speakerIndex = ((wordPositionWithinL1 - 1 + patternIndex - 1) % speakerCount) + 1;
  return {
    speaker_id: `${prefix}_s${String(speakerIndex).padStart(2, "0")}`,
    label: `${l1}${speakerIndex}`,
  };
}

function normalizeSpeakerId(value) {
  return cleanText(value).toLowerCase();
}

function candidatesForSpeakerPattern(candidates, target) {
  if (!target?.speaker_id) return candidates;
  const matched = candidates.filter((item) => item._speaker_id === target.speaker_id);
  if (matched.length) return matched;
  if (candidates.every((item) => item.source_format === "dry_run_placeholder")) return candidates;
  return [];
}

function readField(row, names) {
  for (const name of names) {
    const normalized = name.toLowerCase();
    if (row?.[name] !== undefined && cleanText(row[name])) return cleanText(row[name]);
    if (row?.[normalized] !== undefined && cleanText(row[normalized])) {
      return cleanText(row[normalized]);
    }
  }
  return "";
}

function normalizeHeader(value) {
  return cleanText(value)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "");

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
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
  if (row.some((value) => cleanText(value))) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows
    .slice(1)
    .filter((values) => values.some((value) => cleanText(value)))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

function fileNameFromPath(value, fallback) {
  const name = cleanText(value).replaceAll("\\", "/").split("/").pop();
  return name || fallback;
}

function resolveManifestUrl(value, manifestUrl) {
  const text = cleanText(value);
  if (!text) return "";
  try {
    return new URL(text, manifestUrl).toString();
  } catch (error) {
    return text;
  }
}

function allowedCounterbalanceHosts(env) {
  return cleanText(env?.COUNTERBALANCE_ALLOWED_HOSTS || env?.COUNTERBALANCE_MANIFEST_ALLOWED_HOSTS)
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowedCounterbalanceUrl(url, label, context, allowSameOriginHttp = true) {
  const requestUrl = new URL(context.request.url);
  const parsed = new URL(url, requestUrl.origin);
  const sameOrigin = parsed.origin === requestUrl.origin;
  if (parsed.protocol !== "https:" && !(allowSameOriginHttp && sameOrigin)) {
    throw new Error(`${label} must use https.`);
  }
  const allowedHosts = allowedCounterbalanceHosts(context.env);
  if (allowedHosts.length && !sameOrigin && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} host is not allowed.`);
  }
}

function manifestRowToMaterial(row, manifestUrl, index) {
  const directUrl = readField(row, MANIFEST_URL_COLUMNS);
  const filePath = readField(row, MANIFEST_FILE_COLUMNS);
  const audioSource = directUrl || filePath;
  const audioUrl = resolveManifestUrl(audioSource, manifestUrl);
  const l1Raw = readField(row, [
    "l1_condition",
    "l1",
    "native_language",
    "native",
    "speaker_l1",
  ]);
  const pronunciationRaw = readField(row, [
    "pronunciation_condition",
    "pronunciation",
    "accent_condition",
    "accent",
    "style",
  ]);
  const l1 = normalizeL1(l1Raw) || l1Raw;
  const pronunciation = normalizePronunciation(pronunciationRaw) || pronunciationRaw;
  const sourcePath = filePath || audioUrl;
  const fileName = fileNameFromPath(sourcePath || audioUrl, `server_manifest_${index + 1}.wav`);

  return {
    id: index + 1,
    file: undefined,
    source_path: sourcePath,
    audio_url: audioUrl,
    file_name: fileName,
    target_word: readField(row, ["target_word", "word", "item", "expected_word"]),
    participant_id: readField(row, [
      "participant_id",
      "participant",
      "proposed_speaker_id",
      "l1_speaker_id",
      "speaker_id",
      "speaker",
    ]),
    native_language: l1,
    l1_condition: l1,
    pronunciation_condition: pronunciation,
    accent_condition: pronunciation,
    condition: readField(row, ["condition", "pass_condition", "variability_condition"]),
    talker: readField(row, ["talker", "global_speaker_id", "talker_id", "voice", "voice_alias"]),
    pass_number: readField(row, ["pass_number", "pass"]),
    word_number: readField(row, ["word_number", "word_id", "item_id", "word_no"]),
    trial_number: readField(row, ["trial_number", "trial"]),
    take_number: readField(row, ["take_number", "take"]),
    spoken_form: readField(row, ["spoken_form", "spoken_text", "prompt"]),
    practice_note: readField(row, ["practice_note", "note", "notes"]),
    source_format: readField(row, ["source_format"]) || "server_manifest",
    stimulus_list: readField(row, ["stimulus_list", "list", "list_id", "counterbalance_list"]).toUpperCase(),
  };
}

async function fetchManifest(context, source) {
  const requestUrl = new URL(context.request.url);
  const resolved = new URL(source, requestUrl.origin);
  const isRelative = !/^https?:\/\//i.test(source);
  if (!isRelative) {
    assertAllowedCounterbalanceUrl(resolved.toString(), "Counterbalance manifest URL", context, false);
  }

  if (isRelative && context.env?.ASSETS?.fetch) {
    const assetUrl = new URL(`${resolved.pathname}${resolved.search}`, requestUrl.origin);
    return {
      response: await context.env.ASSETS.fetch(new Request(assetUrl.toString())),
      resolvedUrl: assetUrl.toString(),
    };
  }

  return {
    response: await fetch(new Request(resolved.toString(), {
      headers: { "cache-control": "no-store" },
    })),
    resolvedUrl: resolved.toString(),
  };
}

export function normalizeL1(value) {
  const text = cleanText(value).toLowerCase();
  if (["eng", "english", "native_english", "ame", "american", "us", "usa"].includes(text)) {
    return "ENG";
  }
  if (["jpn", "jp", "japanese", "japan"].includes(text)) return "JPN";
  if (["chn", "cn", "zh", "chinese", "china", "mandarin"].includes(text)) return "CHN";
  return "";
}

export function normalizePronunciation(value) {
  const text = cleanText(value).toLowerCase().replace(/[_\s-]+/g, "");
  if (["natural", "nat", "native", "nativelike"].includes(text)) return "natural";
  if (["accented", "accent", "strongaccent", "mildaccent", "nonnative"].includes(text)) {
    return "accented";
  }
  return "";
}

function expectedPronunciation(l1, wordNumber, pronunciationStyle, wordNumbers = []) {
  if (l1 === "ENG") return "natural";
  const index = wordNumbers.indexOf(wordNumber);
  if (index < 0) throw new Error(`Word number ${wordNumber} is not in the current ${l1} list.`);
  const evenPosition = index % 2 === 0;
  const evenPositionNatural = pronunciationStyle === "a";
  return evenPosition === evenPositionNatural ? "natural" : "accented";
}

function normalizeMaterial(item, index) {
  const wordNumber = Number.parseInt(
    readField(item, ["word_number", "word_id", "item_id", "word_no"]),
    10,
  );
  const l1 = normalizeL1(
    readField(item, ["l1_condition", "l1", "native_language", "native", "speaker_l1"]),
  );
  const pronunciation = normalizePronunciation(
    readField(item, [
      "pronunciation_condition",
      "pronunciation",
      "accent_condition",
      "accent",
      "style",
    ]),
  );
  const stimulusList = cleanText(
    readField(item, ["stimulus_list", "list", "list_id", "counterbalance_list"]),
  ).toUpperCase();
  const speakerId = normalizeSpeakerId(
    readField(item, [
      "participant_id",
      "participant",
      "proposed_speaker_id",
      "l1_speaker_id",
      "speaker_id",
      "speaker",
    ]),
  );
  return {
    ...item,
    _source_index: index,
    _word_number_number: Number.isFinite(wordNumber) ? wordNumber : null,
    _l1_condition: l1,
    _pronunciation_condition: pronunciation,
    _stimulus_list: /^[A-J]$/.test(stimulusList) ? stimulusList : "",
    _speaker_id: speakerId,
  };
}

function materialMatches(material, stimulusList, l1, wordNumber, expected) {
  if (material._stimulus_list && material._stimulus_list !== stimulusList) return false;
  if (material._l1_condition !== l1) return false;
  if (material._word_number_number !== wordNumber) return false;
  if (l1 === "ENG") {
    return material._pronunciation_condition === "natural";
  }
  return material._pronunciation_condition === expected;
}

function canonicalizeAssignmentItem(item, metadata) {
  return {
    ...item,
    file: undefined,
    phase: "main",
    practice_kind: "",
    practice_group: "",
    counterbalance_cell: String(metadata.cell.cell_id),
    list_comb: metadata.cell.list_comb,
    pronunciation_style: metadata.cell.pronunciation_style,
    speaker_pattern_bundle: metadata.cell.speaker_pattern_bundle || null,
    allocation_strategy_version: metadata.cell.allocation_strategy_version || null,
    allocation_cohort: metadata.cell.allocation_cohort || null,
    stimulus_list: metadata.stimulus_list,
    l1_condition: metadata.l1,
    pronunciation_condition: metadata.expected_pronunciation,
    native_language: metadata.l1,
    accent_condition: metadata.expected_pronunciation,
    word_number: String(metadata.word_number),
    block_index: metadata.block_index,
    block_list: metadata.stimulus_list,
    speaker_pattern_index: metadata.speaker_pattern_index,
    speaker_pattern_speaker: metadata.speaker_pattern_speaker,
  };
}

export async function ensureCounterbalanceCells(db) {
  const statements = COUNTERBALANCE_CELLS.map((cell) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO counterbalance_cells (
          cell_id, list_comb, pronunciation_style
        ) VALUES (?, ?, ?)`,
      )
      .bind(cell.cell_id, cell.list_comb, cell.pronunciation_style),
  );
  await db.batch(statements);
}

export async function ensureSpeakerPatternBundles(db) {
  const statements = SPEAKER_PATTERN_BUNDLES.map((bundle) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO speaker_pattern_bundles (
          allocation_strategy_version, speaker_pattern_bundle,
          block_1_pattern, block_2_pattern, block_3_pattern, block_4_pattern
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        CURRENT_ALLOCATION_STRATEGY_VERSION,
        bundle.speaker_pattern_bundle,
        ...bundle.patterns,
      ),
  );
  await db.batch(statements);
  const stored = await db
    .prepare(
      `SELECT speaker_pattern_bundle, block_1_pattern, block_2_pattern,
              block_3_pattern, block_4_pattern
       FROM speaker_pattern_bundles
       WHERE allocation_strategy_version = ?
       ORDER BY speaker_pattern_bundle`,
    )
    .bind(CURRENT_ALLOCATION_STRATEGY_VERSION)
    .all();
  const rows = stored.results || [];
  const exact = rows.length === SPEAKER_PATTERN_BUNDLES.length &&
    SPEAKER_PATTERN_BUNDLES.every((expected, index) => {
      const actual = rows[index] || {};
      return Number(actual.speaker_pattern_bundle) === expected.speaker_pattern_bundle &&
        expected.patterns.every(
          (pattern, blockIndex) => Number(actual[`block_${blockIndex + 1}_pattern`]) === pattern,
        );
    });
  if (!exact) {
    throw new Error("Stored speaker-pattern bundles do not match the deployed allocation strategy.");
  }
}

export async function loadCounterbalanceMaterials(context) {
  const configuredSource = cleanText(context.env?.COUNTERBALANCE_MANIFEST_URL);
  const source = configuredSource || DEFAULT_COUNTERBALANCE_MANIFEST;
  const { response, resolvedUrl } = await fetchManifest(context, source);

  if (!response.ok) {
    throw new Error(`Could not load server counterbalance manifest (${response.status}).`);
  }

  const rows = parseCsv(await response.text());
  const materials = rows
    .map((row, index) => manifestRowToMaterial(row, resolvedUrl, index))
    .filter((item) => item.audio_url);

  if (!materials.length) {
    throw new Error("Server counterbalance manifest contains no playable audio rows.");
  }
  materials.forEach((item) => {
    assertAllowedCounterbalanceUrl(item.audio_url, "Counterbalance audio URL", context);
  });

  return {
    materials,
    summary: {
      source: configuredSource ? "COUNTERBALANCE_MANIFEST_URL" : DEFAULT_COUNTERBALANCE_MANIFEST,
      row_count: rows.length,
      material_count: materials.length,
    },
  };
}

function dryRunPlaceholderAudio(l1, wordNumber) {
  const pool = DRY_RUN_PLACEHOLDER_AUDIO[l1] || DRY_RUN_PLACEHOLDER_AUDIO.ENG;
  return pool[(wordNumber - 1) % pool.length];
}

export function dryRunPlaceholderCounterbalanceMaterials(context, fallbackReason = "") {
  const origin = new URL(context.request.url).origin;
  const materials = [];
  for (const [stimulusList, spec] of Object.entries(LIST_SPECS)) {
    for (const l1 of L1_ORDER) {
      const wordNumbers = spec[l1] || [];
      for (const wordNumber of wordNumbers) {
        const pronunciations = l1 === "ENG" ? ["natural"] : ["natural", "accented"];
        for (const pronunciation of pronunciations) {
          const audioPath = dryRunPlaceholderAudio(l1, wordNumber);
          const targetWord = `dryrun_${stimulusList.toLowerCase()}_${l1.toLowerCase()}_${wordNumber}_${pronunciation}`;
          materials.push({
            id: materials.length + 1,
            source_path: audioPath,
            audio_url: new URL(audioPath, origin).toString(),
            file_name: fileNameFromPath(audioPath, `dry_run_${materials.length + 1}.wav`),
            target_word: targetWord,
            participant_id: `dryrun_${l1.toLowerCase()}`,
            native_language: l1,
            l1_condition: l1,
            pronunciation_condition: pronunciation,
            accent_condition: pronunciation,
            condition: "dry_run_placeholder",
            talker: `dryrun_${l1.toLowerCase()}`,
            pass_number: "",
            word_number: String(wordNumber),
            trial_number: String(wordNumber),
            take_number: "",
            spoken_form: targetWord,
            practice_note: "Dry-run placeholder stimulus",
            source_format: "dry_run_placeholder",
            stimulus_list: stimulusList,
          });
        }
      }
    }
  }
  return {
    materials,
    summary: {
      source: "dry_run_placeholder",
      row_count: materials.length,
      material_count: materials.length,
      fallback_reason: cleanText(fallbackReason),
    },
  };
}

export async function allocateCounterbalance(db, sessionId, assignedAt, options = {}) {
  await ensureCounterbalanceCells(db);
  await ensureSpeakerPatternBundles(db);
  const allocationId = crypto.randomUUID();
  const dryRun = Boolean(options.dryRun);
  const allocationStrategyVersion = cleanText(
    options.allocationStrategyVersion || CURRENT_ALLOCATION_STRATEGY_VERSION,
  );
  const allocationCohort = cleanText(options.allocationCohort);
  if (allocationStrategyVersion !== CURRENT_ALLOCATION_STRATEGY_VERSION) {
    throw new Error(`Unsupported counterbalance allocation strategy: ${allocationStrategyVersion}`);
  }
  if (!allocationCohort) throw new Error("Counterbalance allocation cohort is required.");
  const startedStatus = dryRun ? "dry_run_started" : "started";
  const completedStatus = dryRun ? "dry_run_completed" : "completed";
  const candidateCount = COUNTERBALANCE_CELLS.length * SPEAKER_PATTERN_BUNDLES.length;
  const tieBreakerOffset = hashString(sessionId) % candidateCount;
  const allocationInsert = db
    .prepare(
      `WITH scoped AS (
        SELECT cell_id, speaker_pattern_bundle, status
        FROM counterbalance_allocations
        WHERE allocation_cohort = ?
          AND allocation_strategy_version = ?
      ),
      cell_stats AS (
        SELECT
          cell_id,
          SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed,
          COUNT(*) AS historical
        FROM scoped
        GROUP BY cell_id
      ),
      combination_stats AS (
        SELECT
          cell_id,
          speaker_pattern_bundle,
          SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed,
          COUNT(*) AS historical
        FROM scoped
        GROUP BY cell_id, speaker_pattern_bundle
      ),
      bundle_stats AS (
        SELECT
          speaker_pattern_bundle,
          SUM(CASE WHEN status IN (?, ?) THEN 1 ELSE 0 END) AS active_completed,
          SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS completed
        FROM scoped
        GROUP BY speaker_pattern_bundle
      )
      INSERT INTO counterbalance_allocations (
        id, session_id, cell_id, speaker_pattern_bundle,
        allocation_strategy_version, allocation_cohort,
        status, assigned_at, updated_at
      )
      SELECT ?, ?, c.cell_id, b.speaker_pattern_bundle, ?, ?, ?, ?, ?
      FROM counterbalance_cells c
      CROSS JOIN speaker_pattern_bundles b
      LEFT JOIN cell_stats cs ON cs.cell_id = c.cell_id
      LEFT JOIN combination_stats cbs
        ON cbs.cell_id = c.cell_id
       AND cbs.speaker_pattern_bundle = b.speaker_pattern_bundle
      LEFT JOIN bundle_stats bs
        ON bs.speaker_pattern_bundle = b.speaker_pattern_bundle
      WHERE b.allocation_strategy_version = ?
      ORDER BY
        COALESCE(cs.active_completed, 0) ASC,
        COALESCE(cs.completed, 0) ASC,
        COALESCE(cbs.active_completed, 0) ASC,
        COALESCE(cbs.completed, 0) ASC,
        COALESCE(bs.active_completed, 0) ASC,
        COALESCE(bs.completed, 0) ASC,
        COALESCE(cs.historical, 0) ASC,
        COALESCE(cbs.historical, 0) ASC,
        ((((c.cell_id - 1) * ${SPEAKER_PATTERN_COUNT}) +
          (b.speaker_pattern_bundle - 1) + ?) % ${candidateCount}) ASC,
        c.cell_id ASC,
        b.speaker_pattern_bundle ASC
      LIMIT 1`,
    )
    .bind(
      allocationCohort,
      allocationStrategyVersion,
      startedStatus,
      completedStatus,
      completedStatus,
      startedStatus,
      completedStatus,
      completedStatus,
      startedStatus,
      completedStatus,
      completedStatus,
      allocationId,
      sessionId,
      allocationStrategyVersion,
      allocationCohort,
      startedStatus,
      assignedAt,
      assignedAt,
      allocationStrategyVersion,
      tieBreakerOffset,
    );

  const allocationSelect = db
    .prepare(
      `SELECT
        ca.id AS allocation_id,
        c.cell_id,
        c.list_comb,
        c.pronunciation_style,
        ca.speaker_pattern_bundle,
        ca.allocation_strategy_version,
        ca.allocation_cohort,
        b.block_1_pattern,
        b.block_2_pattern,
        b.block_3_pattern,
        b.block_4_pattern
       FROM counterbalance_allocations ca
       JOIN counterbalance_cells c ON c.cell_id = ca.cell_id
       JOIN speaker_pattern_bundles b
         ON b.allocation_strategy_version = ca.allocation_strategy_version
        AND b.speaker_pattern_bundle = ca.speaker_pattern_bundle
       WHERE ca.id = ?`,
    )
    .bind(allocationId);
  const [, selectionResult] = await db.batch([allocationInsert, allocationSelect]);
  const row = selectionResult?.results?.[0];

  if (!row) {
    throw new Error("Could not allocate a counterbalance cell.");
  }
  return {
    allocation_id: row.allocation_id,
    cell_id: Number(row.cell_id),
    list_comb: row.list_comb,
    pronunciation_style: row.pronunciation_style,
    speaker_pattern_bundle: Number(row.speaker_pattern_bundle),
    allocation_strategy_version: row.allocation_strategy_version,
    allocation_cohort: row.allocation_cohort,
    speaker_pattern_indexes: [
      Number(row.block_1_pattern),
      Number(row.block_2_pattern),
      Number(row.block_3_pattern),
      Number(row.block_4_pattern),
    ],
  };
}

function assertBundledAssignmentInvariants(assignment, cell) {
  const bundle = SPEAKER_PATTERN_BUNDLE_BY_ID.get(Number(cell.speaker_pattern_bundle));
  if (!bundle) return;
  if (assignment.length !== 100) {
    throw new Error(`Bundled counterbalance assignment must contain 100 main trials; got ${assignment.length}.`);
  }

  for (let blockIndex = 1; blockIndex <= 4; blockIndex += 1) {
    const block = assignment.filter((item) => Number(item.block_index) === blockIndex);
    const patterns = new Set(block.map((item) => Number(item.speaker_pattern_index)));
    if (block.length !== 25 || patterns.size !== 1 || !patterns.has(bundle.patterns[blockIndex - 1])) {
      throw new Error(`Speaker-pattern bundle invariant failed for block ${blockIndex}.`);
    }
  }

  for (const l1 of ["JPN", "CHN"]) {
    for (let speakerIndex = 1; speakerIndex <= SPEAKER_PATTERN_SPEAKER_COUNT[l1]; speakerIndex += 1) {
      const label = `${l1}${speakerIndex}`;
      const trials = assignment.filter(
        (item) => item.l1_condition === l1 && item.speaker_pattern_speaker === label,
      );
      const natural = trials.filter((item) => item.pronunciation_condition === "natural").length;
      const accented = trials.filter((item) => item.pronunciation_condition === "accented").length;
      if (trials.length !== 4 || natural !== 2 || accented !== 2) {
        throw new Error(`${label} must have exactly two natural and two accented trials.`);
      }
    }
  }
}

export function buildCounterbalancedAssignment(materials, cell, seedText) {
  if (!Array.isArray(materials) || !materials.length) {
    throw new Error("counterbalance materials are required.");
  }
  const normalized = materials.map(normalizeMaterial);
  const blocks = [];
  const missing = [];

  for (const [listIndex, stimulusList] of cell.list_comb.split("").entries()) {
    const spec = LIST_SPECS[stimulusList];
    if (!spec) throw new Error(`Unknown counterbalance list: ${stimulusList}`);
    const speakerPatternIndex = sheet2PatternIndex(seedText, cell, stimulusList, listIndex + 1);
    const blockItems = [];
    for (const l1 of L1_ORDER) {
      const wordNumbers = spec[l1];
      for (const [wordPositionIndex, wordNumber] of wordNumbers.entries()) {
        const expected = expectedPronunciation(
          l1,
          wordNumber,
          cell.pronunciation_style,
          wordNumbers,
        );
        const speakerTarget = speakerPatternTarget(l1, wordPositionIndex + 1, speakerPatternIndex);
        const candidates = candidatesForSpeakerPattern(
          normalized.filter((item) =>
            materialMatches(item, stimulusList, l1, wordNumber, expected),
          ),
          speakerTarget,
        );
        const picked = pickOne(
          candidates,
          `${seedText}:${cell.cell_id}:${stimulusList}:${l1}:${wordNumber}:${expected}:speaker:${speakerTarget?.speaker_id || ""}`,
        );
        if (!picked) {
          missing.push(`${stimulusList}/${l1}/word${wordNumber}/${expected}/${speakerTarget?.speaker_id || "any_speaker"}`);
          continue;
        }
        blockItems.push(
          canonicalizeAssignmentItem(picked, {
            cell,
            stimulus_list: stimulusList,
            block_index: listIndex + 1,
            l1,
            word_number: wordNumber,
            expected_pronunciation: expected,
            speaker_pattern_index: speakerPatternIndex,
            speaker_pattern_speaker: speakerTarget?.label || "",
          }),
        );
      }
    }
    const shuffledBlock = constrainedShuffleByL1(
      blockItems,
      `${seedText}:${cell.cell_id}:block:${listIndex + 1}:${stimulusList}`,
    );
    blocks.push(
      shuffledBlock.map((item, index) => ({
        ...item,
        within_block_index: index + 1,
        block_trial_count: shuffledBlock.length,
      })),
    );
  }

  if (missing.length) {
    throw new Error(`Missing counterbalance materials: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", ..." : ""}`);
  }

  const assignment = blocks.flat().map((item, index) => ({
    ...item,
    trial_index: index + 1,
  }));
  assertBundledAssignmentInvariants(assignment, cell);
  return assignment;
}

export function counterbalancePayload(cell) {
  if (!cell) return null;
  return {
    allocation_id: nullableText(cell.allocation_id),
    counterbalance_cell: cell.cell_id,
    list_comb: cell.list_comb,
    pronunciation_style: cell.pronunciation_style,
    speaker_pattern_bundle: cell.speaker_pattern_bundle || null,
    allocation_strategy_version: nullableText(cell.allocation_strategy_version),
    allocation_cohort: nullableText(cell.allocation_cohort),
    speaker_pattern_indexes: Array.isArray(cell.speaker_pattern_indexes)
      ? cell.speaker_pattern_indexes.map(Number)
      : null,
  };
}

export function safeMaterialsJson(materialsOrSummary) {
  if (Array.isArray(materialsOrSummary)) {
    return safeJson({ material_count: materialsOrSummary.length });
  }
  return safeJson(materialsOrSummary || { material_count: 0 });
}
