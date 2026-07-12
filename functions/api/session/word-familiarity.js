import {
  cleanText,
  errorResponse,
  insertEvent,
  jsonResponse,
  nowMs,
  readJson,
  requireDb,
  requireSameOrigin,
  requireSessionToken,
} from "../_utils.js";
import {
  TARGET_WORD_COUNT,
  validateWordFamiliarityResponses,
} from "../_word-familiarity.js";

async function insertEventBestEffort(db, event) {
  try {
    await insertEvent(db, event);
  } catch (error) {
    console.warn("word familiarity event log failed", error);
  }
}

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const sessionId = cleanText(body.session_id || body.server_session_id);
    if (!sessionId) return errorResponse("session_id is required.");

    const session = await db
      .prepare(
        `SELECT id, rater_id, status, trial_count, session_token_hash
         FROM sessions
         WHERE id = ?`,
      )
      .bind(sessionId)
      .first();
    if (!session) return errorResponse("Session was not found.", 404);
    await requireSessionToken(context.request, body, session);
    if (cleanText(session.status) !== "started") {
      return errorResponse("Word familiarity can only be saved for an active session.", 409);
    }

    const completedRow = await db
      .prepare("SELECT COUNT(*) AS count FROM rating_trials WHERE session_id = ?")
      .bind(sessionId)
      .first();
    const completedCount = Number(completedRow?.count || 0);
    const expectedCount = Number(session.trial_count || 0);
    if (!expectedCount || completedCount !== expectedCount) {
      return errorResponse("Complete all rating trials before the word checklist.", 409);
    }

    const responses = validateWordFamiliarityResponses(body.word_familiarity);
    const submittedAtMs = nowMs();
    const submittedAt = new Date(submittedAtMs).toISOString();
    const serializedResponses = JSON.stringify(
      responses.map((response) => ({
        word_number: response.word_number,
        target_word: response.target_word,
        word_known: response.known ? 1 : 0,
      })),
    );
    const statements = [
      db
        .prepare(
          `INSERT INTO word_familiarity_responses (
             session_id, word_number, target_word, word_known,
             submitted_at, submitted_at_ms
           )
           SELECT
             ?,
             CAST(json_extract(value, '$.word_number') AS INTEGER),
             CAST(json_extract(value, '$.target_word') AS TEXT),
             CAST(json_extract(value, '$.word_known') AS INTEGER),
             ?,
             ?
           FROM json_each(?)
           WHERE 1
           ON CONFLICT(session_id, word_number) DO UPDATE SET
             target_word = excluded.target_word,
             word_known = excluded.word_known,
             submitted_at = excluded.submitted_at,
             submitted_at_ms = excluded.submitted_at_ms`,
        )
        .bind(sessionId, submittedAt, submittedAtMs, serializedResponses),
      db
        .prepare(
          `UPDATE sessions
           SET last_seen_at = ?, last_seen_at_ms = ?
           WHERE id = ? AND status = 'started'`,
        )
        .bind(submittedAt, submittedAtMs, sessionId),
    ];
    await db.batch(statements);

    const knownCount = responses.reduce((sum, response) => sum + (response.known ? 1 : 0), 0);
    await insertEventBestEffort(db, {
      session_id: sessionId,
      rater_id: session.rater_id,
      event_type: "word_familiarity_saved",
      event_at: submittedAt,
      payload: {
        response_count: TARGET_WORD_COUNT,
        known_word_count: knownCount,
      },
    });

    return jsonResponse({
      ok: true,
      session_id: sessionId,
      response_count: TARGET_WORD_COUNT,
      known_word_count: knownCount,
      submitted_at: submittedAt,
    });
  } catch (error) {
    return errorResponse(error.message || "Could not save word familiarity.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
