#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = "https://accentednesscomprehensibility.pages.dev";
const PLATFORM_VERSION = "pronunciation_rating_v0.10.1";
const ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1";
const PRACTICE_SET_ID = "practice_calibration_v0.10.1";
const PRACTICE_AUDIO_ROOT =
  "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration";
const PRACTICE_ITEMS = Object.freeze([
  Object.freeze({
    practice_set_id: PRACTICE_SET_ID,
    trial_index: 1,
    target_word: "appreciation",
    file_name: "ENG_Female_appreciation_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/eng_female_appreciation_practice.wav`,
    l1_condition: "ENG",
    pronunciation_condition: "natural",
    talker: "practice_eng_female",
    spoken_form: "appreciation",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "reference_acc_1_2_comp_1_2",
    expert_comprehensibility_range: "1–2",
    expert_accentedness_range: "1–2",
    size_bytes: 203920,
    sha256: "69aee95815630ec2e5563473eb3e7c4b4e1606134beb44910676e2f1e901c1bd",
  }),
  Object.freeze({
    practice_set_id: PRACTICE_SET_ID,
    trial_index: 2,
    target_word: "pesticide",
    file_name: "JPN_Male_pesticide.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/jpn_male_pesticide_practice.wav`,
    l1_condition: "JPN",
    pronunciation_condition: "accented",
    talker: "practice_jpn_male",
    spoken_form: "pesticide",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "reference_acc_2_3_comp_1_2",
    expert_comprehensibility_range: "1–2",
    expert_accentedness_range: "2–3",
    size_bytes: 154808,
    sha256: "3ef097d287d04a8f5e300917727abd5f28f55e8e1f2abcb66fc0f210ec6c30d4",
  }),
  Object.freeze({
    practice_set_id: PRACTICE_SET_ID,
    trial_index: 3,
    target_word: "quality",
    file_name: "JPN_Female_quality_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/jpn_female_quality_practice.wav`,
    l1_condition: "JPN",
    pronunciation_condition: "accented",
    talker: "practice_jpn_female",
    spoken_form: "quality",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "reference_acc_4_5_comp_2_3",
    expert_comprehensibility_range: "2–3",
    expert_accentedness_range: "4–5",
    size_bytes: 164088,
    sha256: "8b01e13b47f45f8efda480339c15876a2d4594000b07454a177a1d4b78ea9763",
  }),
  Object.freeze({
    practice_set_id: PRACTICE_SET_ID,
    trial_index: 4,
    target_word: "organizer",
    file_name: "CHN_Female_Organizer_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/chn_female_organizer_practice.wav`,
    l1_condition: "CHN",
    pronunciation_condition: "accented",
    talker: "practice_chn_female",
    spoken_form: "organizer",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "reference_acc_4_6_comp_5_7",
    expert_comprehensibility_range: "5–7",
    expert_accentedness_range: "4–6",
    size_bytes: 184152,
    sha256: "1336b859808f091e6cc31a3247695f56e197bacedd9d4ca9b48f4b4cef859ac1",
  }),
  Object.freeze({
    practice_set_id: PRACTICE_SET_ID,
    trial_index: 5,
    target_word: "balloon",
    file_name: "CHN_Male_Balloon_Practice.wav",
    audio_url: `${PRACTICE_AUDIO_ROOT}/chn_male_balloon_practice.wav`,
    l1_condition: "CHN",
    pronunciation_condition: "accented",
    talker: "practice_chn_male",
    spoken_form: "balloon",
    source_format: "researcher_provided_calibration_wav",
    practice_group: "reference_acc_6_8_comp_4_6",
    expert_comprehensibility_range: "4–6",
    expert_accentedness_range: "6–8",
    size_bytes: 124440,
    sha256: "5803d3d56eaba60cabfe8aed51570a4905216ae7a1876131709c3fd671586ba4",
  }),
]);
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT_ROOT = path.resolve(REPO_ROOT, "..");
const DROPBOX_PACKAGE_ROOT = "/Users/tohokusla/Dropbox/Accentedness/Stimuli_OSF_Release_20260703";
const PACKAGE_ROOT = path.resolve(
  argValue("--package-root", process.env.STIMULI_PACKAGE_ROOT || defaultPackageRoot()),
);
const DEFAULT_OUT = path.join(PACKAGE_ROOT, "metadata", "LIVE_DEPLOYMENT_CHECK_20260703.md");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function defaultPackageRoot() {
  const adjacentRoot = path.join(PROJECT_ROOT, "Stimuli_OSF_Release_20260703");
  if (packageRootLooksUsable(DROPBOX_PACKAGE_ROOT)) return DROPBOX_PACKAGE_ROOT;
  if (packageRootLooksUsable(adjacentRoot)) return adjacentRoot;
  return adjacentRoot;
}

function packageRootLooksUsable(packageRoot) {
  return fs.existsSync(path.join(packageRoot, "remote_manifest.csv")) ||
    fs.existsSync(path.join(packageRoot, "metadata", "selected_practice_manifest.csv"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    const next = text[index + 1];
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
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])),
    );
}

async function fetchText(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { redirect: "manual", cache: "no-store" });
  const text = await response.text();
  return { url: url.toString(), response, text };
}

async function fetchHead(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store" });
  return { url: url.toString(), response };
}

async function fetchBinary(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { redirect: "manual", cache: "no-store" });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    url: url.toString(),
    response,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function postJson(baseUrl, pathname, payload) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { parse_error: true, text: text.slice(0, 240) };
  }
  return { url: url.toString(), response, data, text };
}

function header(response, name) {
  return response.headers.get(name) || "";
}

function checkRequiredAppSnippets(appText) {
  const required = [
    `const VERSION = "${PLATFORM_VERSION}"`,
    "const STAGED_COMBINED_FLOW = true",
    "speaker_pattern_index",
    PRACTICE_AUDIO_ROOT,
    ...PRACTICE_ITEMS.flatMap((item) => [
      item.target_word,
      item.audio_url.split("/").at(-1),
      item.expert_comprehensibility_range,
      item.expert_accentedness_range,
    ]),
    "response_flow",
    "error.data?.retryable === true",
    "Confirming saved responses...",
    "resumeExistingServerSessionIfNeeded",
    "applyServerBackgroundValues",
    "showWordFamiliarityChecklist",
    'postJson("/api/session/word-familiarity"',
    "state.wordFamiliarityRequired = data.word_familiarity_required !== false",
    "if (state.wordFamiliarityRequired)",
    "error.data?.reload_required === true",
    "serverCompletedTrialKeys",
    "serverCompletedDistractorIndexes",
    "resumeAfterPractice",
    "replayingPractice",
    "practiceRecordingRequired",
    "practice_replay_required",
    "continueAfterPractice",
    "replayedSavedPractice",
    "practiceFeedbackReplayCount",
    "practiceFeedbackReplayGeneration",
    "audioPlaybackGeneration",
    "playbackSettled",
    "AUDIO_LIFECYCLE.isPlaybackCurrent",
    "AUDIO_LIFECYCLE.createFeedbackReplayLifecycle",
    "replayPracticeFeedbackAudio",
    "You may replay this practice audio as many times as needed.",
    "Expert raters rated this as:",
    "Comprehensibility: ${expertCompRange} (Your rating:",
    "These reference ratings are only for practice.",
    "practice_feedback_replay_start",
    "practice_feedback_replay_end",
  ];
  const forbidden = [
    'params.get("completion_code")',
    'params.get("PROLIFIC_CODE")',
    "Comprehensibility: — (Your rating:",
    "practiceFeedbackReplayCount >=",
  ];
  const problems = [];
  for (const snippet of required) {
    if (!appText.includes(snippet)) problems.push(`live app.js missing snippet: ${snippet}`);
  }
  for (const snippet of forbidden) {
    if (appText.includes(snippet)) problems.push(`live app.js still contains forbidden snippet: ${snippet}`);
  }
  return problems;
}

function matchingDelimiterIndex(text, start, open, close) {
  if (open === close) {
    if (text[start] !== open) throw new Error(`expected ${open} at offset ${start}`);
    let escaped = false;
    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === close) {
        return index;
      }
    }
    throw new Error(`unterminated ${open}${close} literal`);
  }
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) break;
    }
  }
  throw new Error(`unterminated ${open}${close} literal`);
}

function stringConstant(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`\\bconst\\s+${escapedName}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`),
  );
  if (!match) throw new Error(`could not statically parse ${name}`);
  return JSON.parse(match[1]);
}

function parsePracticeObject(objectText, constants) {
  const item = {};
  let cursor = 1;
  const limit = objectText.length - 1;
  const skipWhitespace = () => {
    while (cursor < limit && /\s/.test(objectText[cursor])) cursor += 1;
  };
  while (cursor < limit) {
    skipWhitespace();
    if (objectText[cursor] === ",") {
      cursor += 1;
      continue;
    }
    if (cursor >= limit) break;
    const keyMatch = objectText.slice(cursor).match(/^([A-Za-z_$][\w$]*)/);
    if (!keyMatch) throw new Error(`unexpected practice-object token at offset ${cursor}`);
    const key = keyMatch[1];
    if (Object.hasOwn(item, key)) throw new Error(`duplicate practice-object field ${key}`);
    cursor += key.length;
    skipWhitespace();
    if (objectText[cursor] !== ":") throw new Error(`missing colon after practice-object field ${key}`);
    cursor += 1;
    skipWhitespace();

    let value;
    if (objectText[cursor] === '"') {
      const end = matchingDelimiterIndex(objectText, cursor, '"', '"');
      const token = objectText.slice(cursor, end + 1);
      value = JSON.parse(token);
      cursor = end + 1;
    } else if (objectText[cursor] === "`") {
      const end = matchingDelimiterIndex(objectText, cursor, "`", "`");
      const token = objectText.slice(cursor, end + 1);
      const templateMatch = token.match(/^`\$\{PRACTICE_AUDIO_ROOT\}(\/[^`$\\]*)`$/);
      if (!templateMatch) throw new Error(`unsupported template value for practice-object field ${key}`);
      value = `${constants.PRACTICE_AUDIO_ROOT}${templateMatch[1]}`;
      cursor = end + 1;
    } else {
      const valueMatch = objectText.slice(cursor).match(/^([A-Za-z_$][\w$]*)/);
      if (!valueMatch || !Object.hasOwn(constants, valueMatch[1])) {
        throw new Error(`unsupported value for practice-object field ${key}`);
      }
      value = constants[valueMatch[1]];
      cursor += valueMatch[1].length;
    }
    item[key] = value;
    skipWhitespace();
    if (cursor < limit && objectText[cursor] !== ",") {
      throw new Error(`missing comma after practice-object field ${key}`);
    }
  }
  return item;
}

function deployedClientPracticeItems(appText) {
  const declaration = appText.match(/\bconst\s+PRACTICE_ITEMS\s*=\s*\[/);
  if (!declaration || declaration.index === undefined) {
    throw new Error("could not locate the active PRACTICE_ITEMS declaration");
  }
  const arrayStart = declaration.index + declaration[0].lastIndexOf("[");
  const arrayEnd = matchingDelimiterIndex(appText, arrayStart, "[", "]");
  const arrayBody = appText.slice(arrayStart + 1, arrayEnd);
  const constants = {
    PRACTICE_AUDIO_ROOT: stringConstant(appText, "PRACTICE_AUDIO_ROOT"),
    PRACTICE_SET_ID: stringConstant(appText, "PRACTICE_SET_ID"),
  };
  const items = [];
  let cursor = 0;
  while (cursor < arrayBody.length) {
    while (cursor < arrayBody.length && /[\s,]/.test(arrayBody[cursor])) cursor += 1;
    if (cursor >= arrayBody.length) break;
    if (arrayBody[cursor] !== "{") {
      throw new Error(`unexpected PRACTICE_ITEMS token at offset ${cursor}`);
    }
    const objectEnd = matchingDelimiterIndex(arrayBody, cursor, "{", "}");
    items.push(parsePracticeObject(arrayBody.slice(cursor, objectEnd + 1), constants));
    cursor = objectEnd + 1;
  }
  return items;
}

function expectedClientPracticeItems() {
  return PRACTICE_ITEMS.map((item) => ({
    practice_set_id: item.practice_set_id,
    practice_kind: "combined",
    practice_group: item.practice_group,
    word: item.target_word,
    file_name: item.file_name,
    audio_url: item.audio_url,
    l1_condition: item.l1_condition,
    pronunciation_condition: item.pronunciation_condition,
    talker: item.talker,
    voice_variant: item.talker.replace(/^practice_/, ""),
    spoken_form: item.spoken_form,
    expert_comprehensibility_range: item.expert_comprehensibility_range,
    expert_accentedness_range: item.expert_accentedness_range,
    source_format: item.source_format,
    practice_note: `Researcher-provided calibration WAV. Expert Accentedness reference range: ${item.expert_accentedness_range}. Expert Comprehensibility reference range: ${item.expert_comprehensibility_range}.`,
  }));
}

function checkDeployedClientPracticeContract(appText) {
  let actualItems;
  try {
    actualItems = deployedClientPracticeItems(appText);
  } catch (error) {
    return [`live app.js practice contract could not be parsed statically: ${error.message}`];
  }
  const expectedItems = expectedClientPracticeItems();
  if (!Array.isArray(actualItems) || actualItems.length !== expectedItems.length) {
    return [
      `live app.js active PRACTICE_ITEMS has ${actualItems?.length ?? "an invalid value"}; expected ${expectedItems.length} items`,
    ];
  }
  const problems = [];
  actualItems.forEach((actual, index) => {
    const expected = expectedItems[index];
    const actualKeys = Object.keys(actual || {}).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      problems.push(
        `live app.js practice item ${index + 1} (${expected.word}) has fields [${actualKeys.join(", ")}]; expected [${expectedKeys.join(", ")}]`,
      );
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (actual?.[field] !== expectedValue) {
        problems.push(
          `live app.js practice item ${index + 1} (${expected.word}) ${field} is ${JSON.stringify(actual?.[field])}; expected ${JSON.stringify(expectedValue)}`,
        );
      }
    }
  });
  return problems;
}

function checkRequiredAudioLifecycleSnippets(helperText) {
  return [
    "createFeedbackReplayLifecycle",
    "isPlaybackCurrent",
    'complete("timeupdate")',
    '"timeout"',
  ]
    .filter((snippet) => !helperText.includes(snippet))
    .map((snippet) => `live audio-lifecycle.js missing snippet: ${snippet}`);
}

function checkRequiredIndexSnippets(indexText) {
  const required = [
    'src="audio-lifecycle.js?v=0.10.1"',
    'src="app.js?v=0.10.1"',
    "In this practice session, you will transcribe and rate five sample words.",
    "familiarize you with the task procedure; and",
    "help you calibrate your Accentedness and Comprehensibility ratings by comparing them with expert reference ranges.",
    "rate 5 words. The word played and expert Accentedness and Comprehensibility reference ranges will be shown after each",
    "compare your response with the expert Accentedness and Comprehensibility reference ranges",
    "listen to the sample again as many times as you like.",
    'id="word-familiarity-panel"',
    'id="word-familiarity-grid"',
    "Review all 50 words",
    "If you were unfamiliar with it",
    "Rate how strong the speaker's <strong>accent</strong> sounded.",
    "Rate how easy the word was to <strong>understand</strong>.",
    'id="practice-feedback-replay-btn"',
    'id="practice-feedback-replay-status"',
    "You may replay the audio while reviewing this practice feedback.",
  ];
  const problems = required
    .filter((snippet) => !indexText.includes(snippet))
    .map((snippet) => `live index.html missing snippet: ${snippet}`);
  const accentIndex = indexText.indexOf("Rate how strong the speaker's");
  const understandingIndex = indexText.indexOf("Rate how easy the word was");
  if (accentIndex < 0 || understandingIndex < 0 || accentIndex > understandingIndex) {
    problems.push("live task instructions are not Accentedness-first");
  }
  return problems;
}

function practiceAssignment() {
  return PRACTICE_ITEMS.map((item) => ({
    practice_set_id: item.practice_set_id,
    phase: "practice",
    trial_index: item.trial_index,
    source_path: item.audio_url,
    audio_url: item.audio_url,
    file_name: item.file_name,
    target_word: item.target_word,
    participant_id: item.talker,
    native_language: item.l1_condition,
    accent_condition: item.pronunciation_condition,
    condition: `practice_${item.pronunciation_condition}`,
    talker: item.talker,
    word_number: String(item.trial_index),
    trial_number: String(item.trial_index),
    spoken_form: item.spoken_form,
    practice_note: `Researcher-provided calibration WAV. Expert Accentedness reference range: ${item.expert_accentedness_range}. Expert Comprehensibility reference range: ${item.expert_comprehensibility_range}.`,
    source_format: item.source_format,
    practice_kind: "combined",
    practice_group: item.practice_group,
    expert_comprehensibility_range: item.expert_comprehensibility_range,
    expert_accentedness_range: item.expert_accentedness_range,
  }));
}

function trialSavePayload(sessionId, sessionToken, assignment, overrides = {}) {
  return {
    session_id: sessionId,
    session_token: sessionToken,
    row: {
      phase: assignment.phase || "main",
      trial_index: Number(assignment.trial_index),
      trial_total: assignment.phase === "practice" ? PRACTICE_ITEMS.length : 100,
      completed_at: new Date().toISOString(),
      typed_response: assignment.target_word,
      intelligibility_response_status: "typed",
      comprehensibility_1_9: 4,
      accentedness_1_9: 4,
      response_flow: "staged_dictation_then_ratings",
      ...overrides,
    },
  };
}

function checkSecurityHeaders(response, label) {
  const problems = [];
  for (const name of ["content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy"]) {
    if (!header(response, name)) problems.push(`${label} missing ${name}`);
  }
  const xFrameOptions = header(response, "x-frame-options").trim().toUpperCase();
  if (xFrameOptions !== "DENY") {
    problems.push(`${label} x-frame-options is ${xFrameOptions || "(missing)"}; expected DENY`);
  }
  return problems;
}

function checkCacheControl(response, label, expectedDirectives) {
  const cacheControl = header(response, "cache-control");
  const directives = new Set(
    cacheControl
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return expectedDirectives
    .filter((directive) => !directives.has(directive))
    .map((directive) =>
      `${label} cache-control is ${cacheControl || "(missing)"}; expected directive ${directive}`
    );
}

function summarizeHeaders(response) {
  return {
    status: String(response.status),
    content_type: header(response, "content-type"),
    content_length: header(response, "content-length"),
    cache_control: header(response, "cache-control"),
    csp: header(response, "content-security-policy") ? "present" : "",
    x_frame_options: header(response, "x-frame-options"),
  };
}

async function liveApiDryRunStartCheck(baseUrl, turnstileToken) {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    rater_id: `live_check_${nonce}`,
    session_label: `live_check_${nonce}`,
    task_mode: "combined",
    platform_version: PLATFORM_VERSION,
    seed: `live_check_${nonce}`,
    dry_run: "1",
    prolific_pid: `LIVE_CHECK_${nonce}`,
    prolific_study_id: "DRY_RUN",
    prolific_session_id: `LIVE_CHECK_SESSION_${nonce}`,
    participant_age_years: 30,
    english_variety: "other",
    english_variety_other: "live check variety",
    gender: "other",
    gender_other: "live check gender",
    english_teaching_experience: "yes",
    english_teaching_experience_details: "live check teaching details",
    linguistics_knowledge: "yes",
    linguistics_knowledge_details: "live check linguistics details",
    japanese_familiarity_1_6: 3,
    chinese_familiarity_1_6: 3,
    turnstile_token: turnstileToken || "",
    counterbalance: { enabled: true },
    practice_assignment: practiceAssignment(),
  };
  const resumePayload = {
    rater_id: payload.rater_id,
    session_label: payload.session_label,
    platform_version: PLATFORM_VERSION,
    dry_run: "1",
    resume_only: true,
    prolific_pid: payload.prolific_pid,
    prolific_study_id: payload.prolific_study_id,
    prolific_session_id: payload.prolific_session_id,
    counterbalance: { enabled: true },
  };
  const result = await postJson(baseUrl, "/api/session/start", payload);
  const assignment = Array.isArray(result.data.main_assignment)
    ? result.data.main_assignment
    : [];
  const assignedCounterbalance = result.data.counterbalance || {};
  const savedPractice = [];
  let savedPracticeEvent = null;
  let savedMain = null;
  if (result.response.status === 200 && result.data.ok === true && result.data.session_token) {
    savedPracticeEvent = await postJson(baseUrl, "/api/event", {
      session_id: result.data.session_id,
      session_token: result.data.session_token,
      event_type: "practice_audio_play_start",
      trial_index: 1,
      event_at: new Date().toISOString(),
      payload: {
        phase: "practice",
        practice_set_id: PRACTICE_SET_ID,
        target_word: PRACTICE_ITEMS[0].target_word,
      },
    });
    for (const practice of practiceAssignment()) {
      savedPractice.push(
        await postJson(
          baseUrl,
          "/api/trial",
          trialSavePayload(result.data.session_id, result.data.session_token, practice),
        ),
      );
    }
    if (assignment[0]) {
      savedMain = await postJson(
        baseUrl,
        "/api/trial",
        trialSavePayload(result.data.session_id, result.data.session_token, assignment[0]),
      );
    }
  }
  const duplicate = result.response.status === 200 && result.data.ok === true
    ? await postJson(baseUrl, "/api/session/start", resumePayload)
    : null;
  const duplicateResume = duplicate?.data?.resume || {};
  const duplicatePracticeRows = Array.isArray(duplicate?.data?.practice_assignment)
    ? duplicate.data.practice_assignment
    : [];
  const resumedPracticeSave = duplicate?.data?.session_token && duplicatePracticeRows[0]
    ? await postJson(
        baseUrl,
        "/api/trial",
        trialSavePayload(
          duplicate.data.session_id,
          duplicate.data.session_token,
          duplicatePracticeRows[0],
          { typed_response: "must-not-overwrite", accentedness_1_9: 9 },
        ),
      )
    : null;
  const placeholderRows = assignment.filter((row) => row.source_format === "dry_run_placeholder");
  const nonHttpsRows = assignment.filter((row) => !/^https:\/\//i.test(row.audio_url || ""));
  const engAccentedRows = assignment.filter((row) =>
    row.l1_condition === "ENG" && row.pronunciation_condition !== "natural"
  );
  const invalidL1Rows = assignment.filter((row) => !["ENG", "JPN", "CHN"].includes(row.l1_condition));
  const invalidPronunciationRows = assignment.filter((row) =>
    !["natural", "accented"].includes(row.pronunciation_condition)
  );
  const problems = [
    ...(result.response.status === 200 ? [] : [`/api/session/start returned ${result.response.status}`]),
    ...(result.data.ok === true ? [] : [`/api/session/start response was not ok: ${result.data.error || result.text.slice(0, 160)}`]),
    ...(assignment.length === 100 ? [] : [`expected 100 main assignments, got ${assignment.length}`]),
    ...(Number(result.data.trial_count) === 100 ? [] : [`expected trial_count 100, got ${result.data.trial_count}`]),
    ...(result.data.practice_recording_required === false
      ? []
      : ["new session did not disable practice recording"]),
    ...(Number(assignedCounterbalance.counterbalance_cell) >= 1 &&
      Number(assignedCounterbalance.counterbalance_cell) <= 20
      ? []
      : ["counterbalance response is missing a valid cell 1-20"]),
    ...(Number(assignedCounterbalance.speaker_pattern_bundle) >= 1 &&
      Number(assignedCounterbalance.speaker_pattern_bundle) <= 10
      ? []
      : ["counterbalance response is missing a valid speaker bundle 1-10"]),
    ...(assignedCounterbalance.allocation_strategy_version === ALLOCATION_STRATEGY_VERSION
      ? []
      : ["counterbalance response has the wrong allocation strategy version"]),
    ...(assignedCounterbalance.allocation_cohort === "dry_run:speaker_bundle_latin_v1"
      ? []
      : ["counterbalance response has the wrong dry-run allocation cohort"]),
    ...(Array.isArray(assignedCounterbalance.speaker_pattern_indexes) &&
      assignedCounterbalance.speaker_pattern_indexes.length === 4
      ? []
      : ["counterbalance response is missing the four speaker pattern indexes"]),
    ...(savedPracticeEvent?.response.status === 200 &&
      savedPracticeEvent.data.ok === true &&
      savedPracticeEvent.data.ignored === true &&
      savedPracticeEvent.data.reason === "practice_not_recorded"
      ? []
      : [
          `practice event was not explicitly ignored: ${savedPracticeEvent?.response.status ?? "not sent"} ${savedPracticeEvent?.data?.error || savedPracticeEvent?.text?.slice(0, 120) || ""}`.trim(),
        ]),
    ...savedPractice.flatMap((save, index) =>
      save.response.status === 200 &&
      save.data.ok === true &&
      save.data.ignored === true &&
      save.data.reason === "practice_not_recorded"
        ? []
        : [`practice ${index + 1} was not explicitly ignored: ${save.response.status} ${save.data.error || save.text.slice(0, 120)}`],
    ),
    ...(savedMain && savedMain.response.status === 200 && savedMain.data.ok === true
      ? []
      : ["first main-trial save did not succeed"]),
    ...(placeholderRows.length ? [`${placeholderRows.length} assignment row(s) used dry_run_placeholder fallback`] : []),
    ...(nonHttpsRows.length ? [`${nonHttpsRows.length} assignment row(s) do not have HTTPS audio_url`] : []),
    ...(engAccentedRows.length ? [`${engAccentedRows.length} ENG row(s) are not natural`] : []),
    ...(invalidL1Rows.length ? [`${invalidL1Rows.length} row(s) have invalid l1_condition`] : []),
    ...(invalidPronunciationRows.length
      ? [`${invalidPronunciationRows.length} row(s) have invalid pronunciation_condition`]
      : []),
    ...(duplicate
      ? [
          ...(duplicate.response.status === 200 ? [] : [`duplicate start returned ${duplicate.response.status}`]),
          ...(duplicate.data.ok === true ? [] : [`duplicate start response was not ok: ${duplicate.data.error || duplicate.text.slice(0, 160)}`]),
          ...(duplicate.data.existing_session === true ? [] : ["duplicate start did not report existing_session: true"]),
          ...(duplicate.data.practice_recording_required === false
            ? []
            : ["duplicate start did not preserve the no-practice-recording contract"]),
          ...(duplicate.data.session_id === result.data.session_id ? [] : ["duplicate start did not return the same session_id"]),
          ...(duplicate.data.session_token ? [] : ["duplicate start did not issue a fresh session_token"]),
          ...(JSON.stringify(duplicate.data.counterbalance) === JSON.stringify(assignedCounterbalance)
            ? []
            : ["duplicate start did not preserve the complete counterbalance allocation"]),
          ...(Array.isArray(duplicate.data.saved_trials) ? [] : ["duplicate start did not return saved_trials"]),
          ...(Array.isArray(duplicate.data.distractor_completed_trial_indexes) ? [] : ["duplicate start did not return distractor_completed_trial_indexes"]),
          ...(duplicateResume.practice_replay_required === true ? [] : ["duplicate start did not require all practice items to replay"]),
          ...(duplicateResume.next_phase === "main" ? [] : [`duplicate resume phase must be main, got ${duplicateResume.next_phase || "(missing)"}`]),
          ...(Number(duplicateResume.next_trial_index) === 2 ? [] : [`duplicate resume must preserve progress at main trial 2, got ${duplicateResume.next_trial_index || "(missing)"}`]),
          ...(duplicatePracticeRows.length === PRACTICE_ITEMS.length ? [] : [`duplicate start returned ${duplicatePracticeRows.length} practice assignments instead of ${PRACTICE_ITEMS.length}`]),
          ...PRACTICE_ITEMS.flatMap((expected, index) => {
            const actual = duplicatePracticeRows[index] || {};
            return actual.practice_set_id === expected.practice_set_id &&
              actual.target_word === expected.target_word &&
              actual.audio_url === expected.audio_url &&
              actual.participant_id === expected.talker &&
              actual.talker === expected.talker &&
              actual.spoken_form === expected.spoken_form &&
              actual.source_format === expected.source_format &&
              actual.practice_group === expected.practice_group &&
              actual.expert_comprehensibility_range === expected.expert_comprehensibility_range &&
              actual.expert_accentedness_range === expected.expert_accentedness_range &&
              actual.accent_condition === expected.pronunciation_condition &&
              actual.condition === `practice_${expected.pronunciation_condition}`
              ? []
              : [`practice assignment ${index + 1} does not match authoritative metadata for ${expected.target_word}`];
          }),
          ...(Array.isArray(duplicate.data.saved_trials) && duplicate.data.saved_trials.length === 1
            ? []
            : [`duplicate start should report 1 saved main row, got ${duplicate.data.saved_trials?.length ?? "(missing)"}`]),
          ...(duplicate.data.word_familiarity_required === true ? [] : ["duplicate start did not preserve word_familiarity_required"]),
          ...(Array.isArray(duplicate.data.word_familiarity) ? [] : ["duplicate start did not return word_familiarity"]),
          ...(Number(duplicate.data.japanese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original japanese_familiarity_1_6"]),
          ...(Number(duplicate.data.chinese_familiarity_1_6) === 3 ? [] : ["duplicate start did not return original chinese_familiarity_1_6"]),
          ...(Number(duplicate.data.participant_age_years) === 30 ? [] : ["duplicate start did not return original participant_age_years"]),
          ...(duplicate.data.english_variety === "other" ? [] : ["duplicate start did not return original english_variety"]),
          ...(duplicate.data.english_variety_other === "live check variety" ? [] : ["duplicate start did not return original english_variety_other"]),
          ...(duplicate.data.gender === "other" ? [] : ["duplicate start did not return original gender"]),
          ...(duplicate.data.gender_other === "live check gender" ? [] : ["duplicate start did not return original gender_other"]),
          ...(duplicate.data.english_teaching_experience === "yes" ? [] : ["duplicate start did not return original english_teaching_experience"]),
          ...(duplicate.data.english_teaching_experience_details === "live check teaching details" ? [] : ["duplicate start did not return original english_teaching_experience_details"]),
          ...(duplicate.data.linguistics_knowledge === "yes" ? [] : ["duplicate start did not return original linguistics_knowledge"]),
          ...(duplicate.data.linguistics_knowledge_details === "live check linguistics details" ? [] : ["duplicate start did not return original linguistics_knowledge_details"]),
        ]
      : []),
    ...(resumedPracticeSave?.response.status === 200 &&
      resumedPracticeSave.data.ok === true &&
      resumedPracticeSave.data.ignored === true &&
      resumedPracticeSave.data.reason === "practice_not_recorded"
      ? []
      : ["replayed practice was not ignored by the no-recording contract"]),
  ];
  return {
    problems,
    summary: JSON.stringify({
      status: result.response.status,
      ok: result.data.ok === true,
      dry_run: result.data.dry_run === true,
      trial_count: result.data.trial_count,
      main_assignment: assignment.length,
      counterbalance_cell: assignedCounterbalance.counterbalance_cell || "",
      speaker_pattern_bundle: assignedCounterbalance.speaker_pattern_bundle || "",
      allocation_strategy_version: assignedCounterbalance.allocation_strategy_version || "",
      allocation_cohort: assignedCounterbalance.allocation_cohort || "",
      speaker_pattern_indexes: assignedCounterbalance.speaker_pattern_indexes || [],
      placeholder_rows: placeholderRows.length,
      non_https_rows: nonHttpsRows.length,
      duplicate_existing_session: duplicate?.data?.existing_session === true,
      duplicate_resume_phase: duplicateResume.next_phase || "",
      duplicate_resume_trial_index: duplicateResume.next_trial_index || "",
      practice_replay_required: duplicateResume.practice_replay_required === true,
      practice_assignment: duplicatePracticeRows.length,
      practice_recording_required: duplicate?.data?.practice_recording_required === true,
      practice_event_ignored: savedPracticeEvent?.data?.ignored === true,
      resumed_practice_save_ignored: resumedPracticeSave?.data?.ignored === true,
    }),
  };
}

function markdown(checks, context) {
  const blockers = checks.flatMap((check) => check.problems.map((problem) => ({ ...check, problem })));
  const lines = [
    "# Live Deployment Check",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Base URL: ${context.baseUrl}`,
    "",
    `Result: ${blockers.length ? "FAIL" : "PASS"}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of checks) {
    lines.push(`- ${check.problems.length ? "FAIL" : "PASS"} ${check.name}: ${check.summary}`);
    for (const problem of check.problems) lines.push(`  - ${problem}`);
  }
  if (blockers.length) {
    lines.push("", "## Blockers", "");
    for (const blocker of blockers) lines.push(`- ${blocker.name}: ${blocker.problem}`);
  }
  return `${lines.join("\n")}\n`;
}

const baseUrl = argValue("--base-url", DEFAULT_BASE_URL).replace(/\/+$/, "/");
const out = path.resolve(argValue("--out", DEFAULT_OUT));
const allowDemoStaticManifest = hasFlag("--allow-demo-static-manifest");
const allowTurnstileOff = hasFlag("--allow-turnstile-off");
const apiDryRunStart = hasFlag("--api-dry-run-start");
const turnstileToken = argValue("--turnstile-token", process.env.TURNSTILE_TEST_TOKEN || "");

const index = await fetchText(baseUrl, "/");
const indexHtml = await fetchText(baseUrl, "/index.html");
const app = await fetchText(baseUrl, "/app.js");
const audioLifecycle = await fetchText(baseUrl, "/audio-lifecycle.js");
const manifest = await fetchText(baseUrl, "/remote_manifest.csv");
const config = await fetchText(baseUrl, "/api/config");
const selectedPractice = await Promise.all(
  PRACTICE_ITEMS.map((item) => fetchBinary(baseUrl, item.audio_url)),
);
const adminDryRun = await fetchHead(baseUrl, "/admin/dry-run.html");
const indexHtmlRedirectsHome =
  indexHtml.response.status >= 300 &&
  indexHtml.response.status < 400 &&
  new URL(header(indexHtml.response, "location") || "/index.html", baseUrl).pathname === "/";

let configJson = {};
try {
  configJson = JSON.parse(config.text);
} catch {
  configJson = {};
}
const manifestRows = parseCsv(manifest.text);
const repoManifestLooksDemo = manifestRows.length < 2497 || manifestRows.some((row) =>
  String(row.practice_note || "").toLowerCase().includes("demo")
  || String(row.participant_id || "").toLowerCase().startsWith("practice_")
);
const checks = [
  {
    name: "Index security headers",
    problems: [
      ...checkSecurityHeaders(index.response, "index"),
      ...checkCacheControl(index.response, "/", ["no-cache", "no-store", "must-revalidate"]),
      ...checkRequiredIndexSnippets(index.text),
    ],
    summary: JSON.stringify(summarizeHeaders(index.response)),
  },
  {
    name: "Explicit index.html headers",
    problems: [
      ...(indexHtml.response.status === 200 || indexHtmlRedirectsHome
        ? []
        : [`index.html returned ${indexHtml.response.status} without redirecting to /`]),
      ...(indexHtml.response.status === 200
        ? [
            ...checkSecurityHeaders(indexHtml.response, "index.html"),
            ...checkCacheControl(indexHtml.response, "/index.html", [
              "no-cache",
              "no-store",
              "must-revalidate",
            ]),
          ]
        : []),
    ],
    summary: JSON.stringify({
      ...summarizeHeaders(indexHtml.response),
      redirects_home: indexHtmlRedirectsHome,
    }),
  },
  {
    name: "Live app.js version",
    problems: [
      ...(app.response.status === 200 ? [] : [`app.js returned ${app.response.status}`]),
      ...checkSecurityHeaders(app.response, "app.js"),
      ...checkCacheControl(app.response, "/app.js", ["no-cache", "must-revalidate"]),
      ...checkRequiredAppSnippets(app.text),
      ...checkDeployedClientPracticeContract(app.text),
    ],
    summary: `${app.text.length} bytes`,
  },
  {
    name: "Live audio replay lifecycle",
    problems: [
      ...(audioLifecycle.response.status === 200
        ? []
        : [`audio-lifecycle.js returned ${audioLifecycle.response.status}`]),
      ...checkRequiredAudioLifecycleSnippets(audioLifecycle.text),
    ],
    summary: `${audioLifecycle.text.length} bytes`,
  },
  {
    name: "Live static remote_manifest.csv",
    problems: repoManifestLooksDemo && !allowDemoStaticManifest
      ? [`static remote_manifest.csv appears to be demo/incomplete (${manifestRows.length} rows)`]
      : [],
    summary: `${manifestRows.length} row(s)`,
  },
  {
    name: "Live /api/config",
    problems: [
      ...(configJson.production === true ? [] : ["production mode is not true"]),
      ...(!allowTurnstileOff && configJson.require_turnstile !== true ? ["Turnstile is not required"] : []),
    ],
    summary: JSON.stringify(configJson),
  },
  {
    name: "Selected practice audio deployed",
    problems: selectedPractice.flatMap((result, index) =>
      [
        ...(result.response.status >= 200 && result.response.status < 300
          ? []
          : [`${PRACTICE_ITEMS[index].target_word} practice WAV returned ${result.response.status}`]),
        ...(/^audio\//i.test(header(result.response, "content-type"))
          ? []
          : [`${PRACTICE_ITEMS[index].target_word} practice WAV returned ${header(result.response, "content-type") || "(no content-type)"}`]),
        ...(result.size_bytes === PRACTICE_ITEMS[index].size_bytes
          ? []
          : [`${PRACTICE_ITEMS[index].target_word} practice WAV is ${result.size_bytes} bytes; expected ${PRACTICE_ITEMS[index].size_bytes}`]),
        ...(result.sha256 === PRACTICE_ITEMS[index].sha256
          ? []
          : [`${PRACTICE_ITEMS[index].target_word} practice WAV SHA-256 is ${result.sha256}; expected ${PRACTICE_ITEMS[index].sha256}`]),
      ],
    ),
    summary: JSON.stringify(
      Object.fromEntries(
        selectedPractice.map((result, index) => [
          PRACTICE_ITEMS[index].target_word,
          { ...summarizeHeaders(result.response), size_bytes: result.size_bytes, sha256: result.sha256 },
        ]),
      ),
    ),
  },
  {
    name: "Admin dry-run protected",
    problems: [302, 401, 403].includes(adminDryRun.response.status)
      ? []
      : [`admin dry-run path returned ${adminDryRun.response.status}, expected Access challenge/deny`],
    summary: JSON.stringify(summarizeHeaders(adminDryRun.response)),
  },
];

if (apiDryRunStart) {
  checks.push({
    name: "Live API dry-run start",
    ...(await liveApiDryRunStartCheck(baseUrl, turnstileToken)),
  });
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, markdown(checks, { baseUrl }));
const blockers = checks.flatMap((check) => check.problems.map((problem) => `${check.name}: ${problem}`));
console.log(`live deployment report: ${out}`);
console.log(`result: ${blockers.length ? "FAIL" : "PASS"}`);
if (blockers.length) {
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exit(1);
}
