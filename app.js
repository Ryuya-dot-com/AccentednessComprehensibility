(function () {
  "use strict";

  const VERSION = "pronunciation_rating_v0.5.0";
  const DEFAULT_REMOTE_MANIFEST_URL = "remote_manifest.csv";
  const AUDIO_EXTENSIONS = /\.(wav|mp3|m4a|ogg|webm)$/i;
  const REQUIRED_MANIFEST_FILE_COLUMNS = [
    "audio_file",
    "osf_audio_file",
    "standardized_audio_file",
    "new_relative_path",
    "file",
    "filename",
    "path",
  ];
  const REMOTE_AUDIO_URL_COLUMNS = ["audio_url", "url", "source_url", "raw_url"];
  const DEFAULT_BREAK_INTERVAL = 40;
  const DISTRACTOR_PROBLEM_COUNT = 6;
  const RATING_SCALE_MAX = 9;
  const AUDIO_REPLAY_ALLOWED = false;
  const STAGED_COMBINED_FLOW = true;
  const DEFAULT_PROLIFIC_COMPLETION_CODE = "CONTACT_RESEARCHER";
  const ONBOARDING_STEPS = ["identity", "familiarity", "instructions", "ready"];
  const SEARCH_PARAMS = new URLSearchParams(window.location.search);
  const DRY_RUN_MODE =
    SEARCH_PARAMS.get("dry_run") === "1" ||
    SEARCH_PARAMS.get("STUDY_ID")?.toUpperCase() === "DRY_RUN";
  const SERVER_SAVE_REQUIRED = SEARCH_PARAMS.get("local") !== "1";
  const COUNTERBALANCE_ENABLED = SEARCH_PARAMS.get("manual") !== "1";
  const PARTICIPANT_MODE = COUNTERBALANCE_ENABLED;
  document.body.classList.toggle("participant-mode", PARTICIPANT_MODE);
  document.body.classList.toggle("dry-run-mode", DRY_RUN_MODE);

  const PRACTICE_ITEMS = [
    {
      practice_kind: "combined",
      practice_group: "natural",
      word: "chocolate",
      file_name: "chocolate__eng_bella.mp3",
      audio_url: "practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/chocolate__eng_bella.mp3",
      l1_condition: "ENG",
      pronunciation_condition: "natural",
      talker: "practice_eng_bella",
      voice_variant: "eng_bella",
      expert_comprehensibility_1_9: 1,
      expert_accentedness_1_9: 1,
      practice_note: "Selected ElevenLabs practice MP3. Loudness-normalized with ffmpeg loudnorm I=-23 LRA=7 TP=-2.",
    },
    {
      practice_kind: "combined",
      practice_group: "mild_accent",
      word: "coffee",
      file_name: "coffee__jpn_yusuke_stronger.mp3",
      audio_url: "practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/coffee__jpn_yusuke_stronger.mp3",
      l1_condition: "JPN",
      pronunciation_condition: "accented",
      talker: "practice_jpn_yusuke_stronger",
      voice_variant: "jpn_yusuke_stronger",
      expert_comprehensibility_1_9: 3,
      expert_accentedness_1_9: 4,
      practice_note: "Selected stronger Japanese-accent ElevenLabs candidate. Reference ratings are provisional until researcher review.",
    },
    {
      practice_kind: "combined",
      practice_group: "strong_accent",
      word: "pizza",
      file_name: "pizza__jpn_lia_stronger.mp3",
      audio_url: "practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/pizza__jpn_lia_stronger.mp3",
      l1_condition: "JPN",
      pronunciation_condition: "accented",
      talker: "practice_jpn_lia_stronger",
      voice_variant: "jpn_lia_stronger",
      expert_comprehensibility_1_9: 5,
      expert_accentedness_1_9: 6,
      practice_note: "Selected stronger Japanese-accent ElevenLabs candidate. Reference ratings are provisional until researcher review.",
    },
    {
      practice_kind: "combined",
      practice_group: "strong_accent",
      word: "sofa",
      file_name: "sofa__chn_deep_bass_stronger.mp3",
      audio_url: "practice_training_audio/elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703/sofa__chn_deep_bass_stronger.mp3",
      l1_condition: "CHN",
      pronunciation_condition: "accented",
      talker: "practice_chn_deep_bass_stronger",
      voice_variant: "chn_deep_bass_stronger",
      expert_comprehensibility_1_9: 7,
      expert_accentedness_1_9: 8,
      practice_note: "Selected stronger Chinese-accent ElevenLabs candidate. Reference ratings are provisional until researcher review.",
    },
  ];

  const els = {
    versionLabel: document.getElementById("version-label"),
    setupPanel: document.getElementById("setup-panel"),
    taskPanel: document.getElementById("task-panel"),
    breakPanel: document.getElementById("break-panel"),
    distractorPanel: document.getElementById("distractor-panel"),
    completePanel: document.getElementById("complete-panel"),
    setupStatus: document.getElementById("setup-status"),
    statusAudio: document.getElementById("status-audio"),
    statusTargets: document.getElementById("status-targets"),
    statusManifest: document.getElementById("status-manifest"),
    statusMode: document.getElementById("status-mode"),
    onboardingControls: document.getElementById("onboarding-controls"),
    onboardingBackBtn: document.getElementById("onboarding-back-btn"),
    onboardingNextBtn: document.getElementById("onboarding-next-btn"),
    readyBackBtn: document.getElementById("ready-back-btn"),
    onboardingSteps: Array.from(document.querySelectorAll("[data-onboarding-step]")),
    stepChips: Array.from(document.querySelectorAll("[data-step-chip]")),
    participantIdField: document.getElementById("participant-id-field"),
    prolificDetectedNote: document.getElementById("prolific-detected-note"),
    raterId: document.getElementById("rater-id"),
    sessionId: document.getElementById("session-id"),
    seed: document.getElementById("seed"),
    taskMode: document.getElementById("task-mode"),
    breakInterval: document.getElementById("break-interval"),
    audioFiles: document.getElementById("audio-files"),
    audioFolder: document.getElementById("audio-folder"),
    manifestFile: document.getElementById("manifest-file"),
    customManifestToggle: document.getElementById("custom-manifest-toggle"),
    customManifestField: document.getElementById("custom-manifest-field"),
    sourceSummary: document.getElementById("source-summary"),
    remoteManifestUrl: document.getElementById("remote-manifest-url"),
    remoteParticipantGrid: document.getElementById("remote-participant-grid"),
    remoteSelectAllBtn: document.getElementById("remote-select-all-btn"),
    remoteClearBtn: document.getElementById("remote-clear-btn"),
    loadParticipantsBtn: document.getElementById("load-participants-btn"),
    prepareRemoteBtn: document.getElementById("prepare-remote-btn"),
    loadPracticeBtn: document.getElementById("load-practice-btn"),
    prepareBtn: document.getElementById("prepare-btn"),
    startBtn: document.getElementById("start-btn"),
    downloadBtn: document.getElementById("download-btn"),
    finalDownloadBtn: document.getElementById("final-download-btn"),
    newSessionBtn: document.getElementById("new-session-btn"),
    setupLog: document.getElementById("setup-log"),
    taskPhase: document.getElementById("task-phase"),
    trialTitle: document.getElementById("trial-title"),
    progressFill: document.getElementById("progress-fill"),
    progressText: document.getElementById("progress-text"),
    railMode: document.getElementById("rail-mode"),
    railCompleted: document.getElementById("rail-completed"),
    railRemaining: document.getElementById("rail-remaining"),
    railAudio: document.getElementById("rail-audio"),
    playBtn: document.getElementById("play-btn"),
    audioState: document.getElementById("audio-state"),
    dictationBlock: document.getElementById("dictation-block"),
    dictationInput: document.getElementById("dictation-input"),
    dictationUnidentified: document.getElementById("dictation-unidentified"),
    comprehensibilityBlock: document.getElementById("comprehensibility-block"),
    comprehensibilityScale: document.getElementById("comprehensibility-scale"),
    accentednessBlock: document.getElementById("accentedness-block"),
    accentednessScale: document.getElementById("accentedness-scale"),
    practiceFeedback: document.getElementById("practice-feedback"),
    practiceReasonBlock: document.getElementById("practice-reason-block"),
    practiceReason: document.getElementById("practice-reason"),
    turnstileWidget: document.getElementById("turnstile-widget"),
    nextBtn: document.getElementById("next-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    resumeBtn: document.getElementById("resume-btn"),
    breakMessage: document.getElementById("break-message"),
    distractorMessage: document.getElementById("distractor-message"),
    distractorProblems: document.getElementById("distractor-problems"),
    distractorStatus: document.getElementById("distractor-status"),
    distractorSubmitBtn: document.getElementById("distractor-submit-btn"),
    completeMessage: document.getElementById("complete-message"),
    completionCode: document.getElementById("completion-code"),
    prolificReturnLink: document.getElementById("prolific-return-link"),
  };

  const state = {
    manifestRows: [],
    remoteRows: [],
    remoteManifestUrl: "",
    items: [],
    mainTrials: [],
    practiceTrials: [],
    trials: [],
    rows: [],
    currentIndex: -1,
    phase: "main",
    pendingPracticeRow: null,
    pendingPracticeFeedback: null,
    currentUrl: null,
    currentAudio: null,
    audioStartMs: null,
    playedAtIso: "",
    trialStage: "single",
    dictationAudioStartMs: null,
    ratingAudioStartMs: null,
    dictationPlayedAtIso: "",
    ratingPlayedAtIso: "",
    dictationSubmitRtMs: null,
    dictationAudioDurationS: null,
    ratingAudioDurationS: null,
    firstKeyRtMs: null,
    replayCount: 0,
    responseTrace: null,
    downloadBlobUrl: null,
    downloadName: "",
    running: false,
    serverSessionId: "",
    serverSessionToken: "",
    serverSaveFailed: false,
    productionMode: false,
    onboardingStep: "identity",
    securityConfigLoaded: false,
    turnstileSiteKey: "",
    turnstileToken: "",
    turnstileWidgetId: null,
    distractor: null,
    counterbalance: {
      enabled: COUNTERBALANCE_ENABLED,
      assigned: null,
    },
  };

  function setLog(message) {
    els.setupLog.textContent = message;
  }

  function formatTaskMode(value) {
    if (value === "ratings") return "Ratings";
    if (value === "dictation") return "Dictation";
    return "Combined";
  }

  function setSetupStatus(text, ready = false) {
    els.setupStatus.textContent = text;
    els.setupStatus.dataset.ready = ready ? "true" : "false";
  }

  function updateSetupSummary(audioCount = state.items.length, targetCount = 0, manifestCount = state.manifestRows.length) {
    els.statusAudio.textContent = String(audioCount || 0);
    els.statusTargets.textContent = String(targetCount || 0);
    els.statusManifest.textContent = manifestCount ? String(manifestCount) : "none";
    els.statusMode.textContent = formatTaskMode(els.taskMode.value);
  }

  function updateSelectedMaterialSummary() {
    const audioCount = collectAudioFiles().length || state.items.length || state.remoteRows.length;
    const targetCount = state.items.filter((item) => item.target_word).length ||
      state.remoteRows.filter((row) => valueFrom(row, ["target_word", "word", "item", "expected_word"])).length;
    const manifestCount = state.manifestRows.length || state.remoteRows.length || (els.manifestFile.files[0] ? "selected" : 0);
    const remoteSelectionNeeded =
      !state.counterbalance.enabled &&
      state.remoteRows.length > 0 &&
      selectedRemoteParticipants().length === 0;
    updateSetupSummary(audioCount, targetCount, manifestCount);
    if (state.counterbalance.enabled) {
      const previewCount = state.items.length || state.remoteRows.length;
      updateSetupSummary(
        previewCount || "server",
        targetCount || 0,
        manifestCount || "server",
      );
      setPreparedStartState("Ready");
    } else if (state.mainTrials.length) {
      setPreparedStartState("Ready");
    } else if (remoteSelectionNeeded) {
      setSetupStatus("Participant needed");
    } else if (audioCount && els.raterId.value.trim()) {
      setSetupStatus("Ready to prepare");
    } else if (audioCount) {
      setSetupStatus("Participant ID needed");
    } else {
      setSetupStatus("Waiting for audio");
    }
    renderOnboarding();
  }

  function showOnly(panel) {
    [els.setupPanel, els.taskPanel, els.breakPanel, els.distractorPanel, els.completePanel].forEach((el) => {
      el.classList.toggle("hidden", el !== panel);
    });
  }

  function prolificParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      prolific_pid: params.get("PROLIFIC_PID") || "",
      prolific_study_id: params.get("STUDY_ID") || "",
      prolific_session_id: params.get("SESSION_ID") || "",
    };
  }

  function hasRequiredProlificParams() {
    const prolific = prolificParams();
    return Boolean(
      prolific.prolific_pid &&
        prolific.prolific_study_id &&
        prolific.prolific_session_id,
    );
  }

  function productionProlificLinkMissing() {
    return PARTICIPANT_MODE && state.productionMode && !hasRequiredProlificParams();
  }

  function initializeParticipantMode() {
    if (!PARTICIPANT_MODE) return;
    document.body.classList.add("participant-mode");
    const prolific = prolificParams();
    if (!els.raterId.value.trim() && prolific.prolific_pid) {
      els.raterId.value = prolific.prolific_pid;
    }
    if (!els.sessionId.value.trim() && prolific.prolific_session_id) {
      els.sessionId.value = prolific.prolific_session_id;
    }
    if (prolific.prolific_pid && els.participantIdField) {
      els.participantIdField.classList.add("hidden");
    }
    if (prolific.prolific_pid && els.prolificDetectedNote) {
      els.prolificDetectedNote.classList.remove("hidden");
    }
  }

  function clientScreenInfo() {
    return {
      width: window.screen?.width || "",
      height: window.screen?.height || "",
      avail_width: window.screen?.availWidth || "",
      avail_height: window.screen?.availHeight || "",
      device_pixel_ratio: window.devicePixelRatio || "",
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
    };
  }

  function selectedRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : "";
  }

  function familiarityValues() {
    return {
      japanese_familiarity_1_6: selectedRadioValue("japanese-familiarity"),
      chinese_familiarity_1_6: selectedRadioValue("chinese-familiarity"),
    };
  }

  function familiarityComplete() {
    const values = familiarityValues();
    return Boolean(values.japanese_familiarity_1_6 && values.chinese_familiarity_1_6);
  }

  function participantIdComplete() {
    return Boolean(els.raterId.value.trim());
  }

  function currentOnboardingIndex() {
    const index = ONBOARDING_STEPS.indexOf(state.onboardingStep);
    return index >= 0 ? index : 0;
  }

  function onboardingStepComplete(step) {
    if (productionProlificLinkMissing()) return false;
    if (step === "identity") return participantIdComplete();
    if (step === "familiarity") return familiarityComplete();
    if (step === "instructions") return true;
    if (step === "ready") return participantIdComplete() && familiarityComplete();
    return false;
  }

  function focusCurrentOnboardingRequirement() {
    if (state.onboardingStep === "identity") {
      els.raterId.focus();
      return;
    }
    if (state.onboardingStep === "familiarity") {
      const missingName = selectedRadioValue("japanese-familiarity")
        ? "chinese-familiarity"
        : "japanese-familiarity";
      const firstRadio = document.querySelector(`input[name="${missingName}"]`);
      firstRadio?.focus();
    }
  }

  function renderOnboarding() {
    if (!PARTICIPANT_MODE) return;
    let activeIndex = currentOnboardingIndex();
    if (productionProlificLinkMissing() && activeIndex > 0) {
      state.onboardingStep = "identity";
      activeIndex = 0;
    } else if (!participantIdComplete() && activeIndex > 0) {
      state.onboardingStep = "identity";
      activeIndex = 0;
    } else if (!familiarityComplete() && activeIndex > 1) {
      state.onboardingStep = "familiarity";
      activeIndex = 1;
    }
    els.onboardingSteps.forEach((stepEl) => {
      const step = stepEl.dataset.onboardingStep;
      stepEl.classList.toggle("active", step === state.onboardingStep);
    });
    els.stepChips.forEach((chip) => {
      const step = chip.dataset.stepChip;
      const stepIndex = ONBOARDING_STEPS.indexOf(step);
      chip.classList.toggle("active", step === state.onboardingStep);
      chip.classList.toggle("complete", stepIndex >= 0 && stepIndex < activeIndex);
    });
    if (els.onboardingBackBtn) {
      els.onboardingBackBtn.disabled = activeIndex === 0;
    }
    if (els.onboardingControls) {
      els.onboardingControls.classList.toggle("hidden", state.onboardingStep === "ready");
    }
    if (els.onboardingNextBtn) {
      const isReadyStep = state.onboardingStep === "ready";
      els.onboardingNextBtn.classList.toggle("hidden", isReadyStep);
      els.onboardingNextBtn.disabled = isReadyStep || !onboardingStepComplete(state.onboardingStep);
    }
  }

  function setOnboardingStep(step) {
    if (!PARTICIPANT_MODE || !ONBOARDING_STEPS.includes(step)) return;
    state.onboardingStep = step;
    renderOnboarding();
  }

  function advanceOnboarding() {
    if (!onboardingStepComplete(state.onboardingStep)) {
      focusCurrentOnboardingRequirement();
      return;
    }
    const nextIndex = Math.min(currentOnboardingIndex() + 1, ONBOARDING_STEPS.length - 1);
    setOnboardingStep(ONBOARDING_STEPS[nextIndex]);
  }

  function retreatOnboarding() {
    const previousIndex = Math.max(currentOnboardingIndex() - 1, 0);
    setOnboardingStep(ONBOARDING_STEPS[previousIndex]);
  }

  function setPreparedStartState(readyLabel = "Ready") {
    const participantReady = Boolean(els.raterId.value.trim());
    const familiarityReady = familiarityComplete();
    const prolificReady = !productionProlificLinkMissing();
    const ready = participantReady && familiarityReady && prolificReady;
    let status = "Open from Prolific";
    if (prolificReady) {
      status = participantReady
        ? familiarityReady
          ? readyLabel
          : "Familiarity needed"
        : "Participant ID needed";
    }
    setSetupStatus(status, ready);
    els.startBtn.disabled = !ready;
    renderOnboarding();
    return ready;
  }

  function newResponseTrace() {
    return {
      responseOrder: [],
      firstResponseField: "",
      firstResponseRtMs: null,
      ratingOrder: [],
      ratingInteractionSequence: [],
      firstRatingField: "",
      firstRatingRtMs: null,
      comprehensibilityFirstRtMs: null,
      comprehensibilityLastRtMs: null,
      comprehensibilitySelectionCount: 0,
      accentednessFirstRtMs: null,
      accentednessLastRtMs: null,
      accentednessSelectionCount: 0,
      unidentifiedSelectedRtMs: null,
    };
  }

  function resetResponseTrace() {
    state.responseTrace = newResponseTrace();
  }

  function itemRequiresDictation(item = currentTrial()) {
    if (isPracticeTrial(item)) return item.practice_kind === "combined";
    return els.taskMode.value === "combined" || els.taskMode.value === "dictation";
  }

  function itemRequiresRatings(item = currentTrial()) {
    if (isPracticeTrial(item)) return item.practice_kind === "combined";
    return els.taskMode.value === "combined" || els.taskMode.value === "ratings";
  }

  function usesStagedResponseFlow(item = currentTrial()) {
    return Boolean(
      STAGED_COMBINED_FLOW &&
        item &&
        itemRequiresDictation(item) &&
        itemRequiresRatings(item),
    );
  }

  function initialTrialStage(item = currentTrial()) {
    return usesStagedResponseFlow(item) ? "dictation" : "single";
  }

  function currentStagePlayed() {
    if (usesStagedResponseFlow()) {
      if (state.trialStage === "dictation") return Boolean(state.dictationAudioStartMs);
      if (state.trialStage === "ratings") return Boolean(state.ratingAudioStartMs);
    }
    return Boolean(state.audioStartMs);
  }

  function currentResponseRtMs() {
    return state.audioStartMs ? performance.now() - state.audioStartMs : null;
  }

  function rtCell(value) {
    return value === null || value === undefined ? "" : Number(value).toFixed(1);
  }

  function recordResponseInteraction(field) {
    if (!state.responseTrace) resetResponseTrace();
    const rt = currentResponseRtMs();
    if (rt === null) return;
    if (!state.responseTrace.responseOrder.includes(field)) {
      state.responseTrace.responseOrder.push(field);
    }
    if (!state.responseTrace.firstResponseField) {
      state.responseTrace.firstResponseField = field;
      state.responseTrace.firstResponseRtMs = rt;
    }
  }

  function recordRatingSelection(field) {
    if (field !== "comprehensibility" && field !== "accentedness") return;
    if (!state.responseTrace) resetResponseTrace();
    const rt = currentResponseRtMs();
    if (rt === null) return;
    recordResponseInteraction(field);
    state.responseTrace.ratingInteractionSequence.push(field);
    if (!state.responseTrace.ratingOrder.includes(field)) {
      state.responseTrace.ratingOrder.push(field);
    }
    if (!state.responseTrace.firstRatingField) {
      state.responseTrace.firstRatingField = field;
      state.responseTrace.firstRatingRtMs = rt;
    }
    if (field === "comprehensibility") {
      if (state.responseTrace.comprehensibilityFirstRtMs === null) {
        state.responseTrace.comprehensibilityFirstRtMs = rt;
      }
      state.responseTrace.comprehensibilityLastRtMs = rt;
      state.responseTrace.comprehensibilitySelectionCount += 1;
    } else {
      if (state.responseTrace.accentednessFirstRtMs === null) {
        state.responseTrace.accentednessFirstRtMs = rt;
      }
      state.responseTrace.accentednessLastRtMs = rt;
      state.responseTrace.accentednessSelectionCount += 1;
    }
  }

  function responseTraceFields() {
    const trace = state.responseTrace || newResponseTrace();
    return {
      response_order: trace.responseOrder.join(">"),
      first_response_field: trace.firstResponseField,
      first_response_rt_ms: rtCell(trace.firstResponseRtMs),
      rating_order: trace.ratingOrder.join(">"),
      rating_interaction_sequence: trace.ratingInteractionSequence.join(">"),
      first_rating_field: trace.firstRatingField,
      first_rating_rt_ms: rtCell(trace.firstRatingRtMs),
      comprehensibility_first_rt_ms: rtCell(trace.comprehensibilityFirstRtMs),
      comprehensibility_last_rt_ms: rtCell(trace.comprehensibilityLastRtMs),
      comprehensibility_selection_count: trace.comprehensibilitySelectionCount,
      accentedness_first_rt_ms: rtCell(trace.accentednessFirstRtMs),
      accentedness_last_rt_ms: rtCell(trace.accentednessLastRtMs),
      accentedness_selection_count: trace.accentednessSelectionCount,
      unidentified_selected_rt_ms: rtCell(trace.unidentifiedSelectedRtMs),
    };
  }

  function prolificCompletionCode() {
    return DEFAULT_PROLIFIC_COMPLETION_CODE;
  }

  function ensureSessionLabel() {
    if (els.sessionId.value.trim()) return;
    const prolific = prolificParams();
    const raterId = els.raterId.value.trim() || "participant";
    els.sessionId.value =
      prolific.prolific_session_id ||
      `session_${sanitizeName(raterId)}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  }

  function buildPracticeTrials() {
    return PRACTICE_ITEMS.map((item, index) => ({
      id: `practice_combined_${index + 1}`,
      phase: "practice",
      practice_kind: item.practice_kind,
      practice_group: item.practice_group,
      source_path: item.audio_url,
      audio_url: item.audio_url,
      file_name: item.file_name,
      target_word: item.word,
      participant_id: item.talker || "practice",
      native_language: item.l1_condition || "",
      accent_condition: item.practice_group,
      condition: `practice_${item.pronunciation_condition || item.practice_group}`,
      talker: item.talker || "practice_talker",
      pass_number: "",
      word_number: String(index + 1),
      trial_number: String(index + 1),
      take_number: "",
      spoken_form: item.word,
      practice_note: item.practice_note || "",
      source_format: item.source_format || "practice_elevenlabs_mp3_norm",
      stimulus_list: "practice",
      l1_condition: item.l1_condition || "",
      pronunciation_condition: item.pronunciation_condition || "",
      speaker_pattern_index: item.speaker_pattern_index || "",
      speaker_pattern_speaker: item.speaker_pattern_speaker || "",
      voice_variant: item.voice_variant || "",
      expert_comprehensibility_1_9: item.expert_comprehensibility_1_9,
      expert_accentedness_1_9: item.expert_accentedness_1_9,
      placeholder_audio: Boolean(item.placeholder_audio),
    }));
  }

  function serverAssignmentRows() {
    const practiceRows = buildPracticeTrials().map((item, index) => ({
      phase: item.phase || "main",
      trial_index: index + 1,
      counterbalance_cell: item.counterbalance_cell || "",
      list_comb: item.list_comb || "",
      pronunciation_style: item.pronunciation_style || "",
      stimulus_list: item.stimulus_list || "",
      l1_condition: item.l1_condition || "",
      pronunciation_condition: item.pronunciation_condition || "",
      speaker_pattern_index: item.speaker_pattern_index || "",
      speaker_pattern_speaker: item.speaker_pattern_speaker || "",
      block_index: item.block_index || "",
      block_list: item.block_list || "",
      within_block_index: item.within_block_index || "",
      block_trial_count: item.block_trial_count || "",
      source_path: item.source_path,
      audio_url: item.audio_url || "",
      file_name: item.file_name,
      target_word: item.target_word,
      participant_id: item.participant_id,
      native_language: item.native_language,
      accent_condition: item.accent_condition,
      condition: item.condition,
      talker: item.talker,
      pass_number: item.pass_number,
      word_number: item.word_number,
      trial_number: item.trial_number,
      take_number: item.take_number,
      spoken_form: item.spoken_form,
      practice_note: item.practice_note,
      source_format: item.source_format,
      expert_comprehensibility_1_9: item.expert_comprehensibility_1_9 || "",
      expert_accentedness_1_9: item.expert_accentedness_1_9 || "",
    }));
    const mainRows = (state.mainTrials.length ? state.mainTrials : state.trials).map((item, index) => ({
      phase: item.phase || "main",
      trial_index: index + 1,
      counterbalance_cell: item.counterbalance_cell || "",
      list_comb: item.list_comb || "",
      pronunciation_style: item.pronunciation_style || "",
      stimulus_list: item.stimulus_list || "",
      l1_condition: item.l1_condition || "",
      pronunciation_condition: item.pronunciation_condition || "",
      speaker_pattern_index: item.speaker_pattern_index || "",
      speaker_pattern_speaker: item.speaker_pattern_speaker || "",
      block_index: item.block_index || "",
      block_list: item.block_list || "",
      within_block_index: item.within_block_index || "",
      block_trial_count: item.block_trial_count || "",
      source_path: item.source_path,
      audio_url: item.audio_url || "",
      file_name: item.file_name,
      target_word: item.target_word,
      participant_id: item.participant_id,
      native_language: item.native_language,
      accent_condition: item.accent_condition,
      condition: item.condition,
      talker: item.talker,
      pass_number: item.pass_number,
      word_number: item.word_number,
      trial_number: item.trial_number,
      take_number: item.take_number,
      spoken_form: item.spoken_form,
      practice_note: item.practice_note,
      source_format: item.source_format,
      expert_comprehensibility_1_9: item.expert_comprehensibility_1_9 || "",
      expert_accentedness_1_9: item.expert_accentedness_1_9 || "",
    }));
    return [...practiceRows, ...mainRows];
  }

  async function postJson(path, payload) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || data.status || `${response.status} ${response.statusText}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function loadScriptOnce(id, src) {
    const existing = document.getElementById(id);
    if (existing) {
      return existing.dataset.loaded === "true"
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
          });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function renderTurnstile() {
    if (!els.turnstileWidget || !state.turnstileSiteKey || state.turnstileWidgetId !== null) return;
    els.turnstileWidget.classList.remove("hidden");
    await loadScriptOnce(
      "cloudflare-turnstile-script",
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
    if (!window.turnstile?.render) return;
    state.turnstileWidgetId = window.turnstile.render(els.turnstileWidget, {
      sitekey: state.turnstileSiteKey,
      callback: (token) => {
        state.turnstileToken = token;
      },
      "expired-callback": () => {
        state.turnstileToken = "";
      },
      "error-callback": () => {
        state.turnstileToken = "";
      },
    });
  }

  function resetTurnstile() {
    state.turnstileToken = "";
    if (state.turnstileWidgetId !== null && window.turnstile?.reset) {
      window.turnstile.reset(state.turnstileWidgetId);
    }
  }

  async function loadSecurityConfig() {
    if (state.securityConfigLoaded) return;
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const data = await response.json();
      state.productionMode = Boolean(data.production);
      state.turnstileSiteKey = data.turnstile_site_key || "";
      if (state.turnstileSiteKey) {
        await renderTurnstile();
      }
    } catch (error) {
      console.warn("security config could not be loaded", error);
    } finally {
      state.securityConfigLoaded = true;
      updateSelectedMaterialSummary();
    }
  }

  async function startServerSession() {
    if (state.serverSessionId) return state.serverSessionId;
    ensureSessionLabel();
    const seed = els.seed.value.trim() || `${els.raterId.value.trim()}_${els.sessionId.value.trim()}_${VERSION}`;
    const payload = {
      rater_id: els.raterId.value.trim(),
      session_label: els.sessionId.value.trim(),
      task_mode: els.taskMode.value,
      platform_version: VERSION,
      seed,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      turnstile_token: state.turnstileToken,
      dry_run: DRY_RUN_MODE ? "1" : "",
      screen: clientScreenInfo(),
      ...familiarityValues(),
      ...prolificParams(),
    };
    if (state.counterbalance.enabled) {
      payload.counterbalance = { enabled: true };
      payload.practice_assignment = buildPracticeTrials().map((item, index) => ({
        phase: item.phase || "practice",
        trial_index: index + 1,
        source_path: item.source_path,
        audio_url: item.audio_url || "",
        file_name: item.file_name,
        target_word: item.target_word,
        participant_id: item.participant_id,
        native_language: item.native_language,
        accent_condition: item.accent_condition,
        condition: item.condition,
        talker: item.talker,
        pass_number: item.pass_number,
        word_number: item.word_number,
        trial_number: item.trial_number,
        take_number: item.take_number,
        spoken_form: item.spoken_form,
        practice_note: item.practice_note,
        source_format: item.source_format,
        practice_kind: item.practice_kind,
        practice_group: item.practice_group,
        expert_comprehensibility_1_9: item.expert_comprehensibility_1_9 || "",
        expert_accentedness_1_9: item.expert_accentedness_1_9 || "",
      }));
    } else {
      payload.assignment = serverAssignmentRows();
    }

    const data = await postJson("/api/session/start", payload);
    state.serverSessionId = data.session_id;
    state.serverSessionToken = data.session_token || "";
    if (data.counterbalance) {
      state.counterbalance.assigned = data.counterbalance;
    }
    if (Array.isArray(data.main_assignment) && data.main_assignment.length) {
      state.mainTrials = data.main_assignment.map((item) => ({
        ...item,
        file: null,
        phase: "main",
        practice_kind: "",
      }));
    }
    state.serverSaveFailed = false;
    return state.serverSessionId;
  }

  async function logServerEvent(eventType, payload = {}, trialIndex = null) {
    if (!state.serverSessionId) return;
    try {
      await postJson("/api/event", {
        session_id: state.serverSessionId,
        session_token: state.serverSessionToken,
        rater_id: els.raterId.value.trim(),
        event_type: eventType,
        trial_index: trialIndex,
        event_at: new Date().toISOString(),
        payload,
      });
    } catch (error) {
      console.warn("server event log failed", error);
    }
  }

  async function saveServerTrial(row) {
    if (!state.serverSessionId) return;
    await postJson("/api/trial", {
      session_id: state.serverSessionId,
      session_token: state.serverSessionToken,
      ...prolificParams(),
      row,
    });
  }

  async function completeServerSession() {
    if (!state.serverSessionId) return null;
    const payload = {
      session_id: state.serverSessionId,
      session_token: state.serverSessionToken,
    };
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await postJson("/api/session/complete", payload);
      } catch (error) {
        const retryable = error.status === 409 && error.data?.retryable === true;
        if (!retryable || attempt === maxAttempts - 1) throw error;
        els.progressText.textContent = "Confirming saved responses...";
        els.railAudio.textContent = "Saving";
        await delay(700 + attempt * 900);
      }
    }
    return null;
  }

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function rowsToCsv(rows) {
    if (!rows.length) return "";
    const keys = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    return [
      keys.map(csvCell).join(","),
      ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
    ].join("\n");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    if (!rows.length) return [];
    const headers = rows[0].map((header) => normalizeHeader(header));
    return rows.slice(1)
      .filter((values) => values.some((value) => String(value).trim() !== ""))
      .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  }

  function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function normalizeResponse(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  }

  function fileKey(value) {
    return String(value || "")
      .trim()
      .replaceAll("\\", "/")
      .split("/")
      .pop()
      .toLowerCase();
  }

  function pathKey(value) {
    return String(value || "")
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .toLowerCase();
  }

  function hashString(value) {
    let h = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function rng() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, seedText) {
    const out = items.slice();
    const rng = mulberry32(hashString(seedText));
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function parseRecordingName(fileName) {
    const base = fileName.replace(/\.[^.]+$/, "");
    const production = base.match(/^(.+?)_production_(\d+)_([a-z][a-z-]*)$/i);
    if (production) {
      return {
        participant_id: production[1],
        trial_number: production[2],
        target_word: production[3],
        source_format: "vocabulary_platform_production",
      };
    }

    const pilot = base.match(/^(.+?)_(english|japanese|chinese)_pass(\d+)_(.+?)_word(\d+)_([a-z][a-z-]*)_take(\d+)_trial(\d+)_talker_(.+)$/i);
    if (pilot) {
      return {
        participant_id: pilot[1],
        native_language: pilot[2],
        pass_number: pilot[3],
        condition: pilot[4],
        word_number: pilot[5],
        target_word: pilot[6],
        take_number: pilot[7],
        trial_number: pilot[8],
        talker: pilot[9],
        source_format: "pilot_learning_phase",
      };
    }

    return { source_format: "unknown_filename" };
  }

  function valueFrom(row, names) {
    for (const name of names) {
      const normalized = normalizeHeader(name);
      if (row && row[normalized] !== undefined && String(row[normalized]).trim() !== "") {
        return String(row[normalized]).trim();
      }
    }
    return "";
  }

  function normalizeL1Condition(value) {
    const text = String(value || "").trim().toLowerCase();
    if (["eng", "english", "native_english", "ame", "american", "us", "usa"].includes(text)) return "ENG";
    if (["jpn", "jp", "japanese", "japan"].includes(text)) return "JPN";
    if (["chn", "cn", "zh", "chinese", "china", "mandarin"].includes(text)) return "CHN";
    return "";
  }

  function normalizePronunciationCondition(value) {
    const text = String(value || "").trim().toLowerCase().replace(/[_\s-]+/g, "");
    if (["natural", "nat", "native", "nativelike"].includes(text)) return "natural";
    if (["accented", "accent", "strongaccent", "mildaccent", "nonnative"].includes(text)) return "accented";
    return "";
  }

  function participantIdFromRow(row) {
    return valueFrom(row, [
      "participant_id",
      "participant",
      "proposed_speaker_id",
      "l1_speaker_id",
      "speaker_id",
      "speaker",
    ]);
  }

  function resolveUrl(value, baseUrl = window.location.href) {
    try {
      return new URL(value, baseUrl).toString();
    } catch (error) {
      return String(value || "");
    }
  }

  function remoteAudioUrlFromRow(row, manifestUrl) {
    const directUrl = valueFrom(row, REMOTE_AUDIO_URL_COLUMNS);
    const filePath = valueFrom(row, REQUIRED_MANIFEST_FILE_COLUMNS);
    const candidate = directUrl || filePath;
    return candidate ? resolveUrl(candidate, manifestUrl) : "";
  }

  function hasCounterbalanceMetadata(row) {
    const wordNumber = valueFrom(row, ["word_number", "word_id", "item_id", "word_no"]);
    const l1Raw = valueFrom(row, ["l1_condition", "l1", "native_language", "native", "speaker_l1"]);
    const l1 = normalizeL1Condition(l1Raw);
    const pronunciation = normalizePronunciationCondition(valueFrom(row, [
      "pronunciation_condition",
      "pronunciation",
      "accent_condition",
      "accent",
      "style",
    ]));
    const pronunciationReady = l1 === "ENG"
      ? (!pronunciation || pronunciation === "natural")
      : Boolean(pronunciation);
    return Boolean(wordNumber && l1 && pronunciationReady);
  }

  function displayFileNameFromSource(sourcePath, fallback = "audio.wav") {
    const key = fileKey(sourcePath);
    return key || fallback;
  }

  function buildManifestIndex(rows) {
    const index = new Map();
    rows.forEach((row) => {
      const fileValue = valueFrom(row, REQUIRED_MANIFEST_FILE_COLUMNS);
      if (!fileValue) return;
      index.set(pathKey(fileValue), row);
      const base = fileKey(fileValue);
      if (!index.has(base)) index.set(base, row);
    });
    return index;
  }

  function collectAudioFiles() {
    return [...els.audioFiles.files, ...els.audioFolder.files]
      .filter((file) => AUDIO_EXTENSIONS.test(file.name))
      .sort((a, b) => {
        const aPath = a.webkitRelativePath || a.name;
        const bPath = b.webkitRelativePath || b.name;
        return aPath.localeCompare(bPath);
      })
      .map((file) => ({
        file,
        sourcePath: file.webkitRelativePath || file.name,
      }));
  }

  async function readManifest() {
    const file = els.manifestFile.files[0];
    if (!file) return [];
    const text = await file.text();
    return parseCsv(text);
  }

  async function fetchCsv(url) {
    const resolvedUrl = resolveUrl(url || DEFAULT_REMOTE_MANIFEST_URL);
    const response = await fetch(resolvedUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${resolvedUrl} (${response.status})`);
    }
    return {
      rows: parseCsv(await response.text()),
      url: resolvedUrl,
    };
  }

  function remoteManifestInput() {
    if (!els.customManifestToggle.checked) return DEFAULT_REMOTE_MANIFEST_URL;
    return els.remoteManifestUrl.value.trim() || DEFAULT_REMOTE_MANIFEST_URL;
  }

  function syncCustomManifestVisibility() {
    els.customManifestField.classList.toggle("hidden", !els.customManifestToggle.checked);
    els.sourceSummary.textContent = els.customManifestToggle.checked
      ? "Custom manifest selected"
      : `Default: ${DEFAULT_REMOTE_MANIFEST_URL}`;
  }

  async function prepareTrials() {
    const raterId = els.raterId.value.trim();
    const sessionId = els.sessionId.value.trim();
    if (!raterId || !sessionId) {
      setLog("Enter both a participant ID and a session label.");
      setSetupStatus("Participant ID needed");
      return;
    }

    const fileRecords = collectAudioFiles();
    if (!fileRecords.length) {
      setLog("Upload at least one audio file or audio folder.");
      setSetupStatus("Audio needed");
      return;
    }

    state.manifestRows = await readManifest();
    prepareFileRecords(fileRecords, state.manifestRows);
  }

  function prepareFileRecords(fileRecords, manifestRows) {
    const raterId = els.raterId.value.trim();
    const sessionId = els.sessionId.value.trim();
    const manifestIndex = buildManifestIndex(manifestRows);

    state.items = fileRecords.map(({ file, sourcePath }, index) => {
      const parsed = parseRecordingName(file.name);
      const manifest = manifestIndex.get(pathKey(sourcePath)) || manifestIndex.get(fileKey(sourcePath)) || manifestIndex.get(fileKey(file.name)) || {};
      const targetWord = valueFrom(manifest, ["target_word", "word", "item", "expected_word"]) || parsed.target_word || "";
      return {
        id: index + 1,
        file,
        source_path: sourcePath,
        file_name: file.name,
        target_word: targetWord,
        participant_id: participantIdFromRow(manifest) || parsed.participant_id || "",
        native_language: valueFrom(manifest, ["native_language", "native", "l1"]) || parsed.native_language || "",
        condition: valueFrom(manifest, ["condition", "pass_condition", "variability_condition"]) || parsed.condition || "",
        accent_condition: valueFrom(manifest, ["accent_condition", "accent"]) || "",
        talker: valueFrom(manifest, ["talker", "global_speaker_id", "talker_id", "voice", "voice_alias"]) || parsed.talker || "",
        pass_number: valueFrom(manifest, ["pass_number", "pass"]) || parsed.pass_number || "",
        trial_number: valueFrom(manifest, ["trial_number", "trial"]) || parsed.trial_number || "",
        word_number: valueFrom(manifest, ["word_number", "word_id", "item_id"]) || parsed.word_number || "",
        take_number: valueFrom(manifest, ["take_number", "take"]) || parsed.take_number || "",
        spoken_form: valueFrom(manifest, ["spoken_form", "spoken_text", "prompt"]),
        practice_note: valueFrom(manifest, ["practice_note", "note", "notes"]),
        source_format: valueFrom(manifest, ["source_format"]) || parsed.source_format,
        manifest,
      };
    });

    finishPreparedItems(manifestRows);
  }

  function remoteRowToItem(row, manifestUrl, index, participantId = "") {
    const audioUrl = remoteAudioUrlFromRow(row, manifestUrl);
    const sourcePath = valueFrom(row, REQUIRED_MANIFEST_FILE_COLUMNS) || audioUrl;
    const fileName = displayFileNameFromSource(sourcePath || audioUrl, `remote_${String(index + 1).padStart(3, "0")}.wav`);
    const parsed = parseRecordingName(fileName);
    const targetWord = valueFrom(row, ["target_word", "word", "item", "expected_word"]) || parsed.target_word || "";
    const l1Raw = valueFrom(row, ["l1_condition", "l1", "native_language", "native", "speaker_l1"]) || parsed.native_language || "";
    const pronunciationRaw = valueFrom(row, [
      "pronunciation_condition",
      "pronunciation",
      "accent_condition",
      "accent",
      "style",
    ]);
    const l1Condition = normalizeL1Condition(l1Raw) || l1Raw;
    const pronunciationCondition = normalizePronunciationCondition(pronunciationRaw) || pronunciationRaw;
    return {
      id: index + 1,
      file: null,
      audio_url: audioUrl,
      source_path: sourcePath,
      file_name: fileName,
      target_word: targetWord,
      participant_id: participantIdFromRow(row) || parsed.participant_id || participantId,
      native_language: l1Condition,
      l1_condition: l1Condition,
      pronunciation_condition: pronunciationCondition,
      stimulus_list: valueFrom(row, ["stimulus_list", "list", "list_id", "counterbalance_list"]).toUpperCase(),
      condition: valueFrom(row, ["condition", "pass_condition", "variability_condition"]) || parsed.condition || "",
      accent_condition: pronunciationCondition,
      talker: valueFrom(row, ["talker", "global_speaker_id", "talker_id", "voice", "voice_alias"]) || parsed.talker || "",
      pass_number: valueFrom(row, ["pass_number", "pass"]) || parsed.pass_number || "",
      trial_number: valueFrom(row, ["trial_number", "trial"]) || parsed.trial_number || "",
      word_number: valueFrom(row, ["word_number", "word_id", "item_id", "word_no"]) || parsed.word_number || "",
      take_number: valueFrom(row, ["take_number", "take"]) || parsed.take_number || "",
      spoken_form: valueFrom(row, ["spoken_form", "spoken_text", "prompt"]),
      practice_note: valueFrom(row, ["practice_note", "note", "notes"]),
      source_format: valueFrom(row, ["source_format"]) || "github_remote",
      manifest: row,
    };
  }

  function prepareRemoteRows(rows, manifestUrl, participantId) {
    state.items = rows.map((row, index) => remoteRowToItem(row, manifestUrl, index, participantId));
    state.counterbalance.enabled = false;
    state.counterbalance.assigned = null;

    finishPreparedItems(rows, `participant_id: ${participantId}`);
  }

  function prepareCounterbalancePool(rows, manifestUrl) {
    const raterId = els.raterId.value.trim();
    if (!els.sessionId.value.trim() && raterId) {
      els.sessionId.value = `counterbalance_${sanitizeName(raterId)}_${new Date().toISOString().slice(0, 10)}`;
    }

    state.items = rows.map((row, index) => remoteRowToItem(row, manifestUrl, index));
    state.manifestRows = rows;
    state.mainTrials = [];
    state.trials = [];
    state.practiceTrials = [];
    state.rows = [];
    state.currentIndex = -1;
    state.phase = "main";
    state.pendingPracticeRow = null;
    state.pendingPracticeFeedback = null;
    state.serverSessionId = "";
    state.serverSessionToken = "";
    state.serverSaveFailed = false;
    state.distractor = null;
    state.counterbalance.enabled = true;
    state.counterbalance.assigned = null;
    resetDownload();

    const targetCount = state.items.filter((item) => item.target_word).length;
    const l1Counts = state.items.reduce((counts, item) => {
      const key = item.l1_condition || item.native_language || "(missing)";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const pronunciationCounts = state.items.reduce((counts, item) => {
      const key = item.pronunciation_condition || "(missing)";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});

    const enoughCandidates = state.items.length >= 100;
    updateSetupSummary(state.items.length, targetCount, rows.length);
    setPreparedStartState("Ready");
    els.downloadBtn.disabled = true;
    setLog([
      `version: ${VERSION}`,
      "counterbalance: server-side automatic allocation",
      `manifest_rows: ${rows.length}`,
      `candidate_audio: ${state.items.length}`,
      enoughCandidates ? "" : "warning: fewer than 100 counterbalance-ready rows are available.",
      "main_trials_per_session: 100",
      `practice_trials: ${PRACTICE_ITEMS.length}`,
      "task_mode: combined",
      "",
      "l1_counts:",
      Object.entries(l1Counts).map(([key, value]) => `${key}: ${value}`).join("\n"),
      "",
      "pronunciation_counts:",
      Object.entries(pronunciationCounts).map(([key, value]) => `${key}: ${value}`).join("\n"),
    ].join("\n"));
  }

  function resetRemoteParticipantSelect(label = "Load participants first") {
    els.remoteParticipantGrid.innerHTML = label;
    els.remoteParticipantGrid.classList.add("empty");
    els.remoteSelectAllBtn.disabled = true;
    els.remoteClearBtn.disabled = true;
    els.prepareRemoteBtn.disabled = true;
  }

  function selectedRemoteParticipants() {
    return [...els.remoteParticipantGrid.querySelectorAll("input:checked")].map((input) => input.value);
  }

  function updateRemoteParticipantActions() {
    const inputs = els.remoteParticipantGrid.querySelectorAll("input");
    const selected = selectedRemoteParticipants();
    els.remoteSelectAllBtn.disabled = inputs.length === 0;
    els.remoteClearBtn.disabled = inputs.length === 0;
    els.prepareRemoteBtn.disabled = selected.length === 0;
    updateSelectedMaterialSummary();
  }

  function populateParticipantSelect(rows, manifestUrl) {
    const counts = new Map();
    rows.forEach((row) => {
      const participantId = participantIdFromRow(row);
      const audioUrl = remoteAudioUrlFromRow(row, manifestUrl);
      if (!participantId || !audioUrl) return;
      counts.set(participantId, (counts.get(participantId) || 0) + 1);
    });

    const participants = [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    els.remoteParticipantGrid.innerHTML = "";
    els.remoteParticipantGrid.classList.toggle("empty", participants.length === 0);
    if (!participants.length) {
      els.remoteParticipantGrid.textContent = "No participants found.";
    }
    participants.forEach(([participantId, count]) => {
      const label = document.createElement("label");
      label.className = "participant-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = participantId;
      input.checked = participants.length === 1;
      input.addEventListener("change", updateRemoteParticipantActions);
      const text = document.createTextNode(participantId);
      const meta = document.createElement("span");
      meta.textContent = `${count} files`;
      label.append(input, text, meta);
      els.remoteParticipantGrid.append(label);
    });

    updateRemoteParticipantActions();
    return participants;
  }

  async function loadRemoteParticipants() {
    const manifestInput = remoteManifestInput();
    els.loadParticipantsBtn.disabled = true;
    els.prepareRemoteBtn.disabled = true;
    resetRemoteParticipantSelect("Loading participants...");
    setSetupStatus("Loading");
    setLog(`Loading uploaded recordings:\n${manifestInput}`);

    const { rows, url } = await fetchCsv(manifestInput);
    const usableRows = rows.filter((row) => {
      if (!remoteAudioUrlFromRow(row, url)) return false;
      return COUNTERBALANCE_ENABLED ? hasCounterbalanceMetadata(row) : participantIdFromRow(row);
    });
    if (!usableRows.length) {
      state.remoteRows = [];
      state.remoteManifestUrl = "";
      state.manifestRows = [];
      resetRemoteParticipantSelect("No usable participants");
      updateSelectedMaterialSummary();
      throw new Error(
        COUNTERBALANCE_ENABLED
          ? "The manifest needs rows with audio_file/audio_url, word_number, l1_condition/native_language, natural pronunciation for ENG rows, and natural/accented pronunciation for JPN/CHN rows."
          : "The manifest needs rows with participant_id plus audio_file or audio_url.",
      );
    }

    state.remoteRows = usableRows;
    state.remoteManifestUrl = url;
    state.manifestRows = usableRows;
    state.items = [];
    state.trials = [];
    resetDownload();
    els.startBtn.disabled = true;
    const participants = populateParticipantSelect(usableRows, url);
    els.sourceSummary.textContent = els.customManifestToggle.checked ? `Loaded: ${url}` : `Default loaded: ${DEFAULT_REMOTE_MANIFEST_URL}`;
    if (COUNTERBALANCE_ENABLED) {
      els.prepareRemoteBtn.textContent = "Prepare counterbalanced session";
      prepareCounterbalancePool(usableRows, url);
      els.remoteParticipantGrid.classList.remove("empty");
      els.remoteParticipantGrid.textContent =
        "Server-side counterbalancing is enabled. All usable manifest rows form the candidate pool; participant checkboxes are not used.";
      els.remoteSelectAllBtn.disabled = true;
      els.remoteClearBtn.disabled = true;
      els.prepareRemoteBtn.disabled = false;
    } else {
      updateSelectedMaterialSummary();
      setSetupStatus(selectedRemoteParticipants().length ? "Participant ID needed" : "Participant needed");
      setLog([
        `remote_manifest: ${url}`,
        `usable_rows: ${usableRows.length}`,
        `participants: ${participants.length}`,
        "",
        "participant_ids:",
        participants.map(([participantId, count]) => `${participantId}: ${count} files`).join("\n"),
      ].join("\n"));
    }
    els.loadParticipantsBtn.disabled = false;
  }

  function prepareSelectedRemoteParticipant() {
    const raterId = els.raterId.value.trim();
    if (COUNTERBALANCE_ENABLED) {
      if (!raterId) {
        setSetupStatus("Participant ID needed");
        setLog("Enter a participant ID before preparing the counterbalanced session.");
        els.raterId.focus();
        return;
      }
      const manifestUrl = state.remoteManifestUrl || resolveUrl(remoteManifestInput());
      prepareCounterbalancePool(state.remoteRows, manifestUrl);
      return;
    }
    const participantIds = selectedRemoteParticipants();
    if (!raterId) {
      setSetupStatus("Participant ID needed");
      setLog("Enter a participant ID before preparing the rating session.");
      els.raterId.focus();
      return;
    }
    if (!participantIds.length) {
      setSetupStatus("Participant needed");
      setLog("Check at least one participant ID first.");
      els.remoteParticipantGrid.focus();
      return;
    }
    if (!els.sessionId.value.trim()) {
      els.sessionId.value = participantIds.length === 1
        ? `participant_${sanitizeName(participantIds[0])}`
        : `participants_${participantIds.length}_${new Date().toISOString().slice(0, 10)}`;
    }

    const manifestUrl = state.remoteManifestUrl || resolveUrl(remoteManifestInput());
    const participantSet = new Set(participantIds);
    const selectedRows = state.remoteRows.filter((row) => participantSet.has(participantIdFromRow(row)));
    const playableRows = selectedRows.filter((row) => remoteAudioUrlFromRow(row, manifestUrl));
    if (!playableRows.length) {
      setSetupStatus("Audio needed");
      setLog(`No playable audio rows were found for participant_id: ${participantIds.join(", ")}`);
      return;
    }

    state.manifestRows = playableRows;
    prepareRemoteRows(playableRows, manifestUrl, participantIds.join(", "));
  }

  function finishPreparedItems(manifestRows, extraLogLine = "") {
    const raterId = els.raterId.value.trim();
    const sessionId = els.sessionId.value.trim();

    state.counterbalance.enabled = false;
    state.counterbalance.assigned = null;
    const seed = els.seed.value.trim() || `${raterId}_${sessionId}_${VERSION}`;
    const taskMode = els.taskMode.value;
    state.mainTrials = shuffle(
      state.items.map((item) => ({ ...item, phase: "main", practice_kind: "" })),
      seed,
    );
    state.trials = state.mainTrials;
    state.practiceTrials = [];
    state.rows = [];
    state.currentIndex = -1;
    state.phase = "main";
    state.pendingPracticeRow = null;
    state.pendingPracticeFeedback = null;
    state.serverSessionId = "";
    state.serverSessionToken = "";
    state.serverSaveFailed = false;
    state.distractor = null;
    resetDownload();

    const targetCount = state.items.filter((item) => item.target_word).length;
    updateSetupSummary(state.items.length, targetCount, state.manifestRows.length);
    setPreparedStartState("Ready");
    const manifestMessage = state.manifestRows.length
      ? `manifest_rows: ${state.manifestRows.length}`
      : "manifest_rows: 0";
    const preview = state.mainTrials.slice(0, 5).map((item, index) => {
      const target = item.target_word ? "target=available" : "target=missing";
      return `${index + 1}. ${item.file_name} (${target})`;
    }).join("\n");

    setLog([
      `version: ${VERSION}`,
      `audio_files: ${state.items.length}`,
      `practice_trials: ${PRACTICE_ITEMS.length}`,
      `target_words_available: ${targetCount}`,
      manifestMessage,
      `task_mode: ${taskMode}`,
      `seed: ${seed}`,
      extraLogLine,
      "",
      "first_trials:",
      preview,
    ].filter((line) => line !== "").join("\n"));

    els.downloadBtn.disabled = true;
  }

  function resetDownload() {
    if (state.downloadBlobUrl) URL.revokeObjectURL(state.downloadBlobUrl);
    state.downloadBlobUrl = null;
    state.downloadName = "";
  }

  function renderScales() {
    renderScale(els.comprehensibilityScale, "comprehensibility");
    renderScale(els.accentednessScale, "accentedness");
  }

  function renderScale(container, name) {
    container.innerHTML = "";
    for (let value = 1; value <= RATING_SCALE_MAX; value += 1) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = String(value);
      input.required = true;
      input.addEventListener("change", handleRatingChange);
      label.append(input, document.createTextNode(String(value)));
      container.append(label);
    }
  }

  function selectedScale(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : "";
  }

  function clearSelectedScale(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = false;
    });
  }

  function setScaleInputsDisabled(disabled) {
    document
      .querySelectorAll('input[name="comprehensibility"], input[name="accentedness"]')
      .forEach((input) => {
        input.disabled = disabled;
      });
    [els.comprehensibilityBlock, els.accentednessBlock].forEach((block) => {
      if (block) block.classList.toggle("disabled", disabled);
    });
  }

  function setResponseInputsEnabled(enabled) {
    const staged = usesStagedResponseFlow();
    const dictationActive = !staged || state.trialStage === "dictation";
    const ratingsActive = !staged || state.trialStage === "ratings";
    if (requiresDictation()) {
      const canUseDictation = enabled && dictationActive;
      els.dictationInput.disabled = !canUseDictation || Boolean(els.dictationUnidentified?.checked);
      if (els.dictationUnidentified) els.dictationUnidentified.disabled = !canUseDictation;
    }
    if (requiresRatings()) {
      setScaleInputsDisabled(!(enabled && ratingsActive));
    }
  }

  function currentTrial() {
    return state.trials[state.currentIndex] || null;
  }

  function isPracticeTrial(item = currentTrial()) {
    return item?.phase === "practice";
  }

  function hidePracticeFeedback() {
    state.pendingPracticeRow = null;
    state.pendingPracticeFeedback = null;
    if (els.practiceFeedback) {
      els.practiceFeedback.textContent = "";
      els.practiceFeedback.classList.add("hidden");
    }
    if (els.practiceReasonBlock) els.practiceReasonBlock.classList.add("hidden");
    if (els.practiceReason) els.practiceReason.value = "";
    updateNextButtonLabel();
  }

  function practiceRequiresReason(feedback) {
    return Boolean(feedback?.requiresReason);
  }

  function selectedRatingNumber(name) {
    const value = Number.parseInt(selectedScale(name), 10);
    return Number.isFinite(value) ? value : null;
  }

  function buildPracticeFeedback(row, item) {
    const exact = row.intelligibility_exact === 1;
    const expertComp = Number(item.expert_comprehensibility_1_9);
    const expertAccent = Number(item.expert_accentedness_1_9);
    const userComp = selectedRatingNumber("comprehensibility");
    const userAccent = selectedRatingNumber("accentedness");
    const answerText = row.intelligibility_unidentified === 1
      ? "I could not identify the word"
      : row.typed_response || "(blank)";
    return {
      requiresReason: false,
      text:
        `Correct word: ${item.target_word}\n` +
        `Your answer: ${answerText} ${exact ? "(matched)" : "(not an exact match)"}\n` +
        `Understanding reference: ${expertComp}; your rating: ${userComp}.\n` +
        `Accent reference: ${expertAccent}; your rating: ${userAccent}.\n` +
        "These reference ratings are only for practice.",
    };
  }

  function shouldAdvanceToRatingStage() {
    return usesStagedResponseFlow() && state.trialStage === "dictation";
  }

  function advanceToRatingStage() {
    state.dictationSubmitRtMs = currentResponseRtMs();
    cleanupAudio();
    state.audioStartMs = null;
    state.trialStage = "ratings";
    els.playBtn.disabled = false;
    els.playBtn.textContent = "Play audio";
    els.audioState.textContent = "Press Play audio to begin the rating part.";
    els.railAudio.textContent = "Pending";
    els.trialTitle.textContent = trialTitleText();
    updateTaskModeVisibility();
    setResponseInputsEnabled(false);
    updateNextButtonLabel();
    updateNextState();
    logServerEvent(
      "rating_stage_shown",
      {
        phase: state.phase,
        file_name: currentTrial()?.file_name || "",
        target_word: currentTrial()?.target_word || "",
        dictation_submit_rt_ms: rtCell(state.dictationSubmitRtMs),
      },
      state.currentIndex + 1,
    );
    els.playBtn.focus();
  }

  async function startSession() {
    els.startBtn.disabled = true;
    setSetupStatus("Starting");
    await loadSecurityConfig();
    if (state.productionMode && (!SERVER_SAVE_REQUIRED || !COUNTERBALANCE_ENABLED)) {
      setSetupStatus("Start failed");
      setLog(PARTICIPANT_MODE
        ? "The task could not start. Please contact the researcher."
        : "Production mode does not allow local or manual participant workflows.");
      els.startBtn.disabled = false;
      return;
    }
    if (productionProlificLinkMissing()) {
      setSetupStatus("Open from Prolific");
      setLog("Please open this task from your Prolific study page.");
      setOnboardingStep("identity");
      els.startBtn.disabled = true;
      return;
    }
    if (!els.raterId.value.trim()) {
      setSetupStatus("Participant ID needed");
      setLog("Enter a participant ID before starting.");
      setOnboardingStep("identity");
      els.startBtn.disabled = false;
      return;
    }
    if (!familiarityComplete()) {
      setSetupStatus("Familiarity needed");
      setLog("Answer both familiarity questions before starting.");
      setOnboardingStep("familiarity");
      updateSelectedMaterialSummary();
      return;
    }
    if (!state.counterbalance.enabled && !state.items.length && !state.mainTrials.length) {
      setSetupStatus("Audio needed");
      setLog("Load or prepare the rating materials before starting.");
      setOnboardingStep("ready");
      els.startBtn.disabled = false;
      return;
    }
    try {
      await startServerSession();
      setSetupStatus("Starting", true);
    } catch (error) {
      state.serverSaveFailed = true;
      resetTurnstile();
      setSetupStatus(PARTICIPANT_MODE ? "Start failed" : "Server save failed");
      setLog(PARTICIPANT_MODE
        ? "The task could not start. Please contact the researcher."
        : `Server session could not be started: ${error.message}\n` +
            (SERVER_SAVE_REQUIRED
              ? "Server saving is required. Do not run data collection until this is fixed."
              : state.counterbalance.enabled
                ? "Counterbalanced sessions require the server manifest and cannot fall back to local randomization."
                : "Continuing in local mode because ?local=1 is set."));
      if (SERVER_SAVE_REQUIRED || state.counterbalance.enabled) {
        els.startBtn.disabled = false;
        return;
      }
    }
    state.running = true;
    state.phase = "practice";
    state.practiceTrials = buildPracticeTrials();
    state.trials = state.practiceTrials;
    showOnly(els.taskPanel);
    showTrial(0);
  }

  function trialTitleText(item = currentTrial()) {
    if (usesStagedResponseFlow(item)) {
      return state.trialStage === "ratings" ? "Rate the word" : "Identify the word";
    }
    return isPracticeTrial(item) ? "Practice" : "Listen and answer";
  }

  function updateNextButtonLabel() {
    if (!els.nextBtn) return;
    const item = currentTrial();
    if (state.pendingPracticeRow) {
      els.nextBtn.textContent = "Continue";
    } else if (usesStagedResponseFlow(item) && state.trialStage === "dictation") {
      els.nextBtn.textContent = "Continue to ratings";
    } else if (isPracticeTrial(item)) {
      els.nextBtn.textContent = "Check practice answer";
    } else {
      els.nextBtn.textContent = "Continue";
    }
  }

  function showTrial(index) {
    cleanupAudio();
    state.currentIndex = index;
    const item = currentTrial();
    state.audioStartMs = null;
    state.playedAtIso = "";
    state.trialStage = initialTrialStage(item);
    state.dictationAudioStartMs = null;
    state.ratingAudioStartMs = null;
    state.dictationPlayedAtIso = "";
    state.ratingPlayedAtIso = "";
    state.dictationSubmitRtMs = null;
    state.dictationAudioDurationS = null;
    state.ratingAudioDurationS = null;
    state.firstKeyRtMs = null;
    state.replayCount = 0;
    resetResponseTrace();
    hidePracticeFeedback();

    clearSelectedScale("comprehensibility");
    clearSelectedScale("accentedness");
    els.dictationInput.value = "";
    els.dictationInput.disabled = true;
    if (els.dictationUnidentified) {
      els.dictationUnidentified.checked = false;
      els.dictationUnidentified.disabled = true;
    }
    setScaleInputsDisabled(true);
    els.nextBtn.disabled = true;
    els.playBtn.disabled = false;
    els.playBtn.textContent = "Play audio";
    els.audioState.textContent = usesStagedResponseFlow(item)
      ? "Press Play audio to begin the word-identification part."
      : "Press Play audio to begin.";
    updateTaskModeVisibility();
    setResponseInputsEnabled(false);

    const trialNumber = index + 1;
    const total = state.trials.length;
    els.taskPhase.textContent = isPracticeTrial(item)
      ? `Practice ${trialNumber} of ${total}`
      : `Question ${trialNumber} of ${total}`;
    els.trialTitle.textContent = trialTitleText(item);
    updateNextButtonLabel();
    els.progressFill.style.width = `${Math.max(0, (index / total) * 100)}%`;
    els.progressText.textContent = `${index} of ${total} completed`;
    els.railMode.textContent = formatTaskMode(els.taskMode.value);
    els.railCompleted.textContent = String(index);
    els.railRemaining.textContent = String(total - index);
    els.railAudio.textContent = "Pending";
    logServerEvent(
      "trial_shown",
      {
        phase: state.phase,
        practice_kind: item?.practice_kind || "",
        file_name: item?.file_name || "",
        target_word: item?.target_word || "",
      },
      trialNumber,
    );
  }

  function cleanupAudio() {
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio.src = "";
      state.currentAudio = null;
    }
    if (state.currentUrl) {
      URL.revokeObjectURL(state.currentUrl);
      state.currentUrl = null;
    }
  }

  function markAudioPlaybackStarted() {
    const isReplay = currentStagePlayed();
    if (isReplay) {
      state.replayCount += 1;
    } else {
      const startedAtMs = performance.now();
      const startedAtIso = new Date().toISOString();
      state.audioStartMs = startedAtMs;
      if (!state.playedAtIso) state.playedAtIso = startedAtIso;
      if (usesStagedResponseFlow()) {
        if (state.trialStage === "dictation") {
          state.dictationAudioStartMs = startedAtMs;
          state.dictationPlayedAtIso = startedAtIso;
        } else if (state.trialStage === "ratings") {
          state.ratingAudioStartMs = startedAtMs;
          state.ratingPlayedAtIso = startedAtIso;
        }
      } else {
        state.playedAtIso = startedAtIso;
      }
    }
    return isReplay;
  }

  function recordCurrentStageAudioDuration(duration) {
    if (!Number.isFinite(duration)) return;
    if (usesStagedResponseFlow()) {
      if (state.trialStage === "dictation") {
        state.dictationAudioDurationS = duration;
      } else if (state.trialStage === "ratings") {
        state.ratingAudioDurationS = duration;
      }
    }
  }

  function resetPlaybackAttemptAfterError() {
    if (usesStagedResponseFlow()) {
      if (state.trialStage === "dictation") {
        state.dictationAudioStartMs = null;
        state.dictationPlayedAtIso = "";
        state.dictationAudioDurationS = null;
      } else if (state.trialStage === "ratings") {
        state.ratingAudioStartMs = null;
        state.ratingPlayedAtIso = "";
        state.ratingAudioDurationS = null;
      }
      state.playedAtIso = state.dictationPlayedAtIso || state.ratingPlayedAtIso || "";
    } else {
      state.playedAtIso = "";
    }
    state.audioStartMs = null;
    els.railAudio.textContent = "Error";
    setResponseInputsEnabled(false);
    els.nextBtn.disabled = true;
  }

  function responsePromptAfterPlayback() {
    const dictation = requiresDictation();
    const ratings = requiresRatings();
    if (usesStagedResponseFlow()) {
      return state.trialStage === "ratings" ? "Choose both ratings." : "Type the word you heard.";
    }
    if (dictation && ratings) return "Type the word and choose both ratings.";
    if (dictation) return "Type the word you heard.";
    if (ratings) return "Choose both ratings.";
    return "Continue when ready.";
  }

  function enableResponsesAfterPlayback() {
    els.playBtn.disabled = !AUDIO_REPLAY_ALLOWED;
    els.playBtn.textContent = AUDIO_REPLAY_ALLOWED ? "Play again" : "Audio played";
    els.audioState.textContent = `Audio played. ${responsePromptAfterPlayback()}`;
    els.railAudio.textContent = "Played";
    setResponseInputsEnabled(true);
    if (requiresDictation()) {
      els.dictationInput.focus();
    }
    updateNextState();
  }

  async function playPlaceholderPracticeAudio(item) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      throw new Error("AudioContext is unavailable for placeholder practice audio.");
    }
    const audioCtx = new Ctx();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.62);
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    els.playBtn.disabled = true;
    els.audioState.textContent = "Playing placeholder practice audio...";
    els.railAudio.textContent = "Playing";
    setResponseInputsEnabled(false);
    els.nextBtn.disabled = true;
    const isReplay = markAudioPlaybackStarted();
    logServerEvent(
      "placeholder_audio_play_start",
      {
        phase: state.phase,
        trial_stage: state.trialStage,
        file_name: item.file_name,
        practice_kind: item.practice_kind,
        is_replay: isReplay,
        play_rt_ms: rtCell(currentResponseRtMs()),
        replay_count: state.replayCount,
      },
      state.currentIndex + 1,
    );
    await new Promise((resolve) => {
      oscillator.onended = resolve;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.65);
    });
    await audioCtx.close();
    recordCurrentStageAudioDuration(0.65);
    enableResponsesAfterPlayback();
  }

  async function playCurrentAudio() {
    const item = state.trials[state.currentIndex];
    if (!item) return;
    if (!AUDIO_REPLAY_ALLOWED && currentStagePlayed()) {
      els.playBtn.disabled = true;
      els.playBtn.textContent = "Audio played";
      els.audioState.textContent = `Audio already played. ${responsePromptAfterPlayback()}`;
      return;
    }

    cleanupAudio();
    if (item.placeholder_audio) {
      await playPlaceholderPracticeAudio(item);
      return;
    }
    let audio;
    if (item.audio_url) {
      audio = new Audio(item.audio_url);
    } else if (item.file) {
      state.currentUrl = URL.createObjectURL(item.file);
      audio = new Audio(state.currentUrl);
    } else {
      throw new Error("No audio source is attached to this trial.");
    }
    state.currentAudio = audio;

    els.playBtn.disabled = true;
    els.audioState.textContent = "Playing...";
    els.railAudio.textContent = "Playing";
    setResponseInputsEnabled(false);
    els.nextBtn.disabled = true;
    const isReplay = markAudioPlaybackStarted();
    logServerEvent(
      "audio_play_start",
      {
        file_name: item.file_name,
        trial_stage: state.trialStage,
        is_replay: isReplay,
        play_rt_ms: rtCell(currentResponseRtMs()),
        replay_count: state.replayCount,
      },
      state.currentIndex + 1,
    );

    audio.addEventListener("ended", () => {
      logServerEvent(
        "audio_play_end",
        {
          file_name: item.file_name,
          trial_stage: state.trialStage,
          duration_s: Number.isFinite(audio.duration) ? audio.duration : "",
        },
        state.currentIndex + 1,
      );
      recordCurrentStageAudioDuration(audio.duration);
      enableResponsesAfterPlayback();
    }, { once: true });

    audio.addEventListener("error", () => {
      resetPlaybackAttemptAfterError();
      els.audioState.textContent = "This audio file could not be played.";
      els.playBtn.disabled = false;
      logServerEvent(
        "audio_play_error",
        {
          file_name: item.file_name,
          audio_url: item.audio_url || "",
          trial_stage: state.trialStage,
        },
        state.currentIndex + 1,
      );
    }, { once: true });

    await audio.play();
  }

  function handleFirstKey() {
    if (!state.audioStartMs || state.firstKeyRtMs !== null) return;
    state.firstKeyRtMs = performance.now() - state.audioStartMs;
    recordResponseInteraction("dictation");
    logServerEvent(
      "first_key",
      { first_key_rt_ms: state.firstKeyRtMs.toFixed(1) },
      state.currentIndex + 1,
    );
  }

  function handleDictationInput() {
    if (els.dictationInput.value.trim()) {
      recordResponseInteraction("dictation");
    }
    updateNextState();
  }

  function handleUnidentifiedChange() {
    if (!els.dictationUnidentified) return;
    if (els.dictationUnidentified.checked) {
      recordResponseInteraction("unidentified");
      if (state.responseTrace && state.responseTrace.unidentifiedSelectedRtMs === null) {
        state.responseTrace.unidentifiedSelectedRtMs = currentResponseRtMs();
      }
      els.dictationInput.value = "";
      els.dictationInput.disabled = true;
    } else {
      els.dictationInput.disabled = !state.audioStartMs;
      if (state.audioStartMs) els.dictationInput.focus();
    }
    updateNextState();
  }

  function handleRatingChange(event) {
    recordRatingSelection(event.currentTarget.name);
    updateNextState();
  }

  function updateNextState() {
    updateNextButtonLabel();
    if (state.pendingPracticeFeedback) {
      const reasonReady =
        !practiceRequiresReason(state.pendingPracticeFeedback) ||
        Boolean(els.practiceReason.value.trim());
      els.nextBtn.disabled = !reasonReady;
      return;
    }
    const played = currentStagePlayed();
    const dictationReady = !requiresDictation() ||
      Boolean(els.dictationInput.value.trim()) ||
      Boolean(els.dictationUnidentified?.checked);
    const ratingReady = !requiresRatings() || Boolean(
      selectedScale("comprehensibility") &&
      selectedScale("accentedness")
    );
    let ready = played && dictationReady && ratingReady;
    if (usesStagedResponseFlow()) {
      ready = state.trialStage === "dictation"
        ? played && dictationReady
        : played && ratingReady;
    }
    els.nextBtn.disabled = !ready;
  }

  function requiresDictation() {
    return itemRequiresDictation(currentTrial());
  }

  function requiresRatings() {
    return itemRequiresRatings(currentTrial());
  }

  function updateTaskModeVisibility() {
    const dictation = requiresDictation();
    const ratings = requiresRatings();
    const staged = usesStagedResponseFlow();
    const dictationVisible = dictation && (!staged || state.trialStage === "dictation");
    const ratingsVisible = ratings && (!staged || state.trialStage === "ratings");
    els.dictationBlock.classList.toggle("hidden", !dictationVisible);
    els.comprehensibilityBlock.classList.toggle("hidden", !ratingsVisible);
    els.accentednessBlock.classList.toggle("hidden", !ratingsVisible);
    if (!dictation) {
      els.dictationInput.value = "";
      els.dictationInput.disabled = true;
      if (els.dictationUnidentified) {
        els.dictationUnidentified.checked = false;
        els.dictationUnidentified.disabled = true;
      }
    }
  }

  function buildCurrentTrialRow() {
    const item = state.trials[state.currentIndex];
    const dictationRequired = requiresDictation();
    const unidentified = dictationRequired && Boolean(els.dictationUnidentified?.checked);
    const typed = dictationRequired && !unidentified ? els.dictationInput.value.trim() : "";
    const target = item.target_word || "";
    const normalizedTyped = normalizeResponse(typed);
    const normalizedTarget = normalizeResponse(target);
    const submitRt = state.audioStartMs ? performance.now() - state.audioStartMs : null;
    const ratingSubmitRt = usesStagedResponseFlow() && state.ratingAudioStartMs
      ? performance.now() - state.ratingAudioStartMs
      : submitRt;
    const currentAudio = state.currentAudio;
    const responseFlow = usesStagedResponseFlow() ? "staged_dictation_then_ratings" : "single_page";
    const audioDuration = usesStagedResponseFlow()
      ? state.ratingAudioDurationS || state.dictationAudioDurationS
      : currentAudio && Number.isFinite(currentAudio.duration)
        ? currentAudio.duration
        : null;
    const intelligibilityStatus = dictationRequired
      ? unidentified
        ? "unidentified"
        : typed
          ? "typed"
          : "blank"
      : "not_collected";
    const scoreable = dictationRequired && normalizedTarget && (typed || unidentified);

    return {
      platform_version: VERSION,
      server_session_id: state.serverSessionId,
      rater_id: els.raterId.value.trim(),
      session_id: els.sessionId.value.trim(),
      phase: item.phase || state.phase || "main",
      practice_kind: item.practice_kind || "",
      practice_group: item.practice_group || "",
      counterbalance_cell: item.counterbalance_cell || state.counterbalance.assigned?.counterbalance_cell || "",
      list_comb: item.list_comb || state.counterbalance.assigned?.list_comb || "",
      pronunciation_style: item.pronunciation_style || state.counterbalance.assigned?.pronunciation_style || "",
      stimulus_list: item.stimulus_list || "",
      l1_condition: item.l1_condition || "",
      pronunciation_condition: item.pronunciation_condition || "",
      speaker_pattern_index: item.speaker_pattern_index || "",
      speaker_pattern_speaker: item.speaker_pattern_speaker || "",
      block_index: item.block_index || "",
      block_list: item.block_list || "",
      within_block_index: item.within_block_index || "",
      block_trial_count: item.block_trial_count || "",
      task_mode: els.taskMode.value,
      trial_index: state.currentIndex + 1,
      trial_total: state.trials.length,
      completed_at: new Date().toISOString(),
      played_at: state.playedAtIso,
      source_path: item.source_path,
      audio_url: item.audio_url || "",
      file_name: item.file_name,
      participant_id: item.participant_id,
      native_language: item.native_language,
      accent_condition: item.accent_condition,
      condition: item.condition,
      talker: item.talker,
      pass_number: item.pass_number,
      word_number: item.word_number,
      trial_number: item.trial_number,
      take_number: item.take_number,
      spoken_form: item.spoken_form,
      practice_note: item.practice_note,
      source_format: item.source_format,
      target_word: target,
      typed_response: typed,
      normalized_response: normalizedTyped,
      normalized_target: normalizedTarget,
      intelligibility_exact: scoreable ? Number(!unidentified && normalizedTyped === normalizedTarget) : "",
      intelligibility_needs_manual_review: scoreable ? Number(!unidentified && normalizedTyped !== normalizedTarget) : "",
      intelligibility_response_status: intelligibilityStatus,
      intelligibility_unidentified: unidentified ? 1 : 0,
      first_key_rt_ms: state.firstKeyRtMs === null ? "" : state.firstKeyRtMs.toFixed(1),
      submit_rt_ms: ratingSubmitRt === null ? "" : ratingSubmitRt.toFixed(1),
      audio_duration_s: Number.isFinite(audioDuration) ? audioDuration.toFixed(3) : "",
      replay_count: state.replayCount,
      response_flow: responseFlow,
      dictation_played_at: state.dictationPlayedAtIso,
      rating_played_at: state.ratingPlayedAtIso,
      dictation_submit_rt_ms: rtCell(state.dictationSubmitRtMs),
      rating_submit_rt_ms: rtCell(ratingSubmitRt),
      dictation_audio_duration_s: Number.isFinite(state.dictationAudioDurationS)
        ? state.dictationAudioDurationS.toFixed(3)
        : "",
      rating_audio_duration_s: Number.isFinite(state.ratingAudioDurationS)
        ? state.ratingAudioDurationS.toFixed(3)
        : "",
      ...responseTraceFields(),
      comprehensibility_1_9: requiresRatings() ? selectedScale("comprehensibility") : "",
      accentedness_1_9: requiresRatings() ? selectedScale("accentedness") : "",
      expert_comprehensibility_1_9: item.expert_comprehensibility_1_9 || "",
      expert_accentedness_1_9: item.expert_accentedness_1_9 || "",
      practice_feedback: "",
      practice_requires_reason: "",
      practice_reason: "",
      ...familiarityValues(),
    };
  }

  async function persistRowAndAdvance(row) {
    els.nextBtn.disabled = true;
    els.audioState.textContent = "Saving response...";
    try {
      await saveServerTrial(row);
      state.serverSaveFailed = false;
    } catch (error) {
      state.serverSaveFailed = true;
      els.audioState.textContent =
        PARTICIPANT_MODE
          ? "Your response could not be saved. Please try Continue again."
          : `Server save failed: ${error.message}. Please try Save and continue again.`;
      if (SERVER_SAVE_REQUIRED) {
        els.nextBtn.disabled = false;
        return;
      }
    }

    state.rows.push(row);

    const nextIndex = state.currentIndex + 1;
    const breakInterval = Number.parseInt(els.breakInterval.value, 10) || 0;
    if (nextIndex >= state.trials.length) {
      if (state.phase === "practice") {
        startMainTrials();
        return;
      }
      completeSession();
      return;
    }
    if (shouldShowBlockDistractor(nextIndex)) {
      showDistractor(nextIndex);
      return;
    }
    if (!state.counterbalance.enabled && state.phase === "main" && breakInterval > 0 && nextIndex % breakInterval === 0) {
      showBreak(nextIndex);
      return;
    }
    showTrial(nextIndex);
  }

  function showPracticeFeedback(row, item) {
    const feedback = buildPracticeFeedback(row, item);
    state.pendingPracticeRow = row;
    state.pendingPracticeFeedback = feedback;
    if (els.practiceFeedback) {
      els.practiceFeedback.textContent = feedback.text;
      els.practiceFeedback.classList.remove("hidden");
    }
    setScaleInputsDisabled(true);
    if (els.dictationInput) els.dictationInput.disabled = true;
    if (els.practiceReasonBlock) {
      els.practiceReasonBlock.classList.toggle("hidden", !feedback.requiresReason);
    }
    updateNextButtonLabel();
    updateNextState();
  }

  async function saveTrialAndAdvance() {
    if (state.pendingPracticeRow) {
      const row = state.pendingPracticeRow;
      row.practice_feedback = state.pendingPracticeFeedback?.text || "";
      row.practice_requires_reason = state.pendingPracticeFeedback?.requiresReason ? "1" : "0";
      row.practice_reason = els.practiceReason.value.trim();
      await persistRowAndAdvance(row);
      return;
    }

    if (shouldAdvanceToRatingStage()) {
      advanceToRatingStage();
      return;
    }

    const item = currentTrial();
    const row = buildCurrentTrialRow();
    if (isPracticeTrial(item)) {
      showPracticeFeedback(row, item);
      return;
    }
    await persistRowAndAdvance(row);
  }

  function startMainTrials() {
    state.phase = "main";
    state.trials = state.mainTrials;
    state.currentIndex = -1;
    hidePracticeFeedback();
    const assignment = !PARTICIPANT_MODE && state.counterbalance.assigned
      ? `\nCounterbalance: cell ${state.counterbalance.assigned.counterbalance_cell}, ${state.counterbalance.assigned.list_comb}, style ${state.counterbalance.assigned.pronunciation_style}.`
      : "";
    setLog(
      PARTICIPANT_MODE
        ? "Practice complete. The main task is ready."
        : `Practice complete.\nMain rating trials are ready: ${state.mainTrials.length} samples.${assignment}`,
    );
    showTrial(0);
  }

  function completedRowsForPhase(phase) {
    return state.rows.filter((row) => row.phase === phase).length;
  }

  function showBreak(nextIndex) {
    cleanupAudio();
    const total = state.trials.length;
    els.breakMessage.textContent = `${nextIndex} of ${total} samples completed.`;
    showOnly(els.breakPanel);
  }

  function resumeFromBreak() {
    showOnly(els.taskPanel);
    showTrial(completedRowsForPhase(state.phase));
  }

  function shouldShowBlockDistractor(nextIndex) {
    if (state.phase !== "main" || !state.counterbalance.enabled) return false;
    if (nextIndex <= 0 || nextIndex >= state.trials.length) return false;
    const completed = state.trials[nextIndex - 1];
    const upcoming = state.trials[nextIndex];
    return Boolean(
      completed?.block_index &&
      upcoming?.block_index &&
      String(completed.block_index) !== String(upcoming.block_index),
    );
  }

  function generateDistractorProblems(completedBlock, nextIndex) {
    const seed = `${els.raterId.value.trim()}_${els.sessionId.value.trim()}_${VERSION}:distractor:${completedBlock}:${nextIndex}`;
    const rng = mulberry32(hashString(seed));
    return Array.from({ length: DISTRACTOR_PROBLEM_COUNT }, (_, index) => {
      const useAddition = index % 2 === 0;
      if (useAddition) {
        const left = 12 + Math.floor(rng() * 68);
        const right = 3 + Math.floor(rng() * 27);
        return {
          id: index + 1,
          prompt: `${left} + ${right} =`,
          answer: left + right,
        };
      }
      const left = 24 + Math.floor(rng() * 66);
      const right = 2 + Math.floor(rng() * Math.min(35, left - 1));
      return {
        id: index + 1,
        prompt: `${left} - ${right} =`,
        answer: left - right,
      };
    });
  }

  function updateDistractorSubmitState() {
    const inputs = Array.from(els.distractorProblems.querySelectorAll("input"));
    const complete = inputs.length > 0 && inputs.every((input) => input.value.trim() !== "");
    els.distractorSubmitBtn.disabled = !complete;
  }

  function renderDistractorProblems(problems) {
    els.distractorProblems.innerHTML = "";
    problems.forEach((problem) => {
      const wrapper = document.createElement("div");
      wrapper.className = "distractor-problem";
      const label = document.createElement("label");
      const prompt = document.createElement("span");
      prompt.textContent = problem.prompt;
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      input.dataset.problemId = String(problem.id);
      input.addEventListener("input", updateDistractorSubmitState);
      label.append(prompt, input);
      wrapper.append(label);
      els.distractorProblems.append(wrapper);
    });
    updateDistractorSubmitState();
  }

  function showDistractor(nextIndex) {
    cleanupAudio();
    const completed = state.trials[nextIndex - 1];
    const upcoming = state.trials[nextIndex];
    const completedBlock = Number.parseInt(completed.block_index, 10);
    const problems = generateDistractorProblems(completedBlock, nextIndex);
    state.distractor = {
      nextIndex,
      completedBlockIndex: completed.block_index || "",
      completedBlockList: completed.block_list || completed.stimulus_list || "",
      nextBlockIndex: upcoming.block_index || "",
      nextBlockList: upcoming.block_list || upcoming.stimulus_list || "",
      startedAtIso: new Date().toISOString(),
      startedAtMs: performance.now(),
      problems,
    };
    els.distractorMessage.textContent = PARTICIPANT_MODE
      ? "You have finished one part of the task. Answer the calculation questions before continuing."
      : `Block ${state.distractor.completedBlockIndex} (${state.distractor.completedBlockList}) complete. ` +
        `Answer the calculation problems before Block ${state.distractor.nextBlockIndex} (${state.distractor.nextBlockList}).`;
    els.distractorStatus.textContent = "";
    els.distractorSubmitBtn.textContent = "Continue";
    renderDistractorProblems(problems);
    logServerEvent(
      "distractor_shown",
      {
        completed_block_index: state.distractor.completedBlockIndex,
        completed_block_list: state.distractor.completedBlockList,
        next_block_index: state.distractor.nextBlockIndex,
        next_block_list: state.distractor.nextBlockList,
        completed_trials: nextIndex,
      },
      nextIndex,
    );
    showOnly(els.distractorPanel);
    const firstInput = els.distractorProblems.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  async function submitDistractor() {
    if (!state.distractor) return;
    const inputs = Array.from(els.distractorProblems.querySelectorAll("input"));
    if (!inputs.length || inputs.some((input) => input.value.trim() === "")) {
      updateDistractorSubmitState();
      return;
    }
    els.distractorSubmitBtn.disabled = true;
    els.distractorSubmitBtn.textContent = "Saving...";
    const completedAtIso = new Date().toISOString();
    const responses = state.distractor.problems.map((problem) => {
      const input = inputs.find((el) => el.dataset.problemId === String(problem.id));
      const response = Number.parseInt(input?.value.trim() || "", 10);
      return {
        problem_id: problem.id,
        prompt: problem.prompt,
        response: Number.isFinite(response) ? response : "",
        answer: problem.answer,
        correct: Number(response === problem.answer),
      };
    });
    const payload = {
      completed_block_index: state.distractor.completedBlockIndex,
      completed_block_list: state.distractor.completedBlockList,
      next_block_index: state.distractor.nextBlockIndex,
      next_block_list: state.distractor.nextBlockList,
      completed_trials: state.distractor.nextIndex,
      problem_count: responses.length,
      correct_count: responses.reduce((sum, item) => sum + item.correct, 0),
      started_at: state.distractor.startedAtIso,
      completed_at: completedAtIso,
      rt_ms: Math.round(performance.now() - state.distractor.startedAtMs),
      responses,
    };
    try {
      await postJson("/api/event", {
        session_id: state.serverSessionId,
        session_token: state.serverSessionToken,
        rater_id: els.raterId.value.trim(),
        event_type: "distractor_complete",
        trial_index: state.distractor.nextIndex,
        event_at: completedAtIso,
        payload,
      });
      state.serverSaveFailed = false;
    } catch (error) {
      state.serverSaveFailed = true;
      els.distractorStatus.textContent = PARTICIPANT_MODE
        ? "Your answer could not be saved. Please try Continue again."
        : `Save failed: ${error.message}. Please try Continue again.`;
      if (SERVER_SAVE_REQUIRED) {
        els.distractorSubmitBtn.disabled = false;
        els.distractorSubmitBtn.textContent = "Continue";
        return;
      }
    }
    const nextIndex = state.distractor.nextIndex;
    state.distractor = null;
    showOnly(els.taskPanel);
    showTrial(nextIndex);
  }

  async function completeSession() {
    cleanupAudio();
    state.running = false;
    els.progressFill.style.width = "100%";
    els.progressText.textContent = `${state.trials.length} of ${state.trials.length} completed`;
    els.railCompleted.textContent = String(state.trials.length);
    els.railRemaining.textContent = "0";
    els.railAudio.textContent = "Complete";
    let completionResult = null;
    try {
      completionResult = await completeServerSession();
      state.serverSaveFailed =
        Boolean(completionResult?.status) && completionResult.status !== "completed";
    } catch (error) {
      state.serverSaveFailed = true;
      console.warn("server completion failed", error);
    }
    await buildDownload();
    const completionCode = completionResult?.completion_code || "";
    const completionUrl = completionResult?.completion_url || "";
    if (
      !DRY_RUN_MODE &&
      !state.serverSaveFailed &&
      state.serverSessionId &&
      !completionCode &&
      !completionUrl
    ) {
      state.serverSaveFailed = true;
    }
    if (els.completionCode) {
      els.completionCode.textContent = state.serverSaveFailed
        ? DEFAULT_PROLIFIC_COMPLETION_CODE
        : state.serverSessionId
          ? completionCode || "Ready"
          : prolificCompletionCode();
    }
    if (els.prolificReturnLink) {
      els.prolificReturnLink.classList.toggle("hidden", state.serverSaveFailed || !completionUrl);
      if (completionUrl && !state.serverSaveFailed) {
        els.prolificReturnLink.href = completionUrl;
      } else {
        els.prolificReturnLink.removeAttribute("href");
      }
    }
    els.completeMessage.textContent = state.serverSaveFailed
      ? "The task is complete, but saving needs review. Please contact the researcher."
      : DRY_RUN_MODE
        ? "Dry run complete. Responses were saved as dry-run data and excluded from analysis exports."
        : completionUrl
        ? "Thank you. Your responses have been saved. Returning to Prolific."
        : "Thank you. Your responses have been saved. Please copy the completion code below.";
    showOnly(els.completePanel);
    if (!state.serverSaveFailed && completionUrl) {
      window.setTimeout(() => {
        window.location.assign(completionUrl);
      }, completionResult?.redirect_after_ms || 1200);
    }
  }

  async function buildDownload() {
    const csv = rowsToCsv(state.rows);
    const assignment = {
      platform_version: VERSION,
      rater_id: els.raterId.value.trim(),
      session_id: els.sessionId.value.trim(),
      task_mode: els.taskMode.value,
      completion_code: prolificCompletionCode(),
      counterbalance: state.counterbalance.assigned || "",
      ...familiarityValues(),
      created_at: new Date().toISOString(),
      trial_count: state.practiceTrials.length + state.mainTrials.length,
      trial_order: [...state.practiceTrials, ...state.mainTrials].map((item, index) => ({
        phase: item.phase || "",
        trial_index: index + 1,
        counterbalance_cell: item.counterbalance_cell || "",
        list_comb: item.list_comb || "",
        pronunciation_style: item.pronunciation_style || "",
        stimulus_list: item.stimulus_list || "",
        l1_condition: item.l1_condition || "",
        pronunciation_condition: item.pronunciation_condition || "",
        block_index: item.block_index || "",
        block_list: item.block_list || "",
        within_block_index: item.within_block_index || "",
        block_trial_count: item.block_trial_count || "",
        source_path: item.source_path,
        audio_url: item.audio_url || "",
        file_name: item.file_name,
        target_word: item.target_word,
        participant_id: item.participant_id,
        condition: item.condition,
        talker: item.talker,
        spoken_form: item.spoken_form,
        practice_note: item.practice_note,
        expert_comprehensibility_1_9: item.expert_comprehensibility_1_9 || "",
        expert_accentedness_1_9: item.expert_accentedness_1_9 || "",
      })),
    };

    const baseName = `${sanitizeName(els.raterId.value || "rater")}_${sanitizeName(els.sessionId.value || "session")}_pronunciation_ratings`;
    if (window.JSZip) {
      const zip = new JSZip();
      zip.file(`${baseName}.csv`, csv);
      zip.file(`${baseName}_assignment.json`, JSON.stringify(assignment, null, 2));
      const blob = await zip.generateAsync({ type: "blob" });
      setDownload(blob, `${baseName}.zip`);
    } else {
      setDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
    }
    els.downloadBtn.disabled = false;
  }

  function setDownload(blob, fileName) {
    resetDownload();
    state.downloadBlobUrl = URL.createObjectURL(blob);
    state.downloadName = fileName;
  }

  function downloadResults() {
    if (!state.downloadBlobUrl) {
      buildDownload().then(downloadResults);
      return;
    }
    const a = document.createElement("a");
    a.href = state.downloadBlobUrl;
    a.download = state.downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function loadPracticeSamples() {
    if (!els.raterId.value.trim()) els.raterId.value = "practice_rater";
    if (!els.sessionId.value.trim()) els.sessionId.value = "practice_session";
    els.loadPracticeBtn.disabled = true;
    setSetupStatus("Loading");
    setLog("Loading selected ElevenLabs practice materials...");

    const manifestResponse = await fetch("practice_manifest.csv", { cache: "no-store" });
    if (!manifestResponse.ok) {
      throw new Error(`Could not load practice_manifest.csv (${manifestResponse.status})`);
    }

    const manifestRows = parseCsv(await manifestResponse.text());
    const fileRecords = [];
    for (const row of manifestRows) {
      const audioPath = valueFrom(row, REQUIRED_MANIFEST_FILE_COLUMNS);
      if (!audioPath) continue;
      const response = await fetch(audioPath, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Could not load ${audioPath} (${response.status})`);
      }
      const blob = await response.blob();
      const file = new File([blob], fileKey(audioPath), { type: blob.type || "audio/wav" });
      fileRecords.push({ file, sourcePath: audioPath });
    }

    state.manifestRows = manifestRows;
    prepareFileRecords(fileRecords, manifestRows);
    els.loadPracticeBtn.disabled = false;
  }

  function pauseSession() {
    state.running = false;
    cleanupAudio();
    logServerEvent("session_paused", { completed: state.rows.length, total: state.trials.length });
    showOnly(els.setupPanel);
    setOnboardingStep("ready");
    els.startBtn.disabled = false;
    els.downloadBtn.disabled = state.rows.length === 0;
    setLog(`Paused after ${state.rows.length} of ${state.trials.length} samples.\nDownload partial results before closing the browser.`);
    if (state.rows.length) buildDownload();
  }

  function newSession() {
    state.running = false;
    cleanupAudio();
    resetDownload();
    state.rows = [];
    state.trials = [];
    state.mainTrials = [];
    state.practiceTrials = [];
    state.items = [];
    state.manifestRows = [];
    state.remoteRows = [];
    state.remoteManifestUrl = "";
    state.counterbalance.enabled = COUNTERBALANCE_ENABLED;
    state.counterbalance.assigned = null;
    state.currentIndex = -1;
    state.phase = "main";
    state.pendingPracticeRow = null;
    state.pendingPracticeFeedback = null;
    state.serverSessionId = "";
    state.serverSessionToken = "";
    state.serverSaveFailed = false;
    state.distractor = null;
    els.startBtn.disabled = true;
    els.downloadBtn.disabled = true;
    els.audioFiles.value = "";
    els.audioFolder.value = "";
    els.manifestFile.value = "";
    resetRemoteParticipantSelect();
    syncCustomManifestVisibility();
    setLog("");
    updateSetupSummary(0, 0, 0);
    setSetupStatus("Waiting for audio");
    showOnly(els.setupPanel);
    setOnboardingStep("identity");
  }

  function sanitizeName(value) {
    return String(value || "")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      || "session";
  }

  window.addEventListener("beforeunload", (event) => {
    if (!state.running && state.rows.length === 0) return;
    event.preventDefault();
    event.returnValue = "";
  });

  els.versionLabel.textContent = VERSION;
  els.loadParticipantsBtn.addEventListener("click", () => {
    loadRemoteParticipants().catch((error) => {
      els.loadParticipantsBtn.disabled = false;
      setSetupStatus("Remote load failed");
      setLog(`Remote participant load failed: ${error.message}`);
    });
  });
  els.customManifestToggle.addEventListener("change", syncCustomManifestVisibility);
  els.remoteManifestUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadRemoteParticipants().catch((error) => {
        els.loadParticipantsBtn.disabled = false;
        setSetupStatus("Remote load failed");
        setLog(`Remote participant load failed: ${error.message}`);
      });
    }
  });
  els.remoteSelectAllBtn.addEventListener("click", () => {
    els.remoteParticipantGrid.querySelectorAll("input").forEach((input) => {
      input.checked = true;
    });
    updateRemoteParticipantActions();
  });
  els.remoteClearBtn.addEventListener("click", () => {
    els.remoteParticipantGrid.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
    updateRemoteParticipantActions();
  });
  els.prepareRemoteBtn.addEventListener("click", prepareSelectedRemoteParticipant);
  if (els.onboardingBackBtn) els.onboardingBackBtn.addEventListener("click", retreatOnboarding);
  if (els.onboardingNextBtn) els.onboardingNextBtn.addEventListener("click", advanceOnboarding);
  if (els.readyBackBtn) els.readyBackBtn.addEventListener("click", retreatOnboarding);
  els.raterId.addEventListener("input", updateSelectedMaterialSummary);
  els.sessionId.addEventListener("input", updateSelectedMaterialSummary);
  els.loadPracticeBtn.addEventListener("click", () => {
    loadPracticeSamples().catch((error) => {
      els.loadPracticeBtn.disabled = false;
      setSetupStatus("Practice load failed");
      setLog(`Practice sample load failed: ${error.message}`);
    });
  });
  els.prepareBtn.addEventListener("click", prepareTrials);
  els.startBtn.addEventListener("click", () => {
    startSession().catch((error) => {
      setSetupStatus("Start failed");
      setLog(`Session start failed: ${error.message}`);
      els.startBtn.disabled = false;
    });
  });
  els.downloadBtn.addEventListener("click", downloadResults);
  els.finalDownloadBtn.addEventListener("click", downloadResults);
  els.newSessionBtn.addEventListener("click", newSession);
  els.pauseBtn.addEventListener("click", pauseSession);
  els.resumeBtn.addEventListener("click", resumeFromBreak);
  els.distractorSubmitBtn.addEventListener("click", () => {
    submitDistractor().catch((error) => {
      els.distractorStatus.textContent = PARTICIPANT_MODE
        ? "Your answer could not be saved. Please try Continue again."
        : `Save failed: ${error.message}. Please try Continue again.`;
      els.distractorSubmitBtn.disabled = false;
      els.distractorSubmitBtn.textContent = "Continue";
    });
  });
  els.playBtn.addEventListener("click", () => {
    playCurrentAudio().catch((error) => {
      resetPlaybackAttemptAfterError();
      els.audioState.textContent = PARTICIPANT_MODE
        ? "The audio could not be played. Please try again."
        : `Playback failed: ${error.message}`;
      els.playBtn.disabled = false;
    });
  });
  els.dictationInput.addEventListener("keydown", handleFirstKey);
  els.dictationInput.addEventListener("input", handleDictationInput);
  if (els.dictationUnidentified) {
    els.dictationUnidentified.addEventListener("change", handleUnidentifiedChange);
  }
  if (els.practiceReason) els.practiceReason.addEventListener("input", updateNextState);
  els.nextBtn.addEventListener("click", () => {
    saveTrialAndAdvance().catch((error) => {
      els.audioState.textContent = PARTICIPANT_MODE
        ? "Your response could not be saved. Please try Continue again."
        : `Save failed: ${error.message}`;
      els.nextBtn.disabled = false;
    });
  });
  els.taskMode.addEventListener("change", updateSelectedMaterialSummary);
  els.audioFiles.addEventListener("change", updateSelectedMaterialSummary);
  els.audioFolder.addEventListener("change", updateSelectedMaterialSummary);
  els.manifestFile.addEventListener("change", updateSelectedMaterialSummary);
  document
    .querySelectorAll('input[name="japanese-familiarity"], input[name="chinese-familiarity"]')
    .forEach((input) => {
      input.addEventListener("change", updateSelectedMaterialSummary);
    });
  els.breakInterval.value = String(DEFAULT_BREAK_INTERVAL);
  if (COUNTERBALANCE_ENABLED) {
    els.taskMode.value = "combined";
    els.taskMode.disabled = true;
    els.breakInterval.value = "0";
    els.breakInterval.disabled = true;
    els.prepareRemoteBtn.textContent = "Prepare counterbalanced session";
  }
  if (els.completionCode) els.completionCode.textContent = prolificCompletionCode();
  initializeParticipantMode();
  loadSecurityConfig();
  syncCustomManifestVisibility();
  updateSelectedMaterialSummary();
  loadRemoteParticipants().catch((error) => {
    els.loadParticipantsBtn.disabled = false;
    if (COUNTERBALANCE_ENABLED) {
      updateSelectedMaterialSummary();
      setLog(
        `Stimulus preview load failed: ${error.message}\n` +
          "The server will load the authoritative counterbalance manifest when the session starts.",
      );
    } else {
      setSetupStatus("Remote load failed");
      setLog(`Remote participant load failed: ${error.message}`);
    }
  });
  renderScales();
})();
