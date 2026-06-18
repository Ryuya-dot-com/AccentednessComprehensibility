import {
  cleanText,
  errorResponse,
  insertEvent,
  requireAdmin,
  requireDb,
  requireSameOrigin,
  rowsToCsv,
  textResponse,
} from "../../_utils.js";

const EXPORTS = {
  analysis: {
    fileName: "analysis_main_completed.csv",
    columns: [
      "analysis_participant_id",
      "session_status",
      "counterbalance_cell",
      "list_comb",
      "pronunciation_style",
      "japanese_familiarity_1_6",
      "chinese_familiarity_1_6",
      "trial_index",
      "block_index",
      "block_list",
      "within_block_index",
      "block_trial_count",
      "stimulus_list",
      "l1_condition",
      "pronunciation_condition",
      "participant_id",
      "talker",
      "target_word",
      "word_number",
      "trial_number",
      "take_number",
      "file_name",
      "typed_response",
      "normalized_response",
      "normalized_target",
      "intelligibility_exact",
      "intelligibility_needs_manual_review",
      "intelligibility_response_status",
      "intelligibility_unidentified",
      "comprehensibility_1_9",
      "accentedness_1_9",
      "first_key_rt_ms",
      "submit_rt_ms",
      "audio_duration_s",
      "replay_count",
      "response_order",
      "first_response_field",
      "first_response_rt_ms",
      "rating_order",
      "rating_interaction_sequence",
      "first_rating_field",
      "first_rating_rt_ms",
      "comprehensibility_first_rt_ms",
      "comprehensibility_last_rt_ms",
      "comprehensibility_selection_count",
      "accentedness_first_rt_ms",
      "accentedness_last_rt_ms",
      "accentedness_selection_count",
      "unidentified_selected_rt_ms",
    ],
    sql: `SELECT
        s.id AS session_id,
        s.status AS session_status,
        s.counterbalance_cell,
        s.list_comb,
        s.pronunciation_style,
        s.japanese_familiarity_1_6,
        s.chinese_familiarity_1_6,
        rt.trial_index,
        rt.block_index,
        rt.block_list,
        rt.within_block_index,
        rt.block_trial_count,
        rt.stimulus_list,
        rt.l1_condition,
        rt.pronunciation_condition,
        rt.participant_id,
        rt.talker,
        rt.target_word,
        rt.word_number,
        rt.trial_number,
        rt.take_number,
        rt.file_name,
        rt.typed_response,
        rt.normalized_response,
        rt.normalized_target,
        rt.intelligibility_exact,
        rt.intelligibility_needs_manual_review,
        rt.intelligibility_response_status,
        rt.intelligibility_unidentified,
        rt.comprehensibility_1_9,
        rt.accentedness_1_9,
        rt.first_key_rt_ms,
        rt.submit_rt_ms,
        rt.audio_duration_s,
        rt.replay_count,
        rt.response_order,
        rt.first_response_field,
        rt.first_response_rt_ms,
        rt.rating_order,
        rt.rating_interaction_sequence,
        rt.first_rating_field,
        rt.first_rating_rt_ms,
        rt.comprehensibility_first_rt_ms,
        rt.comprehensibility_last_rt_ms,
        rt.comprehensibility_selection_count,
        rt.accentedness_first_rt_ms,
        rt.accentedness_last_rt_ms,
        rt.accentedness_selection_count,
        rt.unidentified_selected_rt_ms
      FROM rating_trials rt
      JOIN sessions s ON s.id = rt.session_id
      WHERE s.status = 'completed'
        AND rt.phase = 'main'
      ORDER BY s.completed_at_ms, s.completed_at, s.id, rt.trial_index`,
    transform: addAnalysisParticipantIds,
  },
  ratings: {
    fileName: "rating_trials.csv",
    columns: [
      "session_id",
      "assignment_id",
      "rater_id",
      "session_label",
      "prolific_pid",
      "prolific_study_id",
      "prolific_session_id",
      "task_mode",
      "platform_version",
      "phase",
      "practice_kind",
      "practice_group",
      "counterbalance_cell",
      "list_comb",
      "pronunciation_style",
      "stimulus_list",
      "l1_condition",
      "pronunciation_condition",
      "block_index",
      "block_list",
      "within_block_index",
      "block_trial_count",
      "trial_index",
      "trial_total",
      "completed_at",
      "played_at",
      "server_received_at",
      "source_path",
      "audio_url",
      "file_name",
      "participant_id",
      "native_language",
      "accent_condition",
      "condition",
      "talker",
      "pass_number",
      "word_number",
      "trial_number",
      "take_number",
      "spoken_form",
      "practice_note",
      "source_format",
      "target_word",
      "typed_response",
      "normalized_response",
      "normalized_target",
      "intelligibility_exact",
      "intelligibility_needs_manual_review",
      "intelligibility_response_status",
      "intelligibility_unidentified",
      "comprehensibility_1_9",
      "accentedness_1_9",
      "expert_comprehensibility_1_9",
      "expert_accentedness_1_9",
      "practice_feedback",
      "practice_requires_reason",
      "practice_reason",
      "japanese_familiarity_1_6",
      "chinese_familiarity_1_6",
      "first_key_rt_ms",
      "submit_rt_ms",
      "audio_duration_s",
      "replay_count",
      "response_order",
      "first_response_field",
      "first_response_rt_ms",
      "rating_order",
      "rating_interaction_sequence",
      "first_rating_field",
      "first_rating_rt_ms",
      "comprehensibility_first_rt_ms",
      "comprehensibility_last_rt_ms",
      "comprehensibility_selection_count",
      "accentedness_first_rt_ms",
      "accentedness_last_rt_ms",
      "accentedness_selection_count",
      "unidentified_selected_rt_ms",
    ],
    sql: `SELECT
        session_id, assignment_id, rater_id, session_label, prolific_pid,
        prolific_study_id, prolific_session_id, task_mode, platform_version,
        phase, practice_kind, practice_group,
        counterbalance_cell, list_comb, pronunciation_style, stimulus_list,
        l1_condition, pronunciation_condition, block_index, block_list,
        within_block_index, block_trial_count, trial_index, trial_total,
        completed_at, played_at, server_received_at,
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
        response_order, first_response_field, first_response_rt_ms,
        rating_order, rating_interaction_sequence, first_rating_field,
        first_rating_rt_ms, comprehensibility_first_rt_ms,
        comprehensibility_last_rt_ms, comprehensibility_selection_count,
        accentedness_first_rt_ms, accentedness_last_rt_ms,
        accentedness_selection_count, unidentified_selected_rt_ms
      FROM rating_trials
      ORDER BY rater_id, session_label, phase, trial_index`,
  },
  sessions: {
    fileName: "sessions.csv",
    columns: [
      "id",
      "role",
      "rater_id",
      "session_label",
      "task_mode",
      "platform_version",
      "prolific_pid",
      "prolific_study_id",
      "prolific_session_id",
      "participant_key",
      "seed",
      "japanese_familiarity_1_6",
      "chinese_familiarity_1_6",
      "completion_code",
      "counterbalance_allocation_id",
      "counterbalance_cell",
      "list_comb",
      "pronunciation_style",
      "started_at",
      "started_at_ms",
      "completed_at",
      "completed_at_ms",
      "last_seen_at",
      "last_seen_at_ms",
      "status",
      "trial_count",
      "completed_trial_count",
      "completion_url_issued_at",
      "completion_url_issued_at_ms",
      "completion_url_issued_count",
      "duplicate_start_count",
      "duplicate_start_last_at",
      "duplicate_start_last_at_ms",
      "timezone",
      "user_agent",
    ],
    sql: `SELECT
        id, role, rater_id, session_label, task_mode, platform_version,
        prolific_pid, prolific_study_id, prolific_session_id, participant_key, seed,
        japanese_familiarity_1_6, chinese_familiarity_1_6, completion_code,
        counterbalance_allocation_id, counterbalance_cell, list_comb,
        pronunciation_style,
        started_at, started_at_ms, completed_at, completed_at_ms,
        last_seen_at, last_seen_at_ms, status, trial_count,
        completed_trial_count, completion_url_issued_at,
        completion_url_issued_at_ms, completion_url_issued_count,
        duplicate_start_count, duplicate_start_last_at, duplicate_start_last_at_ms,
        timezone, user_agent
      FROM sessions
      ORDER BY started_at`,
  },
  assignments: {
    fileName: "rating_assignments.csv",
    columns: [
      "session_id",
      "phase",
      "trial_index",
      "source_path",
      "audio_url",
      "file_name",
      "target_word",
      "participant_id",
      "native_language",
      "accent_condition",
      "condition",
      "talker",
      "pass_number",
      "word_number",
      "trial_number",
      "take_number",
      "spoken_form",
      "practice_note",
      "source_format",
      "practice_kind",
      "practice_group",
      "counterbalance_cell",
      "list_comb",
      "pronunciation_style",
      "stimulus_list",
      "l1_condition",
      "pronunciation_condition",
      "block_index",
      "block_list",
      "within_block_index",
      "block_trial_count",
      "expert_comprehensibility_1_9",
      "expert_accentedness_1_9",
      "created_at",
    ],
    sql: `SELECT
        session_id, phase, trial_index, source_path, audio_url, file_name,
        target_word, participant_id, native_language, accent_condition,
        condition, talker, pass_number, word_number, trial_number,
        take_number, spoken_form, practice_note, source_format,
        practice_kind, practice_group, counterbalance_cell, list_comb,
        pronunciation_style, stimulus_list, l1_condition,
        pronunciation_condition, block_index, block_list,
        within_block_index, block_trial_count,
        expert_comprehensibility_1_9,
        expert_accentedness_1_9, created_at
      FROM rating_assignments
      ORDER BY session_id, phase, trial_index`,
  },
  events: {
    fileName: "event_logs.csv",
    columns: [
      "id",
      "session_id",
      "rater_id",
      "event_type",
      "trial_index",
      "event_at",
      "server_received_at",
      "payload_json",
    ],
    sql: `SELECT
        id, session_id, rater_id, event_type, trial_index, event_at,
        server_received_at, payload_json
      FROM event_logs
      ORDER BY server_received_at`,
  },
  counterbalance: {
    fileName: "counterbalance_allocations.csv",
    columns: [
      "id",
      "session_id",
      "cell_id",
      "list_comb",
      "pronunciation_style",
      "status",
      "assigned_at",
      "completed_at",
      "updated_at",
      "rater_id",
      "prolific_pid",
      "participant_key",
    ],
    sql: `SELECT
        ca.id, ca.session_id, ca.cell_id, cc.list_comb, cc.pronunciation_style,
        ca.status, ca.assigned_at, ca.completed_at, ca.updated_at,
        s.rater_id, s.prolific_pid, s.participant_key
      FROM counterbalance_allocations ca
      JOIN counterbalance_cells cc ON cc.cell_id = ca.cell_id
      LEFT JOIN sessions s ON s.id = ca.session_id
      ORDER BY ca.assigned_at`,
  },
  quality: {
    fileName: "data_quality_sessions.csv",
    columns: [
      "analysis_participant_id",
      "status",
      "elapsed_ms",
      "active_elapsed_ms",
      "trial_count",
      "completed_trial_count",
      "missing_trial_count",
      "main_saved_count",
      "practice_saved_count",
      "manual_review_count",
      "unidentified_count",
      "blank_dictation_count",
      "missing_rating_count",
      "avg_submit_rt_ms",
      "min_submit_rt_ms",
      "max_submit_rt_ms",
      "avg_replay_count",
      "max_replay_count",
      "distractor_completed_count",
      "distractor_correct_total",
      "distractor_problem_total",
      "distractor_accuracy",
      "avg_distractor_rt_ms",
      "duplicate_start_count",
      "completion_url_issued_count",
      "counterbalance_cell",
      "list_comb",
      "pronunciation_style",
    ],
    sql: `SELECT
        s.id AS session_id,
        s.status,
        CASE
          WHEN s.status = 'completed' AND s.completed_at_ms IS NOT NULL AND s.started_at_ms IS NOT NULL
          THEN s.completed_at_ms - s.started_at_ms
          ELSE NULL
        END AS elapsed_ms,
        CASE
          WHEN s.last_seen_at_ms IS NOT NULL AND s.started_at_ms IS NOT NULL
          THEN s.last_seen_at_ms - s.started_at_ms
          ELSE NULL
        END AS active_elapsed_ms,
        s.trial_count,
        s.completed_trial_count,
        CASE
          WHEN s.trial_count - s.completed_trial_count > 0
          THEN s.trial_count - s.completed_trial_count
          ELSE 0
        END AS missing_trial_count,
        SUM(CASE WHEN rt.phase = 'main' THEN 1 ELSE 0 END) AS main_saved_count,
        SUM(CASE WHEN rt.phase = 'practice' THEN 1 ELSE 0 END) AS practice_saved_count,
        SUM(CASE WHEN rt.intelligibility_needs_manual_review = 1 THEN 1 ELSE 0 END) AS manual_review_count,
        SUM(CASE WHEN rt.intelligibility_unidentified = 1 THEN 1 ELSE 0 END) AS unidentified_count,
        SUM(CASE WHEN rt.id IS NOT NULL AND (rt.typed_response IS NULL OR rt.typed_response = '') AND COALESCE(rt.intelligibility_unidentified, 0) = 0 THEN 1 ELSE 0 END) AS blank_dictation_count,
        SUM(CASE WHEN rt.phase = 'main' AND (rt.comprehensibility_1_9 IS NULL OR rt.accentedness_1_9 IS NULL) THEN 1 ELSE 0 END) AS missing_rating_count,
        ROUND(AVG(rt.submit_rt_ms), 2) AS avg_submit_rt_ms,
        MIN(rt.submit_rt_ms) AS min_submit_rt_ms,
        MAX(rt.submit_rt_ms) AS max_submit_rt_ms,
        ROUND(AVG(rt.replay_count), 2) AS avg_replay_count,
        MAX(rt.replay_count) AS max_replay_count,
        COALESCE(de.distractor_completed_count, 0) AS distractor_completed_count,
        COALESCE(de.distractor_correct_total, 0) AS distractor_correct_total,
        COALESCE(de.distractor_problem_total, 0) AS distractor_problem_total,
        CASE
          WHEN COALESCE(de.distractor_problem_total, 0) > 0
          THEN ROUND(1.0 * de.distractor_correct_total / de.distractor_problem_total, 4)
          ELSE NULL
        END AS distractor_accuracy,
        de.avg_distractor_rt_ms,
        s.duplicate_start_count,
        s.completion_url_issued_count,
        s.counterbalance_cell,
        s.list_comb,
        s.pronunciation_style
      FROM sessions s
      LEFT JOIN rating_trials rt ON rt.session_id = s.id
      LEFT JOIN (
        SELECT
          session_id,
          COUNT(*) AS distractor_completed_count,
          SUM(COALESCE(CAST(json_extract(payload_json, '$.correct_count') AS INTEGER), 0)) AS distractor_correct_total,
          SUM(COALESCE(CAST(json_extract(payload_json, '$.problem_count') AS INTEGER), 0)) AS distractor_problem_total,
          ROUND(AVG(CAST(json_extract(payload_json, '$.rt_ms') AS REAL)), 2) AS avg_distractor_rt_ms
        FROM event_logs
        WHERE event_type = 'distractor_complete'
        GROUP BY session_id
      ) de ON de.session_id = s.id
      GROUP BY s.id
      ORDER BY s.started_at_ms, s.started_at`,
    transform: addAnalysisParticipantIds,
  },
};

function addAnalysisParticipantIds(rows) {
  const participantIds = new Map();
  let nextId = 1;
  return rows.map((row) => {
    if (!participantIds.has(row.session_id)) {
      participantIds.set(row.session_id, `P${String(nextId).padStart(4, "0")}`);
      nextId += 1;
    }
    return {
      ...row,
      analysis_participant_id: participantIds.get(row.session_id),
    };
  });
}

async function logAdminExport(db, dataset, request, accessPayload) {
  try {
    const email = cleanText(
      accessPayload?.email || request.headers.get("cf-access-authenticated-user-email"),
    );
    await insertEvent(db, {
      rater_id: email || "admin",
      event_type: "admin_export",
      event_at: new Date().toISOString(),
      payload: {
        dataset,
        access_email: email || "",
        user_agent: request.headers.get("user-agent") || "",
      },
    });
  } catch (error) {
    console.warn("admin export audit log failed", error);
  }
}

export async function onRequestGet(context) {
  try {
    requireSameOrigin(context.request);
    const accessPayload = await requireAdmin(context.request, context.env);
    const dataset = String(context.params.dataset || "")
      .replace(/\.csv$/i, "")
      .toLowerCase();
    const exportSpec = EXPORTS[dataset];
    if (!exportSpec) {
      return errorResponse(
        "Unknown export. Use analysis.csv, ratings.csv, sessions.csv, assignments.csv, events.csv, counterbalance.csv, or quality.csv.",
        404,
      );
    }

    const db = requireDb(context.env);
    await logAdminExport(db, dataset, context.request, accessPayload);
    const { results } = await db.prepare(exportSpec.sql).all();
    const rows = exportSpec.transform ? exportSpec.transform(results || []) : results || [];
    const csv = "\uFEFF" + rowsToCsv(rows, exportSpec.columns);
    return textResponse(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportSpec.fileName}"`,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not export data.", error.status || 500);
  }
}

export function onRequest(context) {
  return errorResponse("Method not allowed.", 405);
}
