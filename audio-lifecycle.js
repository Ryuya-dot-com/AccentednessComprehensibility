(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AudioLifecycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_INITIAL_TIMEOUT_MS = 15_000;
  const DEFAULT_DURATION_GRACE_MS = 2_500;
  const END_EPSILON_SECONDS = 0.08;

  function isPlaybackCurrent(state, audio, generation) {
    return Boolean(
      state &&
      audio &&
      state.currentAudio === audio &&
      state.audioPlaybackGeneration === generation,
    );
  }

  function createFeedbackReplayLifecycle(audio, options = {}) {
    if (!audio || typeof audio.addEventListener !== "function") {
      throw new Error("A replay Audio object is required.");
    }
    const isCurrent = typeof options.isCurrent === "function" ? options.isCurrent : () => true;
    const onComplete = typeof options.onComplete === "function" ? options.onComplete : () => {};
    const onError = typeof options.onError === "function" ? options.onError : () => {};
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    const initialTimeoutMs = Number.isFinite(options.initialTimeoutMs)
      ? Math.max(1_000, options.initialTimeoutMs)
      : DEFAULT_INITIAL_TIMEOUT_MS;
    const durationGraceMs = Number.isFinite(options.durationGraceMs)
      ? Math.max(500, options.durationGraceMs)
      : DEFAULT_DURATION_GRACE_MS;
    let settled = false;
    let timeoutId = null;

    function clearWatchdog() {
      if (timeoutId !== null) clearTimer(timeoutId);
      timeoutId = null;
    }

    function canSettle() {
      if (settled) return false;
      if (isCurrent()) return true;
      settled = true;
      clearWatchdog();
      return false;
    }

    function complete(source = "ended") {
      if (!canSettle()) return false;
      settled = true;
      clearWatchdog();
      onComplete({ source });
      return true;
    }

    function fail(error, source = "error") {
      if (!canSettle()) return false;
      settled = true;
      clearWatchdog();
      onError({
        error: error instanceof Error ? error : new Error(String(error || source)),
        source,
      });
      return true;
    }

    function armWatchdog(delayMs) {
      if (settled) return;
      clearWatchdog();
      timeoutId = setTimer(() => {
        fail(new Error("Practice feedback replay timed out."), "timeout");
      }, Math.max(1_000, delayMs));
    }

    function armDurationWatchdog() {
      if (settled) return;
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      armWatchdog(duration * 1_000 + durationGraceMs);
    }

    audio.addEventListener("ended", () => complete("ended"), { once: true });
    audio.addEventListener("error", () => {
      fail(new Error("Practice feedback audio failed."), "media_error");
    }, { once: true });
    audio.addEventListener("loadedmetadata", armDurationWatchdog, { once: true });
    audio.addEventListener("durationchange", armDurationWatchdog);
    audio.addEventListener("timeupdate", () => {
      const duration = Number(audio.duration);
      const currentTime = Number(audio.currentTime);
      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        Number.isFinite(currentTime) &&
        currentTime >= Math.max(0, duration - END_EPSILON_SECONDS)
      ) {
        complete("timeupdate");
      }
    });
    armWatchdog(initialTimeoutMs);

    return Object.freeze({
      complete,
      fail,
      cancel() {
        if (settled) return;
        settled = true;
        clearWatchdog();
      },
      isSettled() {
        return settled;
      },
    });
  }

  return Object.freeze({
    createFeedbackReplayLifecycle,
    isPlaybackCurrent,
  });
});
