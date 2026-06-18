(function () {
  "use strict";

  function randomSuffix() {
    const bytes = new Uint8Array(6);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const dryRunId = "DRYRUN_" + timestamp + "_" + randomSuffix();
  const params = new URLSearchParams({
    dry_run: "1",
    PROLIFIC_PID: dryRunId,
    STUDY_ID: "DRY_RUN",
    SESSION_ID: dryRunId + "_SESSION",
    completion_code: "DRY-RUN",
  });
  const target = "/?" + params.toString();
  const link = document.getElementById("dry-run-link");
  link.href = target;
  window.setTimeout(function () {
    window.location.replace(target);
  }, 250);
})();
