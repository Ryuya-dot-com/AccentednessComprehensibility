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
    counterbalanceScope: document.getElementById("counterbalance-scope"),
    counterbalanceScopeMeta: document.getElementById("counterbalance-scope-meta"),
    balanceCompleted: document.getElementById("balance-completed"),
    balanceStarted: document.getElementById("balance-started"),
    balanceIncomplete: document.getElementById("balance-incomplete"),
    balanceAssigned: document.getElementById("balance-assigned"),
    balanceFilledMicrocells: document.getElementById("balance-filled-microcells"),
    counterbalanceCellsBody: document.getElementById("counterbalance-cells-body"),
    counterbalanceMatrixHead: document.getElementById("counterbalance-matrix-head"),
    counterbalanceMatrixBody: document.getElementById("counterbalance-matrix-body"),
    counterbalanceBundlesBody: document.getElementById("counterbalance-bundles-body"),
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

  const counterbalanceView = {
    cellRows: [],
    bundleRows: [],
    bundleDefinitions: [],
    selectedScopeKey: "",
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

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function scopeKey(row) {
    return JSON.stringify([
      row?.allocation_cohort ?? "",
      row?.allocation_strategy_version ?? "",
    ]);
  }

  function scopeParts(key) {
    try {
      const parsed = JSON.parse(key);
      return {
        cohort: parsed[0] || "",
        strategy: parsed[1] || "",
      };
    } catch {
      return { cohort: "", strategy: "" };
    }
  }

  function scopeLabel(scope) {
    const cohort = scope.cohort || "(legacy / unscoped)";
    const strategy = scope.strategy || "(unversioned)";
    return `${cohort} — ${strategy}`;
  }

  function allocationCounts(row) {
    return {
      completed: numberValue(row?.completed) + numberValue(row?.dry_run_completed),
      started: numberValue(row?.started) + numberValue(row?.dry_run_started),
      incomplete: numberValue(row?.incomplete) + numberValue(row?.dry_run_incomplete),
      assigned: numberValue(row?.assigned) + numberValue(row?.dry_run_assigned),
      liveAssigned: numberValue(row?.assigned),
      dryRunAssigned: numberValue(row?.dry_run_assigned),
    };
  }

  function appendEmptyRow(body, colspan, message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = colspan;
    cell.className = "admin-empty-row";
    cell.textContent = message;
    row.appendChild(cell);
    body.appendChild(row);
  }

  function bundlePatternText(bundle) {
    return [1, 2, 3, 4]
      .map((block) => displayValue(bundle?.[`block_${block}_pattern`]))
      .join(" · ");
  }

  function renderCounterbalanceScope() {
    const selectedKey = counterbalanceView.selectedScopeKey;
    const selectedScope = scopeParts(selectedKey);
    const cellRows = counterbalanceView.cellRows
      .filter((row) => scopeKey(row) === selectedKey)
      .sort((a, b) => numberValue(a.cell_id) - numberValue(b.cell_id));
    const bundleRows = counterbalanceView.bundleRows.filter(
      (row) => scopeKey(row) === selectedKey,
    );
    const bundleDefinitions = counterbalanceView.bundleDefinitions
      .filter(
        (row) =>
          (row.allocation_strategy_version || "") === selectedScope.strategy,
      )
      .sort(
        (a, b) =>
          numberValue(a.speaker_pattern_bundle) -
          numberValue(b.speaker_pattern_bundle),
      );
    const visibleBundleDefinitions = bundleDefinitions.length
      ? bundleDefinitions
      : [...new Map(
          bundleRows
            .filter(
              (row) =>
                row.speaker_pattern_bundle !== null &&
                row.speaker_pattern_bundle !== undefined,
            )
            .map((row) => [String(row.speaker_pattern_bundle), row]),
        ).values()].sort(
          (a, b) =>
            numberValue(a.speaker_pattern_bundle) -
            numberValue(b.speaker_pattern_bundle),
        );

    const totals = cellRows.reduce(
      (sum, row) => {
        const counts = allocationCounts(row);
        sum.completed += counts.completed;
        sum.started += counts.started;
        sum.incomplete += counts.incomplete;
        sum.assigned += counts.assigned;
        sum.liveAssigned += counts.liveAssigned;
        sum.dryRunAssigned += counts.dryRunAssigned;
        return sum;
      },
      {
        completed: 0,
        started: 0,
        incomplete: 0,
        assigned: 0,
        liveAssigned: 0,
        dryRunAssigned: 0,
      },
    );
    const completedMicrocells = bundleRows.filter(
      (row) => allocationCounts(row).completed > 0,
    ).length;
    const microcellTotal = cellRows.length * visibleBundleDefinitions.length;
    const inferredDryRun = selectedScope.cohort.startsWith("dry_run:");
    const dataType =
      totals.liveAssigned && totals.dryRunAssigned
        ? "mixed live and dry-run records"
        : totals.dryRunAssigned || inferredDryRun
          ? "dry-run records"
          : "live records";

    els.balanceCompleted.textContent = String(totals.completed);
    els.balanceStarted.textContent = String(totals.started);
    els.balanceIncomplete.textContent = String(totals.incomplete);
    els.balanceAssigned.textContent = String(totals.assigned);
    els.balanceFilledMicrocells.textContent = `${completedMicrocells} / ${microcellTotal || 0}`;
    els.counterbalanceScopeMeta.textContent =
      `Cohort: ${selectedScope.cohort || "legacy / unscoped"} · ` +
      `Strategy: ${selectedScope.strategy || "unversioned"} · ${dataType} · ` +
      `${cellRows.length} cells × ${visibleBundleDefinitions.length} bundles = ${microcellTotal} microcells`;

    els.counterbalanceCellsBody.replaceChildren();
    if (!cellRows.length) {
      appendEmptyRow(els.counterbalanceCellsBody, 7, "No cell totals are available for this scope.");
    } else {
      for (const row of cellRows) {
        const tableRow = document.createElement("tr");
        const counts = allocationCounts(row);
        appendCell(tableRow, row.cell_id);
        appendCell(tableRow, row.list_comb);
        appendCell(tableRow, row.pronunciation_style);
        appendCell(tableRow, counts.completed, "admin-count-completed");
        appendCell(tableRow, counts.started, "admin-count-started");
        appendCell(tableRow, counts.incomplete, "admin-count-incomplete");
        appendCell(tableRow, counts.assigned);
        els.counterbalanceCellsBody.appendChild(tableRow);
      }
    }

    els.counterbalanceBundlesBody.replaceChildren();
    if (!visibleBundleDefinitions.length) {
      appendEmptyRow(
        els.counterbalanceBundlesBody,
        5,
        "No speaker-pattern bundle definitions are available for this strategy.",
      );
    } else {
      for (const bundle of visibleBundleDefinitions) {
        const tableRow = document.createElement("tr");
        appendCell(tableRow, bundle.speaker_pattern_bundle);
        for (let block = 1; block <= 4; block += 1) {
          appendCell(tableRow, bundle[`block_${block}_pattern`]);
        }
        els.counterbalanceBundlesBody.appendChild(tableRow);
      }
    }

    els.counterbalanceMatrixHead.replaceChildren();
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.textContent = "Cell · list / style";
    els.counterbalanceMatrixHead.appendChild(corner);
    for (const bundle of visibleBundleDefinitions) {
      const header = document.createElement("th");
      header.scope = "col";
      header.textContent = `B${String(bundle.speaker_pattern_bundle).padStart(2, "0")}`;
      header.title = `Bundle ${bundle.speaker_pattern_bundle}: block patterns ${bundlePatternText(bundle)}`;
      els.counterbalanceMatrixHead.appendChild(header);
    }

    const microcellLookup = new Map(
      bundleRows.map((row) => [
        `${row.cell_id}:${row.speaker_pattern_bundle}`,
        row,
      ]),
    );
    els.counterbalanceMatrixBody.replaceChildren();
    if (!cellRows.length || !visibleBundleDefinitions.length) {
      appendEmptyRow(
        els.counterbalanceMatrixBody,
        Math.max(1, visibleBundleDefinitions.length + 1),
        "The complete microcell matrix is unavailable for this legacy or unconfigured scope.",
      );
    } else {
      for (const cellRow of cellRows) {
        const tableRow = document.createElement("tr");
        const label = document.createElement("th");
        label.scope = "row";
        label.textContent = `${cellRow.cell_id} · ${cellRow.list_comb} / ${cellRow.pronunciation_style}`;
        tableRow.appendChild(label);
        for (const bundle of visibleBundleDefinitions) {
          const microcell = microcellLookup.get(
            `${cellRow.cell_id}:${bundle.speaker_pattern_bundle}`,
          );
          const counts = allocationCounts(microcell);
          const cell = document.createElement("td");
          cell.className = "admin-microcell";
          if (!counts.assigned) cell.classList.add("is-empty");
          if (counts.completed) cell.classList.add("has-completed");
          if (counts.started) cell.classList.add("has-started");
          if (counts.incomplete) cell.classList.add("has-incomplete");
          const description =
            `Cell ${cellRow.cell_id}, bundle ${bundle.speaker_pattern_bundle}: ` +
            `${counts.completed} completed, ${counts.started} started, ` +
            `${counts.incomplete} incomplete, ${counts.assigned} assigned`;
          cell.title = description;
          cell.setAttribute("aria-label", description);
          for (const [labelText, count, className] of [
            ["C", counts.completed, "completed"],
            ["S", counts.started, "started"],
            ["I", counts.incomplete, "incomplete"],
          ]) {
            const metric = document.createElement("span");
            metric.className = `admin-microcell-count ${className}`;
            metric.textContent = `${labelText}${count}`;
            cell.appendChild(metric);
          }
          tableRow.appendChild(cell);
        }
        els.counterbalanceMatrixBody.appendChild(tableRow);
      }
    }
  }

  function renderCounterbalance(data) {
    counterbalanceView.cellRows = data.counterbalance_by_cell || [];
    counterbalanceView.bundleRows = data.counterbalance_by_bundle || [];
    counterbalanceView.bundleDefinitions = data.speaker_pattern_bundles || [];
    const scopeMap = new Map();
    for (const row of [
      ...counterbalanceView.cellRows,
      ...counterbalanceView.bundleRows,
    ]) {
      const key = scopeKey(row);
      if (!scopeMap.has(key)) scopeMap.set(key, scopeParts(key));
    }
    const scopes = [...scopeMap.entries()].sort(([, a], [, b]) => {
      const aLegacy = !a.cohort || !a.strategy ? 1 : 0;
      const bLegacy = !b.cohort || !b.strategy ? 1 : 0;
      const aDry = a.cohort.startsWith("dry_run:") ? 1 : 0;
      const bDry = b.cohort.startsWith("dry_run:") ? 1 : 0;
      return (
        aLegacy - bLegacy ||
        aDry - bDry ||
        scopeLabel(a).localeCompare(scopeLabel(b))
      );
    });

    els.counterbalanceScope.replaceChildren();
    if (!scopes.length) {
      const option = document.createElement("option");
      option.textContent = "No allocation scopes available";
      els.counterbalanceScope.appendChild(option);
      els.counterbalanceScope.disabled = true;
      counterbalanceView.selectedScopeKey = "";
      els.counterbalanceScopeMeta.textContent = "No counterbalance scope is available.";
      els.balanceCompleted.textContent = "0";
      els.balanceStarted.textContent = "0";
      els.balanceIncomplete.textContent = "0";
      els.balanceAssigned.textContent = "0";
      els.balanceFilledMicrocells.textContent = "0 / 0";
      els.counterbalanceCellsBody.replaceChildren();
      appendEmptyRow(els.counterbalanceCellsBody, 7, "No counterbalance scope is available.");
      els.counterbalanceBundlesBody.replaceChildren();
      appendEmptyRow(els.counterbalanceBundlesBody, 5, "No bundle definitions are available.");
      els.counterbalanceMatrixHead.replaceChildren();
      els.counterbalanceMatrixBody.replaceChildren();
      appendEmptyRow(els.counterbalanceMatrixBody, 1, "No microcell matrix is available.");
      return;
    }
    for (const [key, scope] of scopes) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = scopeLabel(scope);
      els.counterbalanceScope.appendChild(option);
    }
    const availableKeys = new Set(scopes.map(([key]) => key));
    if (!availableKeys.has(counterbalanceView.selectedScopeKey)) {
      counterbalanceView.selectedScopeKey = scopes[0][0];
    }
    els.counterbalanceScope.value = counterbalanceView.selectedScopeKey;
    els.counterbalanceScope.disabled = false;
    renderCounterbalanceScope();
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
      emptyCell.colSpan = 26;
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
          [row.counterbalance_cell],
          [
            row.list_comb || row.pronunciation_style
              ? `${displayValue(row.list_comb)} / ${displayValue(row.pronunciation_style)}`
              : "—",
          ],
          [row.speaker_pattern_bundle],
          [row.allocation_cohort, "admin-scope-cell"],
          [row.allocation_strategy_version, "admin-scope-cell"],
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
    renderCounterbalance(data);
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
        `speaker_bundle_sessions: ${data.quality?.speaker_bundle_sessions || 0}`,
        `legacy_or_unversioned_counterbalance_sessions: ${data.quality?.legacy_or_unversioned_counterbalance_sessions || 0}`,
        `unidentified_count: ${data.quality?.unidentified_count || 0}`,
        `manual_review_count: ${data.quality?.manual_review_count || 0}`,
        `blank_dictation_count: ${data.quality?.blank_dictation_count || 0}`,
        `dry_run_sessions: ${data.quality?.dry_run_sessions || 0}`,
        `word_familiarity_sessions: ${data.quality?.word_familiarity_sessions || 0}`,
        `known_word_responses: ${data.quality?.known_word_responses || 0}`,
        `sessions_missing_word_familiarity: ${data.quality?.sessions_missing_word_familiarity || 0}`,
        "",
        `counterbalance_scopes: ${new Set((data.counterbalance_by_cell || []).map(scopeKey)).size}`,
        `zero_filled_cell_rows: ${(data.counterbalance_by_cell || []).length}`,
        `zero_filled_microcell_rows: ${(data.counterbalance_by_bundle || []).length}`,
        `speaker_pattern_bundle_definitions: ${(data.speaker_pattern_bundles || []).length}`,
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
  els.counterbalanceScope.addEventListener("change", () => {
    counterbalanceView.selectedScopeKey = els.counterbalanceScope.value;
    renderCounterbalanceScope();
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
