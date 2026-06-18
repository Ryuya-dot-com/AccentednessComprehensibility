import {
  cleanText,
  errorResponse,
  insertEvent,
  jsonResponse,
  nullableInt,
  nowMs,
  requireAdmin,
  requireDb,
  requireSameOrigin,
} from "../_utils.js";

async function logAdminSummary(db, request, accessPayload) {
  try {
    const email = cleanText(
      accessPayload?.email || request.headers.get("cf-access-authenticated-user-email"),
    );
    await insertEvent(db, {
      rater_id: email || "admin",
      event_type: "admin_summary",
      event_at: new Date().toISOString(),
      payload: {
        access_email: email || "",
        user_agent: request.headers.get("user-agent") || "",
      },
    });
  } catch (error) {
    console.warn("admin summary audit log failed", error);
  }
}

export async function onRequestGet(context) {
  try {
    requireSameOrigin(context.request);
    const accessPayload = await requireAdmin(context.request, context.env);
    const db = requireDb(context.env);
    await logAdminSummary(db, context.request, accessPayload);
    const staleAfterMinutes = Math.max(1, nullableInt(context.env.STALE_SESSION_MINUTES) || 240);
    const staleCutoffMs = nowMs() - staleAfterMinutes * 60_000;
    const [sessions, trials, assignments, events] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM sessions").first(),
      db.prepare("SELECT COUNT(*) AS count FROM rating_trials").first(),
      db.prepare("SELECT COUNT(*) AS count FROM rating_assignments").first(),
      db.prepare("SELECT COUNT(*) AS count FROM event_logs").first(),
    ]);

    const statusRows = await db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM sessions
         GROUP BY status
         ORDER BY status`,
      )
      .all();

    const counterbalanceRows = await db
      .prepare(
        `SELECT
          cc.cell_id,
          cc.list_comb,
          cc.pronunciation_style,
          SUM(CASE WHEN ca.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ca.status = 'started' THEN 1 ELSE 0 END) AS started,
          SUM(CASE WHEN ca.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
          COUNT(ca.id) AS assigned
        FROM counterbalance_cells cc
        LEFT JOIN counterbalance_allocations ca ON ca.cell_id = cc.cell_id
        GROUP BY cc.cell_id, cc.list_comb, cc.pronunciation_style
        ORDER BY cc.cell_id`,
      )
      .all();

    const quality = await db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
          SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) AS noncompleted_sessions,
          SUM(CASE WHEN status = 'started' THEN 1 ELSE 0 END) AS started_sessions,
          SUM(CASE WHEN status = 'started' AND last_seen_at_ms > 0 AND last_seen_at_ms <= ? THEN 1 ELSE 0 END) AS stale_started_sessions,
          SUM(CASE WHEN status = 'incomplete_dropout' THEN 1 ELSE 0 END) AS incomplete_dropout_sessions,
          SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) AS abandoned_sessions,
          SUM(CASE WHEN completed_trial_count < trial_count THEN 1 ELSE 0 END) AS sessions_with_missing_trials,
          SUM(CASE WHEN duplicate_start_count > 0 THEN 1 ELSE 0 END) AS sessions_with_duplicate_starts,
          SUM(duplicate_start_count) AS duplicate_start_total,
          SUM(completion_url_issued_count) AS completion_url_issued_total
         FROM sessions`,
      )
      .bind(staleCutoffMs)
      .first();

    const completedMainTrials = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM rating_trials rt
         JOIN sessions s ON s.id = rt.session_id
         WHERE s.status = 'completed'
           AND rt.phase = 'main'`,
      )
      .first();

    const intelligibility = await db
      .prepare(
        `SELECT
          SUM(CASE WHEN rt.intelligibility_unidentified = 1 THEN 1 ELSE 0 END) AS unidentified_count,
          SUM(CASE WHEN rt.intelligibility_needs_manual_review = 1 THEN 1 ELSE 0 END) AS manual_review_count,
          SUM(CASE WHEN (rt.typed_response IS NULL OR rt.typed_response = '') AND COALESCE(rt.intelligibility_unidentified, 0) = 0 THEN 1 ELSE 0 END) AS blank_dictation_count
         FROM rating_trials rt
         JOIN sessions s ON s.id = rt.session_id
         WHERE s.status = 'completed'
           AND rt.phase = 'main'`,
      )
      .first();

    return jsonResponse({
      ok: true,
      counts: {
        sessions: Number(sessions?.count || 0),
        rating_trials: Number(trials?.count || 0),
        rating_assignments: Number(assignments?.count || 0),
        event_logs: Number(events?.count || 0),
      },
      quality: {
        completed_sessions: Number(quality?.completed_sessions || 0),
        noncompleted_sessions: Number(quality?.noncompleted_sessions || 0),
        started_sessions: Number(quality?.started_sessions || 0),
        stale_started_sessions: Number(quality?.stale_started_sessions || 0),
        incomplete_dropout_sessions: Number(quality?.incomplete_dropout_sessions || 0),
        abandoned_sessions: Number(quality?.abandoned_sessions || 0),
        sessions_with_missing_trials: Number(quality?.sessions_with_missing_trials || 0),
        sessions_with_duplicate_starts: Number(quality?.sessions_with_duplicate_starts || 0),
        duplicate_start_total: Number(quality?.duplicate_start_total || 0),
        completion_url_issued_total: Number(quality?.completion_url_issued_total || 0),
        completed_main_trials: Number(completedMainTrials?.count || 0),
        unidentified_count: Number(intelligibility?.unidentified_count || 0),
        manual_review_count: Number(intelligibility?.manual_review_count || 0),
        blank_dictation_count: Number(intelligibility?.blank_dictation_count || 0),
        stale_after_minutes: staleAfterMinutes,
      },
      sessions_by_status: statusRows.results || [],
      counterbalance_by_cell: counterbalanceRows.results || [],
    });
  } catch (error) {
    return errorResponse(error.message || "Could not load admin summary.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
