import {
  assertTextMax,
  cleanText,
  errorResponse,
  insertEvent,
  jsonResponse,
  nowMs,
  readJson,
  requireDb,
  requireSameOrigin,
  requireSessionToken,
} from "./_utils.js";

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const db = requireDb(context.env);
    const body = await readJson(context.request);
    const eventType = cleanText(body.event_type);
    if (!eventType) return errorResponse("event_type is required.");
    assertTextMax("event_type", eventType, 64);

    const sessionId = cleanText(body.session_id || body.server_session_id);
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};
    let raterId = cleanText(body.rater_id);
    if (sessionId) {
      const session = await db
        .prepare(
          `SELECT s.id, s.rater_id, s.session_token_hash,
             EXISTS (
               SELECT 1
               FROM rating_assignments ra
               WHERE ra.session_id = s.id AND ra.phase = 'practice'
             ) AS practice_recording_required
           FROM sessions s
           WHERE s.id = ?`,
        )
        .bind(sessionId)
        .first();
      if (!session) return errorResponse("Session was not found.", 404);
      await requireSessionToken(context.request, body, session);
      raterId = cleanText(session.rater_id) || raterId;
      const practiceEvent =
        eventType.startsWith("practice_") || cleanText(payload.phase) === "practice";
      if (practiceEvent && Number(session.practice_recording_required) !== 1) {
        return jsonResponse({
          ok: true,
          ignored: true,
          reason: "practice_not_recorded",
        });
      }
    }

    const id = await insertEvent(db, {
      session_id: sessionId,
      rater_id: raterId,
      event_type: eventType,
      trial_index: body.trial_index,
      event_at: body.event_at,
      payload,
    });
    if (sessionId) {
      const seenAtMs = nowMs();
      const seenAt = new Date(seenAtMs).toISOString();
      await db
        .prepare(
          `UPDATE sessions
           SET last_seen_at = ?, last_seen_at_ms = ?
           WHERE id = ?`,
        )
        .bind(seenAt, seenAtMs, sessionId)
        .run();
    }

    return jsonResponse({ ok: true, id });
  } catch (error) {
    return errorResponse(error.message || "Could not save event.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
