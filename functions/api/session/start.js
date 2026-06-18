import {
  assertRequiredIntRange,
  cleanText,
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
  counterbalancePayload,
  loadCounterbalanceMaterials,
  safeMaterialsJson,
} from "../_counterbalance.js";

const ASSIGNMENT_SELECT = `
  SELECT
    phase, trial_index, source_path, audio_url, file_name, target_word,
    participant_id, native_language, accent_condition, condition, talker,
    pass_number, word_number, trial_number, take_number, spoken_form,
    practice_note, source_format, practice_kind, practice_group,
    counterbalance_cell, list_comb, pronunciation_style, stimulus_list,
    l1_condition, pronunciation_condition, block_index, block_list,
    within_block_index, block_trial_count, expert_comprehensibility_1_9,
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

function canonicalKey(value) {
  return cleanText(value).toLowerCase();
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
  const { results } = await db
    .prepare(ASSIGNMENT_SELECT)
    .bind(session.id, "main")
    .all();
  return {
    ok: true,
    existing_session: true,
    session_id: session.id,
    status: session.status,
    completed_trial_count: Number(session.completed_trial_count || 0),
    trial_count: Number(session.trial_count || 0),
    session_token: sessionToken,
    counterbalance: counterbalancePayload(counterbalanceFromSession(session)),
    main_assignment: results || [],
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
        .prepare("DELETE FROM counterbalance_allocations WHERE id = ? AND status = 'started'")
        .bind(allocationId),
    );
  }
  await db.batch(statements);
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
    const practiceAssignment = Array.isArray(body.practice_assignment)
      ? body.practice_assignment
      : [];
    let assignment = Array.isArray(body.assignment) ? body.assignment : [];
    let mainAssignment = [];

    if (!raterId) return errorResponse("rater_id is required.");
    if (!sessionLabel) return errorResponse("session_label is required.");
    if (isProduction(context.env) && !counterbalanceEnabled) {
      return errorResponse("Server-side counterbalancing is required in production.", 400);
    }
    assertRequiredIntRange("japanese_familiarity_1_6", body.japanese_familiarity_1_6, 1, 6);
    assertRequiredIntRange("chinese_familiarity_1_6", body.chinese_familiarity_1_6, 1, 6);

    client = requestClientContext(context.request, body);
    requireProlificIdentity(client, context.env);
    const dryRun = isDryRunClient(client);
    const key = participantKey(client, raterId, sessionLabel);
    const turnstileVerified = await verifyTurnstile(
      context.request,
      context.env,
      body.turnstile_token,
    );
    if (hasProlificIdentity(client)) {
      const existing = await findExistingProlificSession(db, client, key);
      if (existing) {
        return duplicateStartResponse(db, existing);
      }
    }

    sessionId = crypto.randomUUID();
    const sessionToken = randomToken();
    const sessionTokenHash = await sha256Hex(sessionToken);
    const startedAtMs = nowMs();
    const startedAt = new Date(startedAtMs).toISOString();
    const screenJson = safeJson(body.screen || {});
    const seed = cleanText(body.seed) || `${raterId}_${sessionLabel}_${platformVersion}`;
    let manifestSummary = null;

    if (counterbalanceEnabled) {
      const loadedManifest = await loadCounterbalanceMaterials(context);
      manifestSummary = loadedManifest.summary;
      counterbalance = await allocateCounterbalance(db, sessionId, startedAt, { dryRun });
      try {
        mainAssignment = buildCounterbalancedAssignment(
          loadedManifest.materials,
          counterbalance,
          `${seed}:${sessionId}`,
        );
      } catch (error) {
        await db
          .prepare("DELETE FROM counterbalance_allocations WHERE id = ?")
          .bind(counterbalance.allocation_id)
          .run();
        throw error;
      }
      assignment = [...practiceAssignment, ...mainAssignment];
    }

    if (!assignment.length) return errorResponse("assignment must contain trials.");

    try {
      await db
        .prepare(
          `INSERT INTO sessions (
            id, role, rater_id, session_label, task_mode, platform_version,
            prolific_pid, prolific_study_id, prolific_session_id, participant_key, seed,
            user_agent, timezone, japanese_familiarity_1_6,
            chinese_familiarity_1_6, completion_code, session_token_hash,
            turnstile_verified,
            counterbalance_allocation_id, counterbalance_cell, list_comb,
            pronunciation_style, screen_json,
            started_at, started_at_ms, last_seen_at, last_seen_at_ms,
            status, trial_count, completed_trial_count
          ) VALUES (?, 'rater', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started', ?, 0)`,
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
          nullableInt(body.japanese_familiarity_1_6),
          nullableInt(body.chinese_familiarity_1_6),
          null,
          sessionTokenHash,
          Number(turnstileVerified),
          nullableText(counterbalance?.allocation_id),
          nullableInt(counterbalance?.cell_id),
          nullableText(counterbalance?.list_comb),
          nullableText(counterbalance?.pronunciation_style),
          screenJson,
          startedAt,
          startedAtMs,
          startedAt,
          startedAtMs,
          assignment.length,
        )
        .run();

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
              expert_comprehensibility_1_9, expert_accentedness_1_9,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            nullableInt(item.expert_comprehensibility_1_9),
            nullableInt(item.expert_accentedness_1_9),
            startedAt,
          );
      });

      await db.batch(statements);
    } catch (error) {
      await cleanupFailedStart(db, sessionId, counterbalance?.allocation_id);
      if (isUniqueConstraintError(error) && hasProlificIdentity(client)) {
        const existing = await findExistingProlificSession(db, client, key);
        if (existing) {
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
        started_at_ms: startedAtMs,
        seed: cleanText(body.seed),
        japanese_familiarity_1_6: body.japanese_familiarity_1_6,
        chinese_familiarity_1_6: body.chinese_familiarity_1_6,
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
      counterbalance: counterbalancePayload(counterbalance),
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
