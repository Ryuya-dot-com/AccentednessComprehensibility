import {
  COUNTERBALANCE_CELLS,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const lists = "ABCDEFGHIJ".split("");
const materials = [];

for (const stimulusList of lists) {
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    materials.push({
      audio_url: `ame/${stimulusList}/${wordNumber}.mp3`,
      target_word: `word${wordNumber}`,
      participant_id: "AME_S01",
      l1_condition: "AME",
      pronunciation_condition: "natural",
      stimulus_list: stimulusList,
      word_number: String(wordNumber),
      file_name: `ame_${stimulusList}_${wordNumber}.mp3`,
    });

    for (const pronunciation of ["natural", "accented"]) {
      materials.push({
        audio_url: `jpn/${pronunciation}/${stimulusList}/${wordNumber}.mp3`,
        target_word: `word${wordNumber}`,
        participant_id: "JPN_S01",
        l1_condition: "JPN",
        pronunciation_condition: pronunciation,
        stimulus_list: stimulusList,
        word_number: String(wordNumber),
        file_name: `jpn_${pronunciation}_${stimulusList}_${wordNumber}.mp3`,
      });
      materials.push({
        audio_url: `chn/${pronunciation}/${stimulusList}/${wordNumber}.mp3`,
        target_word: `word${wordNumber}`,
        participant_id: "CHN_S01",
        l1_condition: "CHN",
        pronunciation_condition: pronunciation,
        stimulus_list: stimulusList,
        word_number: String(wordNumber),
        file_name: `chn_${pronunciation}_${stimulusList}_${wordNumber}.mp3`,
      });
    }
  }
}

function assertNoLongConstrainedRun(assignment, label) {
  let previous = "";
  let runLength = 0;
  for (const item of assignment) {
    const l1 = item.l1_condition;
    runLength = l1 === previous ? runLength + 1 : 1;
    previous = l1;
    if (["AME", "JPN", "CHN"].includes(l1) && runLength >= 3) {
      throw new Error(`Found ${l1} run of ${runLength} in ${label} at trial ${item.trial_index}.`);
    }
  }
}

for (const cell of COUNTERBALANCE_CELLS) {
  const assignment = buildCounterbalancedAssignment(materials, cell, "verify-seed");
  if (assignment.length !== 100) {
    throw new Error(`Cell ${cell.cell_id} generated ${assignment.length} trials, expected 100.`);
  }

  const blocks = new Map();
  for (const item of assignment) {
    const key = String(item.block_index);
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(item);
  }
  if (blocks.size !== 4) {
    throw new Error(`Cell ${cell.cell_id} generated ${blocks.size} blocks, expected 4.`);
  }

  for (let blockIndex = 1; blockIndex <= 4; blockIndex += 1) {
    const block = blocks.get(String(blockIndex)) || [];
    const expectedList = cell.list_comb[blockIndex - 1];
    if (block.length !== 25) {
      throw new Error(`Cell ${cell.cell_id} block ${blockIndex} generated ${block.length} trials, expected 25.`);
    }
    if (block.some((item) => item.block_list !== expectedList || item.stimulus_list !== expectedList)) {
      throw new Error(`Cell ${cell.cell_id} block ${blockIndex} contains trials outside list ${expectedList}.`);
    }
    block.forEach((item, index) => {
      if (item.within_block_index !== index + 1) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has incorrect within_block_index.`);
      }
      if (item.trial_index !== (blockIndex - 1) * 25 + index + 1) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has incorrect trial_index.`);
      }
    });
    assertNoLongConstrainedRun(block, `cell ${cell.cell_id} block ${blockIndex}`);

    const counts = block.reduce((acc, item) => {
      acc[item.l1_condition] = (acc[item.l1_condition] || 0) + 1;
      return acc;
    }, {});
    if (counts.AME !== 5 || counts.JPN !== 10 || counts.CHN !== 10) {
      throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has wrong L1 counts: ${JSON.stringify(counts)}.`);
    }

    const amePronunciationCounts = block
      .filter((item) => item.l1_condition === "AME")
      .reduce((acc, item) => {
        acc[item.pronunciation_condition] = (acc[item.pronunciation_condition] || 0) + 1;
        return acc;
      }, {});
    if (amePronunciationCounts.natural !== 5 || Object.keys(amePronunciationCounts).length !== 1) {
      throw new Error(
        `Cell ${cell.cell_id} block ${blockIndex} AME is not natural-only: ${JSON.stringify(amePronunciationCounts)}.`,
      );
    }

    for (const l1 of ["JPN", "CHN"]) {
      const pronunciationCounts = block
        .filter((item) => item.l1_condition === l1)
        .reduce((acc, item) => {
          acc[item.pronunciation_condition] = (acc[item.pronunciation_condition] || 0) + 1;
          return acc;
        }, {});
      if (pronunciationCounts.natural !== 5 || pronunciationCounts.accented !== 5) {
        throw new Error(
          `Cell ${cell.cell_id} block ${blockIndex} ${l1} is not 5/5 natural/accented: ${JSON.stringify(pronunciationCounts)}.`,
        );
      }
    }
  }

  const counts = assignment.reduce((acc, item) => {
    acc[item.l1_condition] = (acc[item.l1_condition] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `cell ${cell.cell_id}: ${assignment.length} trials in 4 blocks, ` +
      `AME=${counts.AME || 0}, JPN=${counts.JPN || 0}, CHN=${counts.CHN || 0}`,
  );
}

console.log("block counterbalance verification ok");
