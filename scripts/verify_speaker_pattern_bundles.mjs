import assert from "node:assert/strict";

import {
  COUNTERBALANCE_CELLS,
  CURRENT_ALLOCATION_STRATEGY_VERSION,
  SPEAKER_PATTERN_BUNDLES,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const LISTS = "ABCDEFGHIJ".split("");
const EXPECTED_REFINED_BUNDLES = [
  [10, 8, 5, 9],
  [6, 1, 9, 10],
  [1, 6, 4, 3],
  [8, 10, 3, 7],
  [3, 5, 6, 2],
  [9, 4, 8, 1],
  [2, 9, 7, 6],
  [4, 7, 10, 5],
  [5, 2, 1, 8],
  [7, 3, 2, 4],
];
const CONDITION_KEYS = [
  "ENG:natural",
  "JPN:natural",
  "JPN:accented",
  "CHN:natural",
  "CHN:accented",
];
const LIST_SPECS = {
  A: { ENG: [1, 2, 3, 4, 5], JPN: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], CHN: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25] },
  B: { ENG: [26, 27, 28, 29, 30], JPN: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40], CHN: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50] },
  C: { ENG: [6, 7, 8, 9, 10], JPN: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], CHN: [21, 22, 23, 24, 25, 1, 2, 3, 4, 5] },
  D: { ENG: [31, 32, 33, 34, 35], JPN: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45], CHN: [46, 47, 48, 49, 50, 26, 27, 28, 29, 30] },
  E: { ENG: [11, 12, 13, 14, 15], JPN: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25], CHN: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  F: { ENG: [36, 37, 38, 39, 40], JPN: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50], CHN: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35] },
  G: { ENG: [16, 17, 18, 19, 20], JPN: [21, 22, 23, 24, 25, 1, 2, 3, 4, 5], CHN: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  H: { ENG: [41, 42, 43, 44, 45], JPN: [46, 47, 48, 49, 50, 26, 27, 28, 29, 30], CHN: [31, 32, 33, 34, 35, 36, 37, 38, 39, 40] },
  I: { ENG: [21, 22, 23, 24, 25], JPN: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], CHN: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] },
  J: { ENG: [46, 47, 48, 49, 50], JPN: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35], CHN: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
};

function speakerIds(l1) {
  const count = l1 === "ENG" ? 5 : 10;
  return Array.from(
    { length: count },
    (_, index) => `${l1.toLowerCase()}_s${String(index + 1).padStart(2, "0")}`,
  );
}

function placeholderMaterials() {
  const materials = [];
  for (const stimulusList of LISTS) {
    for (const wordNumber of LIST_SPECS[stimulusList].ENG) {
      for (const participantId of speakerIds("ENG")) {
        materials.push({
          audio_url: `placeholder/eng/${participantId}/${stimulusList}/word${wordNumber}.wav`,
          target_word: `word${wordNumber}`,
          participant_id: participantId,
          l1_condition: "ENG",
          pronunciation_condition: "natural",
          stimulus_list: stimulusList,
          word_number: String(wordNumber),
          file_name: `${participantId}_${stimulusList}_word${wordNumber}.wav`,
        });
      }
    }
    for (const l1 of ["JPN", "CHN"]) {
      for (const wordNumber of LIST_SPECS[stimulusList][l1]) {
        for (const pronunciation of ["natural", "accented"]) {
          for (const participantId of speakerIds(l1)) {
            materials.push({
              audio_url:
                `placeholder/${l1.toLowerCase()}/${participantId}/${pronunciation}/` +
                `${stimulusList}/word${wordNumber}.wav`,
              target_word: `word${wordNumber}`,
              participant_id: participantId,
              l1_condition: l1,
              pronunciation_condition: pronunciation,
              stimulus_list: stimulusList,
              word_number: String(wordNumber),
              file_name:
                `${participantId}_${pronunciation}_${stimulusList}_word${wordNumber}.wav`,
            });
          }
        }
      }
    }
  }
  return materials;
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function normalizeBundle(row, index) {
  if (Array.isArray(row)) {
    if (row.length === 4) return { bundleId: index + 1, patterns: row.map(Number) };
    if (row.length === 5) return { bundleId: Number(row[0]), patterns: row.slice(1).map(Number) };
  }

  const bundleId = Number(
    firstDefined(row, ["speaker_pattern_bundle", "bundle_id", "bundleId", "id"]),
  );
  const bundledPatterns = firstDefined(row, [
    "patterns",
    "pattern_indexes",
    "speaker_pattern_indexes",
    "block_patterns",
  ]);
  const patterns = Array.isArray(bundledPatterns)
    ? bundledPatterns.map(Number)
    : [1, 2, 3, 4].map((blockIndex) =>
        Number(
          firstDefined(row, [
            `block_${blockIndex}`,
            `block${blockIndex}`,
            `block_${blockIndex}_pattern`,
            `block${blockIndex}Pattern`,
          ]),
        ),
      );
  return { bundleId, patterns };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function countMap(items, keyFor) {
  const counts = new Map();
  for (const item of items) increment(counts, keyFor(item));
  return counts;
}

function assertMapValue(map, key, expected, label) {
  assert.equal(map.get(key) || 0, expected, `${label}: ${key}`);
}

function blockPatternSequence(assignment) {
  return [1, 2, 3, 4].map((blockIndex) => {
    const values = new Set(
      assignment
        .filter((item) => Number(item.block_index) === blockIndex)
        .map((item) => Number(item.speaker_pattern_index)),
    );
    assert.equal(values.size, 1, `block ${blockIndex} must use exactly one speaker pattern`);
    return [...values][0];
  });
}

function maxSameL1Run(items) {
  let previous = "";
  let currentRun = 0;
  let maximumRun = 0;
  for (const item of items) {
    currentRun = item.l1_condition === previous ? currentRun + 1 : 1;
    previous = item.l1_condition;
    maximumRun = Math.max(maximumRun, currentRun);
  }
  return maximumRun;
}

function verifyBundleTable() {
  assert.ok(Array.isArray(SPEAKER_PATTERN_BUNDLES), "SPEAKER_PATTERN_BUNDLES must be an array");
  const bundles = SPEAKER_PATTERN_BUNDLES.map(normalizeBundle).sort(
    (left, right) => left.bundleId - right.bundleId,
  );

  assert.equal(bundles.length, 10, "there must be exactly 10 speaker-pattern bundles");
  assert.deepEqual(
    bundles.map((bundle) => bundle.bundleId),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "bundle IDs must be 1-10",
  );
  assert.deepEqual(
    bundles.map((bundle) => bundle.patterns),
    EXPECTED_REFINED_BUNDLES,
    "the production bundle table must match the adopted refined non-consecutive design",
  );

  for (const bundle of bundles) {
    assert.equal(bundle.patterns.length, 4, `bundle ${bundle.bundleId} must have four blocks`);
    assert.equal(
      new Set(bundle.patterns).size,
      4,
      `bundle ${bundle.bundleId} must not repeat a pattern within a participant`,
    );
    assert.ok(
      bundle.patterns.every((pattern) => Number.isInteger(pattern) && pattern >= 1 && pattern <= 10),
      `bundle ${bundle.bundleId} patterns must be integers 1-10`,
    );
    assert.equal(
      bundle.patterns.filter((pattern) => pattern % 2 === 1).length,
      2,
      `bundle ${bundle.bundleId} must contain two odd and two even patterns`,
    );
  }

  for (let blockIndex = 0; blockIndex < 4; blockIndex += 1) {
    assert.deepEqual(
      bundles.map((bundle) => bundle.patterns[blockIndex]).sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      `Block ${blockIndex + 1} must use patterns 1-10 exactly once`,
    );
  }

  const paritySequences = new Set(
    bundles.map((bundle) => bundle.patterns.map((pattern) => (pattern % 2 ? "O" : "E")).join("")),
  );
  assert.deepEqual(
    [...paritySequences].sort(),
    ["EEOO", "EOEO", "EOOE", "OEEO", "OEOE", "OOEE"],
    "the bundles must cover all six possible 2/2 parity sequences",
  );

  const adjacentPairs = bundles.flatMap((bundle) =>
    bundle.patterns.slice(0, -1).map((pattern, index) => `${pattern}>${bundle.patterns[index + 1]}`),
  );
  assert.equal(adjacentPairs.length, 30, "ten bundles must contain 30 adjacent transitions");
  assert.equal(new Set(adjacentPairs).size, 30, "all 30 adjacent pattern pairs must be distinct");

  const parityTransitions = bundles.flatMap((bundle) =>
    bundle.patterns.slice(0, -1).map((pattern, index) =>
      pattern % 2 === bundle.patterns[index + 1] % 2 ? "same" : "flip",
    ),
  );
  const transitionCounts = countMap(parityTransitions, (transition) => transition);
  assertMapValue(transitionCounts, "same", 12, "bundle parity transition count");
  assertMapValue(transitionCounts, "flip", 18, "bundle parity transition count");

  return bundles;
}

function verifyParticipant(assignment, cell, bundle) {
  const label = `cell ${cell.cell_id}, bundle ${bundle.bundleId}`;
  assert.equal(assignment.length, 100, `${label}: main trial count`);
  assert.deepEqual(blockPatternSequence(assignment), bundle.patterns, `${label}: block pattern sequence`);

  const conditionCounts = countMap(
    assignment,
    (item) => `${item.l1_condition}:${item.pronunciation_condition}`,
  );
  for (const conditionKey of CONDITION_KEYS) {
    assertMapValue(conditionCounts, conditionKey, 20, `${label}: participant condition count`);
  }

  const wordCounts = countMap(assignment, (item) => Number(item.word_number));
  assert.equal(wordCounts.size, 50, `${label}: distinct word count`);
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    assertMapValue(wordCounts, wordNumber, 2, `${label}: participant word count`);
  }

  for (const l1 of ["JPN", "CHN"]) {
    for (const speakerId of speakerIds(l1)) {
      const speakerTrials = assignment.filter(
        (item) => item.l1_condition === l1 && item.participant_id === speakerId,
      );
      const pronunciationCounts = countMap(
        speakerTrials,
        (item) => item.pronunciation_condition,
      );
      assert.equal(speakerTrials.length, 4, `${label}: ${speakerId} total trials`);
      assertMapValue(pronunciationCounts, "natural", 2, `${label}: ${speakerId}`);
      assertMapValue(pronunciationCounts, "accented", 2, `${label}: ${speakerId}`);
    }
  }
  for (const speakerId of speakerIds("ENG")) {
    const speakerTrials = assignment.filter(
      (item) => item.l1_condition === "ENG" && item.participant_id === speakerId,
    );
    assert.equal(speakerTrials.length, 4, `${label}: ${speakerId} total trials`);
    assert.ok(
      speakerTrials.every((item) => item.pronunciation_condition === "natural"),
      `${label}: ${speakerId} must remain natural-only`,
    );
  }

  for (let blockIndex = 1; blockIndex <= 4; blockIndex += 1) {
    const block = assignment.filter((item) => Number(item.block_index) === blockIndex);
    assert.equal(block.length, 25, `${label}: Block ${blockIndex} trial count`);
    assert.ok(maxSameL1Run(block) <= 2, `${label}: Block ${blockIndex} has an L1 run over 2`);
    const blockConditions = countMap(
      block,
      (item) => `${item.l1_condition}:${item.pronunciation_condition}`,
    );
    for (const conditionKey of CONDITION_KEYS) {
      assertMapValue(blockConditions, conditionKey, 5, `${label}: Block ${blockIndex}`);
    }
  }
}

function verifyFullFactorial(bundles) {
  assert.equal(COUNTERBALANCE_CELLS.length, 20, "there must be exactly 20 counterbalance cells");
  const materials = placeholderMaterials();
  const allAssignments = [];
  const firstCell = COUNTERBALANCE_CELLS[0];

  assert.throws(
    () => buildCounterbalancedAssignment(
      materials,
      { ...firstCell, allocation_strategy_version: CURRENT_ALLOCATION_STRATEGY_VERSION },
      "missing-bundle-must-fail",
    ),
    /requires a speaker-pattern bundle/i,
    "the current strategy must fail closed when its bundle is missing",
  );
  assert.throws(
    () => buildCounterbalancedAssignment(
      materials,
      {
        ...firstCell,
        allocation_strategy_version: CURRENT_ALLOCATION_STRATEGY_VERSION,
        speaker_pattern_bundle: 11,
      },
      "invalid-bundle-must-fail",
    ),
    /unknown speaker-pattern bundle/i,
    "the current strategy must reject bundle IDs outside 1-10",
  );
  assert.throws(
    () => buildCounterbalancedAssignment(
      materials,
      { ...firstCell, speaker_pattern_bundle: 1 },
      "unversioned-bundle-must-fail",
    ),
    /requires an allocation strategy version/i,
    "a bundle must never be interpreted without its strategy version",
  );
  assert.equal(
    buildCounterbalancedAssignment(materials, firstCell, "explicit-legacy-compatibility").length,
    100,
    "a legacy cell with neither strategy nor bundle must retain hash-based compatibility",
  );

  for (const cell of COUNTERBALANCE_CELLS) {
    for (const bundle of bundles) {
      const bundledCell = {
        ...cell,
        speaker_pattern_bundle: bundle.bundleId,
        allocation_strategy_version: CURRENT_ALLOCATION_STRATEGY_VERSION,
      };
      const seed = `bundle-verifier:cell-${cell.cell_id}:bundle-${bundle.bundleId}`;
      const assignment = buildCounterbalancedAssignment(materials, bundledCell, seed);
      verifyParticipant(assignment, bundledCell, bundle);

      const alternateSeedAssignment = buildCounterbalancedAssignment(
        materials,
        bundledCell,
        `${seed}:alternate-seed`,
      );
      assert.deepEqual(
        blockPatternSequence(alternateSeedAssignment),
        bundle.patterns,
        `cell ${cell.cell_id}, bundle ${bundle.bundleId}: seed must not change bundle patterns`,
      );
      allAssignments.push(...assignment);
    }
  }

  assert.equal(allAssignments.length, 20_000, "200 participants must yield 20,000 main trials");

  const wordConditionCounts = countMap(
    allAssignments,
    (item) => `${Number(item.word_number)}:${item.l1_condition}:${item.pronunciation_condition}`,
  );
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    for (const conditionKey of CONDITION_KEYS) {
      assertMapValue(
        wordConditionCounts,
        `${wordNumber}:${conditionKey}`,
        80,
        "full-cycle word-condition count",
      );
    }
  }

  const tokenCounts = countMap(
    allAssignments,
    (item) =>
      `${Number(item.word_number)}:${item.l1_condition}:${item.participant_id}:` +
      `${item.pronunciation_condition}`,
  );
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    for (const speakerId of speakerIds("ENG")) {
      assertMapValue(
        tokenCounts,
        `${wordNumber}:ENG:${speakerId}:natural`,
        16,
        "full-cycle ENG token count",
      );
    }
    for (const l1 of ["JPN", "CHN"]) {
      for (const speakerId of speakerIds(l1)) {
        for (const pronunciation of ["natural", "accented"]) {
          assertMapValue(
            tokenCounts,
            `${wordNumber}:${l1}:${speakerId}:${pronunciation}`,
            8,
            `full-cycle ${l1} token count`,
          );
        }
      }
    }
  }

  assert.equal(
    tokenCounts.size,
    2_250,
    "full cycle must contain exactly 250 ENG and 2,000 JPN/CHN lexical audio tokens",
  );

  return {
    counterbalance_cells: COUNTERBALANCE_CELLS.length,
    speaker_pattern_bundles: bundles.length,
    participant_allocations: COUNTERBALANCE_CELLS.length * bundles.length,
    main_trials: allAssignments.length,
    word_condition_cells: wordConditionCounts.size,
    lexical_audio_tokens: tokenCounts.size,
    expected_non_eng_token_replications: 8,
    expected_eng_token_replications: 16,
  };
}

const bundles = verifyBundleTable();
const summary = verifyFullFactorial(bundles);
console.log(JSON.stringify({ status: "PASS", ...summary }, null, 2));
