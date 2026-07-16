#!/usr/bin/env node
import assert from "node:assert/strict";

import { constrainedShuffleByL1 } from "../functions/api/_counterbalance.js";

const L1S = ["ENG", "JPN", "CHN"];
const BLOCK_SIZE = 25;
const DEFAULT_BLOCK_COUNT = 50_000;
const EXPECTED_FIRST_L1_PROBABILITY = Object.freeze({
  // Exact dynamic-programming result over all 1,111,167,738 valid label
  // sequences with 5 ENG, 10 JPN, 10 CHN and no run longer than two.
  ENG: 193_043_184 / 1_111_167_738,
  JPN: 459_062_277 / 1_111_167_738,
  CHN: 459_062_277 / 1_111_167_738,
});
const FIRST_POSITION_TOLERANCE = 0.015;
const POSITION_SYMMETRY_TOLERANCE = 0.025;
const MEAN_POSITION_TOLERANCE = 0.08;

function argInteger(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const parsed = Number.parseInt(process.argv[index + 1] || "", 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function makeItems() {
  return L1S.flatMap((l1) => {
    const count = l1 === "ENG" ? 5 : 10;
    return Array.from({ length: count }, (_, index) => ({
      id: `${l1}-${index + 1}`,
      l1_condition: l1,
    }));
  });
}

function maximumRun(items) {
  let previous = "";
  let current = 0;
  let maximum = 0;
  for (const item of items) {
    current = item.l1_condition === previous ? current + 1 : 1;
    previous = item.l1_condition;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function closeTo(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual.toFixed(6)} is not within ${tolerance} of ${expected.toFixed(6)}`,
  );
}

const blockCount = argInteger("--blocks", DEFAULT_BLOCK_COUNT);
const items = makeItems();
const positionCounts = Object.fromEntries(
  L1S.map((l1) => [l1, Array.from({ length: BLOCK_SIZE }, () => 0)]),
);
const positionTotals = Object.fromEntries(L1S.map((l1) => [l1, 0]));
const firstTenTotals = Object.fromEntries(L1S.map((l1) => [l1, 0]));
const uniqueOrders = new Set();

const deterministicA = constrainedShuffleByL1(items, "determinism-check");
const deterministicB = constrainedShuffleByL1(items, "determinism-check");
assert.deepEqual(deterministicA, deterministicB, "the same seed must reproduce the exact order");
assert.notDeepEqual(
  deterministicA,
  constrainedShuffleByL1(items, "different-seed-check"),
  "different fixed seeds must not collapse to the same test order",
);
assert.throws(
  () =>
    constrainedShuffleByL1(
      Array.from({ length: 3 }, (_, index) => ({
        id: `impossible-${index + 1}`,
        l1_condition: "ENG",
      })),
      "impossible-run-check",
    ),
  /after 200 attempts/,
  "an impossible no-3 order must fail closed at the bounded attempt limit",
);

for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
  const ordered = constrainedShuffleByL1(items, `distribution-audit:${blockIndex}`);
  assert.equal(ordered.length, BLOCK_SIZE, `block ${blockIndex}: trial count`);
  assert.ok(maximumRun(ordered) <= 2, `block ${blockIndex}: same-L1 run exceeded two`);

  const counts = Object.fromEntries(L1S.map((l1) => [l1, 0]));
  ordered.forEach((item, positionIndex) => {
    const l1 = item.l1_condition;
    assert.ok(L1S.includes(l1), `block ${blockIndex}: unexpected L1 ${l1}`);
    counts[l1] += 1;
    positionCounts[l1][positionIndex] += 1;
    positionTotals[l1] += positionIndex + 1;
    if (positionIndex < 10) firstTenTotals[l1] += 1;
  });
  assert.deepEqual(counts, { ENG: 5, JPN: 10, CHN: 10 }, `block ${blockIndex}: L1 counts`);
  uniqueOrders.add(ordered.map((item) => item.id).join("|"));
}

for (const l1 of L1S) {
  const expectedCount = l1 === "ENG" ? 5 : 10;
  const meanPosition = positionTotals[l1] / (blockCount * expectedCount);
  closeTo(meanPosition, 13, MEAN_POSITION_TOLERANCE, `${l1} mean position`);

  const firstProbability = positionCounts[l1][0] / blockCount;
  const lastProbability = positionCounts[l1][BLOCK_SIZE - 1] / blockCount;
  closeTo(
    firstProbability,
    EXPECTED_FIRST_L1_PROBABILITY[l1],
    FIRST_POSITION_TOLERANCE,
    `${l1} first-position probability`,
  );
  closeTo(
    lastProbability,
    EXPECTED_FIRST_L1_PROBABILITY[l1],
    FIRST_POSITION_TOLERANCE,
    `${l1} last-position probability`,
  );

  const firstTenExpected = firstTenTotals[l1] / blockCount;
  const expectedFirstTen = l1 === "ENG" ? 2 : 4;
  closeTo(firstTenExpected, expectedFirstTen, 0.15, `${l1} expected count in positions 1-10`);

  for (let positionIndex = 0; positionIndex < BLOCK_SIZE; positionIndex += 1) {
    const reverseIndex = BLOCK_SIZE - positionIndex - 1;
    const forward = positionCounts[l1][positionIndex] / blockCount;
    const reverse = positionCounts[l1][reverseIndex] / blockCount;
    closeTo(
      forward,
      reverse,
      POSITION_SYMMETRY_TOLERANCE,
      `${l1} positions ${positionIndex + 1} and ${reverseIndex + 1} reversal symmetry`,
    );
  }
}

for (let positionIndex = 0; positionIndex < BLOCK_SIZE; positionIndex += 1) {
  const jpn = positionCounts.JPN[positionIndex] / blockCount;
  const chn = positionCounts.CHN[positionIndex] / blockCount;
  closeTo(
    jpn,
    chn,
    POSITION_SYMMETRY_TOLERANCE,
    `JPN/CHN symmetry at position ${positionIndex + 1}`,
  );
}

assert.ok(
  uniqueOrders.size / blockCount >= 0.999,
  `order diversity is too low: ${uniqueOrders.size}/${blockCount}`,
);

const summary = Object.fromEntries(
  L1S.map((l1) => {
    const expectedCount = l1 === "ENG" ? 5 : 10;
    return [
      l1,
      {
        first_probability: positionCounts[l1][0] / blockCount,
        last_probability: positionCounts[l1][BLOCK_SIZE - 1] / blockCount,
        mean_position: positionTotals[l1] / (blockCount * expectedCount),
        expected_first_ten_count: firstTenTotals[l1] / blockCount,
      },
    ];
  }),
);

console.log(`randomization distribution verification ok (${blockCount} blocks)`);
console.log(JSON.stringify({ unique_orders: uniqueOrders.size, l1: summary }, null, 2));
