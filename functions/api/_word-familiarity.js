import { cleanText, nullableInt } from "./_utils.js";

// Canonical CounterBalance.xlsx Sheet1 numbering. Keep this in sync with
// TARGET_WORDS in app.js; production preflight checks the full mapping.
export const TARGET_WORDS = Object.freeze([
  { word_number: 1, target_word: "tweezers" },
  { word_number: 2, target_word: "persimmon" },
  { word_number: 3, target_word: "thermometer" },
  { word_number: 4, target_word: "razor" },
  { word_number: 5, target_word: "mantis" },
  { word_number: 6, target_word: "pacifier" },
  { word_number: 7, target_word: "podium" },
  { word_number: 8, target_word: "labyrinth" },
  { word_number: 9, target_word: "loquat" },
  { word_number: 10, target_word: "scapula" },
  { word_number: 11, target_word: "burdock" },
  { word_number: 12, target_word: "protractor" },
  { word_number: 13, target_word: "acorn" },
  { word_number: 14, target_word: "scalpel" },
  { word_number: 15, target_word: "cocoon" },
  { word_number: 16, target_word: "cicada" },
  { word_number: 17, target_word: "toboggan" },
  { word_number: 18, target_word: "chisel" },
  { word_number: 19, target_word: "casket" },
  { word_number: 20, target_word: "detergent" },
  { word_number: 21, target_word: "nostril" },
  { word_number: 22, target_word: "rickshaw" },
  { word_number: 23, target_word: "capelin" },
  { word_number: 24, target_word: "lotus" },
  { word_number: 25, target_word: "tadpole" },
  { word_number: 26, target_word: "burglar" },
  { word_number: 27, target_word: "xylophone" },
  { word_number: 28, target_word: "walrus" },
  { word_number: 29, target_word: "icicle" },
  { word_number: 30, target_word: "abalone" },
  { word_number: 31, target_word: "porcupine" },
  { word_number: 32, target_word: "carousel" },
  { word_number: 33, target_word: "faucet" },
  { word_number: 34, target_word: "cobweb" },
  { word_number: 35, target_word: "pylon" },
  { word_number: 36, target_word: "pupa" },
  { word_number: 37, target_word: "binoculars" },
  { word_number: 38, target_word: "spatula" },
  { word_number: 39, target_word: "lawnmower" },
  { word_number: 40, target_word: "ladle" },
  { word_number: 41, target_word: "raccoon" },
  { word_number: 42, target_word: "syringe" },
  { word_number: 43, target_word: "catapult" },
  { word_number: 44, target_word: "treadmill" },
  { word_number: 45, target_word: "wardrobe" },
  { word_number: 46, target_word: "strainer" },
  { word_number: 47, target_word: "parakeet" },
  { word_number: 48, target_word: "scallop" },
  { word_number: 49, target_word: "toupee" },
  { word_number: 50, target_word: "abacus" },
]);

export const TARGET_WORD_COUNT = TARGET_WORDS.length;

export function validateWordFamiliarityResponses(value) {
  if (!Array.isArray(value) || value.length !== TARGET_WORD_COUNT) {
    const error = new Error(`word_familiarity must contain exactly ${TARGET_WORD_COUNT} responses.`);
    error.status = 400;
    throw error;
  }

  const byNumber = new Map();
  for (const response of value) {
    const wordNumber = nullableInt(response?.word_number);
    if (!wordNumber || byNumber.has(wordNumber)) {
      const error = new Error("word_familiarity contains an invalid or duplicate word_number.");
      error.status = 400;
      throw error;
    }
    if (typeof response?.known !== "boolean") {
      const error = new Error("Every word_familiarity response must use a boolean known value.");
      error.status = 400;
      throw error;
    }
    byNumber.set(wordNumber, {
      word_number: wordNumber,
      target_word: cleanText(response.target_word).toLowerCase(),
      known: response.known,
    });
  }

  return TARGET_WORDS.map((expected) => {
    const response = byNumber.get(expected.word_number);
    if (!response || response.target_word !== expected.target_word) {
      const error = new Error(
        `word_familiarity does not match canonical word ${expected.word_number}.`,
      );
      error.status = 400;
      throw error;
    }
    return response;
  });
}
