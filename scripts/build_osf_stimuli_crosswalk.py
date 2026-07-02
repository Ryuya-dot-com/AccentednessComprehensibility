#!/usr/bin/env python3
"""Build OSF-oriented old-to-new stimulus path crosswalks.

This script does not rename any files. It creates CSV tables that can be
reviewed before a separate rename/copy step.
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".aif", ".aiff", ".ogg", ".webm"}

PRODUCTION_RE = re.compile(
    r"^(?P<speaker>[ecj]\d+)_"
    r"(?P<language>english|japanese|chinese)_"
    r"pass(?P<pass_number>\d+)_"
    r"(?P<original_pronunciation_label>.+?)_"
    r"word(?P<word_number>\d{3})_"
    r"(?P<target_word>.+?)_"
    r"take(?P<take_number>\d+)_"
    r"trial(?P<trial_number>\d+)_"
    r"talker_(?P<talker>.+)$",
    re.IGNORECASE,
)

CALIBRATION_RE = re.compile(
    r"^(?P<l1>ENG|JPN|CHN)_(?P<gender>Male|Female)_(?P<target_word>[A-Za-z]+)(?:_Practice)?$",
    re.IGNORECASE,
)

ELEVENLABS_RE = re.compile(
    r"^(?P<target_word>[A-Za-z]+)__(?P<voice_variant>[A-Za-z0-9_]+)$",
)

L1_BY_TOP_FOLDER = {
    "ENG": "eng",
    "JPN": "jpn",
    "CHN": "chn",
}

LANGUAGE_BY_L1 = {
    "eng": "english",
    "jpn": "japanese",
    "chn": "chinese",
}


def slug(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value.strip().lower())
    return re.sub(r"_+", "_", cleaned).strip("_")


def normalize_pronunciation(label: str) -> tuple[str, str]:
    normalized = slug(label)
    if normalized in {"natural_english", "clear_english"}:
        note = "clear_english collapsed to natural" if normalized == "clear_english" else ""
        return "natural", note
    if normalized in {
        "intermediate_accent",
        "japanese_accented_english",
        "chinese_accented_english",
    }:
        note = (
            "intermediate_accent collapsed to accented"
            if normalized == "intermediate_accent"
            else ""
        )
        return "accented", note
    return "review", f"unrecognized pronunciation label: {label}"


def speaker_sort_key(value: str) -> tuple[str, int, str]:
    match = re.search(r"(\d+)", value)
    return (value[:1], int(match.group(1)) if match else 0, value)


def build_speaker_map(stimuli_root: Path) -> dict[tuple[str, str], str]:
    speakers: dict[str, set[str]] = defaultdict(set)
    for path in sorted(stimuli_root.rglob("*.wav")):
        rel = path.relative_to(stimuli_root).as_posix()
        parts = rel.split("/")
        if parts[0] not in L1_BY_TOP_FOLDER:
            continue
        match = PRODUCTION_RE.match(path.stem)
        if not match:
            continue
        speakers[parts[0]].add(slug(match.group("speaker")))

    prefixes = {"ENG": "eng", "JPN": "jpn", "CHN": "chn"}
    speaker_map: dict[tuple[str, str], str] = {}
    for l1 in ["ENG", "JPN", "CHN"]:
        for index, old_speaker in enumerate(sorted(speakers[l1], key=speaker_sort_key), start=1):
            speaker_map[(l1, old_speaker)] = f"{prefixes[l1]}_s{index:02d}"
    return speaker_map


def production_row(
    path: Path,
    rel: str,
    speaker_map: dict[tuple[str, str], str],
) -> dict[str, str] | None:
    parts = Path(rel).parts
    if len(parts) < 3 or parts[0] not in L1_BY_TOP_FOLDER:
        return None

    match = PRODUCTION_RE.match(path.stem)
    l1 = L1_BY_TOP_FOLDER[parts[0]]
    row = base_row(rel, "main")
    row["l1_condition"] = l1.upper()
    row["standard_l1_folder"] = l1

    if not match:
        row["parse_status"] = "unparsed"
        row["new_relative_path"] = f"main/{l1}/review/unparsed/{slug(path.stem)}{path.suffix.lower()}"
        row["notes"] = "production filename did not match parser"
        return row

    data = match.groupdict()
    original_label = slug(data["original_pronunciation_label"])
    pronunciation, note = normalize_pronunciation(original_label)
    old_speaker = slug(data["speaker"])
    proposed_speaker = speaker_map.get((parts[0], old_speaker), old_speaker)
    pass_number = data["pass_number"].zfill(2)
    word_number = data["word_number"].zfill(3)
    target_word = slug(data["target_word"])
    take_number = data["take_number"].zfill(2)
    trial_number = data["trial_number"].zfill(4)
    talker = slug(data["talker"])

    new_file = (
        f"{proposed_speaker}_{pronunciation}_pass{pass_number}_"
        f"word{word_number}_{target_word}_take{take_number}_"
        f"trial{trial_number}.wav"
    )
    row.update(
        {
            "parse_status": "parsed",
            "new_relative_path": f"main/{l1}/{pronunciation}/{proposed_speaker}/{new_file}",
            "speaker_id": proposed_speaker,
            "old_speaker_id": old_speaker.upper(),
            "old_speaker_id_normalized": old_speaker,
            "proposed_speaker_id": proposed_speaker,
            "source_language_label": slug(data["language"]),
            "source_pass_number": pass_number,
            "original_pronunciation_label": original_label,
            "pronunciation_condition": pronunciation,
            "word_number": word_number,
            "target_word": target_word,
            "take_number": take_number,
            "trial_number": trial_number,
            "talker_label": talker,
            "include_in_two_condition_design": "yes" if pronunciation in {"natural", "accented"} else "review",
            "notes": note,
        }
    )
    if LANGUAGE_BY_L1.get(l1) != row["source_language_label"]:
        row["notes"] = "; ".join(
            filter(None, [row["notes"], "top-level L1 and filename language differ"])
        )
    return row


def calibration_row(path: Path, rel: str) -> dict[str, str] | None:
    if not rel.startswith("Practice&Calibration/"):
        return None
    row = base_row(rel, "practice_calibration")
    match = CALIBRATION_RE.match(path.stem)
    if not match:
        row["parse_status"] = "unparsed"
        row["new_relative_path"] = f"practice/calibration/unparsed/{slug(path.stem)}{path.suffix.lower()}"
        row["notes"] = "practice/calibration filename did not match parser"
        return row

    l1 = slug(match.group("l1"))
    gender = slug(match.group("gender"))
    target_word = slug(match.group("target_word"))
    row.update(
        {
            "parse_status": "parsed",
            "new_relative_path": f"practice/calibration/{l1}_{gender}_{target_word}_practice{path.suffix.lower()}",
            "l1_condition": l1.upper(),
            "standard_l1_folder": l1,
            "target_word": target_word,
            "talker_label": gender,
            "include_in_two_condition_design": "practice",
        }
    )
    return row


def elevenlabs_row(path: Path, rel: str) -> dict[str, str] | None:
    if not rel.startswith("Practice_ElevenLabs/"):
        return None
    row = base_row(rel, "practice_elevenlabs")
    match = ELEVENLABS_RE.match(path.stem)
    if not match:
        row["parse_status"] = "unparsed"
        row["new_relative_path"] = f"practice/elevenlabs/unparsed/{slug(path.stem)}{path.suffix.lower()}"
        row["notes"] = "ElevenLabs filename did not match parser"
        return row

    target_word = slug(match.group("target_word"))
    voice_variant = slug(match.group("voice_variant"))
    variant_l1 = voice_variant.split("_", 1)[0]
    l1 = {"eng": "ENG", "jpn": "JPN", "chn": "CHN"}.get(variant_l1, "")
    row.update(
        {
            "parse_status": "parsed",
            "new_relative_path": f"practice/elevenlabs/{voice_variant}/{target_word}__{voice_variant}{path.suffix.lower()}",
            "l1_condition": l1,
            "standard_l1_folder": l1.lower() if l1 else "",
            "target_word": target_word,
            "talker_label": voice_variant,
            "include_in_two_condition_design": "practice_candidate",
        }
    )
    return row


def base_row(rel: str, stimulus_set: str) -> dict[str, str]:
    return {
        "stimulus_set": stimulus_set,
        "old_relative_path": rel,
        "new_relative_path": "",
        "parse_status": "",
        "l1_condition": "",
        "standard_l1_folder": "",
        "speaker_id": "",
        "old_speaker_id": "",
        "old_speaker_id_normalized": "",
        "proposed_speaker_id": "",
        "source_language_label": "",
        "source_pass_number": "",
        "original_pronunciation_label": "",
        "pronunciation_condition": "",
        "word_number": "",
        "target_word": "",
        "take_number": "",
        "trial_number": "",
        "talker_label": "",
        "include_in_two_condition_design": "",
        "notes": "",
    }


def make_row(
    path: Path,
    stimuli_root: Path,
    speaker_map: dict[tuple[str, str], str],
) -> dict[str, str]:
    rel = path.relative_to(stimuli_root).as_posix()
    row = production_row(path, rel, speaker_map)
    if row is not None:
        return row
    for builder in (calibration_row, elevenlabs_row):
        row = builder(path, rel)
        if row is not None:
            return row

    row = base_row(rel, "other_audio")
    row["parse_status"] = "unparsed"
    row["new_relative_path"] = f"other_audio/unparsed/{slug(path.stem)}{path.suffix.lower()}"
    row["notes"] = "audio file outside known stimulus folders"
    return row


def folder_rows(file_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    pairs = {}
    for row in file_rows:
        old_folder = str(Path(row["old_relative_path"]).parent).replace(".", "")
        new_folder = str(Path(row["new_relative_path"]).parent).replace(".", "")
        key = (old_folder, new_folder)
        pairs.setdefault(
            key,
            {
                "old_relative_folder": old_folder,
                "new_relative_folder": new_folder,
                "file_count": 0,
                "stimulus_sets": set(),
                "l1_conditions": set(),
                "pronunciation_conditions": set(),
                "notes": set(),
            },
        )
        item = pairs[key]
        item["file_count"] += 1
        for source, target in [
            ("stimulus_set", "stimulus_sets"),
            ("l1_condition", "l1_conditions"),
            ("pronunciation_condition", "pronunciation_conditions"),
            ("notes", "notes"),
        ]:
            value = row.get(source, "")
            if value:
                item[target].add(value)

    output = []
    for item in pairs.values():
        output.append(
            {
                "old_relative_folder": item["old_relative_folder"],
                "new_relative_folder": item["new_relative_folder"],
                "file_count": item["file_count"],
                "stimulus_sets": ";".join(sorted(item["stimulus_sets"])),
                "l1_conditions": ";".join(sorted(item["l1_conditions"])),
                "pronunciation_conditions": ";".join(sorted(item["pronunciation_conditions"])),
                "notes": "; ".join(sorted(item["notes"])),
            }
        )
    return sorted(output, key=lambda row: (row["old_relative_folder"], row["new_relative_folder"]))


def counter_summary(counter: Counter) -> str:
    return ";".join(f"{key}:{value}" for key, value in sorted(counter.items()))


def speaker_rows(file_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    speakers = {}
    for row in file_rows:
        if row["stimulus_set"] != "main" or not row.get("proposed_speaker_id"):
            continue
        key = (row["l1_condition"], row["old_speaker_id"], row["proposed_speaker_id"])
        speakers.setdefault(
            key,
            {
                "l1_condition": row["l1_condition"],
                "old_speaker_id": row["old_speaker_id"],
                "proposed_speaker_id": row["proposed_speaker_id"],
                "old_folders": set(),
                "new_speaker_folders": set(),
                "file_count": 0,
                "word_numbers": set(),
                "source_pass_counts": Counter(),
                "pronunciation_counts": Counter(),
                "original_pronunciation_label_counts": Counter(),
                "talker_label_counts": Counter(),
            },
        )
        item = speakers[key]
        item["old_folders"].add(str(Path(row["old_relative_path"]).parent))
        item["new_speaker_folders"].add(str(Path(row["new_relative_path"]).parent))
        item["file_count"] += 1
        if row["word_number"]:
            item["word_numbers"].add(int(row["word_number"]))
        if row["source_pass_number"]:
            item["source_pass_counts"][row["source_pass_number"]] += 1
        if row["pronunciation_condition"]:
            item["pronunciation_counts"][row["pronunciation_condition"]] += 1
        if row["original_pronunciation_label"]:
            item["original_pronunciation_label_counts"][row["original_pronunciation_label"]] += 1
        if row["talker_label"]:
            item["talker_label_counts"][row["talker_label"]] += 1

    l1_rank = {"ENG": 0, "JPN": 1, "CHN": 2}
    sorted_items = sorted(
        speakers.values(),
        key=lambda item: (l1_rank.get(item["l1_condition"], 99), item["proposed_speaker_id"]),
    )
    output = []
    for global_index, item in enumerate(sorted_items, start=1):
        missing = [str(number) for number in range(1, 51) if number not in item["word_numbers"]]
        output.append(
            {
                "global_speaker_id": f"spk{global_index:03d}",
                "l1_condition": item["l1_condition"],
                "old_speaker_id": item["old_speaker_id"],
                "proposed_speaker_id": item["proposed_speaker_id"],
                "old_folders": ";".join(sorted(item["old_folders"])),
                "new_speaker_folders": ";".join(sorted(item["new_speaker_folders"])),
                "file_count": item["file_count"],
                "word_count": len(item["word_numbers"]),
                "missing_word_numbers": ";".join(missing),
                "source_pass_counts": counter_summary(item["source_pass_counts"]),
                "pronunciation_counts": counter_summary(item["pronunciation_counts"]),
                "original_pronunciation_label_counts": counter_summary(
                    item["original_pronunciation_label_counts"],
                ),
                "talker_label_counts": counter_summary(item["talker_label_counts"]),
                "notes": "old IDs are non-contiguous original recording IDs; proposed IDs are sequential within L1",
            }
        )
    return output


def write_csv(path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--stimuli-root",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "Stimuli",
        help="Stimuli directory to scan.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for CSV files. Defaults to stimuli root.",
    )
    parser.add_argument(
        "--date",
        default=datetime.now().strftime("%Y%m%d"),
        help="Date suffix for output filenames.",
    )
    args = parser.parse_args()

    stimuli_root = args.stimuli_root.expanduser().resolve()
    out_dir = (args.out_dir or stimuli_root).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    audio_paths = sorted(
        path
        for path in stimuli_root.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_EXTENSIONS
    )
    speaker_map = build_speaker_map(stimuli_root)
    rows = [make_row(path, stimuli_root, speaker_map) for path in audio_paths]

    new_path_counts = Counter(row["new_relative_path"] for row in rows)
    for row in rows:
        if new_path_counts[row["new_relative_path"]] > 1:
            row["notes"] = "; ".join(
                filter(None, [row["notes"], "duplicate proposed new path"])
            )

    file_fields = list(base_row("", "").keys())
    file_crosswalk = out_dir / f"osf_stimuli_file_rename_crosswalk_{args.date}.csv"
    write_csv(file_crosswalk, rows, file_fields)

    folders = folder_rows(rows)
    folder_fields = [
        "old_relative_folder",
        "new_relative_folder",
        "file_count",
        "stimulus_sets",
        "l1_conditions",
        "pronunciation_conditions",
        "notes",
    ]
    folder_crosswalk = out_dir / f"osf_stimuli_folder_rename_crosswalk_{args.date}.csv"
    write_csv(folder_crosswalk, folders, folder_fields)

    speakers = speaker_rows(rows)
    speaker_fields = [
        "global_speaker_id",
        "l1_condition",
        "old_speaker_id",
        "proposed_speaker_id",
        "old_folders",
        "new_speaker_folders",
        "file_count",
        "word_count",
        "missing_word_numbers",
        "source_pass_counts",
        "pronunciation_counts",
        "original_pronunciation_label_counts",
        "talker_label_counts",
        "notes",
    ]
    speaker_crosswalk = out_dir / f"osf_speaker_id_crosswalk_{args.date}.csv"
    write_csv(speaker_crosswalk, speakers, speaker_fields)

    status_counts = Counter(row["parse_status"] for row in rows)
    set_counts = Counter(row["stimulus_set"] for row in rows)
    condition_counts = Counter(
        (row["l1_condition"], row["pronunciation_condition"])
        for row in rows
        if row["stimulus_set"] == "main"
    )
    print(f"stimuli_root: {stimuli_root}")
    print(f"audio_files: {len(rows)}")
    print(f"file_crosswalk: {file_crosswalk}")
    print(f"folder_crosswalk: {folder_crosswalk}")
    print(f"speaker_crosswalk: {speaker_crosswalk}")
    print(f"parse_status: {dict(sorted(status_counts.items()))}")
    print(f"stimulus_sets: {dict(sorted(set_counts.items()))}")
    print("main_condition_counts:")
    for key, value in sorted(condition_counts.items()):
        print(f"  {key[0]}/{key[1]}: {value}")
    duplicate_count = sum(1 for count in new_path_counts.values() if count > 1)
    print(f"duplicate_new_paths: {duplicate_count}")
    return 1 if duplicate_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
