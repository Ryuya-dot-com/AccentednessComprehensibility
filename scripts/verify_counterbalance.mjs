import {
  COUNTERBALANCE_CELLS,
  buildCounterbalancedAssignment,
} from "../functions/api/_counterbalance.js";

const lists = "ABCDEFGHIJ".split("");
const materials = [];

function speakerIds(l1) {
  const count = l1 === "ENG" ? 5 : 10;
  const prefix = l1.toLowerCase();
  return Array.from({ length: count }, (_, index) => `${prefix}_s${String(index + 1).padStart(2, "0")}`);
}

for (const stimulusList of lists) {
  for (let wordNumber = 1; wordNumber <= 50; wordNumber += 1) {
    for (const participantId of speakerIds("ENG")) {
      materials.push({
        audio_url: `eng/${participantId}/${stimulusList}/${wordNumber}.wav`,
        target_word: `word${wordNumber}`,
        participant_id: participantId,
        l1_condition: "ENG",
        pronunciation_condition: "natural",
        stimulus_list: stimulusList,
        word_number: String(wordNumber),
        file_name: `${participantId}_${stimulusList}_${wordNumber}.wav`,
      });
    }

    for (const pronunciation of ["natural", "accented"]) {
      for (const l1 of ["JPN", "CHN"]) {
        for (const participantId of speakerIds(l1)) {
          materials.push({
            audio_url: `${l1.toLowerCase()}/${participantId}/${pronunciation}/${stimulusList}/${wordNumber}.wav`,
            target_word: `word${wordNumber}`,
            participant_id: participantId,
            l1_condition: l1,
            pronunciation_condition: pronunciation,
            stimulus_list: stimulusList,
            word_number: String(wordNumber),
            file_name: `${participantId}_${pronunciation}_${stimulusList}_${wordNumber}.wav`,
          });
        }
      }
    }
  }
}

function speakerIdFromPatternLabel(label) {
  const match = String(label || "").match(/^(ENG|JPN|CHN)(\d+)$/);
  if (!match) return "";
  return `${match[1].toLowerCase()}_s${String(Number(match[2])).padStart(2, "0")}`;
}

function assertNoLongConstrainedRun(assignment, label) {
  let previous = "";
  let runLength = 0;
  for (const item of assignment) {
    const l1 = item.l1_condition;
    runLength = l1 === previous ? runLength + 1 : 1;
    previous = l1;
    if (["ENG", "JPN", "CHN"].includes(l1) && runLength >= 3) {
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
      if (!item.speaker_pattern_index || Number(item.speaker_pattern_index) < 1 || Number(item.speaker_pattern_index) > 10) {
        throw new Error(`Cell ${cell.cell_id} block ${blockIndex} is missing Sheet2 speaker_pattern_index.`);
      }
      const expectedSpeakerId = speakerIdFromPatternLabel(item.speaker_pattern_speaker);
      if (expectedSpeakerId && String(item.participant_id).toLowerCase() !== expectedSpeakerId) {
        throw new Error(
          `Cell ${cell.cell_id} block ${blockIndex} expected ${expectedSpeakerId} for ${item.speaker_pattern_speaker}, got ${item.participant_id}.`,
        );
      }
    });
    assertNoLongConstrainedRun(block, `cell ${cell.cell_id} block ${blockIndex}`);

    const counts = block.reduce((acc, item) => {
      acc[item.l1_condition] = (acc[item.l1_condition] || 0) + 1;
      return acc;
    }, {});
    if (counts.ENG !== 5 || counts.JPN !== 10 || counts.CHN !== 10) {
      throw new Error(`Cell ${cell.cell_id} block ${blockIndex} has wrong L1 counts: ${JSON.stringify(counts)}.`);
    }

    const engPronunciationCounts = block
      .filter((item) => item.l1_condition === "ENG")
      .reduce((acc, item) => {
        acc[item.pronunciation_condition] = (acc[item.pronunciation_condition] || 0) + 1;
        return acc;
      }, {});
    if (engPronunciationCounts.natural !== 5 || Object.keys(engPronunciationCounts).length !== 1) {
      throw new Error(
        `Cell ${cell.cell_id} block ${blockIndex} ENG is not natural-only: ${JSON.stringify(engPronunciationCounts)}.`,
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
      `ENG=${counts.ENG || 0}, JPN=${counts.JPN || 0}, CHN=${counts.CHN || 0}`,
  );
}

console.log("block counterbalance verification ok");
