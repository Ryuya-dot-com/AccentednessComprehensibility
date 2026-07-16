import {
  assertAllowed,
  assertOptionalIntRange,
  assertRequiredIntRange,
  assertTextMax,
  boolToInt,
  cleanText,
  errorResponse,
  insertEvent,
  jsonResponse,
  nowMs,
  nowIso,
  nullableInt,
  nullableNumber,
  nullableText,
  readJson,
  requireDb,
  requireSameOrigin,
  requireSessionToken,
  requestClientContext,
  safeJson,
} from "./_utils.js";

const SESSION_BACKGROUND_FIELDS = new Set([
  "participant_age_years",
  "english_variety",
  "english_variety_other",
  "gender",
  "gender_other",
  "english_teaching_experience",
  "english_teaching_experience_details",
  "linguistics_knowledge",
  "linguistics_knowledge_details",
  "japanese_familiarity_1_6",
  "chinese_familiarity_1_6",
  "background",
]);

function normalizeResponse(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value) !== "";
}

function assertOptionalAllowed(name, value, allowedValues) {
  const text = cleanText(value);
  if (!text) return;
  assertAllowed(name, text, allowedValues);
}

function rawTrialPayload(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return {};
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !SESSION_BACKGROUND_FIELDS.has(key)),
  );
}

async function insertNonCriticalEvent(db, event) {
  try {
    await insertEvent(db, event);
    return true;
  } catch (error) {
    console.warn("non-critical event log failed", error);
    return false;
  }
}

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const serverSessionId = cleanText(body.session_id || body.server_session_id);
    const row = body.row || {};
    const phase = cleanText(row.phase) || "main";
    const trialIndex = nullableInt(row.trial_index);

    if (!serverSessionId) return errorResponse("server session_id is required.");
    if (!trialIndex) return errorResponse("row.trial_index is required.");
    assertAllowed("row.phase", phase, ["practice", "main"]);

    const session = await db
      .prepare(
        `SELECT id, rater_id, session_label, task_mode, platform_version,
          prolific_pid, prolific_study_id, prolific_session_id, trial_count,
          japanese_familiarity_1_6, chinese_familiarity_1_6,
          session_token_hash, status
         FROM sessions WHERE id = ?`,
      )
      .bind(serverSessionId)
      .first();
    if (!session) return errorResponse("Session was not found.", 404);
    await requireSessionToken(context.request, body, session);
    if (cleanText(session.status) !== "started") {
      return errorResponse("Session is not open for trial saves.", 409);
    }
    if (phase === "practice") {
      // Historical releases persisted different practice-set lengths. Assignment
      // existence below is the authoritative compatibility bound for those rows.
      assertRequiredIntRange("row.trial_index", trialIndex, 1, Number.MAX_SAFE_INTEGER);
    } else {
      assertRequiredIntRange(
        "row.trial_index",
        trialIndex,
        1,
        Number(session.trial_count || 1000),
      );
    }

    const assignment = await db
      .prepare(
        `SELECT *
         FROM rating_assignments
         WHERE session_id = ? AND phase = ? AND trial_index = ?`,
      )
      .bind(serverSessionId, phase, trialIndex)
      .first();
    if (!assignment) {
      if (phase === "practice") {
        return jsonResponse({
          ok: true,
          ignored: true,
          reason: "practice_not_recorded",
          session_id: serverSessionId,
          trial_index: trialIndex,
        });
      }
      return errorResponse("Assignment was not found for this session/trial.", 409);
    }

    const receivedAtMs = nowMs();
    const receivedAt = new Date(receivedAtMs).toISOString();
    const client = requestClientContext(context.request, body);
    const assignmentId = assignment.id;
    const trialId = assignmentId;
    const typedResponse = cleanText(row.typed_response);
    const taskMode = cleanText(session.task_mode || row.task_mode);
    const requiresDictation = taskMode === "combined" || taskMode === "dictation";
    const requiresRatings = taskMode === "combined" || taskMode === "ratings";
    const intelligibilityUnidentified = boolToInt(row.intelligibility_unidentified) === 1 ||
      cleanText(row.intelligibility_response_status) === "unidentified";
    const intelligibilityStatus = requiresDictation
      ? intelligibilityUnidentified
        ? "unidentified"
        : typedResponse
          ? "typed"
          : "blank"
      : "not_collected";
    assertAllowed("intelligibility_response_status", intelligibilityStatus, [
      "typed",
      "unidentified",
      "blank",
      "not_collected",
    ]);
    assertTextMax("typed_response", typedResponse, 120);
    assertTextMax("practice_reason", row.practice_reason, 600);
    assertTextMax("response_order", row.response_order, 120);
    assertTextMax("rating_order", row.rating_order, 80);
    assertTextMax("rating_interaction_sequence", row.rating_interaction_sequence, 240);
    assertOptionalAllowed("response_flow", row.response_flow, [
      "single_page",
      "staged_dictation_then_ratings",
    ]);
    const japaneseFamiliarity = nullableInt(session.japanese_familiarity_1_6) ||
      nullableInt(row.japanese_familiarity_1_6);
    const chineseFamiliarity = nullableInt(session.chinese_familiarity_1_6) ||
      nullableInt(row.chinese_familiarity_1_6);
    assertRequiredIntRange("japanese_familiarity_1_6", japaneseFamiliarity, 1, 6);
    assertRequiredIntRange("chinese_familiarity_1_6", chineseFamiliarity, 1, 6);
    assertOptionalAllowed("first_response_field", row.first_response_field, [
      "dictation",
      "unidentified",
      "comprehensibility",
      "accentedness",
    ]);
    assertOptionalAllowed("first_rating_field", row.first_rating_field, [
      "comprehensibility",
      "accentedness",
    ]);
    assertOptionalIntRange("comprehensibility_selection_count", row.comprehensibility_selection_count, 0, 50);
    assertOptionalIntRange("accentedness_selection_count", row.accentedness_selection_count, 0, 50);
    if (requiresDictation && typedResponse && intelligibilityUnidentified) {
      return errorResponse("Use either typed_response or intelligibility_unidentified, not both.", 400);
    }
    if (requiresDictation) {
      if (!typedResponse && !intelligibilityUnidentified) {
        return errorResponse("typed_response or intelligibility_unidentified is required.", 400);
      }
    }
    if (requiresRatings) {
      assertRequiredIntRange("comprehensibility_1_9", row.comprehensibility_1_9, 1, 9);
      assertRequiredIntRange("accentedness_1_9", row.accentedness_1_9, 1, 9);
    } else {
      assertOptionalIntRange("comprehensibility_1_9", row.comprehensibility_1_9, 1, 9);
      assertOptionalIntRange("accentedness_1_9", row.accentedness_1_9, 1, 9);
    }
    const normalizedResponse = normalizeResponse(typedResponse);
    const normalizedTarget = normalizeResponse(assignment.target_word);
    const shouldScoreIntelligibility = Boolean(
      normalizedTarget &&
        (intelligibilityUnidentified ||
          hasValue(row.typed_response) ||
          hasValue(row.normalized_response) ||
          hasValue(row.intelligibility_exact)),
    );

    const existingTrial = await db
      .prepare(
        `SELECT id
         FROM rating_trials
         WHERE session_id = ? AND phase = ? AND trial_index = ?`,
      )
      .bind(serverSessionId, phase, trialIndex)
      .first();
    if (existingTrial) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        session_id: serverSessionId,
        trial_index: trialIndex,
      });
    }

    await db
      .prepare(
        `INSERT OR IGNORE INTO rating_trials (
          id, session_id, assignment_id, rater_id, session_label,
          prolific_pid, prolific_study_id, prolific_session_id, task_mode,
          platform_version, phase, practice_kind, practice_group,
          counterbalance_cell, list_comb, pronunciation_style, stimulus_list,
          l1_condition, pronunciation_condition, block_index, block_list,
          within_block_index, block_trial_count,
          speaker_pattern_bundle, allocation_strategy_version,
          allocation_cohort, speaker_pattern_index, speaker_pattern_speaker,
          trial_index, trial_total, completed_at, played_at,
          source_path, audio_url, file_name, participant_id, native_language,
          accent_condition, condition, talker, pass_number, word_number,
          trial_number, take_number, spoken_form, practice_note, source_format,
          target_word, typed_response, normalized_response, normalized_target,
          intelligibility_exact, intelligibility_needs_manual_review,
          intelligibility_response_status, intelligibility_unidentified,
          comprehensibility_1_9, accentedness_1_9,
          expert_comprehensibility_1_9, expert_accentedness_1_9,
          practice_feedback, practice_requires_reason, practice_reason,
          japanese_familiarity_1_6, chinese_familiarity_1_6,
          first_key_rt_ms, submit_rt_ms, audio_duration_s, replay_count,
          response_flow, dictation_played_at, rating_played_at,
          dictation_submit_rt_ms, rating_submit_rt_ms,
          dictation_audio_duration_s, rating_audio_duration_s,
          response_order, first_response_field, first_response_rt_ms,
          rating_order, rating_interaction_sequence, first_rating_field,
          first_rating_rt_ms, comprehensibility_first_rt_ms,
          comprehensibility_last_rt_ms, comprehensibility_selection_count,
          accentedness_first_rt_ms, accentedness_last_rt_ms,
          accentedness_selection_count, unidentified_selected_rt_ms,
          client_saved_at, server_received_at, raw_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .bind(
        trialId,
        serverSessionId,
        assignmentId,
        cleanText(session.rater_id),
        cleanText(session.session_label),
        nullableText(session.prolific_pid || client.prolific_pid),
        nullableText(session.prolific_study_id || client.prolific_study_id),
        nullableText(session.prolific_session_id || client.prolific_session_id),
        taskMode,
        cleanText(session.platform_version || row.platform_version),
        cleanText(assignment.phase),
        nullableText(assignment.practice_kind),
        nullableText(assignment.practice_group),
        nullableInt(assignment.counterbalance_cell),
        nullableText(assignment.list_comb),
        nullableText(assignment.pronunciation_style),
        nullableText(assignment.stimulus_list),
        nullableText(assignment.l1_condition),
        nullableText(assignment.pronunciation_condition),
        nullableInt(assignment.block_index),
        nullableText(assignment.block_list),
        nullableInt(assignment.within_block_index),
        nullableInt(assignment.block_trial_count),
        nullableInt(assignment.speaker_pattern_bundle),
        nullableText(assignment.allocation_strategy_version),
        nullableText(assignment.allocation_cohort),
        nullableInt(assignment.speaker_pattern_index),
        nullableText(assignment.speaker_pattern_speaker),
        trialIndex,
        nullableInt(session.trial_count) || nullableInt(row.trial_total) || 0,
        nullableText(row.completed_at) || receivedAt,
        nullableText(row.played_at),
        nullableText(assignment.source_path),
        nullableText(assignment.audio_url),
        nullableText(assignment.file_name),
        nullableText(assignment.participant_id),
        nullableText(assignment.native_language),
        nullableText(assignment.accent_condition),
        nullableText(assignment.condition),
        nullableText(assignment.talker),
        nullableText(assignment.pass_number),
        nullableText(assignment.word_number),
        nullableText(assignment.trial_number),
        nullableText(assignment.take_number),
        nullableText(assignment.spoken_form),
        nullableText(assignment.practice_note),
        nullableText(assignment.source_format),
        nullableText(assignment.target_word),
        nullableText(typedResponse),
        nullableText(normalizedResponse),
        nullableText(normalizedTarget),
        shouldScoreIntelligibility
          ? Number(!intelligibilityUnidentified && normalizedResponse === normalizedTarget)
          : boolToInt(row.intelligibility_exact),
        shouldScoreIntelligibility
          ? Number(!intelligibilityUnidentified && normalizedResponse !== normalizedTarget)
          : boolToInt(row.intelligibility_needs_manual_review),
        intelligibilityStatus,
        intelligibilityUnidentified ? 1 : 0,
        nullableInt(row.comprehensibility_1_9),
        nullableInt(row.accentedness_1_9),
        nullableInt(assignment.expert_comprehensibility_1_9),
        nullableInt(assignment.expert_accentedness_1_9),
        nullableText(row.practice_feedback),
        boolToInt(row.practice_requires_reason),
        nullableText(row.practice_reason),
        japaneseFamiliarity,
        chineseFamiliarity,
        nullableNumber(row.first_key_rt_ms),
        nullableNumber(row.submit_rt_ms),
        nullableNumber(row.audio_duration_s),
        nullableInt(row.replay_count) || 0,
        nullableText(row.response_flow),
        nullableText(row.dictation_played_at),
        nullableText(row.rating_played_at),
        nullableNumber(row.dictation_submit_rt_ms),
        nullableNumber(row.rating_submit_rt_ms),
        nullableNumber(row.dictation_audio_duration_s),
        nullableNumber(row.rating_audio_duration_s),
        nullableText(row.response_order),
        nullableText(row.first_response_field),
        nullableNumber(row.first_response_rt_ms),
        nullableText(row.rating_order),
        nullableText(row.rating_interaction_sequence),
        nullableText(row.first_rating_field),
        nullableNumber(row.first_rating_rt_ms),
        nullableNumber(row.comprehensibility_first_rt_ms),
        nullableNumber(row.comprehensibility_last_rt_ms),
        nullableInt(row.comprehensibility_selection_count) || 0,
        nullableNumber(row.accentedness_first_rt_ms),
        nullableNumber(row.accentedness_last_rt_ms),
        nullableInt(row.accentedness_selection_count) || 0,
        nullableNumber(row.unidentified_selected_rt_ms),
        nullableText(row.completed_at) || receivedAt,
        receivedAt,
        safeJson(rawTrialPayload(row)),
      )
      .run();

    await db
      .prepare(
        `UPDATE sessions
         SET last_seen_at = ?,
             last_seen_at_ms = ?,
             completed_trial_count = (
               SELECT COUNT(*) FROM rating_trials WHERE session_id = ?
             )
         WHERE id = ?`,
      )
      .bind(receivedAt, receivedAtMs, serverSessionId, serverSessionId)
      .run();

    const eventLogged = await insertNonCriticalEvent(db, {
      session_id: serverSessionId,
      rater_id: cleanText(session.rater_id),
      event_type: "trial_saved",
      trial_index: trialIndex,
      event_at: receivedAt,
      payload: {
        phase: assignment.phase,
        practice_kind: assignment.practice_kind,
        file_name: assignment.file_name,
        target_word: assignment.target_word,
        intelligibility_response_status: intelligibilityStatus,
        intelligibility_unidentified: intelligibilityUnidentified,
        submit_rt_ms: row.submit_rt_ms,
      },
    });

    return jsonResponse({
      ok: true,
      session_id: serverSessionId,
      trial_index: trialIndex,
      event_logged: eventLogged,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not save trial.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
