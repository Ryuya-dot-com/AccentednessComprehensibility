#!/usr/bin/env python3
"""Generate a local 200-participant smoke-test dataset for the Rating Platform.

The script creates a SQLite database from db/schema.sql, populates Prolific-style
sessions, optionally mixes in finalized dropout sessions, writes
admin-export-like CSV files, and asserts that the main smoke-test invariants
hold.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "exports" / "smoke_test_200"
VERSION = "pronunciation_rating_v0.8.1_smoke"
STUDY_ID = "SMOKE_STUDY_2026"
COMPLETION_CODE = "SMOKE-COMPLETE"
PRACTICE_AUDIO_ROOT = "https://pub-c26f53c7e40c448db5847c2079933f52.r2.dev/practice/calibration"
PRACTICE_ITEMS = [
    (
        "appreciation",
        "accent_band_1_3",
        "ENG",
        "natural",
        "practice_eng_female",
        f"{PRACTICE_AUDIO_ROOT}/eng_female_appreciation_practice.wav",
        1,
        3,
        "appreciation",
        "researcher_provided_calibration_wav",
        "Researcher-provided calibration WAV; expert Accentedness reference range 1–3",
    ),
    (
        "pesticide",
        "accent_band_3_5",
        "JPN",
        "accented",
        "practice_jpn_male",
        f"{PRACTICE_AUDIO_ROOT}/jpn_male_pesticide_practice.wav",
        3,
        5,
        "pesticide",
        "researcher_provided_calibration_wav",
        "Researcher-provided calibration WAV; expert Accentedness reference range 3–5",
    ),
    (
        "quality",
        "accent_band_5_7",
        "JPN",
        "accented",
        "practice_jpn_female",
        f"{PRACTICE_AUDIO_ROOT}/jpn_female_quality_practice.wav",
        5,
        7,
        "quality",
        "researcher_provided_calibration_wav",
        "Researcher-provided calibration WAV; expert Accentedness reference range 5–7",
    ),
    (
        "pizza",
        "accent_band_7_9",
        "CHN",
        "accented",
        "macos_tts_tingting",
        f"{PRACTICE_AUDIO_ROOT}/chn_female_pizza_practice.wav",
        7,
        9,
        "披萨",
        "macos_say_tingting_tts_wav",
        "Researcher-selected synthetic macOS say voice Tingting using the Mandarin form 披萨; expert Accentedness reference range 7–9",
    ),
]
TRIAL_COUNT = len(PRACTICE_ITEMS) + 100

# Canonical CounterBalance.xlsx Sheet1 numbering. Keep this in sync with
# TARGET_WORDS in app.js and functions/api/_word-familiarity.js.
TARGET_WORDS = [
    "tweezers", "persimmon", "thermometer", "razor", "mantis",
    "pacifier", "podium", "labyrinth", "loquat", "scapula",
    "burdock", "protractor", "acorn", "scalpel", "cocoon",
    "cicada", "toboggan", "chisel", "casket", "detergent",
    "nostril", "rickshaw", "capelin", "lotus", "tadpole",
    "burglar", "xylophone", "walrus", "icicle", "abalone",
    "porcupine", "carousel", "faucet", "cobweb", "pylon",
    "pupa", "binoculars", "spatula", "lawnmower", "ladle",
    "raccoon", "syringe", "catapult", "treadmill", "wardrobe",
    "strainer", "parakeet", "scallop", "toupee", "abacus",
]
TARGET_WORD_COUNT = len(TARGET_WORDS)

COUNTERBALANCE_CELLS = [
    (1, "ABCD", "a"),
    (2, "BCDE", "a"),
    (3, "CDEF", "a"),
    (4, "DEFG", "a"),
    (5, "EFGH", "a"),
    (6, "FGHI", "a"),
    (7, "GHIJ", "a"),
    (8, "HIJA", "a"),
    (9, "IJAB", "a"),
    (10, "JABC", "a"),
    (11, "ABCD", "b"),
    (12, "BCDE", "b"),
    (13, "CDEF", "b"),
    (14, "DEFG", "b"),
    (15, "EFGH", "b"),
    (16, "FGHI", "b"),
    (17, "GHIJ", "b"),
    (18, "HIJA", "b"),
    (19, "IJAB", "b"),
    (20, "JABC", "b"),
]

LIST_SPECS = {
    "A": {"ENG": range(1, 6), "JPN": range(6, 16), "CHN": range(16, 26)},
    "B": {"ENG": range(26, 31), "JPN": range(31, 41), "CHN": range(41, 51)},
    "C": {"ENG": range(6, 11), "JPN": range(11, 21), "CHN": [*range(21, 26), *range(1, 6)]},
    "D": {"ENG": range(31, 36), "JPN": range(36, 46), "CHN": [*range(46, 51), *range(26, 31)]},
    "E": {"ENG": range(11, 16), "JPN": range(16, 26), "CHN": range(1, 11)},
    "F": {"ENG": range(36, 41), "JPN": range(41, 51), "CHN": range(26, 36)},
    "G": {"ENG": range(16, 21), "JPN": [*range(21, 26), *range(1, 6)], "CHN": range(6, 16)},
    "H": {"ENG": range(41, 46), "JPN": [*range(46, 51), *range(26, 31)], "CHN": range(31, 41)},
    "I": {"ENG": range(21, 26), "JPN": range(1, 11), "CHN": range(11, 21)},
    "J": {"ENG": range(46, 51), "JPN": range(26, 36), "CHN": range(36, 46)},
}


RATINGS_COLUMNS = [
    "session_id", "assignment_id", "rater_id", "session_label",
    "prolific_pid", "prolific_study_id", "prolific_session_id", "task_mode",
    "platform_version", "phase", "practice_kind", "practice_group",
    "counterbalance_cell", "list_comb", "pronunciation_style", "stimulus_list",
    "l1_condition", "pronunciation_condition", "block_index", "block_list",
    "within_block_index", "block_trial_count", "speaker_pattern_index",
    "speaker_pattern_speaker", "trial_index", "trial_total",
    "completed_at", "played_at", "server_received_at", "source_path",
    "audio_url", "file_name", "participant_id", "native_language",
    "accent_condition", "condition", "talker", "pass_number", "word_number",
    "trial_number", "take_number", "spoken_form", "practice_note",
    "source_format", "target_word", "typed_response", "normalized_response",
    "normalized_target", "intelligibility_exact",
    "intelligibility_needs_manual_review", "intelligibility_response_status",
    "intelligibility_unidentified", "comprehensibility_1_9",
    "accentedness_1_9", "expert_comprehensibility_1_9",
    "expert_accentedness_1_9", "practice_feedback",
    "practice_requires_reason", "practice_reason", "japanese_familiarity_1_6",
    "chinese_familiarity_1_6", "first_key_rt_ms", "submit_rt_ms",
    "audio_duration_s", "replay_count", "response_flow", "dictation_played_at",
    "rating_played_at", "dictation_submit_rt_ms", "rating_submit_rt_ms",
    "dictation_audio_duration_s", "rating_audio_duration_s",
    "response_order", "first_response_field",
    "first_response_rt_ms", "rating_order", "rating_interaction_sequence",
    "first_rating_field", "first_rating_rt_ms", "comprehensibility_first_rt_ms",
    "comprehensibility_last_rt_ms", "comprehensibility_selection_count",
    "accentedness_first_rt_ms", "accentedness_last_rt_ms",
    "accentedness_selection_count", "unidentified_selected_rt_ms",
]

SESSIONS_COLUMNS = [
    "id", "role", "rater_id", "session_label", "task_mode",
    "platform_version", "prolific_pid", "prolific_study_id",
    "prolific_session_id", "participant_key", "seed",
    "japanese_familiarity_1_6", "chinese_familiarity_1_6",
    "completion_code", "counterbalance_allocation_id", "counterbalance_cell",
    "list_comb", "pronunciation_style", "started_at", "started_at_ms",
    "completed_at", "completed_at_ms", "last_seen_at", "last_seen_at_ms",
    "status", "trial_count", "completed_trial_count",
    "completion_url_issued_at", "completion_url_issued_at_ms",
    "completion_url_issued_count", "duplicate_start_count",
    "duplicate_start_last_at", "duplicate_start_last_at_ms", "timezone",
    "user_agent", "word_familiarity_required",
    "word_familiarity_response_count", "known_word_count",
    "missing_word_familiarity_count", "word_familiarity_submitted_at",
]

WORD_FAMILIARITY_COLUMNS = [
    "session_id", "rater_id", "prolific_pid", "prolific_study_id",
    "prolific_session_id", "platform_version", "session_status",
    "word_number", "target_word", "word_known", "submitted_at",
    "submitted_at_ms",
]

ASSIGNMENTS_COLUMNS = [
    "session_id", "phase", "trial_index", "source_path", "audio_url",
    "file_name", "target_word", "participant_id", "native_language",
    "accent_condition", "condition", "talker", "pass_number", "word_number",
    "trial_number", "take_number", "spoken_form", "practice_note",
    "source_format", "practice_kind", "practice_group", "counterbalance_cell",
    "list_comb", "pronunciation_style", "stimulus_list", "l1_condition",
    "pronunciation_condition", "block_index", "block_list",
    "within_block_index", "block_trial_count", "speaker_pattern_index",
    "speaker_pattern_speaker", "expert_comprehensibility_1_9",
    "expert_accentedness_1_9", "created_at",
]

EVENT_COLUMNS = [
    "id", "session_id", "rater_id", "event_type", "trial_index",
    "event_at", "server_received_at", "payload_json",
]

COUNTERBALANCE_COLUMNS = [
    "id", "session_id", "cell_id", "list_comb", "pronunciation_style",
    "status", "assigned_at", "completed_at", "updated_at", "rater_id",
    "prolific_pid", "participant_key",
]

ANALYSIS_COLUMNS = [
    "analysis_participant_id", "session_status", "counterbalance_cell",
    "list_comb", "pronunciation_style", "japanese_familiarity_1_6",
    "chinese_familiarity_1_6", "trial_index", "block_index", "block_list",
    "within_block_index", "block_trial_count", "speaker_pattern_index",
    "speaker_pattern_speaker", "stimulus_list",
    "l1_condition", "pronunciation_condition", "participant_id", "talker",
    "target_word", "word_number", "trial_number", "take_number", "file_name",
    "typed_response", "normalized_response", "normalized_target",
    "intelligibility_exact", "intelligibility_needs_manual_review",
    "intelligibility_response_status", "intelligibility_unidentified",
    "comprehensibility_1_9", "accentedness_1_9", "first_key_rt_ms",
    "submit_rt_ms", "audio_duration_s", "replay_count", "response_flow",
    "dictation_played_at", "rating_played_at", "dictation_submit_rt_ms",
    "rating_submit_rt_ms", "dictation_audio_duration_s", "rating_audio_duration_s",
    "response_order", "first_response_field", "first_response_rt_ms", "rating_order",
    "rating_interaction_sequence", "first_rating_field", "first_rating_rt_ms",
    "comprehensibility_first_rt_ms", "comprehensibility_last_rt_ms",
    "comprehensibility_selection_count", "accentedness_first_rt_ms",
    "accentedness_last_rt_ms", "accentedness_selection_count",
    "unidentified_selected_rt_ms", "word_known",
    "word_familiarity_required", "word_familiarity_submitted_at",
]

QUALITY_COLUMNS = [
    "analysis_participant_id", "status", "elapsed_ms", "active_elapsed_ms", "trial_count",
    "completed_trial_count", "missing_trial_count", "main_saved_count",
    "practice_saved_count", "manual_review_count", "unidentified_count",
    "blank_dictation_count", "missing_rating_count", "avg_submit_rt_ms", "min_submit_rt_ms",
    "max_submit_rt_ms", "avg_replay_count", "max_replay_count",
    "distractor_completed_count", "distractor_correct_total",
    "distractor_problem_total", "distractor_accuracy", "avg_distractor_rt_ms",
    "duplicate_start_count",
    "completion_url_issued_count", "counterbalance_cell", "list_comb",
    "pronunciation_style", "word_familiarity_required",
    "word_familiarity_response_count", "known_word_count",
    "missing_word_familiarity_count",
]


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_word(value: str) -> str:
    return "".join(ch for ch in value.lower() if "a" <= ch <= "z")


def insert_row(conn: sqlite3.Connection, table: str, row: dict) -> None:
    columns = list(row)
    placeholders = ", ".join([":" + column for column in columns])
    conn.execute(
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
        row,
    )


def csv_write(path: Path, rows: list[dict], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


def fetch_all(conn: sqlite3.Connection, sql: str) -> list[dict]:
    cursor = conn.execute(sql)
    return [dict(row) for row in cursor.fetchall()]


def dropout_indices(participant_count: int, dropout_count: int) -> set[int]:
    if dropout_count <= 0:
        return set()
    selected = {
        min(participant_count, 1 + int(index * participant_count / dropout_count))
        for index in range(dropout_count)
    }
    candidate = participant_count
    while len(selected) < dropout_count:
        selected.add(candidate)
        candidate -= 1
    return selected


def dropout_saved_trial_count(participant_index: int) -> int:
    return max(1, min(105, 6 + ((participant_index * 13) % 92)))


def split_word_numbers(values) -> tuple[list[int], list[int]]:
    nums = list(values)
    return nums[:5], nums[5:10]


def word_label(number: int) -> str:
    if not 1 <= number <= TARGET_WORD_COUNT:
        raise ValueError(f"word number must be between 1 and {TARGET_WORD_COUNT}: {number}")
    return TARGET_WORDS[number - 1]


def simulated_word_known(participant_index: int, word_number: int) -> int:
    """Return a deterministic, plausibly distributed familiarity response."""
    rare_words = {9, 11, 23, 30, 36, 49}
    less_common_words = {5, 8, 10, 14, 17, 22, 24, 35, 43, 46, 47, 48, 50}
    if word_number == 23:  # capelin is intentionally least familiar
        probability = 0.06
    elif word_number in rare_words:
        probability = 0.22
    elif word_number in less_common_words:
        probability = 0.58
    else:
        probability = 0.9
    return int(random.Random(participant_index * 10_000 + word_number).random() < probability)


def dropout_word_familiarity_count(saved_main_count: int) -> int:
    """Exercise both absent and partial checklist coverage for late dropouts."""
    return min(TARGET_WORD_COUNT - 1, max(0, saved_main_count - 70))


def build_word_familiarity_rows(
    session_id: str,
    participant_index: int,
    response_count: int,
    submitted_at_ms: int,
) -> list[dict]:
    if not 0 <= response_count <= TARGET_WORD_COUNT:
        raise ValueError(f"invalid word-familiarity response count: {response_count}")
    word_numbers = list(range(1, TARGET_WORD_COUNT + 1))
    if response_count < TARGET_WORD_COUNT:
        random.Random(participant_index * 97).shuffle(word_numbers)
        word_numbers = sorted(word_numbers[:response_count])
    return [
        {
            "session_id": session_id,
            "word_number": word_number,
            "target_word": word_label(word_number),
            "word_known": simulated_word_known(participant_index, word_number),
            "submitted_at": iso(submitted_at_ms),
            "submitted_at_ms": submitted_at_ms,
        }
        for word_number in word_numbers
    ]


def condition_rows(block_list: str, style: str) -> list[dict]:
    specs = LIST_SPECS[block_list]
    eng_numbers = list(specs["ENG"])
    jpn_nat, jpn_acc = split_word_numbers(specs["JPN"])
    chn_nat, chn_acc = split_word_numbers(specs["CHN"])
    if style == "b":
        jpn_nat, jpn_acc = jpn_acc, jpn_nat
        chn_nat, chn_acc = chn_acc, chn_nat

    rows = []
    for index in range(5):
        rows.extend([
            {"l1": "ENG", "pron": "natural", "word": eng_numbers[index]},
            {"l1": "JPN", "pron": "natural", "word": jpn_nat[index]},
            {"l1": "CHN", "pron": "natural", "word": chn_nat[index]},
            {"l1": "JPN", "pron": "accented", "word": jpn_acc[index]},
            {"l1": "CHN", "pron": "accented", "word": chn_acc[index]},
        ])
    return rows


def build_practice_assignment(session_id: str, created_at: str) -> list[dict]:
    rows = []
    for index, (
        word,
        group,
        l1,
        pron,
        talker,
        audio_path,
        accent_min,
        accent_max,
        spoken_form,
        source_format,
        practice_note,
    ) in enumerate(PRACTICE_ITEMS, start=1):
        rows.append({
            "id": f"{session_id}:practice:{index}",
            "session_id": session_id,
            "phase": "practice",
            "trial_index": index,
            "source_path": audio_path,
            "audio_url": audio_path,
            "file_name": Path(audio_path).name,
            "target_word": word,
            "participant_id": talker,
            "native_language": l1,
            "accent_condition": pron,
            "condition": f"practice_{pron}",
            "talker": talker,
            "pass_number": "",
            "word_number": "",
            "trial_number": str(index),
            "take_number": "1",
            "spoken_form": spoken_form,
            "practice_note": practice_note,
            "source_format": source_format,
            "practice_kind": "combined",
            "practice_group": group,
            "counterbalance_cell": "",
            "list_comb": "",
            "pronunciation_style": "",
            "stimulus_list": "",
            "l1_condition": l1,
            "pronunciation_condition": pron,
            "block_index": "",
            "block_list": "",
            "within_block_index": "",
            "block_trial_count": "",
            "expert_comprehensibility_1_9": None,
            "expert_accentedness_1_9": None,
            "created_at": created_at,
        })
    return rows


def build_main_assignment(session_id: str, cell_id: int, list_comb: str, style: str, created_at: str, seed: int) -> list[dict]:
    rows = []
    trial_index = 1
    rng = random.Random(seed)
    for block_index, block_list in enumerate(list_comb, start=1):
        block = condition_rows(block_list, style)
        rng.shuffle(block)
        for within_index, item in enumerate(block, start=1):
            word = word_label(item["word"])
            l1 = item["l1"]
            pron = item["pron"]
            file_name = f"{l1.lower()}_{pron}_{block_list}_{word}.wav"
            rows.append({
                "id": f"{session_id}:main:{trial_index}",
                "session_id": session_id,
                "phase": "main",
                "trial_index": trial_index,
                "source_path": f"smoke_audio/{l1.lower()}/{pron}/{block_list}/{file_name}",
                "audio_url": f"smoke_audio/{l1.lower()}/{pron}/{block_list}/{file_name}",
                "file_name": file_name,
                "target_word": word,
                "participant_id": f"{l1}_SMOKE_{(item['word'] - 1) % 12 + 1:02d}",
                "native_language": l1,
                "accent_condition": pron,
                "condition": f"{l1}_{pron}",
                "talker": f"{l1.lower()}_talker_{(item['word'] - 1) % 6 + 1}",
                "pass_number": "1",
                "word_number": str(item["word"]),
                "trial_number": str(trial_index),
                "take_number": "1",
                "spoken_form": word,
                "practice_note": "",
                "source_format": "smoke",
                "practice_kind": "",
                "practice_group": "",
                "counterbalance_cell": cell_id,
                "list_comb": list_comb,
                "pronunciation_style": style,
                "stimulus_list": block_list,
                "l1_condition": l1,
                "pronunciation_condition": pron,
                "block_index": block_index,
                "block_list": block_list,
                "within_block_index": within_index,
                "block_trial_count": 25,
                "speaker_pattern_index": ((seed + block_index - 2) % 10) + 1,
                "speaker_pattern_speaker": f"{l1}{((within_index - 1) % (5 if l1 == 'ENG' else 10)) + 1}",
                "expert_comprehensibility_1_9": "",
                "expert_accentedness_1_9": "",
                "created_at": created_at,
            })
            trial_index += 1
    return rows


def simulated_fatigue_ms(row: dict) -> int:
    if row["phase"] != "main":
        return 0
    trial_index = int(row["trial_index"])
    block_index = int(row["block_index"] or 0)
    return max(0, trial_index - 25) * 11 + max(0, block_index - 1) * 130


def simulated_replay_count(row: dict, participant_index: int) -> int:
    if row["phase"] != "main":
        return 0
    trial_index = int(row["trial_index"])
    replay_count = 0
    if (participant_index * 3 + trial_index) % 23 == 0:
        replay_count += 1
    if trial_index > 60 and (participant_index + trial_index) % 11 == 0:
        replay_count += 1
    if trial_index > 85 and (participant_index * 5 + trial_index) % 17 == 0:
        replay_count += 1
    return min(replay_count, 3)


def response_for(row: dict, participant_index: int) -> dict:
    target = row["target_word"]
    trial_index = int(row["trial_index"])
    fatigue_ms = simulated_fatigue_ms(row)
    replay_count = simulated_replay_count(row, participant_index)
    unidentified = row["phase"] == "main" and (participant_index + int(row["trial_index"])) % 29 == 0
    manual_review = (
        row["phase"] == "main"
        and not unidentified
        and (participant_index + trial_index) % 17 == 0
    )
    typed = target[:-1] if manual_review else target
    if unidentified:
        typed = ""
    normalized = normalize_word(typed)
    normalized_target = normalize_word(target)
    if row["phase"] == "practice":
        _, _, accent_min, accent_max = row["practice_group"].split("_")
        accent = (int(accent_min) + int(accent_max)) // 2
        comp = accent
    else:
        l1 = row["l1_condition"]
        pron = row["pronunciation_condition"]
        base_comp = {"ENG": 2, "JPN": 5, "CHN": 5}.get(l1, 4)
        base_accent = {"ENG": 1, "JPN": 5, "CHN": 5}.get(l1, 4)
        if pron == "accented":
            base_comp += 2
            base_accent += 3
        comp = max(1, min(9, base_comp + ((participant_index + trial_index) % 3) - 1))
        accent = max(1, min(9, base_accent + ((participant_index + trial_index + 1) % 3) - 1))
    first_response_field = "unidentified" if unidentified else "dictation"
    first_response_rt = 920 + (participant_index % 7) * 23 + fatigue_ms + replay_count * 700
    rating_first_comp = (participant_index + trial_index) % 2 == 0
    rating_order = "comprehensibility>accentedness" if rating_first_comp else "accentedness>comprehensibility"
    comp_first_rt = first_response_rt + (760 if rating_first_comp else 1370)
    accent_first_rt = first_response_rt + (1370 if rating_first_comp else 760)
    comp_count = 2 if row["phase"] == "main" and (
        (participant_index + trial_index) % 31 == 0 or
        (trial_index > 70 and (participant_index + trial_index) % 19 == 0)
    ) else 1
    accent_count = 2 if row["phase"] == "main" and (
        (participant_index + trial_index) % 37 == 0 or
        (trial_index > 70 and (participant_index * 2 + trial_index) % 29 == 0)
    ) else 1
    interaction = ["comprehensibility", "accentedness"] if rating_first_comp else ["accentedness", "comprehensibility"]
    if comp_count > 1:
        interaction.append("comprehensibility")
    if accent_count > 1:
        interaction.append("accentedness")
    return {
        "typed_response": typed,
        "normalized_response": normalized,
        "normalized_target": normalized_target,
        "intelligibility_exact": int(not unidentified and normalized == normalized_target),
        "intelligibility_needs_manual_review": int(not unidentified and normalized != normalized_target),
        "intelligibility_response_status": "unidentified" if unidentified else "typed",
        "intelligibility_unidentified": int(unidentified),
        "comprehensibility_1_9": comp,
        "accentedness_1_9": accent,
        "response_order": f"{first_response_field}>{rating_order}",
        "first_response_field": first_response_field,
        "first_response_rt_ms": first_response_rt,
        "rating_order": rating_order,
        "rating_interaction_sequence": ">".join(interaction),
        "first_rating_field": "comprehensibility" if rating_first_comp else "accentedness",
        "first_rating_rt_ms": min(comp_first_rt, accent_first_rt),
        "comprehensibility_first_rt_ms": comp_first_rt,
        "comprehensibility_last_rt_ms": comp_first_rt + (420 if comp_count > 1 else 0),
        "comprehensibility_selection_count": comp_count,
        "accentedness_first_rt_ms": accent_first_rt,
        "accentedness_last_rt_ms": accent_first_rt + (420 if accent_count > 1 else 0),
        "accentedness_selection_count": accent_count,
        "unidentified_selected_rt_ms": first_response_rt if unidentified else None,
    }


def assignment_to_trial(row: dict, session: dict, participant_index: int, saved_at_ms: int) -> dict:
    response = response_for(row, participant_index)
    fatigue_ms = simulated_fatigue_ms(row)
    replay_count = simulated_replay_count(row, participant_index)
    submit_rt_ms = 4200 + ((participant_index + int(row["trial_index"])) % 23) * 185 + fatigue_ms + replay_count * 1800
    trial = {
        "id": row["id"],
        "session_id": row["session_id"],
        "assignment_id": row["id"],
        "rater_id": session["rater_id"],
        "session_label": session["session_label"],
        "prolific_pid": session["prolific_pid"],
        "prolific_study_id": session["prolific_study_id"],
        "prolific_session_id": session["prolific_session_id"],
        "task_mode": "combined",
        "platform_version": VERSION,
        "phase": row["phase"],
        "practice_kind": row["practice_kind"],
        "practice_group": row["practice_group"],
        "counterbalance_cell": row["counterbalance_cell"] or None,
        "list_comb": row["list_comb"] or None,
        "pronunciation_style": row["pronunciation_style"] or None,
        "stimulus_list": row["stimulus_list"] or None,
        "l1_condition": row["l1_condition"] or None,
        "pronunciation_condition": row["pronunciation_condition"] or None,
        "block_index": row["block_index"] or None,
        "block_list": row["block_list"] or None,
        "within_block_index": row["within_block_index"] or None,
        "block_trial_count": row["block_trial_count"] or None,
        "speaker_pattern_index": row.get("speaker_pattern_index") or None,
        "speaker_pattern_speaker": row.get("speaker_pattern_speaker") or None,
        "trial_index": row["trial_index"],
        "trial_total": TRIAL_COUNT,
        "completed_at": iso(saved_at_ms),
        "played_at": iso(saved_at_ms - submit_rt_ms),
        "source_path": row["source_path"],
        "audio_url": row["audio_url"],
        "file_name": row["file_name"],
        "participant_id": row["participant_id"],
        "native_language": row["native_language"],
        "accent_condition": row["accent_condition"],
        "condition": row["condition"],
        "talker": row["talker"],
        "pass_number": row["pass_number"],
        "word_number": row["word_number"],
        "trial_number": row["trial_number"],
        "take_number": row["take_number"],
        "spoken_form": row["spoken_form"],
        "practice_note": row["practice_note"],
        "source_format": row["source_format"],
        "target_word": row["target_word"],
        "expert_comprehensibility_1_9": row["expert_comprehensibility_1_9"] or None,
        "expert_accentedness_1_9": row["expert_accentedness_1_9"] or None,
        "practice_feedback": (
            f"Expert Accentedness reference range: {row['practice_group'].removeprefix('accent_band_').replace('_', '–')}"
            if row["phase"] == "practice"
            else None
        ),
        "practice_requires_reason": 0 if row["phase"] == "practice" else None,
        "practice_reason": None,
        "japanese_familiarity_1_6": session["japanese_familiarity_1_6"],
        "chinese_familiarity_1_6": session["chinese_familiarity_1_6"],
        "first_key_rt_ms": None if response["intelligibility_unidentified"] else 750 + (participant_index % 9) * 17 + fatigue_ms,
        "submit_rt_ms": submit_rt_ms,
        "audio_duration_s": round(0.72 + (int(row["trial_index"]) % 9) * 0.04, 2),
        "replay_count": replay_count,
        "response_flow": "staged_dictation_then_ratings",
        "dictation_played_at": iso(saved_at_ms - submit_rt_ms - 1400),
        "rating_played_at": iso(saved_at_ms - submit_rt_ms),
        "dictation_submit_rt_ms": round(submit_rt_ms * 0.45, 1),
        "rating_submit_rt_ms": round(submit_rt_ms * 0.55, 1),
        "dictation_audio_duration_s": round(0.72 + (int(row["trial_index"]) % 9) * 0.04, 2),
        "rating_audio_duration_s": round(0.72 + (int(row["trial_index"]) % 9) * 0.04, 2),
        "client_saved_at": iso(saved_at_ms),
        "server_received_at": iso(saved_at_ms + 110),
        "raw_json": json.dumps({"smoke": True, "phase": row["phase"], "trial_index": row["trial_index"]}, separators=(",", ":")),
    }
    trial.update(response)
    return trial


def add_event(conn: sqlite3.Connection, event_id: str, session_id: str | None, rater_id: str, event_type: str, trial_index, event_ms: int, payload: dict) -> None:
    insert_row(conn, "event_logs", {
        "id": event_id,
        "session_id": session_id,
        "rater_id": rater_id,
        "event_type": event_type,
        "trial_index": trial_index,
        "event_at": iso(event_ms),
        "server_received_at": iso(event_ms + 50),
        "payload_json": json.dumps(payload, separators=(",", ":")),
    })


def generate_database(conn: sqlite3.Connection, participant_count: int, dropout_count: int) -> dict:
    schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    conn.executescript(schema)
    base_ms = int(datetime(2026, 6, 18, 9, 0, tzinfo=timezone.utc).timestamp() * 1000)
    dropouts = dropout_indices(participant_count, dropout_count)
    abandoned_dropouts = set(sorted(dropouts)[::5])
    saved_trial_total = 0
    main_saved_total = 0
    practice_saved_total = 0
    incomplete_dropout_count = 0
    abandoned_count = 0
    word_familiarity_response_total = 0
    completed_word_familiarity_response_total = 0
    dropout_word_familiarity_response_total = 0
    dropout_sessions_with_partial_word_familiarity = 0
    practice_resume_session_count = 0
    practice_replay_event_total = 0
    practice_feedback_replay_pair_total = 0

    for participant_index in range(1, participant_count + 1):
        cell_id, list_comb, style = COUNTERBALANCE_CELLS[(participant_index - 1) % len(COUNTERBALANCE_CELLS)]
        session_id = f"smoke-session-{participant_index:04d}"
        allocation_id = f"smoke-allocation-{participant_index:04d}"
        prolific_pid = f"SMOKE_PID_{participant_index:04d}"
        prolific_session_id = f"SMOKE_SUBMISSION_{participant_index:04d}"
        participant_key = f"prolific:{STUDY_ID.lower()}:{prolific_pid.lower()}"
        started_ms = base_ms + participant_index * 300_000
        completed_ms = started_ms + 45 * 60_000 + (participant_index % 10) * 12_000
        is_dropout = participant_index in dropouts
        saved_limit = 0 if participant_index in abandoned_dropouts else (
            dropout_saved_trial_count(participant_index) if is_dropout else TRIAL_COUNT
        )
        saved_limit = max(0, min(TRIAL_COUNT, saved_limit))
        saved_main_count = max(0, saved_limit - len(PRACTICE_ITEMS))
        saved_practice_count = min(saved_limit, len(PRACTICE_ITEMS))
        if is_dropout:
            status = "incomplete_dropout" if saved_limit else "abandoned"
            finalized_ms = started_ms + 8 * 60_000 + saved_limit * 22_000
            last_seen_ms = started_ms + max(60_000, saved_limit * 18_000)
            completion_code = None
            completion_issued_at = None
            completion_issued_at_ms = None
            completion_issued_count = 0
            allocation_status = "incomplete"
            allocation_completed_at = None
            incomplete_dropout_count += 1 if saved_limit else 0
            abandoned_count += 1 if not saved_limit else 0
        else:
            status = "completed"
            finalized_ms = completed_ms
            last_seen_ms = completed_ms
            completion_code = COMPLETION_CODE
            completion_issued_at = iso(completed_ms)
            completion_issued_at_ms = completed_ms
            completion_issued_count = 1
            allocation_status = "completed"
            allocation_completed_at = iso(completed_ms)
        if is_dropout:
            word_familiarity_response_count = dropout_word_familiarity_count(saved_main_count)
            word_familiarity_submitted_ms = last_seen_ms
        else:
            word_familiarity_response_count = TARGET_WORD_COUNT
            word_familiarity_submitted_ms = completed_ms - 30_000
        word_familiarity_rows = build_word_familiarity_rows(
            session_id,
            participant_index,
            word_familiarity_response_count,
            word_familiarity_submitted_ms,
        )
        word_familiarity_response_total += word_familiarity_response_count
        if is_dropout:
            dropout_word_familiarity_response_total += word_familiarity_response_count
            if word_familiarity_response_count:
                dropout_sessions_with_partial_word_familiarity += 1
        else:
            completed_word_familiarity_response_total += word_familiarity_response_count
        duplicate_count = 1 if participant_index % 25 == 0 else 0
        duplicate_ms = started_ms + 6_000 if duplicate_count else None
        session = {
            "id": session_id,
            "role": "rater",
            "rater_id": prolific_pid,
            "session_label": prolific_session_id,
            "task_mode": "combined",
            "platform_version": VERSION,
            "prolific_pid": prolific_pid,
            "prolific_study_id": STUDY_ID,
            "prolific_session_id": prolific_session_id,
            "participant_key": participant_key,
            "seed": f"{prolific_pid}_{prolific_session_id}_{VERSION}",
            "user_agent": "smoke-test/1.0",
            "timezone": "Asia/Tokyo",
            "japanese_familiarity_1_6": 1 + (participant_index % 6),
            "chinese_familiarity_1_6": 1 + ((participant_index + 2) % 6),
            "word_familiarity_required": 1,
            "completion_code": completion_code,
            "session_token_hash": "smoke-token-hash",
            "turnstile_verified": 1,
            "counterbalance_allocation_id": allocation_id,
            "counterbalance_cell": cell_id,
            "list_comb": list_comb,
            "pronunciation_style": style,
            "screen_json": json.dumps({"width": 1440, "height": 900}, separators=(",", ":")),
            "started_at": iso(started_ms),
            "started_at_ms": started_ms,
            "completed_at": iso(finalized_ms),
            "completed_at_ms": finalized_ms,
            "last_seen_at": iso(last_seen_ms),
            "last_seen_at_ms": last_seen_ms,
            "status": status,
            "trial_count": TRIAL_COUNT,
            "completed_trial_count": saved_limit,
            "completion_url_issued_at": completion_issued_at,
            "completion_url_issued_at_ms": completion_issued_at_ms,
            "completion_url_issued_count": completion_issued_count,
            "duplicate_start_count": duplicate_count,
            "duplicate_start_last_at": iso(duplicate_ms) if duplicate_ms else None,
            "duplicate_start_last_at_ms": duplicate_ms,
        }
        insert_row(conn, "sessions", session)
        for word_familiarity_row in word_familiarity_rows:
            insert_row(conn, "word_familiarity_responses", word_familiarity_row)
        insert_row(conn, "counterbalance_allocations", {
            "id": allocation_id,
            "session_id": session_id,
            "cell_id": cell_id,
            "status": allocation_status,
            "assigned_at": iso(started_ms),
            "completed_at": allocation_completed_at,
            "updated_at": iso(finalized_ms),
        })

        assignments = [
            *build_practice_assignment(session_id, iso(started_ms)),
            *build_main_assignment(session_id, cell_id, list_comb, style, iso(started_ms), participant_index),
        ]
        saved_trial_total += saved_limit
        main_saved_total += saved_main_count
        practice_saved_total += saved_practice_count
        for assignment_number, row in enumerate(assignments, start=1):
            insert_row(conn, "rating_assignments", row)
            if assignment_number <= saved_limit:
                offset = row["trial_index"] * 17_000 if row["phase"] == "practice" else 180_000 + row["trial_index"] * 22_000
                saved_at_ms = started_ms + offset
                trial = assignment_to_trial(row, session, participant_index, saved_at_ms)
                insert_row(conn, "rating_trials", trial)
                play_started_ms = saved_at_ms - int(float(trial["submit_rt_ms"]))
                event_base = f"{session_id}:event:audio:{row['phase']}:{row['trial_index']}"
                add_event(conn, f"{event_base}:0", session_id, prolific_pid, "audio_play_start", row["trial_index"], play_started_ms, {
                    "file_name": row["file_name"],
                    "is_replay": False,
                    "play_rt_ms": 0,
                    "replay_count": 0,
                })
                for replay_number in range(1, int(trial["replay_count"]) + 1):
                    replay_rt_ms = min(int(float(trial["submit_rt_ms"])) - 500, 1600 * replay_number + 350)
                    add_event(conn, f"{event_base}:replay:{replay_number}", session_id, prolific_pid, "audio_play_start", row["trial_index"], play_started_ms + replay_rt_ms, {
                        "file_name": row["file_name"],
                        "is_replay": True,
                        "play_rt_ms": replay_rt_ms,
                        "replay_count": replay_number,
                    })

        add_event(conn, f"{session_id}:event:start", session_id, prolific_pid, "session_start", None, started_ms, {
            "trial_count": TRIAL_COUNT,
            "counterbalance_cell": cell_id,
        })
        if duplicate_count and saved_practice_count == len(PRACTICE_ITEMS):
            practice_resume_session_count += 1
            resume_main_index = min(saved_main_count + 1, 100)
            add_event(
                conn,
                f"{session_id}:event:resume",
                session_id,
                prolific_pid,
                "session_resume_practice_required",
                None,
                duplicate_ms,
                {
                    "practice_replay_required": True,
                    "practice_item_count": len(PRACTICE_ITEMS),
                    "next_phase": "main" if saved_main_count < 100 else "word_familiarity",
                    "next_trial_index": resume_main_index if saved_main_count < 100 else None,
                },
            )
            for practice_index, practice_item in enumerate(PRACTICE_ITEMS, start=1):
                add_event(
                    conn,
                    f"{session_id}:event:practice-replayed:{practice_index}",
                    session_id,
                    prolific_pid,
                    "practice_replayed",
                    practice_index,
                    duplicate_ms + practice_index * 1_000,
                    {
                        "target_word": practice_item[0],
                        "practice_replay_required": True,
                    },
                )
                practice_replay_event_total += 1
            # Five feedback-stage replay pairs exercise the intentionally unbounded
            # replay contract without adding duplicate rating_trials rows.
            for replay_number in range(1, 6):
                replay_ms = duplicate_ms + 10_000 + replay_number * 1_000
                for suffix, event_type, event_offset in (
                    ("start", "practice_feedback_replay_start", 0),
                    ("end", "practice_feedback_replay_end", 600),
                ):
                    add_event(
                        conn,
                        f"{session_id}:event:feedback-replay:{replay_number}:{suffix}",
                        session_id,
                        prolific_pid,
                        event_type,
                        1,
                        replay_ms + event_offset,
                        {
                            "target_word": PRACTICE_ITEMS[0][0],
                            "replay_number": replay_number,
                        },
                    )
                practice_feedback_replay_pair_total += 1
        for block_end in (25, 50, 75):
            if saved_main_count >= block_end:
                add_event(conn, f"{session_id}:event:distractor:{block_end}", session_id, prolific_pid, "distractor_complete", block_end, started_ms + 180_000 + block_end * 22_000 + 15_000, {
                    "completed_trials": block_end,
                    "problem_count": 6,
                    "correct_count": 6,
                    "rt_ms": 18500 + (participant_index % 8) * 450 + block_end * 11,
                })
        if not is_dropout:
            add_event(conn, f"{session_id}:event:word-familiarity", session_id, prolific_pid, "word_familiarity_saved", None, word_familiarity_submitted_ms, {
                "response_count": word_familiarity_response_count,
                "known_word_count": sum(row["word_known"] for row in word_familiarity_rows),
            })
            add_event(conn, f"{session_id}:event:complete", session_id, prolific_pid, "session_complete", None, completed_ms, {
                "trial_count": TRIAL_COUNT,
                "completed_trial_count": TRIAL_COUNT,
                "status": "completed",
            })

    if dropout_count:
        finalized_ms = base_ms + (participant_count + 2) * 300_000
        add_event(conn, "smoke-admin:event:finalize-stale", None, "admin", "admin_finalize_stale_sessions", None, finalized_ms, {
            "stale_after_minutes": 240,
            "finalized_total": dropout_count,
            "incomplete_dropout": incomplete_dropout_count,
            "abandoned": abandoned_count,
        })

    conn.commit()
    return {
        "participant_count": participant_count,
        "dropout_count": dropout_count,
        "completed_count": participant_count - dropout_count,
        "incomplete_dropout_count": incomplete_dropout_count,
        "abandoned_count": abandoned_count,
        "saved_trial_total": saved_trial_total,
        "main_saved_total": main_saved_total,
        "practice_saved_total": practice_saved_total,
        "word_familiarity_required_sessions": participant_count,
        "word_familiarity_response_total": word_familiarity_response_total,
        "completed_word_familiarity_response_total": completed_word_familiarity_response_total,
        "dropout_word_familiarity_response_total": dropout_word_familiarity_response_total,
        "dropout_sessions_with_partial_word_familiarity": dropout_sessions_with_partial_word_familiarity,
        "dropout_sessions_without_word_familiarity": dropout_count - dropout_sessions_with_partial_word_familiarity,
        "practice_resume_session_count": practice_resume_session_count,
        "practice_replay_event_total": practice_replay_event_total,
        "practice_feedback_replay_pair_total": practice_feedback_replay_pair_total,
    }


def export_csvs(conn: sqlite3.Connection, out_dir: Path) -> dict:
    exports = {}
    session_base_columns = SESSIONS_COLUMNS[:-5]
    sessions_sql = f"""
        SELECT
          {', '.join(f's.{column}' for column in session_base_columns)},
          s.word_familiarity_required,
          COALESCE(wf.word_familiarity_response_count, 0) AS word_familiarity_response_count,
          COALESCE(wf.known_word_count, 0) AS known_word_count,
          CASE
            WHEN s.word_familiarity_required = 1
            THEN MAX(0, {TARGET_WORD_COUNT} - COALESCE(wf.word_familiarity_response_count, 0))
            ELSE 0
          END AS missing_word_familiarity_count,
          wf.word_familiarity_submitted_at
        FROM sessions s
        LEFT JOIN (
          SELECT
            session_id,
            COUNT(*) AS word_familiarity_response_count,
            SUM(word_known) AS known_word_count,
            MAX(submitted_at) AS word_familiarity_submitted_at
          FROM word_familiarity_responses
          GROUP BY session_id
        ) wf ON wf.session_id = s.id
        ORDER BY s.started_at_ms, s.started_at
    """
    specs = {
        "ratings.csv": (f"SELECT {', '.join(RATINGS_COLUMNS)} FROM rating_trials ORDER BY rater_id, session_label, phase, trial_index", RATINGS_COLUMNS),
        "sessions.csv": (sessions_sql, SESSIONS_COLUMNS),
        "assignments.csv": (f"SELECT {', '.join(ASSIGNMENTS_COLUMNS)} FROM rating_assignments ORDER BY session_id, phase, trial_index", ASSIGNMENTS_COLUMNS),
        "events.csv": (f"SELECT {', '.join(EVENT_COLUMNS)} FROM event_logs ORDER BY server_received_at", EVENT_COLUMNS),
        "counterbalance.csv": ("""
            SELECT ca.id, ca.session_id, ca.cell_id, cc.list_comb, cc.pronunciation_style,
                   ca.status, ca.assigned_at, ca.completed_at, ca.updated_at,
                   s.rater_id, s.prolific_pid, s.participant_key
            FROM counterbalance_allocations ca
            JOIN counterbalance_cells cc ON cc.cell_id = ca.cell_id
            LEFT JOIN sessions s ON s.id = ca.session_id
            ORDER BY ca.assigned_at
        """, COUNTERBALANCE_COLUMNS),
        "word-familiarity.csv": ("""
            SELECT
              wf.session_id,
              s.rater_id,
              s.prolific_pid,
              s.prolific_study_id,
              s.prolific_session_id,
              s.platform_version,
              s.status AS session_status,
              wf.word_number,
              wf.target_word,
              wf.word_known,
              wf.submitted_at,
              wf.submitted_at_ms
            FROM word_familiarity_responses wf
            JOIN sessions s ON s.id = wf.session_id
            ORDER BY s.started_at_ms, s.started_at, wf.session_id, wf.word_number
        """, WORD_FAMILIARITY_COLUMNS),
    }
    for filename, (sql, columns) in specs.items():
        rows = fetch_all(conn, sql)
        csv_write(out_dir / filename, rows, columns)
        exports[filename] = len(rows)

    analysis_rows = fetch_all(conn, """
        SELECT
          s.id AS session_id,
          s.status AS session_status,
          s.counterbalance_cell,
          s.list_comb,
          s.pronunciation_style,
          s.japanese_familiarity_1_6,
          s.chinese_familiarity_1_6,
          rt.trial_index,
          rt.block_index,
          rt.block_list,
          rt.within_block_index,
          rt.block_trial_count,
          rt.speaker_pattern_index,
          rt.speaker_pattern_speaker,
          rt.stimulus_list,
          rt.l1_condition,
          rt.pronunciation_condition,
          rt.participant_id,
          rt.talker,
          rt.target_word,
          rt.word_number,
          rt.trial_number,
          rt.take_number,
          rt.file_name,
          rt.typed_response,
          rt.normalized_response,
          rt.normalized_target,
          rt.intelligibility_exact,
          rt.intelligibility_needs_manual_review,
          rt.intelligibility_response_status,
          rt.intelligibility_unidentified,
          rt.comprehensibility_1_9,
          rt.accentedness_1_9,
          rt.first_key_rt_ms,
          rt.submit_rt_ms,
          rt.audio_duration_s,
          rt.replay_count,
          rt.response_flow,
          rt.dictation_played_at,
          rt.rating_played_at,
          rt.dictation_submit_rt_ms,
          rt.rating_submit_rt_ms,
          rt.dictation_audio_duration_s,
          rt.rating_audio_duration_s,
          rt.response_order,
          rt.first_response_field,
          rt.first_response_rt_ms,
          rt.rating_order,
          rt.rating_interaction_sequence,
          rt.first_rating_field,
          rt.first_rating_rt_ms,
          rt.comprehensibility_first_rt_ms,
          rt.comprehensibility_last_rt_ms,
          rt.comprehensibility_selection_count,
          rt.accentedness_first_rt_ms,
          rt.accentedness_last_rt_ms,
          rt.accentedness_selection_count,
          rt.unidentified_selected_rt_ms,
          wf.word_known,
          s.word_familiarity_required,
          wf.submitted_at AS word_familiarity_submitted_at
        FROM rating_trials rt
        JOIN sessions s ON s.id = rt.session_id
        LEFT JOIN word_familiarity_responses wf
          ON wf.session_id = rt.session_id
         AND wf.word_number = CAST(rt.word_number AS INTEGER)
         AND LOWER(wf.target_word) = LOWER(rt.target_word)
        WHERE s.status = 'completed'
          AND rt.phase = 'main'
        ORDER BY s.completed_at_ms, s.completed_at, s.id, rt.trial_index
    """)
    participant_ids = {}
    for row in analysis_rows:
        participant_ids.setdefault(row["session_id"], f"P{len(participant_ids) + 1:04d}")
        row["analysis_participant_id"] = participant_ids[row["session_id"]]
    csv_write(out_dir / "analysis.csv", analysis_rows, ANALYSIS_COLUMNS)
    exports["analysis.csv"] = len(analysis_rows)

    quality_rows = fetch_all(conn, f"""
        SELECT
          s.id AS session_id,
          s.status,
          CASE
            WHEN s.status = 'completed' AND s.completed_at_ms IS NOT NULL AND s.started_at_ms IS NOT NULL
            THEN s.completed_at_ms - s.started_at_ms
            ELSE NULL
          END AS elapsed_ms,
          CASE
            WHEN s.last_seen_at_ms IS NOT NULL AND s.started_at_ms IS NOT NULL
            THEN s.last_seen_at_ms - s.started_at_ms
            ELSE NULL
          END AS active_elapsed_ms,
          s.trial_count,
          s.completed_trial_count,
          CASE
            WHEN s.trial_count - s.completed_trial_count > 0
            THEN s.trial_count - s.completed_trial_count
            ELSE 0
          END AS missing_trial_count,
          SUM(CASE WHEN rt.phase = 'main' THEN 1 ELSE 0 END) AS main_saved_count,
          SUM(CASE WHEN rt.phase = 'practice' THEN 1 ELSE 0 END) AS practice_saved_count,
          SUM(CASE WHEN rt.intelligibility_needs_manual_review = 1 THEN 1 ELSE 0 END) AS manual_review_count,
          SUM(CASE WHEN rt.intelligibility_unidentified = 1 THEN 1 ELSE 0 END) AS unidentified_count,
          SUM(CASE WHEN rt.id IS NOT NULL AND (rt.typed_response IS NULL OR rt.typed_response = '') AND COALESCE(rt.intelligibility_unidentified, 0) = 0 THEN 1 ELSE 0 END) AS blank_dictation_count,
          SUM(CASE WHEN rt.phase = 'main' AND (rt.comprehensibility_1_9 IS NULL OR rt.accentedness_1_9 IS NULL) THEN 1 ELSE 0 END) AS missing_rating_count,
          ROUND(AVG(rt.submit_rt_ms), 2) AS avg_submit_rt_ms,
          MIN(rt.submit_rt_ms) AS min_submit_rt_ms,
          MAX(rt.submit_rt_ms) AS max_submit_rt_ms,
          ROUND(AVG(rt.replay_count), 2) AS avg_replay_count,
          MAX(rt.replay_count) AS max_replay_count,
          COALESCE(de.distractor_completed_count, 0) AS distractor_completed_count,
          COALESCE(de.distractor_correct_total, 0) AS distractor_correct_total,
          COALESCE(de.distractor_problem_total, 0) AS distractor_problem_total,
          CASE
            WHEN COALESCE(de.distractor_problem_total, 0) > 0
            THEN ROUND(1.0 * de.distractor_correct_total / de.distractor_problem_total, 4)
            ELSE NULL
          END AS distractor_accuracy,
          de.avg_distractor_rt_ms,
          s.duplicate_start_count,
          s.completion_url_issued_count,
          s.counterbalance_cell,
          s.list_comb,
          s.pronunciation_style,
          s.word_familiarity_required,
          COALESCE(wf.word_familiarity_response_count, 0) AS word_familiarity_response_count,
          COALESCE(wf.known_word_count, 0) AS known_word_count,
          CASE
            WHEN s.word_familiarity_required = 1
            THEN MAX(0, {TARGET_WORD_COUNT} - COALESCE(wf.word_familiarity_response_count, 0))
            ELSE 0
          END AS missing_word_familiarity_count
        FROM sessions s
        LEFT JOIN rating_trials rt ON rt.session_id = s.id
        LEFT JOIN (
          SELECT
            session_id,
            COUNT(*) AS distractor_completed_count,
            SUM(COALESCE(CAST(json_extract(payload_json, '$.correct_count') AS INTEGER), 0)) AS distractor_correct_total,
            SUM(COALESCE(CAST(json_extract(payload_json, '$.problem_count') AS INTEGER), 0)) AS distractor_problem_total,
            ROUND(AVG(CAST(json_extract(payload_json, '$.rt_ms') AS REAL)), 2) AS avg_distractor_rt_ms
          FROM event_logs
          WHERE event_type = 'distractor_complete'
          GROUP BY session_id
        ) de ON de.session_id = s.id
        LEFT JOIN (
          SELECT
            session_id,
            COUNT(*) AS word_familiarity_response_count,
            SUM(word_known) AS known_word_count
          FROM word_familiarity_responses
          GROUP BY session_id
        ) wf ON wf.session_id = s.id
        GROUP BY s.id
        ORDER BY s.started_at_ms, s.started_at
    """)
    quality_participant_ids = {}
    for row in quality_rows:
        quality_participant_ids.setdefault(row["session_id"], f"P{len(quality_participant_ids) + 1:04d}")
        row["analysis_participant_id"] = quality_participant_ids[row["session_id"]]
    csv_write(out_dir / "quality.csv", quality_rows, QUALITY_COLUMNS)
    exports["quality.csv"] = len(quality_rows)
    return exports


def scalar(conn: sqlite3.Connection, sql: str) -> int:
    value = conn.execute(sql).fetchone()[0]
    return int(value or 0)


def assert_smoke(conn: sqlite3.Connection, participant_count: int, exports: dict, generation: dict) -> dict:
    completed_count = generation["completed_count"]
    dropout_count = generation["dropout_count"]
    expected_total_trials = generation["saved_trial_total"]
    expected_main = generation["main_saved_total"]
    expected_practice = generation["practice_saved_total"]
    expected_analysis = completed_count * 100
    expected_word_familiarity = generation["word_familiarity_response_total"]
    canonical_rows = fetch_all(
        conn,
        "SELECT word_number, target_word FROM word_familiarity_responses",
    )
    canonical_word_familiarity_mismatches = sum(
        1
        for row in canonical_rows
        if not 1 <= int(row["word_number"]) <= TARGET_WORD_COUNT
        or row["target_word"] != word_label(int(row["word_number"]))
    )
    expected_practice_by_index = {
        index: {
            "target_word": item[0],
            "practice_group": item[1],
            "l1_condition": item[2],
            "pronunciation_condition": item[3],
            "audio_url": item[5],
            "range": f"{item[6]}–{item[7]}",
            "talker": item[4],
            "spoken_form": item[8],
            "source_format": item[9],
            "condition": f"practice_{item[3]}",
            "accent_condition": item[3],
        }
        for index, item in enumerate(PRACTICE_ITEMS, start=1)
    }
    practice_assignment_rows = fetch_all(
        conn,
        """
        SELECT trial_index, target_word, practice_group, l1_condition,
               pronunciation_condition, accent_condition, condition,
               audio_url, participant_id, talker,
               spoken_form, practice_note, source_format,
               expert_comprehensibility_1_9, expert_accentedness_1_9
        FROM rating_assignments
        WHERE phase = 'practice'
        """,
    )
    practice_assignment_mismatches = 0
    for row in practice_assignment_rows:
        expected_item = expected_practice_by_index.get(int(row["trial_index"]))
        if (
            expected_item is None
            or row["target_word"] != expected_item["target_word"]
            or row["practice_group"] != expected_item["practice_group"]
            or row["l1_condition"] != expected_item["l1_condition"]
            or row["pronunciation_condition"] != expected_item["pronunciation_condition"]
            or row["accent_condition"] != expected_item["accent_condition"]
            or row["condition"] != expected_item["condition"]
            or row["audio_url"] != expected_item["audio_url"]
            or row["participant_id"] != expected_item["talker"]
            or row["talker"] != expected_item["talker"]
            or row["spoken_form"] != expected_item["spoken_form"]
            or expected_item["range"] not in str(row["practice_note"] or "")
            or row["source_format"] != expected_item["source_format"]
            or row["expert_comprehensibility_1_9"] is not None
            or row["expert_accentedness_1_9"] is not None
        ):
            practice_assignment_mismatches += 1
    checks = {
        "sessions": scalar(conn, "SELECT COUNT(*) FROM sessions"),
        "completed_sessions": scalar(conn, "SELECT COUNT(*) FROM sessions WHERE status = 'completed'"),
        "incomplete_dropout_sessions": scalar(conn, "SELECT COUNT(*) FROM sessions WHERE status = 'incomplete_dropout'"),
        "abandoned_sessions": scalar(conn, "SELECT COUNT(*) FROM sessions WHERE status = 'abandoned'"),
        "distinct_participant_keys": scalar(conn, "SELECT COUNT(DISTINCT participant_key) FROM sessions"),
        "rating_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials"),
        "main_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE phase = 'main'"),
        "practice_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE phase = 'practice'"),
        "assignments": scalar(conn, "SELECT COUNT(*) FROM rating_assignments"),
        "allocations": scalar(conn, "SELECT COUNT(*) FROM counterbalance_allocations"),
        "incomplete_allocations": scalar(conn, "SELECT COUNT(*) FROM counterbalance_allocations WHERE status = 'incomplete'"),
        "eng_accented_rows": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE l1_condition = 'ENG' AND pronunciation_condition = 'accented'"),
        "unidentified_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE intelligibility_unidentified = 1"),
        "manual_review_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE intelligibility_needs_manual_review = 1"),
        "replayed_trials": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE replay_count > 0"),
        "max_replay_count": scalar(conn, "SELECT MAX(replay_count) FROM rating_trials"),
        "missing_response_order": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE phase = 'main' AND (response_order IS NULL OR response_order = '')"),
        "blank_without_unidentified": scalar(conn, "SELECT COUNT(*) FROM rating_trials WHERE (typed_response IS NULL OR typed_response = '') AND COALESCE(intelligibility_unidentified, 0) = 0"),
        "missing_saved_trials": scalar(conn, "SELECT COUNT(*) FROM sessions WHERE completed_trial_count != trial_count"),
        "completion_urls_issued": scalar(conn, "SELECT SUM(completion_url_issued_count) FROM sessions"),
        "duplicate_start_total": scalar(conn, "SELECT SUM(duplicate_start_count) FROM sessions"),
        "word_familiarity_required_sessions": scalar(conn, "SELECT COUNT(*) FROM sessions WHERE word_familiarity_required = 1"),
        "word_familiarity_responses": scalar(conn, "SELECT COUNT(*) FROM word_familiarity_responses"),
        "completed_word_familiarity_responses": scalar(conn, """
            SELECT COUNT(*)
            FROM word_familiarity_responses wf
            JOIN sessions s ON s.id = wf.session_id
            WHERE s.status = 'completed'
        """),
        "completed_sessions_with_full_word_familiarity": scalar(conn, f"""
            SELECT COUNT(*)
            FROM sessions s
            WHERE s.status = 'completed'
              AND (SELECT COUNT(*) FROM word_familiarity_responses wf WHERE wf.session_id = s.id) = {TARGET_WORD_COUNT}
        """),
        "completed_sessions_missing_word_familiarity": scalar(conn, f"""
            SELECT COUNT(*)
            FROM sessions s
            WHERE s.status = 'completed'
              AND (SELECT COUNT(*) FROM word_familiarity_responses wf WHERE wf.session_id = s.id) != {TARGET_WORD_COUNT}
        """),
        "dropout_sessions_with_full_word_familiarity": scalar(conn, f"""
            SELECT COUNT(*)
            FROM sessions s
            WHERE s.status != 'completed'
              AND (SELECT COUNT(*) FROM word_familiarity_responses wf WHERE wf.session_id = s.id) = {TARGET_WORD_COUNT}
        """),
        "dropout_sessions_with_partial_word_familiarity": scalar(conn, f"""
            SELECT COUNT(*)
            FROM sessions s
            WHERE s.status != 'completed'
              AND (SELECT COUNT(*) FROM word_familiarity_responses wf WHERE wf.session_id = s.id)
                  BETWEEN 1 AND {TARGET_WORD_COUNT - 1}
        """),
        "dropout_sessions_without_word_familiarity": scalar(conn, """
            SELECT COUNT(*)
            FROM sessions s
            WHERE s.status != 'completed'
              AND NOT EXISTS (
                SELECT 1 FROM word_familiarity_responses wf WHERE wf.session_id = s.id
              )
        """),
        "known_word_responses": scalar(conn, "SELECT SUM(word_known) FROM word_familiarity_responses"),
        "unknown_word_responses": scalar(conn, "SELECT COUNT(*) - SUM(word_known) FROM word_familiarity_responses"),
        "capelin_known_responses": scalar(conn, "SELECT SUM(word_known) FROM word_familiarity_responses WHERE word_number = 23 AND target_word = 'capelin'"),
        "canonical_word_familiarity_mismatches": canonical_word_familiarity_mismatches,
        "practice_assignment_mismatches": practice_assignment_mismatches,
        "practice_scalar_expert_values": scalar(conn, """
            SELECT COUNT(*)
            FROM rating_assignments
            WHERE phase = 'practice'
              AND (expert_comprehensibility_1_9 IS NOT NULL OR expert_accentedness_1_9 IS NOT NULL)
        """),
        "sessions_with_more_than_four_practice_trials": scalar(conn, """
            SELECT COUNT(*)
            FROM (
              SELECT session_id
              FROM rating_trials
              WHERE phase = 'practice'
              GROUP BY session_id
              HAVING COUNT(*) > 4
            )
        """),
        "practice_resume_events": scalar(conn, "SELECT COUNT(*) FROM event_logs WHERE event_type = 'session_resume_practice_required'"),
        "practice_replayed_events": scalar(conn, "SELECT COUNT(*) FROM event_logs WHERE event_type = 'practice_replayed'"),
        "practice_feedback_replay_start_events": scalar(conn, "SELECT COUNT(*) FROM event_logs WHERE event_type = 'practice_feedback_replay_start'"),
        "practice_feedback_replay_end_events": scalar(conn, "SELECT COUNT(*) FROM event_logs WHERE event_type = 'practice_feedback_replay_end'"),
        "max_practice_feedback_replay_number": scalar(conn, """
            SELECT MAX(CAST(json_extract(payload_json, '$.replay_number') AS INTEGER))
            FROM event_logs
            WHERE event_type = 'practice_feedback_replay_start'
        """),
        "completed_analysis_rows_missing_word_known": scalar(conn, """
            SELECT COUNT(*)
            FROM rating_trials rt
            JOIN sessions s ON s.id = rt.session_id
            LEFT JOIN word_familiarity_responses wf
              ON wf.session_id = rt.session_id
             AND wf.word_number = CAST(rt.word_number AS INTEGER)
             AND LOWER(wf.target_word) = LOWER(rt.target_word)
            WHERE s.status = 'completed'
              AND rt.phase = 'main'
              AND wf.word_known IS NULL
        """),
        "completed_analysis_rows_missing_word_submitted_at": scalar(conn, """
            SELECT COUNT(*)
            FROM rating_trials rt
            JOIN sessions s ON s.id = rt.session_id
            LEFT JOIN word_familiarity_responses wf
              ON wf.session_id = rt.session_id
             AND wf.word_number = CAST(rt.word_number AS INTEGER)
             AND LOWER(wf.target_word) = LOWER(rt.target_word)
            WHERE s.status = 'completed'
              AND rt.phase = 'main'
              AND wf.submitted_at IS NULL
        """),
    }
    cell_rows = fetch_all(conn, """
        SELECT cell_id, COUNT(*) AS n
        FROM counterbalance_allocations
        GROUP BY cell_id
        ORDER BY cell_id
    """)
    cell_counts = {str(row["cell_id"]): row["n"] for row in cell_rows}
    failures = []
    expected = {
        "sessions": participant_count,
        "completed_sessions": completed_count,
        "incomplete_dropout_sessions": generation["incomplete_dropout_count"],
        "abandoned_sessions": generation["abandoned_count"],
        "distinct_participant_keys": participant_count,
        "rating_trials": expected_total_trials,
        "main_trials": expected_main,
        "practice_trials": expected_practice,
        "assignments": participant_count * TRIAL_COUNT,
        "allocations": participant_count,
        "incomplete_allocations": dropout_count,
        "eng_accented_rows": 0,
        "blank_without_unidentified": 0,
        "missing_saved_trials": dropout_count,
        "completion_urls_issued": completed_count,
        "duplicate_start_total": participant_count // 25,
        "word_familiarity_required_sessions": participant_count,
        "word_familiarity_responses": expected_word_familiarity,
        "completed_word_familiarity_responses": completed_count * TARGET_WORD_COUNT,
        "completed_sessions_with_full_word_familiarity": completed_count,
        "completed_sessions_missing_word_familiarity": 0,
        "dropout_sessions_with_full_word_familiarity": 0,
        "dropout_sessions_with_partial_word_familiarity": generation["dropout_sessions_with_partial_word_familiarity"],
        "dropout_sessions_without_word_familiarity": generation["dropout_sessions_without_word_familiarity"],
        "canonical_word_familiarity_mismatches": 0,
        "practice_assignment_mismatches": 0,
        "practice_scalar_expert_values": 0,
        "sessions_with_more_than_four_practice_trials": 0,
        "practice_resume_events": generation["practice_resume_session_count"],
        "practice_replayed_events": generation["practice_replay_event_total"],
        "practice_feedback_replay_start_events": generation["practice_feedback_replay_pair_total"],
        "practice_feedback_replay_end_events": generation["practice_feedback_replay_pair_total"],
        "max_practice_feedback_replay_number": 5 if generation["practice_feedback_replay_pair_total"] else 0,
        "completed_analysis_rows_missing_word_known": 0,
        "completed_analysis_rows_missing_word_submitted_at": 0,
        "ratings.csv": expected_total_trials,
        "assignments.csv": participant_count * TRIAL_COUNT,
        "sessions.csv": participant_count,
        "counterbalance.csv": participant_count,
        "analysis.csv": expected_analysis,
        "quality.csv": participant_count,
        "word-familiarity.csv": expected_word_familiarity,
    }
    for key, expected_value in expected.items():
        actual = exports.get(key) if key.endswith(".csv") else checks.get(key)
        if actual != expected_value:
            failures.append(f"{key}: expected {expected_value}, got {actual}")
    if sorted(cell_counts.values()) != [participant_count // 20] * 20:
        failures.append(f"cell distribution is not balanced: {cell_counts}")
    if checks["unidentified_trials"] <= 0:
        failures.append("unidentified_trials should be greater than zero")
    if checks["manual_review_trials"] <= 0:
        failures.append("manual_review_trials should be greater than zero")
    if checks["replayed_trials"] <= 0:
        failures.append("replayed_trials should be greater than zero")
    if checks["max_replay_count"] <= 1:
        failures.append("max_replay_count should show more than one replay in at least one trial")
    if checks["missing_response_order"] != 0:
        failures.append("all saved main trials should include response_order")
    if checks["known_word_responses"] <= 0 or checks["unknown_word_responses"] <= 0:
        failures.append("word-familiarity simulation should include both known and unknown responses")
    capelin_response_count = scalar(
        conn,
        "SELECT COUNT(*) FROM word_familiarity_responses WHERE word_number = 23 AND target_word = 'capelin'",
    )
    if capelin_response_count and checks["capelin_known_responses"] >= capelin_response_count:
        failures.append("capelin should be unknown for at least one simulated participant")
    if failures:
        raise AssertionError("; ".join(failures))
    return {
        "checks": checks,
        "cell_counts": cell_counts,
        "exports": exports,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--participants", type=int, default=200)
    parser.add_argument("--dropouts", type=int, default=0)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--keep-existing", action="store_true")
    args = parser.parse_args()
    if args.participants % 20 != 0:
        raise SystemExit("--participants must be divisible by 20 for this smoke test.")
    if args.dropouts < 0 or args.dropouts > args.participants:
        raise SystemExit("--dropouts must be between 0 and --participants.")

    out_dir = args.out_dir
    if args.dropouts and args.out_dir == DEFAULT_OUT_DIR:
        out_dir = ROOT / "exports" / f"smoke_test_{args.participants}_dropout_{args.dropouts}"
    out_dir = out_dir.resolve()
    if out_dir.exists() and not args.keep_existing:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    db_path = out_dir / "smoke_test.sqlite"
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        generation = generate_database(conn, args.participants, args.dropouts)
        exports = export_csvs(conn, out_dir)
        summary = {
            **generation,
            **assert_smoke(conn, args.participants, exports, generation),
            "database": str(db_path),
            "output_dir": str(out_dir),
        }
        (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(json.dumps(summary, indent=2))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
