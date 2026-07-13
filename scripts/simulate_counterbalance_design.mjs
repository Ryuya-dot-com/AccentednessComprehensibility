import {
  COUNTERBALANCE_CELLS,
  CURRENT_ALLOCATION_STRATEGY_VERSION,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const LISTS = "ABCDEFGHIJ".split("");
const DROPOUT_RATES = [0, 0.1, 0.2, 0.35];
const WAVE_SIZES = [100, 250, 400];
const ROLLING_COMPLETED_TARGETS = [100, 200, 250];
const CORRELATED_DROPOUT_CELLS = new Set([1, 7, 14]);
const SPEAKER_PATTERN_BUNDLE_IDS = Array.from({ length: 10 }, (_, index) => index + 1);

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

function placeholderMaterials() {
  const materials = [];
  const speakerIds = (l1) => {
    const count = l1 === "ENG" ? 5 : 10;
    const prefix = l1.toLowerCase();
    return Array.from({ length: count }, (_, index) => `${prefix}_s${String(index + 1).padStart(2, "0")}`);
  };
  for (const stimulusList of LISTS) {
    for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
      const word = `word${String(wordNumber).padStart(3, "0")}`;
      for (const participantId of speakerIds("ENG")) {
        materials.push({
          audio_url: `placeholder/eng/${participantId}/${stimulusList}/${word}.wav`,
          target_word: word,
          participant_id: participantId,
          l1_condition: "ENG",
          pronunciation_condition: "natural",
          stimulus_list: stimulusList,
          word_number: String(wordNumber),
          file_name: `${participantId}_${stimulusList}_${word}.wav`,
        });
      }

      for (const pronunciation of ["natural", "accented"]) {
        for (const l1 of ["JPN", "CHN"]) {
          for (const participantId of speakerIds(l1)) {
            materials.push({
              audio_url: `placeholder/${l1.toLowerCase()}/${participantId}/${pronunciation}/${stimulusList}/${word}.wav`,
              target_word: word,
              participant_id: participantId,
              l1_condition: l1,
              pronunciation_condition: pronunciation,
              stimulus_list: stimulusList,
              word_number: String(wordNumber),
              file_name: `${participantId}_${pronunciation}_${stimulusList}_${word}.wav`,
            });
          }
        }
      }
    }
  }
  return materials;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function maxSameL1Run(items) {
  let previous = "";
  let run = 0;
  let maxRun = 0;
  for (const item of items) {
    const current = item.l1_condition;
    run = current === previous ? run + 1 : 1;
    previous = current;
    maxRun = Math.max(maxRun, run);
  }
  return maxRun;
}

function summarizeAssignment(assignment) {
  const counts = new Map();
  for (const item of assignment) {
    const pronunciation = item.pronunciation_condition;
    increment(counts, `${item.l1_condition}:${pronunciation}`);
  }
  return Object.fromEntries([...counts.entries()].sort());
}

function auditCells(materials) {
  const listPositions = new Map(LISTS.map((list) => [list, [0, 0, 0, 0]]));
  const participantSummaries = [];

  for (const cell of COUNTERBALANCE_CELLS) {
    const speakerPatternBundle = ((cell.cell_id - 1) % SPEAKER_PATTERN_BUNDLE_IDS.length) + 1;
    const bundledCell = {
      ...cell,
      speaker_pattern_bundle: speakerPatternBundle,
      allocation_strategy_version: CURRENT_ALLOCATION_STRATEGY_VERSION,
    };
    const assignment = buildCounterbalancedAssignment(materials, bundledCell, `audit-cell-${cell.cell_id}`);
    if (assignment.length !== 100) {
      throw new Error(`Cell ${cell.cell_id} has ${assignment.length} trials, expected 100.`);
    }

    const participantSummary = summarizeAssignment(assignment);
    const expectedSummary = {
      "CHN:accented": 20,
      "CHN:natural": 20,
      "ENG:natural": 20,
      "JPN:accented": 20,
      "JPN:natural": 20,
    };
    if (JSON.stringify(participantSummary) !== JSON.stringify(expectedSummary)) {
      throw new Error(`Cell ${cell.cell_id} has wrong participant summary: ${JSON.stringify(participantSummary)}`);
    }

    for (let blockIndex = 1; blockIndex <= 4; blockIndex += 1) {
      const block = assignment.filter((item) => item.block_index === blockIndex);
      const expectedList = cell.list_comb[blockIndex - 1];
      listPositions.get(expectedList)[blockIndex - 1] += 1;

      if (block.length !== 25) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has ${block.length} trials, expected 25.`);
      }
      if (maxSameL1Run(block) > 2) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has a same-L1 run longer than 2.`);
      }

      const blockCounts = summarizeAssignment(block);
      const expectedBlockCounts = {
        "CHN:accented": 5,
        "CHN:natural": 5,
        "ENG:natural": 5,
        "JPN:accented": 5,
        "JPN:natural": 5,
      };
      if (JSON.stringify(blockCounts) !== JSON.stringify(expectedBlockCounts)) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has wrong counts: ${JSON.stringify(blockCounts)}`);
      }
    }

    participantSummaries.push({
      cell_id: cell.cell_id,
      list_comb: cell.list_comb,
      pronunciation_style: cell.pronunciation_style,
      speaker_pattern_bundle: speakerPatternBundle,
      totals: participantSummary,
    });
  }

  return {
    cells_audited: COUNTERBALANCE_CELLS.length,
    list_positions: Object.fromEntries(listPositions),
    first_cell_summary: participantSummaries[0],
  };
}

function activeOrCompleted(row) {
  return row.assigned - row.incomplete;
}

function globalBundleCounts(counts, bundleId) {
  const rows = [...counts.values()].map((cell) => cell.bundles.get(bundleId));
  return {
    active_completed: rows.reduce((sum, row) => sum + activeOrCompleted(row), 0),
    completed: rows.reduce((sum, row) => sum + row.completed, 0),
    assigned: rows.reduce((sum, row) => sum + row.assigned, 0),
  };
}

function selectAllocation(counts) {
  const cell = COUNTERBALANCE_CELLS
    .slice()
    .sort((a, b) => {
      const aCounts = counts.get(a.cell_id);
      const bCounts = counts.get(b.cell_id);
      return (
        activeOrCompleted(aCounts) - activeOrCompleted(bCounts) ||
        aCounts.completed - bCounts.completed ||
        a.cell_id - b.cell_id
      );
    })[0];
  const bundle = [...counts.get(cell.cell_id).bundles.values()]
    .sort((a, b) => {
      const aGlobal = globalBundleCounts(counts, a.bundle_id);
      const bGlobal = globalBundleCounts(counts, b.bundle_id);
      return (
        activeOrCompleted(a) - activeOrCompleted(b) ||
        a.completed - b.completed ||
        aGlobal.active_completed - bGlobal.active_completed ||
        aGlobal.completed - bGlobal.completed ||
        a.assigned - b.assigned ||
        a.bundle_id - b.bundle_id
      );
    })[0];
  return { cell_id: cell.cell_id, bundle_id: bundle.bundle_id };
}

function emptyAllocationCounts() {
  return new Map(
    COUNTERBALANCE_CELLS.map((cell) => [
      cell.cell_id,
      {
        assigned: 0,
        completed: 0,
        incomplete: 0,
        bundles: new Map(
          SPEAKER_PATTERN_BUNDLE_IDS.map((bundleId) => [
            bundleId,
            { bundle_id: bundleId, assigned: 0, completed: 0, incomplete: 0 },
          ]),
        ),
      },
    ]),
  );
}

function recordStarted(counts, allocation) {
  const cellCounts = counts.get(allocation.cell_id);
  const bundleCounts = cellCounts.bundles.get(allocation.bundle_id);
  cellCounts.assigned += 1;
  bundleCounts.assigned += 1;
}

function recordOutcome(counts, allocation, completed) {
  const cellCounts = counts.get(allocation.cell_id);
  const bundleCounts = cellCounts.bundles.get(allocation.bundle_id);
  if (completed) {
    cellCounts.completed += 1;
    bundleCounts.completed += 1;
  } else {
    cellCounts.incomplete += 1;
    bundleCounts.incomplete += 1;
  }
}

function recordAllocation(counts, allocation, completed) {
  recordStarted(counts, allocation);
  recordOutcome(counts, allocation, completed);
}

function totalCompleted(counts) {
  return [...counts.values()].reduce((sum, value) => sum + value.completed, 0);
}

function totalAssigned(counts) {
  return [...counts.values()].reduce((sum, value) => sum + value.assigned, 0);
}

function summarizeCounts(counts, extra) {
  const completed = [...counts.values()].map((row) => row.completed);
  const assigned = [...counts.values()].map((row) => row.assigned);
  const incomplete = [...counts.values()].map((row) => row.incomplete);
  const bundleRows = [...counts.values()].flatMap((row) => [...row.bundles.values()]);
  const bundleCompleted = bundleRows.map((row) => row.completed);
  const bundleAssigned = bundleRows.map((row) => row.assigned);
  const globalBundles = SPEAKER_PATTERN_BUNDLE_IDS.map((bundleId) =>
    globalBundleCounts(counts, bundleId)
  );
  const globalBundleCompleted = globalBundles.map((row) => row.completed);
  const globalBundleAssigned = globalBundles.map((row) => row.assigned);
  return {
    ...extra,
    assigned_total: assigned.reduce((sum, value) => sum + value, 0),
    completed_total: completed.reduce((sum, value) => sum + value, 0),
    incomplete_total: incomplete.reduce((sum, value) => sum + value, 0),
    assigned_min: Math.min(...assigned),
    assigned_max: Math.max(...assigned),
    assigned_spread: Math.max(...assigned) - Math.min(...assigned),
    completed_min: Math.min(...completed),
    completed_max: Math.max(...completed),
    completed_spread: Math.max(...completed) - Math.min(...completed),
    microcell_count: bundleRows.length,
    microcell_assigned_min: Math.min(...bundleAssigned),
    microcell_assigned_max: Math.max(...bundleAssigned),
    microcell_assigned_spread: Math.max(...bundleAssigned) - Math.min(...bundleAssigned),
    microcell_completed_min: Math.min(...bundleCompleted),
    microcell_completed_max: Math.max(...bundleCompleted),
    microcell_completed_spread: Math.max(...bundleCompleted) - Math.min(...bundleCompleted),
    bundle_assigned_min: Math.min(...globalBundleAssigned),
    bundle_assigned_max: Math.max(...globalBundleAssigned),
    bundle_assigned_spread: Math.max(...globalBundleAssigned) - Math.min(...globalBundleAssigned),
    bundle_completed_min: Math.min(...globalBundleCompleted),
    bundle_completed_max: Math.max(...globalBundleCompleted),
    bundle_completed_spread: Math.max(...globalBundleCompleted) - Math.min(...globalBundleCompleted),
  };
}

function randomCompleted(rng, dropoutRate) {
  return rng() >= dropoutRate;
}

function correlatedCompleted(rng, cellId) {
  const dropoutRate = CORRELATED_DROPOUT_CELLS.has(cellId) ? 0.6 : 0.1;
  return rng() >= dropoutRate;
}

function simulateRollingKnownDropoutFixedStarts(participantCount, dropoutRate, seedText) {
  const rng = mulberry32(hashString(seedText));
  const counts = emptyAllocationCounts();

  for (let index = 0; index < participantCount; index += 1) {
    const allocation = selectAllocation(counts);
    recordAllocation(counts, allocation, randomCompleted(rng, dropoutRate));
  }

  return summarizeCounts(counts, {
    strategy: "rolling_known_dropout_fixed_starts",
    participants_started: participantCount,
    dropout_rate: dropoutRate,
  });
}

function simulateSingleBatchFixedStarts(participantCount, dropoutRate, seedText) {
  const rng = mulberry32(hashString(seedText));
  const counts = emptyAllocationCounts();
  const allocations = [];

  for (let index = 0; index < participantCount; index += 1) {
    const allocation = selectAllocation(counts);
    recordStarted(counts, allocation);
    allocations.push(allocation);
  }

  for (const allocation of allocations) {
    recordOutcome(counts, allocation, randomCompleted(rng, dropoutRate));
  }

  return summarizeCounts(counts, {
    strategy: "single_batch_fixed_starts",
    participants_started: participantCount,
    dropout_rate: dropoutRate,
  });
}

function simulateRollingToCompletedTarget(completedTarget, dropoutRate, seedText) {
  const rng = mulberry32(hashString(seedText));
  const counts = emptyAllocationCounts();
  const maxStarts = completedTarget * 4;

  while (totalCompleted(counts) < completedTarget && totalAssigned(counts) < maxStarts) {
    const allocation = selectAllocation(counts);
    recordAllocation(counts, allocation, randomCompleted(rng, dropoutRate));
  }

  return summarizeCounts(counts, {
    strategy: "rolling_to_completed_target",
    completed_target: completedTarget,
    dropout_rate: dropoutRate,
    hit_max_starts: totalCompleted(counts) < completedTarget,
  });
}

function simulateCellCorrelatedSingleBatch(participantCount, seedText) {
  const rng = mulberry32(hashString(seedText));
  const counts = emptyAllocationCounts();
  const allocations = [];

  for (let index = 0; index < participantCount; index += 1) {
    const allocation = selectAllocation(counts);
    recordStarted(counts, allocation);
    allocations.push(allocation);
  }

  for (const allocation of allocations) {
    recordOutcome(counts, allocation, correlatedCompleted(rng, allocation.cell_id));
  }

  return summarizeCounts(counts, {
    strategy: "cell_correlated_single_batch_fixed_starts",
    participants_started: participantCount,
    high_dropout_cells: [...CORRELATED_DROPOUT_CELLS],
    high_dropout_rate: 0.6,
    baseline_dropout_rate: 0.1,
  });
}

function simulateCellCorrelatedRollingTarget(completedTarget, seedText) {
  const rng = mulberry32(hashString(seedText));
  const counts = emptyAllocationCounts();
  const maxStarts = completedTarget * 6;

  while (totalCompleted(counts) < completedTarget && totalAssigned(counts) < maxStarts) {
    const allocation = selectAllocation(counts);
    recordAllocation(counts, allocation, correlatedCompleted(rng, allocation.cell_id));
  }

  return summarizeCounts(counts, {
    strategy: "cell_correlated_rolling_to_completed_target",
    completed_target: completedTarget,
    high_dropout_cells: [...CORRELATED_DROPOUT_CELLS],
    high_dropout_rate: 0.6,
    baseline_dropout_rate: 0.1,
    hit_max_starts: totalCompleted(counts) < completedTarget,
  });
}

function assertRollingTargetBalance(rows) {
  const failures = rows.filter((row) =>
    !row.hit_max_starts &&
    (row.completed_spread > 1 || row.microcell_completed_spread > 1)
  );
  const fullCycleFailures = rows.filter((row) =>
    !row.hit_max_starts &&
    row.completed_target % 200 === 0 &&
    (
      row.completed_spread !== 0 ||
      row.microcell_completed_spread !== 0 ||
      row.bundle_completed_spread !== 0
    )
  );
  if (failures.length || fullCycleFailures.length) {
    throw new Error(
      `Rolling completed-target balance failed: ${JSON.stringify({ failures, fullCycleFailures })}`,
    );
  }
}

function runDropoutSimulations() {
  const rollingKnown = [];
  const singleBatch = [];
  const rollingTarget = [];

  for (const participantCount of WAVE_SIZES) {
    for (const rate of DROPOUT_RATES) {
      rollingKnown.push(
        simulateRollingKnownDropoutFixedStarts(
          participantCount,
          rate,
          `rolling-known:${participantCount}:${rate}`,
        ),
      );
      singleBatch.push(
        simulateSingleBatchFixedStarts(
          participantCount,
          rate,
          `single-batch:${participantCount}:${rate}`,
        ),
      );
    }
  }

  for (const completedTarget of ROLLING_COMPLETED_TARGETS) {
    for (const rate of DROPOUT_RATES) {
      rollingTarget.push(
        simulateRollingToCompletedTarget(
          completedTarget,
          rate,
          `rolling-target:${completedTarget}:${rate}`,
        ),
      );
    }
  }

  const cellCorrelated = [
    simulateCellCorrelatedSingleBatch(200, "cell-correlated:single-batch:200"),
    simulateCellCorrelatedRollingTarget(200, "cell-correlated:rolling-target:200"),
  ];

  assertRollingTargetBalance(rollingTarget);
  assertRollingTargetBalance(cellCorrelated.filter((row) =>
    row.strategy === "cell_correlated_rolling_to_completed_target"
  ));

  return {
    rolling_known_dropout_fixed_starts: rollingKnown,
    single_batch_fixed_starts: singleBatch,
    rolling_to_completed_target: rollingTarget,
    cell_correlated: cellCorrelated,
  };
}

function run() {
  const materials = placeholderMaterials();
  const audit = auditCells(materials);
  const dropout = runDropoutSimulations();

  console.log(JSON.stringify({
    placeholder_material_count: materials.length,
    counterbalance_audit: audit,
    dropout_simulations: dropout,
  }, null, 2));
}

run();
