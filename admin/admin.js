(function () {
  "use strict";

  const els = {
    token: document.getElementById("admin-token"),
    staleMinutes: document.getElementById("stale-minutes"),
    status: document.getElementById("admin-status"),
    log: document.getElementById("admin-log"),
    refreshBtn: document.getElementById("refresh-btn"),
    finalizeStaleBtn: document.getElementById("finalize-stale-btn"),
    bundleBtn: document.getElementById("bundle-btn"),
    analysisBtn: document.getElementById("analysis-btn"),
    qualityBtn: document.getElementById("quality-btn"),
    ratingsBtn: document.getElementById("ratings-btn"),
    sessionsBtn: document.getElementById("sessions-btn"),
    assignmentsBtn: document.getElementById("assignments-btn"),
    eventsBtn: document.getElementById("events-btn"),
    counterbalanceBtn: document.getElementById("counterbalance-btn"),
    wordFamiliarityBtn: document.getElementById("word-familiarity-btn"),
    sessions: document.getElementById("count-sessions"),
    trials: document.getElementById("count-trials"),
    assignments: document.getElementById("count-assignments"),
    events: document.getElementById("count-events"),
    wordFamiliarity: document.getElementById("count-word-familiarity"),
    recentPageSize: document.getElementById("recent-page-size"),
    recentIncludeDryRun: document.getElementById("recent-include-dry-run"),
    recentSessionsBody: document.getElementById("recent-sessions-body"),
    recentPrevBtn: document.getElementById("recent-prev-btn"),
    recentNextBtn: document.getElementById("recent-next-btn"),
    recentPageStatus: document.getElementById("recent-page-status"),
  };

  const recentPage = {
    limit: 25,
    offset: 0,
    total: 0,
    hasNext: false,
    hasPrevious: false,
    includeDryRun: false,
  };

  function token() {
    return els.token.value.trim();
  }

  function headers() {
    const out = {};
    if (token()) out["x-admin-token"] = token();
    return out;
  }

  function staleMinutes() {
    const value = Number.parseInt(els.staleMinutes.value, 10);
    return Number.isFinite(value) && value > 0 ? value : 240;
  }

  function setStatus(text, ready = false) {
    els.status.textContent = text;
    els.status.dataset.ready = ready ? "true" : "false";
  }

  function setLog(text) {
    els.log.textContent = text;
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function displayTimestamp(value) {
    const text = displayValue(value);
    if (text === "—") return text;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toLocaleString();
  }

  function appendCell(rowElement, value, className = "") {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = displayValue(value);
    rowElement.appendChild(cell);
  }

  function renderRecentSessions(rows, page = {}) {
    recentPage.limit = Number(page.limit || recentPage.limit || 25);
    recentPage.offset = Number(page.offset || 0);
    recentPage.total = Number(page.total || 0);
    recentPage.hasNext = page.has_next === true;
    recentPage.hasPrevious = page.has_previous === true;
    recentPage.includeDryRun = page.include_dry_run === true;
    els.recentSessionsBody.replaceChildren();

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 21;
      emptyCell.className = "admin-empty-row";
      emptyCell.textContent = "No participant sessions match this page and filter.";
      emptyRow.appendChild(emptyCell);
      els.recentSessionsBody.appendChild(emptyRow);
    } else {
      for (const row of rows) {
        const tableRow = document.createElement("tr");
        const cells = [
          [Number(row.is_dry_run) === 1 ? "Dry run" : "Live"],
          [row.session_id, "admin-id-cell"],
          [row.status],
          [displayTimestamp(row.started_at)],
          [displayTimestamp(row.last_seen_at)],
          [displayTimestamp(row.completed_at)],
          [row.prolific_pid, "admin-id-cell"],
          [row.participant_age_years],
          [row.english_variety],
          [row.english_variety_other, "admin-free-text-cell"],
          [row.gender],
          [row.gender_other, "admin-free-text-cell"],
          [row.japanese_familiarity_1_6],
          [row.chinese_familiarity_1_6],
          [row.english_teaching_experience],
          [row.english_teaching_experience_details, "admin-free-text-cell"],
          [row.linguistics_knowledge],
          [row.linguistics_knowledge_details, "admin-free-text-cell"],
          [Number(row.word_familiarity_required) === 1 ? "Yes" : "No"],
          [row.word_familiarity_response_count],
          [row.known_word_count],
        ];
        for (const [value, className] of cells) appendCell(tableRow, value, className);
        els.recentSessionsBody.appendChild(tableRow);
      }
    }

    const start = recentPage.total && rows.length ? recentPage.offset + 1 : 0;
    const end = recentPage.offset + rows.length;
    const scope = recentPage.includeDryRun ? "sessions including dry runs" : "live sessions";
    els.recentPageStatus.textContent = `${start}–${end} of ${recentPage.total} ${scope}`;
    els.recentPrevBtn.disabled = !recentPage.hasPrevious;
    els.recentNextBtn.disabled = !recentPage.hasNext;
  }

  function handleAdminError(error) {
    setStatus("Failed");
    setLog(error.message);
  }

  async function requestAdmin(path, options = {}) {
    const requestHeaders = {
      ...headers(),
      ...(options.headers || {}),
    };
    const response = await fetch(path, {
      ...options,
      headers: requestHeaders,
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `${response.status} ${response.statusText}`);
    }
    return response;
  }

  async function fetchAdmin(path) {
    return requestAdmin(path);
  }

  async function postAdmin(path, body) {
    return requestAdmin(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  async function refreshSummary(prefixLines = []) {
    setStatus("Loading");
    els.recentPrevBtn.disabled = true;
    els.recentNextBtn.disabled = true;
    const params = new URLSearchParams({
      recent_limit: String(recentPage.limit),
      recent_offset: String(recentPage.offset),
      include_dry_run: recentPage.includeDryRun ? "1" : "0",
    });
    const response = await fetchAdmin(`/api/admin/summary?${params}`);
    const data = await response.json();
    els.sessions.textContent = String(data.counts.sessions || 0);
    els.trials.textContent = String(data.counts.rating_trials || 0);
    els.assignments.textContent = String(data.counts.rating_assignments || 0);
    els.events.textContent = String(data.counts.event_logs || 0);
    els.wordFamiliarity.textContent = String(data.counts.word_familiarity_responses || 0);
    renderRecentSessions(data.recent_sessions || [], data.recent_sessions_page || {});
    setStatus("Loaded", true);
    setLog(
      [
        ...prefixLines,
        ...(prefixLines.length ? [""] : []),
        "sessions_by_status:",
        ...(data.sessions_by_status || []).map(
          (row) => `${row.status || "(blank)"}: ${row.count}`,
        ),
        "",
        "quality:",
        `completed_sessions: ${data.quality?.completed_sessions || 0}`,
        `noncompleted_sessions: ${data.quality?.noncompleted_sessions || 0}`,
        `started_sessions: ${data.quality?.started_sessions || 0}`,
        `stale_started_sessions: ${data.quality?.stale_started_sessions || 0}`,
        `stale_after_minutes: ${data.quality?.stale_after_minutes || 240}`,
        `incomplete_dropout_sessions: ${data.quality?.incomplete_dropout_sessions || 0}`,
        `abandoned_sessions: ${data.quality?.abandoned_sessions || 0}`,
        `completed_main_trials: ${data.quality?.completed_main_trials || 0}`,
        `sessions_with_missing_trials: ${data.quality?.sessions_with_missing_trials || 0}`,
        `sessions_with_duplicate_starts: ${data.quality?.sessions_with_duplicate_starts || 0}`,
        `duplicate_start_total: ${data.quality?.duplicate_start_total || 0}`,
        `completion_url_issued_total: ${data.quality?.completion_url_issued_total || 0}`,
        `unidentified_count: ${data.quality?.unidentified_count || 0}`,
        `manual_review_count: ${data.quality?.manual_review_count || 0}`,
        `blank_dictation_count: ${data.quality?.blank_dictation_count || 0}`,
        `dry_run_sessions: ${data.quality?.dry_run_sessions || 0}`,
        `word_familiarity_sessions: ${data.quality?.word_familiarity_sessions || 0}`,
        `known_word_responses: ${data.quality?.known_word_responses || 0}`,
        `sessions_missing_word_familiarity: ${data.quality?.sessions_missing_word_familiarity || 0}`,
        "",
        "counterbalance_by_cell:",
        ...(data.counterbalance_by_cell || []).map(
          (row) =>
            `cell ${row.cell_id} ${row.list_comb}/${row.pronunciation_style}: ` +
            `completed=${row.completed || 0}, started=${row.started || 0}, ` +
            `incomplete=${row.incomplete || 0}, assigned=${row.assigned || 0}, ` +
            `dry_run_completed=${row.dry_run_completed || 0}, ` +
            `dry_run_started=${row.dry_run_started || 0}, ` +
            `dry_run_incomplete=${row.dry_run_incomplete || 0}, ` +
            `dry_run_assigned=${row.dry_run_assigned || 0}`,
        ),
      ].join("\n"),
    );
  }

  async function finalizeStaleSessions() {
    setStatus("Finalizing");
    const response = await postAdmin("/api/admin/finalize-stale", {
      stale_after_minutes: staleMinutes(),
    });
    const data = await response.json();
    await refreshSummary([
      "finalize_stale_sessions:",
      `candidate_total: ${data.candidate_total || 0}`,
      `finalized_total: ${data.finalized_total || 0}`,
      `incomplete_dropout: ${data.incomplete_dropout || 0}`,
      `abandoned: ${data.abandoned || 0}`,
      `cutoff_at: ${data.cutoff_at || ""}`,
    ]);
  }

  async function downloadFile(path, fallbackFileName) {
    setStatus("Downloading");
    const response = await fetchAdmin(path);
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const fileName = match ? match[1] : fallbackFileName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setStatus("Downloaded", true);
  }

  async function downloadCsv(dataset) {
    return downloadFile(`/api/admin/export/${dataset}.csv`, `${dataset}.csv`);
  }

  async function downloadBundle() {
    return downloadFile("/api/admin/export/all.zip", "rating_platform_exports.zip");
  }

  els.refreshBtn.addEventListener("click", () => {
    refreshSummary().catch(handleAdminError);
  });
  els.finalizeStaleBtn.addEventListener("click", () => {
    finalizeStaleSessions().catch(handleAdminError);
  });
  els.bundleBtn.addEventListener("click", () => {
    downloadBundle().catch(handleAdminError);
  });
  els.analysisBtn.addEventListener("click", () => {
    downloadCsv("analysis").catch(handleAdminError);
  });
  els.qualityBtn.addEventListener("click", () => {
    downloadCsv("quality").catch(handleAdminError);
  });
  els.ratingsBtn.addEventListener("click", () => {
    downloadCsv("ratings").catch(handleAdminError);
  });
  els.sessionsBtn.addEventListener("click", () => {
    downloadCsv("sessions").catch(handleAdminError);
  });
  els.assignmentsBtn.addEventListener("click", () => {
    downloadCsv("assignments").catch(handleAdminError);
  });
  els.eventsBtn.addEventListener("click", () => {
    downloadCsv("events").catch(handleAdminError);
  });
  els.counterbalanceBtn.addEventListener("click", () => {
    downloadCsv("counterbalance").catch(handleAdminError);
  });
  els.wordFamiliarityBtn.addEventListener("click", () => {
    downloadCsv("word-familiarity").catch(handleAdminError);
  });
  els.recentPageSize.addEventListener("change", () => {
    const allowed = new Set([10, 25, 50, 100]);
    const requested = Number.parseInt(els.recentPageSize.value, 10);
    recentPage.limit = allowed.has(requested) ? requested : 25;
    recentPage.offset = 0;
    refreshSummary().catch(handleAdminError);
  });
  els.recentIncludeDryRun.addEventListener("change", () => {
    recentPage.includeDryRun = els.recentIncludeDryRun.checked;
    recentPage.offset = 0;
    refreshSummary().catch(handleAdminError);
  });
  els.recentPrevBtn.addEventListener("click", () => {
    if (!recentPage.hasPrevious) return;
    recentPage.offset = Math.max(0, recentPage.offset - recentPage.limit);
    refreshSummary().catch(handleAdminError);
  });
  els.recentNextBtn.addEventListener("click", () => {
    if (!recentPage.hasNext) return;
    recentPage.offset += recentPage.limit;
    refreshSummary().catch(handleAdminError);
  });
  els.token.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    refreshSummary().catch(handleAdminError);
  });
})();
