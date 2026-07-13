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

function dryRunSessionSql(alias = "s") {
  return `(
    UPPER(COALESCE(${alias}.prolific_study_id, '')) = 'DRY_RUN'
    OR LOWER(COALESCE(${alias}.participant_key, '')) LIKE 'dry-run:%'
  )`;
}

function liveSessionSql(alias = "s") {
  return `NOT ${dryRunSessionSql(alias)}`;
}

const RECENT_SESSION_DEFAULT_LIMIT = 25;
const RECENT_SESSION_MAX_LIMIT = 100;
const RECENT_SESSION_MAX_OFFSET = 100_000;
const CURRENT_ALLOCATION_STRATEGY_VERSION = "speaker_bundle_latin_v1";

function configuredAllocationCohorts(env) {
  const cohorts = new Set([`dry_run:${CURRENT_ALLOCATION_STRATEGY_VERSION}`]);
  const fixed = cleanText(env.COUNTERBALANCE_COHORT_ID);
  if (fixed) cohorts.add(fixed);
  const configuredMap = cleanText(env.COUNTERBALANCE_COHORTS_JSON);
  if (configuredMap) {
    try {
      const parsed = JSON.parse(configuredMap);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          const cohort = cleanText(value);
          if (cohort) cohorts.add(cohort);
        }
      }
    } catch {
      // Session start reports invalid cohort configuration. Keep the protected
      // admin summary available so existing allocation scopes remain visible.
    }
  }
  return [...cohorts].sort();
}

function allocationScopeCte(env) {
  const cohorts = configuredAllocationCohorts(env);
  return {
    sql: `configured_scopes(allocation_cohort, allocation_strategy_version) AS (
      VALUES ${cohorts.map(() => "(?, ?)").join(", ")}
    ),
    scopes AS (
      SELECT allocation_cohort, allocation_strategy_version
      FROM configured_scopes
      UNION
      SELECT DISTINCT allocation_cohort, allocation_strategy_version
      FROM counterbalance_allocations
      WHERE allocation_cohort IS NOT NULL
        AND allocation_strategy_version IS NOT NULL
    )`,
    bindings: cohorts.flatMap((cohort) => [cohort, CURRENT_ALLOCATION_STRATEGY_VERSION]),
  };
}

function boundedQueryInt(value, fallback, min, max) {
  const parsed = nullableInt(value);
  if (parsed === null) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

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
    const url = new URL(context.request.url);
    const recentLimit = boundedQueryInt(
      url.searchParams.get("recent_limit"),
      RECENT_SESSION_DEFAULT_LIMIT,
      1,
      RECENT_SESSION_MAX_LIMIT,
    );
    const recentOffset = boundedQueryInt(
      url.searchParams.get("recent_offset"),
      0,
      0,
      RECENT_SESSION_MAX_OFFSET,
    );
    const includeDryRun = url.searchParams.get("include_dry_run") === "1";
    const recentWhereSql = includeDryRun ? "1 = 1" : liveSessionSql("s");
    const staleAfterMinutes = Math.max(1, nullableInt(context.env.STALE_SESSION_MINUTES) || 240);
    const staleCutoffMs = nowMs() - staleAfterMinutes * 60_000;
    const allocationScopes = allocationScopeCte(context.env);
    const [sessions, trials, assignments, events, wordFamiliarity, speakerPatternBundles] = await Promise.all([
      db.prepare("SELECT COUNT(*) AS count FROM sessions").first(),
      db.prepare("SELECT COUNT(*) AS count FROM rating_trials").first(),
      db.prepare("SELECT COUNT(*) AS count FROM rating_assignments").first(),
      db.prepare("SELECT COUNT(*) AS count FROM event_logs").first(),
      db
        .prepare(
          `SELECT
             COUNT(*) AS count,
             COUNT(DISTINCT session_id) AS session_count,
             SUM(word_known) AS known_count
           FROM word_familiarity_responses`,
        )
        .first(),
      db.prepare("SELECT COUNT(*) AS count FROM speaker_pattern_bundles").first(),
    ]);

    const statusRows = await db
      .prepare(
        `SELECT
           CASE
             WHEN ${dryRunSessionSql("s")} THEN 'dry_run_' || s.status
             ELSE s.status
           END AS status,
           COUNT(*) AS count
         FROM sessions s
         GROUP BY 1
         ORDER BY status`,
      )
      .all();

    const counterbalanceRows = await db
      .prepare(
        `WITH ${allocationScopes.sql}
        SELECT
          sc.allocation_cohort,
          sc.allocation_strategy_version,
          cc.cell_id,
          cc.list_comb,
          cc.pronunciation_style,
          SUM(CASE WHEN ca.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ca.status = 'started' THEN 1 ELSE 0 END) AS started,
          SUM(CASE WHEN ca.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
          SUM(CASE WHEN ca.status NOT LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN ca.status = 'dry_run_completed' THEN 1 ELSE 0 END) AS dry_run_completed,
          SUM(CASE WHEN ca.status = 'dry_run_started' THEN 1 ELSE 0 END) AS dry_run_started,
          SUM(CASE WHEN ca.status = 'dry_run_incomplete' THEN 1 ELSE 0 END) AS dry_run_incomplete,
          SUM(CASE WHEN ca.status LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS dry_run_assigned
        FROM scopes sc
        CROSS JOIN counterbalance_cells cc
        LEFT JOIN counterbalance_allocations ca
          ON ca.cell_id = cc.cell_id
         AND ca.allocation_cohort = sc.allocation_cohort
         AND ca.allocation_strategy_version = sc.allocation_strategy_version
        GROUP BY
          sc.allocation_cohort, sc.allocation_strategy_version,
          cc.cell_id, cc.list_comb, cc.pronunciation_style
        UNION ALL
        SELECT
          ca.allocation_cohort,
          ca.allocation_strategy_version,
          ca.cell_id,
          cc.list_comb,
          cc.pronunciation_style,
          SUM(CASE WHEN ca.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ca.status = 'started' THEN 1 ELSE 0 END) AS started,
          SUM(CASE WHEN ca.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
          SUM(CASE WHEN ca.status NOT LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN ca.status = 'dry_run_completed' THEN 1 ELSE 0 END) AS dry_run_completed,
          SUM(CASE WHEN ca.status = 'dry_run_started' THEN 1 ELSE 0 END) AS dry_run_started,
          SUM(CASE WHEN ca.status = 'dry_run_incomplete' THEN 1 ELSE 0 END) AS dry_run_incomplete,
          SUM(CASE WHEN ca.status LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS dry_run_assigned
        FROM counterbalance_allocations ca
        JOIN counterbalance_cells cc ON cc.cell_id = ca.cell_id
        WHERE ca.allocation_cohort IS NULL
           OR ca.allocation_strategy_version IS NULL
        GROUP BY
          ca.allocation_cohort, ca.allocation_strategy_version,
          ca.cell_id, cc.list_comb, cc.pronunciation_style
        ORDER BY 1, 2, 3`,
      )
      .bind(...allocationScopes.bindings)
      .all();

    const counterbalanceBundleRows = await db
      .prepare(
        `WITH ${allocationScopes.sql}
        SELECT
          sc.allocation_cohort,
          sc.allocation_strategy_version,
          cc.cell_id,
          cc.list_comb,
          cc.pronunciation_style,
          spb.speaker_pattern_bundle,
          spb.block_1_pattern,
          spb.block_2_pattern,
          spb.block_3_pattern,
          spb.block_4_pattern,
          SUM(CASE WHEN ca.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ca.status = 'started' THEN 1 ELSE 0 END) AS started,
          SUM(CASE WHEN ca.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
          SUM(CASE WHEN ca.status NOT LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN ca.status = 'dry_run_completed' THEN 1 ELSE 0 END) AS dry_run_completed,
          SUM(CASE WHEN ca.status = 'dry_run_started' THEN 1 ELSE 0 END) AS dry_run_started,
          SUM(CASE WHEN ca.status = 'dry_run_incomplete' THEN 1 ELSE 0 END) AS dry_run_incomplete,
          SUM(CASE WHEN ca.status LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS dry_run_assigned
        FROM scopes sc
        CROSS JOIN counterbalance_cells cc
        JOIN speaker_pattern_bundles spb
          ON spb.allocation_strategy_version = sc.allocation_strategy_version
        LEFT JOIN counterbalance_allocations ca
          ON ca.allocation_cohort = sc.allocation_cohort
         AND ca.allocation_strategy_version = sc.allocation_strategy_version
         AND ca.cell_id = cc.cell_id
         AND ca.speaker_pattern_bundle = spb.speaker_pattern_bundle
        GROUP BY
          sc.allocation_cohort, sc.allocation_strategy_version, cc.cell_id,
          cc.list_comb, cc.pronunciation_style, spb.speaker_pattern_bundle,
          spb.block_1_pattern, spb.block_2_pattern, spb.block_3_pattern, spb.block_4_pattern
        UNION ALL
        SELECT
          ca.allocation_cohort,
          ca.allocation_strategy_version,
          ca.cell_id,
          cc.list_comb,
          cc.pronunciation_style,
          ca.speaker_pattern_bundle,
          NULL AS block_1_pattern,
          NULL AS block_2_pattern,
          NULL AS block_3_pattern,
          NULL AS block_4_pattern,
          SUM(CASE WHEN ca.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN ca.status = 'started' THEN 1 ELSE 0 END) AS started,
          SUM(CASE WHEN ca.status = 'incomplete' THEN 1 ELSE 0 END) AS incomplete,
          SUM(CASE WHEN ca.status NOT LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS assigned,
          SUM(CASE WHEN ca.status = 'dry_run_completed' THEN 1 ELSE 0 END) AS dry_run_completed,
          SUM(CASE WHEN ca.status = 'dry_run_started' THEN 1 ELSE 0 END) AS dry_run_started,
          SUM(CASE WHEN ca.status = 'dry_run_incomplete' THEN 1 ELSE 0 END) AS dry_run_incomplete,
          SUM(CASE WHEN ca.status LIKE 'dry_run_%' THEN 1 ELSE 0 END) AS dry_run_assigned
        FROM counterbalance_allocations ca
        JOIN counterbalance_cells cc ON cc.cell_id = ca.cell_id
        WHERE ca.allocation_cohort IS NULL
           OR ca.allocation_strategy_version IS NULL
        GROUP BY
          ca.allocation_cohort, ca.allocation_strategy_version, ca.cell_id,
          cc.list_comb, cc.pronunciation_style, ca.speaker_pattern_bundle
        ORDER BY 1, 2, 3, 6`,
      )
      .bind(...allocationScopes.bindings)
      .all();

    const speakerPatternBundleRows = await db
      .prepare(
        `SELECT
           allocation_strategy_version,
           speaker_pattern_bundle,
           block_1_pattern,
           block_2_pattern,
           block_3_pattern,
           block_4_pattern
         FROM speaker_pattern_bundles
         ORDER BY allocation_strategy_version, speaker_pattern_bundle`,
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
          SUM(completion_url_issued_count) AS completion_url_issued_total,
          SUM(CASE WHEN speaker_pattern_bundle IS NOT NULL THEN 1 ELSE 0 END) AS speaker_bundle_sessions,
          SUM(CASE
            WHEN counterbalance_cell IS NOT NULL
             AND (speaker_pattern_bundle IS NULL
               OR allocation_strategy_version IS NULL
               OR allocation_cohort IS NULL)
            THEN 1 ELSE 0
          END) AS legacy_or_unversioned_counterbalance_sessions
         FROM sessions s
         WHERE ${liveSessionSql("s")}`,
      )
      .bind(staleCutoffMs)
      .first();

    const dryRunSessions = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM sessions s
         WHERE ${dryRunSessionSql("s")}`,
      )
      .first();

    const wordFamiliarityQuality = await db
      .prepare(
        `SELECT
           SUM(CASE
             WHEN s.word_familiarity_required = 1
              AND COALESCE(wf.response_count, 0) < 50
             THEN 1 ELSE 0
           END) AS sessions_missing_word_familiarity
         FROM sessions s
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS response_count
           FROM word_familiarity_responses
           GROUP BY session_id
         ) wf ON wf.session_id = s.id
         WHERE ${liveSessionSql("s")}`,
      )
      .first();

    const completedMainTrials = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM rating_trials rt
         JOIN sessions s ON s.id = rt.session_id
         WHERE s.status = 'completed'
           AND rt.phase = 'main'
           AND ${liveSessionSql("s")}`,
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
           AND rt.phase = 'main'
           AND ${liveSessionSql("s")}`,
      )
      .first();

    const [recentSessionCount, recentSessionRows] = await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM sessions s
           WHERE ${recentWhereSql}`,
        )
        .first(),
      db
        .prepare(
          `SELECT
             s.id AS session_id,
             CASE WHEN ${dryRunSessionSql("s")} THEN 1 ELSE 0 END AS is_dry_run,
             s.status,
             s.started_at,
             s.last_seen_at,
             s.completed_at,
             s.prolific_pid,
             s.participant_age_years,
             s.english_variety,
             s.english_variety_other,
             s.gender,
             s.gender_other,
             s.japanese_familiarity_1_6,
             s.chinese_familiarity_1_6,
             s.english_teaching_experience,
             s.english_teaching_experience_details,
             s.linguistics_knowledge,
             s.linguistics_knowledge_details,
             s.word_familiarity_required,
             s.counterbalance_cell,
             s.list_comb,
             s.pronunciation_style,
             s.speaker_pattern_bundle,
             s.allocation_strategy_version,
             s.allocation_cohort,
             (SELECT COUNT(*)
              FROM word_familiarity_responses wf
              WHERE wf.session_id = s.id) AS word_familiarity_response_count,
             (SELECT SUM(wf.word_known)
              FROM word_familiarity_responses wf
              WHERE wf.session_id = s.id) AS known_word_count,
             (SELECT MAX(wf.submitted_at)
              FROM word_familiarity_responses wf
              WHERE wf.session_id = s.id) AS word_familiarity_submitted_at
           FROM sessions s
           WHERE ${recentWhereSql}
           ORDER BY COALESCE(s.completed_at_ms, s.last_seen_at_ms, s.started_at_ms, 0) DESC,
                    s.id DESC
           LIMIT ? OFFSET ?`,
        )
        .bind(recentLimit, recentOffset)
        .all(),
    ]);
    const recentSessions = recentSessionRows.results || [];
    const recentSessionTotal = Number(recentSessionCount?.count || 0);

    return jsonResponse({
      ok: true,
      counts: {
        sessions: Number(sessions?.count || 0),
        rating_trials: Number(trials?.count || 0),
        rating_assignments: Number(assignments?.count || 0),
        event_logs: Number(events?.count || 0),
        word_familiarity_responses: Number(wordFamiliarity?.count || 0),
        speaker_pattern_bundles: Number(speakerPatternBundles?.count || 0),
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
        speaker_bundle_sessions: Number(quality?.speaker_bundle_sessions || 0),
        legacy_or_unversioned_counterbalance_sessions: Number(
          quality?.legacy_or_unversioned_counterbalance_sessions || 0,
        ),
        completed_main_trials: Number(completedMainTrials?.count || 0),
        unidentified_count: Number(intelligibility?.unidentified_count || 0),
        manual_review_count: Number(intelligibility?.manual_review_count || 0),
        blank_dictation_count: Number(intelligibility?.blank_dictation_count || 0),
        stale_after_minutes: staleAfterMinutes,
        dry_run_sessions: Number(dryRunSessions?.count || 0),
        word_familiarity_sessions: Number(wordFamiliarity?.session_count || 0),
        known_word_responses: Number(wordFamiliarity?.known_count || 0),
        sessions_missing_word_familiarity: Number(
          wordFamiliarityQuality?.sessions_missing_word_familiarity || 0,
        ),
      },
      sessions_by_status: statusRows.results || [],
      counterbalance_by_cell: counterbalanceRows.results || [],
      counterbalance_by_bundle: counterbalanceBundleRows.results || [],
      speaker_pattern_bundles: speakerPatternBundleRows.results || [],
      recent_sessions: recentSessions,
      recent_sessions_page: {
        limit: recentLimit,
        offset: recentOffset,
        returned: recentSessions.length,
        total: recentSessionTotal,
        include_dry_run: includeDryRun,
        has_previous: recentOffset > 0,
        has_next: recentOffset + recentSessions.length < recentSessionTotal,
      },
    });
  } catch (error) {
    return errorResponse(error.message || "Could not load admin summary.", error.status || 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "OPTIONS") return jsonResponse({ ok: true });
  return errorResponse("Method not allowed.", 405);
}
