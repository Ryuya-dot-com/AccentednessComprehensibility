import {
  cleanText,
  errorResponse,
  insertEvent,
  isDryRunSession,
  jsonResponse,
  nullableInt,
  nowMs,
  readJson,
  requireAdmin,
  requireDb,
  requireSameOrigin,
} from "../_utils.js";

const DEFAULT_STALE_MINUTES = 240;
const MAX_STALE_MINUTES = 7 * 24 * 60;

function staleMinutes(body, env) {
  const requested = nullableInt(body?.stale_after_minutes);
  const configured = nullableInt(env.STALE_SESSION_MINUTES);
  const minutes = requested || configured || DEFAULT_STALE_MINUTES;
  if (minutes < 1 || minutes > MAX_STALE_MINUTES) {
    const error = new Error(`stale_after_minutes must be between 1 and ${MAX_STALE_MINUTES}.`);
    error.status = 400;
    throw error;
  }
  return minutes;
}

function adminRaterId(request, accessPayload) {
  return cleanText(
    accessPayload?.email ||
      request.headers.get("cf-access-authenticated-user-email") ||
      "admin",
  );
}

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const accessPayload = await requireAdmin(context.request, context.env);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const minutes = staleMinutes(body, context.env);
    const finalizedAtMs = nowMs();
    const finalizedAt = new Date(finalizedAtMs).toISOString();
    const cutoffMs = finalizedAtMs - minutes * 60_000;
    const cutoffAt = new Date(cutoffMs).toISOString();

    const staleRows = await db
      .prepare(
        `SELECT
           s.id,
           s.rater_id,
           s.trial_count,
           (
             SELECT COUNT(*)
             FROM rating_trials rt
             WHERE rt.session_id = s.id
           ) AS saved_trial_count
         FROM sessions s
         WHERE s.status = 'started'
           AND last_seen_at_ms > 0
           AND last_seen_at_ms <= ?
         ORDER BY s.last_seen_at_ms, s.started_at_ms`,
      )
      .bind(cutoffMs)
      .all();
    const orphanAllocationRows = await db
      .prepare(
        `SELECT ca.id
         FROM counterbalance_allocations ca
         LEFT JOIN sessions s ON s.id = ca.session_id
         WHERE s.id IS NULL
           AND ca.status IN ('started', 'dry_run_started')
           AND ca.updated_at <= ?
         ORDER BY ca.updated_at, ca.assigned_at`,
      )
      .bind(cutoffAt)
      .all();

    const rows = staleRows.results || [];
    const orphanAllocations = orphanAllocationRows.results || [];
    const statements = [];
    let abandoned = 0;
    let incompleteDropout = 0;

    rows.forEach((row) => {
      const completedTrials = Number(row.saved_trial_count || 0);
      const newStatus = completedTrials > 0 ? "incomplete_dropout" : "abandoned";
      if (newStatus === "abandoned") abandoned += 1;
      else incompleteDropout += 1;
      statements.push(
        db
          .prepare(
            `UPDATE sessions
             SET status = ?,
                 completed_at = ?,
                 completed_at_ms = ?,
                 completed_trial_count = (
                   SELECT COUNT(*) FROM rating_trials WHERE session_id = ?
                 )
             WHERE id = ?
               AND status = 'started'
               AND last_seen_at_ms <= ?`,
          )
          .bind(newStatus, finalizedAt, finalizedAtMs, row.id, row.id, cutoffMs),
      );
      statements.push(
        db
          .prepare(
            `UPDATE counterbalance_allocations
             SET status = CASE
                   WHEN status LIKE 'dry_run_%' THEN 'dry_run_incomplete'
                   ELSE 'incomplete'
                 END,
                 completed_at = NULL,
                 updated_at = ?
             WHERE session_id = ?
               AND status IN ('started', 'dry_run_started')
               AND EXISTS (
                 SELECT 1
                 FROM sessions s
                 WHERE s.id = ?
                   AND s.status IN ('incomplete_dropout', 'abandoned')
                   AND s.completed_at_ms = ?
               )`,
          )
          .bind(finalizedAt, row.id, row.id, finalizedAtMs),
      );
    });
    orphanAllocations.forEach((row) => {
      statements.push(
        db
          .prepare(
            `UPDATE counterbalance_allocations
             SET status = CASE
                   WHEN status = 'dry_run_started' THEN 'dry_run_incomplete'
                   ELSE 'incomplete'
                 END,
                 completed_at = NULL,
                 updated_at = ?
             WHERE id = ?
               AND status IN ('started', 'dry_run_started')`,
          )
          .bind(finalizedAt, row.id),
      );
    });

    for (let index = 0; index < statements.length; index += 50) {
      await db.batch(statements.slice(index, index + 50));
    }

    const mismatchedAllocationRows = await db
      .prepare(
        `SELECT
           ca.id, ca.status AS allocation_status,
           s.id AS session_id, s.status AS session_status, s.completed_at,
           s.prolific_study_id, s.participant_key
         FROM counterbalance_allocations ca
         JOIN sessions s ON s.id = ca.session_id
         WHERE s.status != 'started'
           AND ca.status != CASE
             WHEN s.status = 'completed' THEN
               CASE
                 WHEN UPPER(COALESCE(s.prolific_study_id, '')) = 'DRY_RUN'
                   OR LOWER(COALESCE(s.participant_key, '')) LIKE 'dry-run:%'
                 THEN 'dry_run_completed'
                 ELSE 'completed'
               END
             ELSE
               CASE
                 WHEN UPPER(COALESCE(s.prolific_study_id, '')) = 'DRY_RUN'
                   OR LOWER(COALESCE(s.participant_key, '')) LIKE 'dry-run:%'
                 THEN 'dry_run_incomplete'
                 ELSE 'incomplete'
               END
           END
         ORDER BY ca.assigned_at`,
      )
      .all();
    const mismatchRows = mismatchedAllocationRows.results || [];
    const reconciliationStatements = mismatchRows.map((row) => {
      const desiredStatus = isDryRunSession(row)
        ? cleanText(row.session_status) === "completed"
          ? "dry_run_completed"
          : "dry_run_incomplete"
        : cleanText(row.session_status) === "completed"
          ? "completed"
          : "incomplete";
      return db
        .prepare(
          `UPDATE counterbalance_allocations
           SET status = ?, completed_at = ?, updated_at = ?
           WHERE id = ?
             AND status = ?
             AND EXISTS (
               SELECT 1 FROM sessions
               WHERE id = ? AND status = ?
             )`,
        )
        .bind(
          desiredStatus,
          desiredStatus.endsWith("completed") ? row.completed_at : null,
          finalizedAt,
          row.id,
          row.allocation_status,
          row.session_id,
          row.session_status,
        );
    });
    let reconciledAllocationTotal = 0;
    for (let index = 0; index < reconciliationStatements.length; index += 50) {
      const results = await db.batch(reconciliationStatements.slice(index, index + 50));
      reconciledAllocationTotal += results.reduce(
        (sum, result) => sum + Number(result?.meta?.changes || 0),
        0,
      );
    }

    const finalizedRows = await db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM sessions
         WHERE completed_at_ms = ?
           AND status IN ('incomplete_dropout', 'abandoned')
         GROUP BY status`,
      )
      .bind(finalizedAtMs)
      .all();
    const finalizedCounts = Object.fromEntries(
      (finalizedRows.results || []).map((row) => [row.status, Number(row.count || 0)]),
    );
    abandoned = finalizedCounts.abandoned || 0;
    incompleteDropout = finalizedCounts.incomplete_dropout || 0;
    const finalizedTotal = abandoned + incompleteDropout;

    await insertEvent(db, {
      session_id: null,
      rater_id: adminRaterId(context.request, accessPayload),
      event_type: "admin_finalize_stale_sessions",
      event_at: finalizedAt,
      payload: {
        stale_after_minutes: minutes,
        cutoff_ms: cutoffMs,
        cutoff_at: cutoffAt,
        candidate_total: rows.length,
        finalized_total: finalizedTotal,
        incomplete_dropout: incompleteDropout,
        abandoned,
        orphan_allocation_finalized_total: orphanAllocations.length,
        allocation_mismatch_candidate_total: mismatchRows.length,
        allocation_mismatch_reconciled_total: reconciledAllocationTotal,
      },
    });

    return jsonResponse({
      ok: true,
      stale_after_minutes: minutes,
      cutoff_ms: cutoffMs,
      cutoff_at: cutoffAt,
      finalized_at: finalizedAt,
      finalized_at_ms: finalizedAtMs,
      candidate_total: rows.length,
      finalized_total: finalizedTotal,
      incomplete_dropout: incompleteDropout,
      abandoned,
      orphan_allocation_finalized_total: orphanAllocations.length,
      allocation_mismatch_candidate_total: mismatchRows.length,
      allocation_mismatch_reconciled_total: reconciledAllocationTotal,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not finalize stale sessions.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
