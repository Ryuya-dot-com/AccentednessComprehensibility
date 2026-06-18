import {
  COUNTERBALANCE_CELLS,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const LISTS = "ABCDEFGHIJ".split("");
const DROPOUT_RATES = [0, 0.1, 0.2, 0.35];
const WAVE_SIZES = [100, 250, 400];
const ROLLING_COMPLETED_TARGETS = [100, 200, 250];
const CORRELATED_DROPOUT_CELLS = new Set([1, 7, 14]);

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
  for (const stimulusList of LISTS) {
    for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
      const word = `word${String(wordNumber).padStart(3, "0")}`;
      materials.push({
        audio_url: `placeholder/ame/${stimulusList}/${word}.mp3`,
        target_word: word,
        participant_id: "AME_PLACEHOLDER",
        l1_condition: "AME",
        pronunciation_condition: "natural",
        stimulus_list: stimulusList,
        word_number: String(wordNumber),
        file_name: `ame_${stimulusList}_${word}.mp3`,
      });

      for (const pronunciation of ["natural", "accented"]) {
        for (const l1 of ["JPN", "CHN"]) {
          materials.push({
            audio_url: `placeholder/${l1.toLowerCase()}/${pronunciation}/${stimulusList}/${word}.mp3`,
            target_word: word,
            participant_id: `${l1}_PLACEHOLDER`,
            l1_condition: l1,
            pronunciation_condition: pronunciation,
            stimulus_list: stimulusList,
            word_number: String(wordNumber),
            file_name: `${l1.toLowerCase()}_${pronunciation}_${stimulusList}_${word}.mp3`,
          });
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
    const assignment = buildCounterbalancedAssignment(materials, cell, `audit-cell-${cell.cell_id}`);
    if (assignment.length !== 100) {
      throw new Error(`Cell ${cell.cell_id} has ${assignment.length} trials, expected 100.`);
    }

    const participantSummary = summarizeAssignment(assignment);
    const expectedSummary = {
      "AME:natural": 20,
      "CHN:accented": 20,
      "CHN:natural": 20,
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
        "AME:natural": 5,
        "CHN:accented": 5,
        "CHN:natural": 5,
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
      totals: participantSummary,
    });
  }

  return {
    cells_audited: COUNTERBALANCE_CELLS.length,
    list_positions: Object.fromEntries(listPositions),
    first_cell_summary: participantSummaries[0],
  };
}

function selectAllocationCell(counts) {
  return COUNTERBALANCE_CELLS
    .slice()
    .sort((a, b) => {
      const aCounts = counts.get(a.cell_id);
      const bCounts = counts.get(b.cell_id);
      return (
        aCounts.completed - bCounts.completed ||
        aCounts.assigned - bCounts.assigned ||
        a.cell_id - b.cell_id
      );
    })[0];
}

function emptyAllocationCounts() {
  return new Map(
    COUNTERBALANCE_CELLS.map((cell) => [
      cell.cell_id,
      { assigned: 0, completed: 0, incomplete: 0 },
    ]),
  );
}

function recordAllocation(counts, cellId, completed) {
  const cellCounts = counts.get(cellId);
  cellCounts.assigned += 1;
  if (completed) cellCounts.completed += 1;
  else cellCounts.incomplete += 1;
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
    const cell = selectAllocationCell(counts);
    recordAllocation(counts, cell.cell_id, randomCompleted(rng, dropoutRate));
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
    const cell = selectAllocationCell(counts);
    counts.get(cell.cell_id).assigned += 1;
    allocations.push(cell.cell_id);
  }

  for (const cellId of allocations) {
    const cellCounts = counts.get(cellId);
    if (randomCompleted(rng, dropoutRate)) cellCounts.completed += 1;
    else cellCounts.incomplete += 1;
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
    const cell = selectAllocationCell(counts);
    recordAllocation(counts, cell.cell_id, randomCompleted(rng, dropoutRate));
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
    const cell = selectAllocationCell(counts);
    counts.get(cell.cell_id).assigned += 1;
    allocations.push(cell.cell_id);
  }

  for (const cellId of allocations) {
    const cellCounts = counts.get(cellId);
    if (correlatedCompleted(rng, cellId)) cellCounts.completed += 1;
    else cellCounts.incomplete += 1;
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
    const cell = selectAllocationCell(counts);
    recordAllocation(counts, cell.cell_id, correlatedCompleted(rng, cell.cell_id));
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
  const failures = rows.filter((row) => !row.hit_max_starts && row.completed_spread > 1);
  if (failures.length) {
    throw new Error(`Rolling completed-target balance failed: ${JSON.stringify(failures)}`);
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
