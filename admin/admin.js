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
    sessions: document.getElementById("count-sessions"),
    trials: document.getElementById("count-trials"),
    assignments: document.getElementById("count-assignments"),
    events: document.getElementById("count-events"),
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
    const response = await fetchAdmin("/api/admin/summary");
    const data = await response.json();
    els.sessions.textContent = String(data.counts.sessions || 0);
    els.trials.textContent = String(data.counts.rating_trials || 0);
    els.assignments.textContent = String(data.counts.rating_assignments || 0);
    els.events.textContent = String(data.counts.event_logs || 0);
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
    refreshSummary().catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.finalizeStaleBtn.addEventListener("click", () => {
    finalizeStaleSessions().catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.bundleBtn.addEventListener("click", () => {
    downloadBundle().catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.analysisBtn.addEventListener("click", () => {
    downloadCsv("analysis").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.qualityBtn.addEventListener("click", () => {
    downloadCsv("quality").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.ratingsBtn.addEventListener("click", () => {
    downloadCsv("ratings").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.sessionsBtn.addEventListener("click", () => {
    downloadCsv("sessions").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.assignmentsBtn.addEventListener("click", () => {
    downloadCsv("assignments").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.eventsBtn.addEventListener("click", () => {
    downloadCsv("events").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
  els.counterbalanceBtn.addEventListener("click", () => {
    downloadCsv("counterbalance").catch((error) => {
      setStatus("Failed");
      setLog(error.message);
    });
  });
})();
