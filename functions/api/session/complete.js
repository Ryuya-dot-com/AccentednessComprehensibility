import {
  cleanText,
  elapsedSeconds,
  errorResponse,
  insertEvent,
  isDryRunSession,
  jsonResponse,
  minCompletionSeconds,
  nowMs,
  prolificCompletionConfig,
  nowIso,
  readJson,
  requireDb,
  requireSameOrigin,
  requireSessionToken,
} from "../_utils.js";

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const sessionId = cleanText(body.session_id || body.server_session_id);
    if (!sessionId) return errorResponse("session_id is required.");

    const session = await db
      .prepare(
        `SELECT id, rater_id, trial_count, counterbalance_allocation_id,
           session_token_hash, started_at, started_at_ms, status,
           completed_trial_count, completion_url_issued_count,
           prolific_pid, prolific_study_id, prolific_session_id, participant_key
         FROM sessions WHERE id = ?`,
      )
      .bind(sessionId)
      .first();
    if (!session) return errorResponse("Session was not found.", 404);
    await requireSessionToken(context.request, body, session);
    const dryRun = isDryRunSession(session);
    if (cleanText(session.status) !== "started") {
      const priorCompletion = cleanText(session.status) === "completed"
        ? dryRun
          ? { code: "DRY-RUN", url: "" }
          : prolificCompletionConfig(context.env)
        : { code: "", url: "" };
      return jsonResponse({
        ok: true,
        existing_completion: true,
        session_id: sessionId,
        status: session.status,
        trial_count: Number(session.trial_count || 0),
        completed_trial_count: Number(session.completed_trial_count || 0),
        completion_code: priorCompletion.code,
        completion_url: priorCompletion.url,
        redirect_after_ms: priorCompletion.url ? 1200 : 0,
      });
    }

    const coverageRow = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*)
            FROM rating_assignments
            WHERE session_id = ?) AS assignment_count,
           (SELECT COUNT(*)
            FROM rating_trials
            WHERE session_id = ?) AS completed_count,
           (SELECT COUNT(*)
            FROM rating_assignments ra
            LEFT JOIN rating_trials rt
              ON rt.session_id = ra.session_id
             AND rt.phase = ra.phase
             AND rt.trial_index = ra.trial_index
            WHERE ra.session_id = ?
              AND rt.id IS NULL) AS missing_assignment_count,
           (SELECT COUNT(*)
            FROM rating_trials rt
            LEFT JOIN rating_assignments ra
              ON ra.session_id = rt.session_id
             AND ra.phase = rt.phase
             AND ra.trial_index = rt.trial_index
            WHERE rt.session_id = ?
              AND ra.id IS NULL) AS orphan_trial_count`,
      )
      .bind(sessionId, sessionId, sessionId, sessionId)
      .first();
    const assignmentCount = Number(coverageRow?.assignment_count || 0);
    const completedCount = Number(coverageRow?.completed_count || 0);
    const missingAssignmentCount = Number(coverageRow?.missing_assignment_count || 0);
    const orphanTrialCount = Number(coverageRow?.orphan_trial_count || 0);
    const expectedTrialCount = Number(session.trial_count || 0);
    const completedAtMs = nowMs();
    const completedAt = new Date(completedAtMs).toISOString();
    const hasCompleteAssignmentCoverage =
      expectedTrialCount > 0 &&
      assignmentCount === expectedTrialCount &&
      completedCount === expectedTrialCount &&
      missingAssignmentCount === 0 &&
      orphanTrialCount === 0;
    let status = hasCompleteAssignmentCoverage ? "completed" : "completed_with_missing_trials";
    const minimumSeconds = minCompletionSeconds(context.env);
    const elapsed = elapsedSeconds(session.started_at, completedAt);
    const startedAtMs = Number(session.started_at_ms || 0);
    const elapsedMs = startedAtMs > 0 ? Math.max(0, completedAtMs - startedAtMs) : null;
    if (
      status === "completed" &&
      minimumSeconds &&
      elapsedMs !== null &&
      elapsedMs < minimumSeconds * 1000
    ) {
      status = "completed_too_fast";
    }

    const completion = status === "completed"
      ? dryRun
        ? { code: "DRY-RUN", url: "" }
        : prolificCompletionConfig(context.env)
      : { code: "", url: "" };
    if (status === "completed" && !dryRun && !completion.code && !completion.url) {
      status = "completed_no_completion_config";
    }

    await db
      .prepare(
        `UPDATE sessions
         SET status = ?, completed_at = ?, last_seen_at = ?,
             completed_at_ms = ?, last_seen_at_ms = ?,
             completed_trial_count = ?,
             completion_code = COALESCE(?, completion_code),
             completion_url_issued_at = CASE WHEN ? != '' THEN ? ELSE completion_url_issued_at END,
             completion_url_issued_at_ms = CASE WHEN ? != '' THEN ? ELSE completion_url_issued_at_ms END,
             completion_url_issued_count = completion_url_issued_count + ?
         WHERE id = ?`,
      )
      .bind(
        status,
        completedAt,
        completedAt,
        completedAtMs,
        completedAtMs,
        completedCount,
        completion.code || null,
        completion.url,
        completedAt,
        completion.url,
        completedAtMs,
        completion.url ? 1 : 0,
        sessionId,
      )
      .run();

    if (session.counterbalance_allocation_id) {
      const allocationStatus = dryRun
        ? status === "completed"
          ? "dry_run_completed"
          : "dry_run_incomplete"
        : status === "completed"
          ? "completed"
          : "incomplete";
      await db
        .prepare(
          `UPDATE counterbalance_allocations
           SET status = ?, completed_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          allocationStatus,
          status === "completed" ? completedAt : null,
          completedAt,
          session.counterbalance_allocation_id,
        )
        .run();
    }

    await insertEvent(db, {
      session_id: sessionId,
      rater_id: session.rater_id,
      event_type: "session_complete",
      event_at: completedAt,
      payload: {
        trial_count: session.trial_count,
        assignment_count: assignmentCount,
        completed_trial_count: completedCount,
        missing_assignment_count: missingAssignmentCount,
        orphan_trial_count: orphanTrialCount,
        status,
        elapsed_seconds: elapsed,
        elapsed_ms: elapsedMs,
        min_completion_seconds: minimumSeconds,
        completion_url_issued: Boolean(completion.url),
        dry_run: dryRun,
      },
    });

    return jsonResponse({
      ok: true,
      session_id: sessionId,
      status,
      trial_count: Number(session.trial_count || 0),
      assignment_count: assignmentCount,
      completed_trial_count: completedCount,
      missing_assignment_count: missingAssignmentCount,
      orphan_trial_count: orphanTrialCount,
      completion_code: completion.code,
      completion_url: completion.url,
      redirect_after_ms: completion.url ? 1200 : 0,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not complete session.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
