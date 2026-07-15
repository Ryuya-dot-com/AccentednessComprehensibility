import {
  cleanText,
  constantTimeEqual,
  errorResponse,
  insertEvent,
  isDryRunClient,
  jsonResponse,
  isProduction,
  nowMs,
  nowIso,
  nullableInt,
  nullableText,
  randomToken,
  readJson,
  requireDb,
  requireProlificIdentity,
  requireSameOrigin,
  requestClientContext,
  safeJson,
  sha256Hex,
  verifyTurnstile,
} from "../_utils.js";
import {
  allocateCounterbalance,
  buildCounterbalancedAssignment,
  CANONICAL_PRACTICE_ASSIGNMENT,
  counterbalancePayload,
  CURRENT_ALLOCATION_STRATEGY_VERSION,
  dryRunPlaceholderCounterbalanceMaterials,
  loadCounterbalanceMaterials,
  safeMaterialsJson,
  speakerPatternIndexesForBundle,
} from "../_counterbalance.js";

const ENGLISH_VARIETIES = [
  "american",
  "british",
  "australian",
  "new_zealand",
  "canadian",
  "other",
];
const GENDER_OPTIONS = ["man", "woman", "no_answer", "other"];
const YES_NO = ["yes", "no"];
const CURRENT_PLATFORM_VERSION = "pronunciation_rating_v0.10.0";

const ASSIGNMENT_SELECT = `
  SELECT
    phase, trial_index, source_path, audio_url, file_name, target_word,
    participant_id, native_language, accent_condition, condition, talker,
    pass_number, word_number, trial_number, take_number, spoken_form,
    practice_note, source_format, practice_kind, practice_group,
    counterbalance_cell, list_comb, pronunciation_style, stimulus_list,
    l1_condition, pronunciation_condition, block_index, block_list,
    within_block_index, block_trial_count, speaker_pattern_bundle,
    allocation_strategy_version, allocation_cohort, speaker_pattern_index,
    speaker_pattern_speaker, expert_comprehensibility_1_9,
    expert_accentedness_1_9
  FROM rating_assignments
  WHERE session_id = ? AND phase = ?
  ORDER BY trial_index
`;

function isUniqueConstraintError(error) {
  return /UNIQUE constraint failed/i.test(String(error?.message || error));
}

function hasProlificIdentity(client) {
  return Boolean(
    client.prolific_session_id ||
      (client.prolific_pid && client.prolific_study_id),
  );
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function requireCanonicalPracticeAssignment(rows) {
  const valid = Array.isArray(rows) &&
    rows.length === CANONICAL_PRACTICE_ASSIGNMENT.length &&
    CANONICAL_PRACTICE_ASSIGNMENT.every((expected, index) => {
      const row = rows[index] || {};
      return (
        cleanText(row.phase) === "practice" &&
        nullableInt(row.trial_index) === expected.trial_index &&
        canonicalKey(row.target_word) === expected.target_word &&
        cleanText(row.audio_url) === expected.audio_url
      );
    });
  if (!valid) {
    badRequest("practice_assignment must match the current four-item practice set.");
  }
}

function requiredIntegerInRange(name, value, min, max) {
  let number = null;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    number = Number(value.trim());
  }
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    badRequest(`${name} must be an integer between ${min} and ${max}.`);
  }
  return number;
}

function requiredChoice(name, value, allowedValues) {
  if (typeof value !== "string") badRequest(`${name} is required.`);
  const choice = value.trim();
  if (!allowedValues.includes(choice)) badRequest(`${name} is not allowed.`);
  return choice;
}

function optionalText(name, value, maxLength) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") badRequest(`${name} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) badRequest(`${name} is too long.`);
  return text;
}

function requireText(name, text) {
  if (!text) badRequest(`${name} is required.`);
  return text;
}

function conditionalText(choice, expectedChoice, text) {
  return choice === expectedChoice ? nullableText(text) : null;
}

function canonicalKey(value) {
  return cleanText(value).toLowerCase();
}

function prolificIdentityMatches(session, client) {
  return (
    constantTimeEqual(canonicalKey(session?.prolific_pid), canonicalKey(client?.prolific_pid)) &&
    constantTimeEqual(
      canonicalKey(session?.prolific_study_id),
      canonicalKey(client?.prolific_study_id),
    ) &&
    constantTimeEqual(
      canonicalKey(session?.prolific_session_id),
      canonicalKey(client?.prolific_session_id),
    )
  );
}

function identityMismatchResponse() {
  return errorResponse("Saved session identity could not be verified.", 401);
}

function platformRequiresWordFamiliarity(platformVersion) {
  const match = /^pronunciation_rating_v(\d+)\.(\d+)\.(\d+)$/i.exec(
    cleanText(platformVersion),
  );
  if (!match) return false;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  return major > 0 || minor >= 7;
}

function participantKey(client, raterId, sessionLabel) {
  if (isDryRunClient(client)) {
    return `dry-run:${canonicalKey(client.prolific_pid || raterId)}:${canonicalKey(
      client.prolific_session_id || sessionLabel,
    )}`;
  }
  const prolificPid = canonicalKey(client.prolific_pid);
  const prolificStudyId = canonicalKey(client.prolific_study_id);
  const prolificSessionId = canonicalKey(client.prolific_session_id);
  if (prolificPid && prolificStudyId) {
    return `prolific:${prolificStudyId}:${prolificPid}`;
  }
  if (prolificSessionId) {
    return `prolific-session:${prolificSessionId}`;
  }
  return `manual:${canonicalKey(raterId)}:${canonicalKey(sessionLabel)}`;
}

function validAllocationCohort(value) {
  const cohort = cleanText(value);
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(cohort)) {
    throw Object.assign(new Error("Counterbalance allocation cohort is invalid."), { status: 500 });
  }
  return cohort;
}

function trustedAllocationCohort(env, client, dryRun) {
  if (dryRun) return "dry_run:speaker_bundle_latin_v1";

  const studyId = canonicalKey(client.prolific_study_id);
  const configuredMap = cleanText(env.COUNTERBALANCE_COHORTS_JSON);
  if (configuredMap) {
    let cohortMap;
    try {
      cohortMap = JSON.parse(configuredMap);
    } catch {
      throw Object.assign(new Error("COUNTERBALANCE_COHORTS_JSON is not valid JSON."), {
        status: 500,
      });
    }
    const normalizedCohortMap = cohortMap && typeof cohortMap === "object"
      ? Object.fromEntries(
          Object.entries(cohortMap).map(([key, value]) => [canonicalKey(key), value]),
        )
      : {};
    const mapped = normalizedCohortMap[studyId];
    if (mapped) return validAllocationCohort(mapped);
    if (isProduction(env)) {
      throw Object.assign(new Error("This Prolific study is not authorized for counterbalance allocation."), {
        status: 403,
      });
    }
  }

  if (isProduction(env)) {
    throw Object.assign(new Error("Counterbalance allocation cohorts are not configured."), {
      status: 500,
    });
  }
  const fixedCohort = cleanText(env.COUNTERBALANCE_COHORT_ID);
  if (fixedCohort) return validAllocationCohort(fixedCohort);
  return "local:speaker_bundle_latin_v1";
}

function canResumeSession(session) {
  return cleanText(session?.status) === "started";
}

async function findExistingProlificSession(db, client, key) {
  if (key) {
    const byKey = await db
      .prepare(
        `SELECT * FROM sessions
         WHERE participant_key = ? AND status != 'start_failed'
         ORDER BY started_at_ms, started_at
         LIMIT 1`,
      )
      .bind(key)
      .first();
    if (byKey) return byKey;
  }
  if (client.prolific_session_id) {
    return db
      .prepare(
        `SELECT * FROM sessions
         WHERE prolific_session_id = ? AND status != 'start_failed'
         ORDER BY started_at_ms, started_at
         LIMIT 1`,
      )
      .bind(client.prolific_session_id)
      .first();
  }
  if (client.prolific_pid && client.prolific_study_id) {
    return db
      .prepare(
        `SELECT * FROM sessions
         WHERE prolific_pid = ? AND prolific_study_id = ? AND status != 'start_failed'
         ORDER BY started_at_ms, started_at
         LIMIT 1`,
      )
      .bind(client.prolific_pid, client.prolific_study_id)
      .first();
  }
  return null;
}

function counterbalanceFromSession(session) {
  if (!session?.counterbalance_cell) return null;
  return {
    allocation_id: nullableText(session.counterbalance_allocation_id),
    cell_id: nullableInt(session.counterbalance_cell),
    list_comb: session.list_comb,
    pronunciation_style: session.pronunciation_style,
    speaker_pattern_bundle: nullableInt(session.speaker_pattern_bundle),
    allocation_strategy_version: nullableText(session.allocation_strategy_version),
    allocation_cohort: nullableText(session.allocation_cohort),
    speaker_pattern_indexes: speakerPatternIndexesForBundle(session.speaker_pattern_bundle),
  };
}

async function issueSessionToken(db, sessionId, now = nowIso(), nowMsValue = nowMs()) {
  const sessionToken = randomToken();
  const sessionTokenHash = await sha256Hex(sessionToken);
  await db
    .prepare(
      `UPDATE sessions
       SET session_token_hash = ?, last_seen_at = ?, last_seen_at_ms = ?
       WHERE id = ?`,
    )
    .bind(sessionTokenHash, now, nowMsValue, sessionId)
    .run();
  return sessionToken;
}

async function recordDuplicateStart(db, sessionId, timestampIso, timestampMs) {
  await db
    .prepare(
      `UPDATE sessions
       SET duplicate_start_count = duplicate_start_count + 1,
           duplicate_start_last_at = ?,
           duplicate_start_last_at_ms = ?,
           last_seen_at = ?,
           last_seen_at_ms = ?
       WHERE id = ?`,
    )
    .bind(timestampIso, timestampMs, timestampIso, timestampMs, sessionId)
    .run();
}

async function existingSessionResponse(db, session, sessionToken) {
  const [
    practiceAssignment,
    mainAssignment,
    completedTrials,
    distractorEvents,
    wordFamiliarity,
  ] = await Promise.all([
    db.prepare(ASSIGNMENT_SELECT).bind(session.id, "practice").all(),
    db.prepare(ASSIGNMENT_SELECT).bind(session.id, "main").all(),
    db
      .prepare(
        `SELECT phase, trial_index
         FROM rating_trials
         WHERE session_id = ?
         ORDER BY CASE phase WHEN 'practice' THEN 0 WHEN 'main' THEN 1 ELSE 2 END, trial_index`,
      )
      .bind(session.id)
      .all(),
    db
      .prepare(
        `SELECT DISTINCT trial_index
         FROM event_logs
         WHERE session_id = ?
           AND event_type = 'distractor_complete'
           AND trial_index IS NOT NULL
         ORDER BY trial_index`,
      )
      .bind(session.id)
      .all(),
    db
      .prepare(
        `SELECT word_number, target_word, word_known, submitted_at
         FROM word_familiarity_responses
         WHERE session_id = ?
         ORDER BY word_number`,
      )
      .bind(session.id)
      .all(),
  ]);
  const savedPracticeRows = practiceAssignment.results || [];
  const practiceRecordingRequired = savedPracticeRows.length > 0;
  const practiceRows = practiceRecordingRequired
    ? savedPracticeRows
    : CANONICAL_PRACTICE_ASSIGNMENT.map((item) => ({
        ...item,
        source_path: item.audio_url,
      }));
  const mainRows = mainAssignment.results || [];
  const savedTrials = (completedTrials.results || []).map((row) => ({
    phase: cleanText(row.phase),
    trial_index: nullableInt(row.trial_index),
  }));
  const savedKeys = new Set(
    savedTrials
      .filter((row) => row.phase && row.trial_index)
      .map((row) => `${row.phase}:${row.trial_index}`),
  );
  const distractorCompletedIndexes = (distractorEvents.results || [])
    .map((row) => nullableInt(row.trial_index))
    .filter(Boolean);
  const distractorCompletedIndexSet = new Set(distractorCompletedIndexes);
  const wordFamiliarityRows = (wordFamiliarity.results || []).map((row) => ({
    word_number: nullableInt(row.word_number),
    target_word: cleanText(row.target_word),
    known: Number(row.word_known) === 1,
    submitted_at: cleanText(row.submitted_at),
  }));
  const nextAssignment = mainRows.find((row) => {
    const trialIndex = nullableInt(row.trial_index);
    return trialIndex && !savedKeys.has(`main:${trialIndex}`);
  });
  const resume = nextAssignment
    ? {
        next_phase: "main",
        next_trial_index: nullableInt(nextAssignment.trial_index),
      }
    : {
        next_phase:
          Number(session.word_familiarity_required) !== 1 || wordFamiliarityRows.length === 50
            ? "complete"
            : "word_familiarity",
        next_trial_index: null,
      };
  resume.practice_replay_required = true;
  if (resume.next_phase === "main" && resume.next_trial_index > 1) {
    const previousMain = mainRows.find((row) => nullableInt(row.trial_index) === resume.next_trial_index - 1);
    const upcomingMain = mainRows.find((row) => nullableInt(row.trial_index) === resume.next_trial_index);
    const pendingDistractorIndex = resume.next_trial_index - 1;
    const crossesBlockBoundary = Boolean(
      previousMain?.block_index &&
        upcomingMain?.block_index &&
        String(previousMain.block_index) !== String(upcomingMain.block_index),
    );
    if (crossesBlockBoundary && !distractorCompletedIndexSet.has(pendingDistractorIndex)) {
      resume.pending_distractor = true;
      resume.pending_distractor_index = pendingDistractorIndex;
    }
  }
  return {
    ok: true,
    existing_session: true,
    session_id: session.id,
    status: session.status,
    completed_trial_count: Number(session.completed_trial_count || 0),
    trial_count: Number(session.trial_count || 0),
    japanese_familiarity_1_6: nullableInt(session.japanese_familiarity_1_6),
    chinese_familiarity_1_6: nullableInt(session.chinese_familiarity_1_6),
    participant_age_years: nullableInt(session.participant_age_years),
    english_variety: cleanText(session.english_variety),
    english_variety_other: cleanText(session.english_variety_other),
    gender: cleanText(session.gender),
    gender_other: cleanText(session.gender_other),
    english_teaching_experience: cleanText(session.english_teaching_experience),
    english_teaching_experience_details: cleanText(session.english_teaching_experience_details),
    linguistics_knowledge: cleanText(session.linguistics_knowledge),
    linguistics_knowledge_details: cleanText(session.linguistics_knowledge_details),
    session_token: sessionToken,
    counterbalance: counterbalancePayload(counterbalanceFromSession(session)),
    practice_recording_required: practiceRecordingRequired,
    practice_assignment: practiceRows,
    main_assignment: mainRows,
    saved_trials: savedTrials,
    word_familiarity: wordFamiliarityRows,
    word_familiarity_required: Number(session.word_familiarity_required) === 1,
    distractor_completed_trial_indexes: distractorCompletedIndexes,
    resume,
  };
}

async function duplicateStartResponse(db, session) {
  const timestampMs = nowMs();
  const timestampIso = new Date(timestampMs).toISOString();
  await recordDuplicateStart(db, session.id, timestampIso, timestampMs);
  if (!canResumeSession(session)) {
    return jsonResponse(
      {
        ok: false,
        duplicate_participant: true,
        status: session.status,
        error: "This Prolific participant already has a closed session.",
      },
      409,
    );
  }
  const sessionToken = await issueSessionToken(db, session.id, timestampIso, timestampMs);
  return jsonResponse(await existingSessionResponse(db, session, sessionToken));
}

async function cleanupFailedStart(db, sessionId, allocationId) {
  const statements = [
    db.prepare("DELETE FROM rating_assignments WHERE session_id = ?").bind(sessionId),
    db.prepare("DELETE FROM sessions WHERE id = ? AND status = 'started'").bind(sessionId),
  ];
  if (allocationId) {
    statements.push(
      db
        .prepare(
          "DELETE FROM counterbalance_allocations WHERE id = ? AND status IN ('started', 'dry_run_started')",
        )
        .bind(allocationId),
    );
  }
  await db.batch(statements);
}

function canUseDryRunPlaceholder(error) {
  return /Missing counterbalance materials/i.test(String(error?.message || error));
}

async function insertEventBestEffort(db, event) {
  try {
    await insertEvent(db, event);
  } catch (error) {
    console.warn("event log failed", error);
  }
}

export async function onRequestPost(context) {
  let db = null;
  let sessionId = "";
  let counterbalance = null;
  let client = null;
  try {
    requireSameOrigin(context.request);
    db = requireDb(context.env);
    const body = await readJson(context.request);
    const raterId = cleanText(body.rater_id);
    const sessionLabel = cleanText(body.session_label);
    const taskMode = cleanText(body.task_mode) || "combined";
    const platformVersion = cleanText(body.platform_version) || "unknown";
    const counterbalanceEnabled = body.counterbalance?.enabled === true;
    let practiceAssignment = Array.isArray(body.practice_assignment)
      ? body.practice_assignment
      : [];
    let assignment = Array.isArray(body.assignment) ? body.assignment : [];
    let mainAssignment = [];

    if (!raterId) return errorResponse("rater_id is required.");
    if (!sessionLabel) return errorResponse("session_label is required.");
    if (isProduction(context.env) && !counterbalanceEnabled) {
      return errorResponse("Server-side counterbalancing is required in production.", 400);
    }
    if (isProduction(context.env) && platformVersion !== CURRENT_PLATFORM_VERSION) {
      return jsonResponse(
        {
          ok: false,
          reload_required: true,
          error: "The study was updated. Reload this page before starting.",
        },
        409,
      );
    }
    if (counterbalanceEnabled && body.resume_only !== true) {
      requireCanonicalPracticeAssignment(practiceAssignment);
      practiceAssignment = CANONICAL_PRACTICE_ASSIGNMENT.map((item) => ({
        ...item,
        source_path: item.audio_url,
      }));
    }
    client = requestClientContext(context.request, body);
    requireProlificIdentity(client, context.env);
    const dryRun = isDryRunClient(client);
    const key = participantKey(client, raterId, sessionLabel);
    if (hasProlificIdentity(client)) {
      const existing = await findExistingProlificSession(db, client, key);
      if (existing) {
        if (!prolificIdentityMatches(existing, client)) return identityMismatchResponse();
        return duplicateStartResponse(db, existing);
      }
    }
    if (body.resume_only === true) {
      return jsonResponse({ ok: true, existing_session: false, resume_only: true });
    }
    const allocationCohort = counterbalanceEnabled
      ? trustedAllocationCohort(context.env, client, dryRun)
      : "";
    const turnstileVerified = await verifyTurnstile(
      context.request,
      context.env,
      body.turnstile_token,
    );

    const participantAgeYears = requiredIntegerInRange(
      "participant_age_years",
      body.participant_age_years,
      1,
      120,
    );
    const japaneseFamiliarity = requiredIntegerInRange(
      "japanese_familiarity_1_6",
      body.japanese_familiarity_1_6,
      1,
      6,
    );
    const chineseFamiliarity = requiredIntegerInRange(
      "chinese_familiarity_1_6",
      body.chinese_familiarity_1_6,
      1,
      6,
    );
    const englishVariety = requiredChoice(
      "english_variety",
      body.english_variety,
      ENGLISH_VARIETIES,
    );
    const gender = requiredChoice("gender", body.gender, GENDER_OPTIONS);
    const englishTeachingExperience = requiredChoice(
      "english_teaching_experience",
      body.english_teaching_experience,
      YES_NO,
    );
    const linguisticsKnowledge = requiredChoice(
      "linguistics_knowledge",
      body.linguistics_knowledge,
      YES_NO,
    );
    const englishVarietyOtherInput = optionalText(
      "english_variety_other",
      body.english_variety_other,
      80,
    );
    const genderOtherInput = optionalText("gender_other", body.gender_other, 80);
    const englishTeachingExperienceDetailsInput = optionalText(
      "english_teaching_experience_details",
      body.english_teaching_experience_details,
      1000,
    );
    const linguisticsKnowledgeDetailsInput = optionalText(
      "linguistics_knowledge_details",
      body.linguistics_knowledge_details,
      1000,
    );
    if (englishVariety === "other") {
      requireText("english_variety_other", englishVarietyOtherInput);
    }
    if (gender === "other") requireText("gender_other", genderOtherInput);
    if (englishTeachingExperience === "yes") {
      requireText(
        "english_teaching_experience_details",
        englishTeachingExperienceDetailsInput,
      );
    }
    if (linguisticsKnowledge === "yes") {
      requireText("linguistics_knowledge_details", linguisticsKnowledgeDetailsInput);
    }
    const englishVarietyOther = conditionalText(
      englishVariety,
      "other",
      englishVarietyOtherInput,
    );
    const genderOther = conditionalText(gender, "other", genderOtherInput);
    const englishTeachingExperienceDetails = conditionalText(
      englishTeachingExperience,
      "yes",
      englishTeachingExperienceDetailsInput,
    );
    const linguisticsKnowledgeDetails = conditionalText(
      linguisticsKnowledge,
      "yes",
      linguisticsKnowledgeDetailsInput,
    );

    sessionId = crypto.randomUUID();
    const sessionToken = randomToken();
    const sessionTokenHash = await sha256Hex(sessionToken);
    const startedAtMs = nowMs();
    const startedAt = new Date(startedAtMs).toISOString();
    const screenJson = safeJson(body.screen || {});
    const seed = cleanText(body.seed) || `${raterId}_${sessionLabel}_${platformVersion}`;
    const wordFamiliarityRequired = isProduction(context.env) ||
      platformRequiresWordFamiliarity(platformVersion);
    let manifestSummary = null;

    if (counterbalanceEnabled) {
      let loadedManifest = await loadCounterbalanceMaterials(context);
      manifestSummary = loadedManifest.summary;
      counterbalance = await allocateCounterbalance(db, sessionId, startedAt, {
        dryRun,
        allocationCohort,
        allocationStrategyVersion: CURRENT_ALLOCATION_STRATEGY_VERSION,
      });
      try {
        mainAssignment = buildCounterbalancedAssignment(
          loadedManifest.materials,
          counterbalance,
          `${seed}:${sessionId}`,
        );
      } catch (error) {
        if (!dryRun || !canUseDryRunPlaceholder(error)) {
          await db
            .prepare("DELETE FROM counterbalance_allocations WHERE id = ?")
            .bind(counterbalance.allocation_id)
            .run();
          throw error;
        }
        loadedManifest = dryRunPlaceholderCounterbalanceMaterials(context, error.message);
        manifestSummary = loadedManifest.summary;
        try {
          mainAssignment = buildCounterbalancedAssignment(
            loadedManifest.materials,
            counterbalance,
            `${seed}:${sessionId}`,
          );
        } catch (fallbackError) {
          await db
            .prepare("DELETE FROM counterbalance_allocations WHERE id = ?")
            .bind(counterbalance.allocation_id)
            .run();
          throw fallbackError;
        }
      }
      assignment = mainAssignment;
    } else {
      practiceAssignment = assignment.filter(
        (item) => cleanText(item?.phase) === "practice",
      );
      mainAssignment = assignment.filter(
        (item) => cleanText(item?.phase) !== "practice",
      );
      assignment = mainAssignment;
    }

    if (!assignment.length) return errorResponse("assignment must contain trials.");

    try {
      const sessionInsert = db
        .prepare(
          `INSERT INTO sessions (
            id, role, rater_id, session_label, task_mode, platform_version,
            prolific_pid, prolific_study_id, prolific_session_id, participant_key, seed,
            user_agent, timezone, participant_age_years, english_variety,
            english_variety_other, gender, gender_other,
            english_teaching_experience, english_teaching_experience_details,
            linguistics_knowledge, linguistics_knowledge_details,
            japanese_familiarity_1_6, chinese_familiarity_1_6,
            word_familiarity_required,
            completion_code, session_token_hash,
            turnstile_verified,
            counterbalance_allocation_id, counterbalance_cell, list_comb,
            pronunciation_style, speaker_pattern_bundle,
            allocation_strategy_version, allocation_cohort, screen_json,
            started_at, started_at_ms, last_seen_at, last_seen_at_ms,
            status, trial_count, completed_trial_count
          ) VALUES (?, 'rater', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started', ?, 0)`,
        )
        .bind(
          sessionId,
          raterId,
          sessionLabel,
          taskMode,
          platformVersion,
          nullableText(client.prolific_pid),
          nullableText(client.prolific_study_id),
          nullableText(client.prolific_session_id),
          nullableText(key),
          nullableText(seed),
          nullableText(client.user_agent),
          nullableText(body.timezone),
          participantAgeYears,
          englishVariety,
          englishVarietyOther,
          gender,
          genderOther,
          englishTeachingExperience,
          englishTeachingExperienceDetails,
          linguisticsKnowledge,
          linguisticsKnowledgeDetails,
          japaneseFamiliarity,
          chineseFamiliarity,
          wordFamiliarityRequired ? 1 : 0,
          null,
          sessionTokenHash,
          Number(turnstileVerified),
          nullableText(counterbalance?.allocation_id),
          nullableInt(counterbalance?.cell_id),
          nullableText(counterbalance?.list_comb),
          nullableText(counterbalance?.pronunciation_style),
          nullableInt(counterbalance?.speaker_pattern_bundle),
          nullableText(counterbalance?.allocation_strategy_version),
          nullableText(counterbalance?.allocation_cohort),
          screenJson,
          startedAt,
          startedAtMs,
          startedAt,
          startedAtMs,
          assignment.length,
        );

      const statements = assignment.map((item, index) => {
        const trialIndex = Number.parseInt(item.trial_index || index + 1, 10);
        const phase = cleanText(item.phase) || "main";
        return db
          .prepare(
            `INSERT INTO rating_assignments (
              id, session_id, phase, trial_index, source_path, audio_url, file_name,
              target_word, participant_id, native_language, accent_condition,
              condition, talker, pass_number, word_number, trial_number,
              take_number, spoken_form, practice_note, source_format,
              practice_kind, practice_group, counterbalance_cell, list_comb,
              pronunciation_style, stimulus_list, l1_condition,
              pronunciation_condition, block_index, block_list,
              within_block_index, block_trial_count,
              speaker_pattern_bundle, allocation_strategy_version,
              allocation_cohort, speaker_pattern_index, speaker_pattern_speaker,
              expert_comprehensibility_1_9, expert_accentedness_1_9,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `${sessionId}:${phase}:${trialIndex}`,
            sessionId,
            phase,
            trialIndex,
            nullableText(item.source_path),
            nullableText(item.audio_url),
            nullableText(item.file_name),
            nullableText(item.target_word),
            nullableText(item.participant_id),
            nullableText(item.native_language),
            nullableText(item.accent_condition),
            nullableText(item.condition),
            nullableText(item.talker),
            nullableText(item.pass_number),
            nullableText(item.word_number),
            nullableText(item.trial_number),
            nullableText(item.take_number),
            nullableText(item.spoken_form),
            nullableText(item.practice_note),
            nullableText(item.source_format),
            nullableText(item.practice_kind),
            nullableText(item.practice_group),
            nullableInt(item.counterbalance_cell),
            nullableText(item.list_comb),
            nullableText(item.pronunciation_style),
            nullableText(item.stimulus_list),
            nullableText(item.l1_condition),
            nullableText(item.pronunciation_condition),
            nullableInt(item.block_index),
            nullableText(item.block_list),
            nullableInt(item.within_block_index),
            nullableInt(item.block_trial_count),
            nullableInt(item.speaker_pattern_bundle || counterbalance?.speaker_pattern_bundle),
            nullableText(
              item.allocation_strategy_version || counterbalance?.allocation_strategy_version,
            ),
            nullableText(item.allocation_cohort || counterbalance?.allocation_cohort),
            nullableInt(item.speaker_pattern_index),
            nullableText(item.speaker_pattern_speaker),
            nullableInt(item.expert_comprehensibility_1_9),
            nullableInt(item.expert_accentedness_1_9),
            startedAt,
          );
      });

      await db.batch([sessionInsert, ...statements]);
    } catch (error) {
      await cleanupFailedStart(db, sessionId, counterbalance?.allocation_id);
      if (isUniqueConstraintError(error) && hasProlificIdentity(client)) {
        const existing = await findExistingProlificSession(db, client, key);
        if (existing) {
          if (!prolificIdentityMatches(existing, client)) return identityMismatchResponse();
          return duplicateStartResponse(db, existing);
        }
      }
      throw error;
    }

    await insertEventBestEffort(db, {
      session_id: sessionId,
      rater_id: raterId,
      event_type: "session_start",
      event_at: startedAt,
      payload: {
        task_mode: taskMode,
        platform_version: platformVersion,
        participant_key: key,
        trial_count: assignment.length,
        practice_persisted: false,
        started_at_ms: startedAtMs,
        seed: cleanText(body.seed),
        japanese_familiarity_1_6: japaneseFamiliarity,
        chinese_familiarity_1_6: chineseFamiliarity,
        counterbalance: counterbalancePayload(counterbalance),
        counterbalance_enabled: counterbalanceEnabled,
        dry_run: dryRun,
        materials: counterbalanceEnabled ? JSON.parse(safeMaterialsJson(manifestSummary)) : undefined,
      },
    });

    return jsonResponse({
      ok: true,
      session_id: sessionId,
      session_token: sessionToken,
      trial_count: assignment.length,
      dry_run: dryRun,
      word_familiarity_required: wordFamiliarityRequired,
      practice_recording_required: false,
      counterbalance: counterbalancePayload(counterbalance),
      practice_assignment: practiceAssignment,
      main_assignment: mainAssignment,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not start session.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
