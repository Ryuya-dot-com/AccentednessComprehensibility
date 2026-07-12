#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  createFeedbackReplayLifecycle,
  isPlaybackCurrent,
} = require("../audio-lifecycle.js");

class FakeAudio {
  constructor() {
    this.currentTime = 0;
    this.duration = 1;
    this.listeners = new Map();
  }

  addEventListener(type, handler, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ handler, once: options.once === true });
    this.listeners.set(type, entries);
  }

  emit(type) {
    const entries = [...(this.listeners.get(type) || [])];
    this.listeners.set(type, entries.filter((entry) => !entry.once));
    for (const entry of entries) entry.handler({ type, target: this });
  }
}

function timerHarness() {
  const timers = new Map();
  let nextId = 1;
  return {
    setTimer(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    fireLatest() {
      const entry = [...timers.entries()].at(-1);
      assert.ok(entry, "Expected an armed replay watchdog");
      timers.delete(entry[0]);
      entry[1]();
    },
  };
}

function testThreeSequentialFeedbackReplays() {
  const starts = [];
  const completions = [];
  for (let replayNumber = 1; replayNumber <= 3; replayNumber += 1) {
    const audio = new FakeAudio();
    const timers = timerHarness();
    let replayButtonDisabled = true;
    starts.push(replayNumber);
    const lifecycle = createFeedbackReplayLifecycle(audio, {
      isCurrent: () => true,
      onComplete: ({ source }) => {
        replayButtonDisabled = false;
        completions.push({ replayNumber, source });
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    audio.emit("ended");
    assert.equal(lifecycle.isSettled(), true, `Replay ${replayNumber} did not settle`);
    assert.equal(replayButtonDisabled, false, `Replay ${replayNumber} did not release its button`);
  }
  assert.deepEqual(starts, [1, 2, 3]);
  assert.deepEqual(completions, [
    { replayNumber: 1, source: "ended" },
    { replayNumber: 2, source: "ended" },
    { replayNumber: 3, source: "ended" },
  ]);
}

function testStaleOrdinaryAudioCannotTakeOverFeedback() {
  const oldAudio = new FakeAudio();
  const feedbackAudio = new FakeAudio();
  const state = { currentAudio: oldAudio, audioPlaybackGeneration: 4 };
  const oldGeneration = state.audioPlaybackGeneration;

  state.audioPlaybackGeneration += 1;
  state.currentAudio = null;
  state.currentAudio = feedbackAudio;

  assert.equal(
    isPlaybackCurrent(state, oldAudio, oldGeneration),
    false,
    "A stale ordinary-audio error could still mutate feedback state",
  );
}

function testTimeupdateAndTimeoutReleaseTheLifecycle() {
  const nearEndAudio = new FakeAudio();
  nearEndAudio.currentTime = 0.96;
  const completions = [];
  const nearEndTimers = timerHarness();
  const nearEndLifecycle = createFeedbackReplayLifecycle(nearEndAudio, {
    onComplete: ({ source }) => completions.push(source),
    setTimer: nearEndTimers.setTimer,
    clearTimer: nearEndTimers.clearTimer,
  });
  nearEndAudio.emit("timeupdate");
  assert.equal(nearEndLifecycle.isSettled(), true);
  assert.deepEqual(completions, ["timeupdate"]);

  const stalledAudio = new FakeAudio();
  const errors = [];
  const stalledTimers = timerHarness();
  const stalledLifecycle = createFeedbackReplayLifecycle(stalledAudio, {
    onError: ({ source }) => errors.push(source),
    setTimer: stalledTimers.setTimer,
    clearTimer: stalledTimers.clearTimer,
  });
  stalledTimers.fireLatest();
  assert.equal(stalledLifecycle.isSettled(), true);
  assert.deepEqual(errors, ["timeout"]);
}

testThreeSequentialFeedbackReplays();
testStaleOrdinaryAudioCannotTakeOverFeedback();
testTimeupdateAndTimeoutReleaseTheLifecycle();

console.log("practice_feedback_three_sequential_replays: true");
console.log("stale_audio_error_guard: true");
console.log("replay_timeupdate_fallback: true");
console.log("replay_timeout_releases_button: true");
