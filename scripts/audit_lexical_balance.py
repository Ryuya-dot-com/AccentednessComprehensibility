#!/usr/bin/env python3
"""Audit lexical balance for counterbalance pronunciation styles a and b."""

from __future__ import annotations

import argparse
import csv
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, stdev
from typing import Any

try:
    from wordfreq import zipf_frequency
except Exception:  # pragma: no cover - optional local dependency.
    zipf_frequency = None

try:
    import cmudict
except Exception:  # pragma: no cover - optional local dependency.
    cmudict = None


REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKAGE_ROOT = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
DEFAULT_MANIFEST = DEFAULT_PACKAGE_ROOT / "remote_manifest.csv"
DEFAULT_LIST_SPECS = REPO_ROOT / "counterbalance_list_specs.csv"
DEFAULT_OUT_DIR = DEFAULT_PACKAGE_ROOT / "metadata"
LIST_COMBINATIONS = [
    "ABCD",
    "BCDE",
    "CDEF",
    "DEFG",
    "EFGH",
    "FGHI",
    "GHIJ",
    "HIJA",
    "IJAB",
    "JABC",
]
L1_ORDER = ["ENG", "JPN", "CHN"]
METRIC_COLUMNS = [
    "letters",
    "zipf_frequency_en",
    "cmu_syllable_count",
    "heuristic_syllable_count",
    "phoneme_count",
    "orthographic_vowel_count",
    "orthographic_consonant_count",
    "max_orthographic_consonant_cluster",
    "neighborhood_density",
    "concreteness",
    "familiarity",
    "loanword_japanese",
    "loanword_chinese",
]
WORD_METRIC_COLUMNS = [
    "word_number",
    "target_word",
    *METRIC_COLUMNS,
    "cmudict_found",
    "metadata_source",
]
SLOT_COLUMNS = [
    "scope",
    "counterbalance_cell",
    "list_comb",
    "block_index",
    "stimulus_list",
    "pronunciation_style",
    "l1_condition",
    "pronunciation_condition",
    "local_position_within_l1",
    "slot_parity_within_l1",
    "list_word_position",
    "word_number",
    "target_word",
    *METRIC_COLUMNS,
]
SUMMARY_BASE_COLUMNS = [
    "scope",
    "summary_type",
    "counterbalance_cell",
    "block_index",
    "stimulus_list",
    "pronunciation_style",
    "l1_condition",
    "pronunciation_condition",
    "slot_parity_within_l1",
    "row_count",
    "unique_word_count",
]
PAIRWISE_COLUMNS = [
    "scope",
    "contrast",
    "l1_condition",
    "pronunciation_style",
    "metric",
    "group_a",
    "n_a",
    "mean_a",
    "sd_a",
    "group_b",
    "n_b",
    "mean_b",
    "sd_b",
    "mean_diff_a_minus_b",
    "standardized_diff",
    "imbalance_flag",
]
MISSING_COLUMNS = [
    "word_number",
    "target_word",
    "missing_cmudict",
    "missing_neighborhood_density",
    "missing_concreteness",
    "missing_familiarity",
    "missing_loanword_japanese",
    "missing_loanword_chinese",
    "notes",
]


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def fmt(value: Any, digits: int = 6) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return ""
        return f"{value:.{digits}f}"
    return str(value)


def parse_range_part(part: str) -> list[int]:
    text = part.strip()
    if not text:
        return []
    if "-" in text:
        start, end = [int(value.strip()) for value in text.split("-", 1)]
        return list(range(start, end + 1))
    return [int(text)]


def parse_number_spec(value: str) -> list[int]:
    numbers: list[int] = []
    for part in str(value or "").split(","):
        numbers.extend(parse_range_part(part))
    return numbers


def read_list_specs(path: Path) -> dict[str, dict[str, list[int]]]:
    specs: dict[str, dict[str, list[int]]] = {}
    for row in read_csv(path):
        stimulus_list = row.get("stimulus_list", "").strip().upper()
        if not stimulus_list:
            continue
        specs[stimulus_list] = {
            "ENG": parse_number_spec(row.get("eng_word_numbers", "")),
            "JPN": parse_number_spec(row.get("jpn_word_numbers", "")),
            "CHN": parse_number_spec(row.get("chn_word_numbers", "")),
        }
    return specs


def target_words_from_manifest(path: Path) -> tuple[dict[int, str], list[str]]:
    words: dict[int, str] = {}
    conflicts: list[str] = []
    for row in read_csv(path):
        try:
            word_number = int(row.get("word_number", ""))
        except ValueError:
            continue
        word = row.get("target_word", "").strip().lower()
        if not word:
            continue
        if word_number in words and words[word_number] != word:
            conflicts.append(f"word {word_number}: {words[word_number]} vs {word}")
        words[word_number] = word
    return words, conflicts


def cmu_entries() -> dict[str, list[list[str]]]:
    if cmudict is None:
        return {}
    try:
        return cmudict.dict()
    except Exception:
        return {}


def syllables_from_cmu(phones: list[str]) -> int:
    return sum(1 for phone in phones if any(ch.isdigit() for ch in phone))


def heuristic_syllables(word: str) -> int:
    text = re.sub(r"[^a-z]", "", word.lower())
    if not text:
        return 0
    groups = re.findall(r"[aeiouy]+", text)
    count = len(groups)
    if text.endswith("e") and count > 1 and not text.endswith(("le", "ue")):
        count -= 1
    return max(1, count)


def max_consonant_cluster(word: str) -> int:
    clusters = re.findall(r"[^aeiouy\\W\\d_]+", word.lower())
    return max((len(cluster) for cluster in clusters), default=0)


def load_external_metadata(path: Path | None) -> dict[str, dict[str, str]]:
    if not path:
        return {}
    rows = read_csv(path.expanduser().resolve())
    indexed: dict[str, dict[str, str]] = {}
    for row in rows:
        keys = [
            row.get("word_number", "").strip(),
            row.get("target_word", "").strip().lower(),
            row.get("word", "").strip().lower(),
        ]
        for key in keys:
            if key:
                indexed[key] = row
    return indexed


def external_value(metadata: dict[str, str], names: list[str]) -> str:
    for name in names:
        if metadata.get(name, "").strip():
            return metadata[name].strip()
    return ""


def word_metrics(
    words: dict[int, str],
    external_metadata: dict[str, dict[str, str]],
    cmu: dict[str, list[list[str]]],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for word_number in sorted(words):
        word = words[word_number]
        alpha = re.sub(r"[^a-z]", "", word.lower())
        phones = (cmu.get(alpha) or [[]])[0]
        syllable_count = syllables_from_cmu(phones) if phones else None
        metadata = external_metadata.get(str(word_number)) or external_metadata.get(word.lower()) or {}
        row = {
            "word_number": str(word_number),
            "target_word": word,
            "letters": str(len(alpha)),
            "zipf_frequency_en": fmt(zipf_frequency(word, "en") if zipf_frequency else None, 3),
            "cmu_syllable_count": fmt(syllable_count, 0),
            "heuristic_syllable_count": str(heuristic_syllables(word)),
            "phoneme_count": str(len(phones)) if phones else "",
            "orthographic_vowel_count": str(sum(1 for ch in alpha if ch in "aeiouy")),
            "orthographic_consonant_count": str(sum(1 for ch in alpha if ch not in "aeiouy")),
            "max_orthographic_consonant_cluster": str(max_consonant_cluster(alpha)),
            "neighborhood_density": external_value(metadata, ["neighborhood_density", "density"]),
            "concreteness": external_value(metadata, ["concreteness", "concreteness_rating"]),
            "familiarity": external_value(metadata, ["familiarity", "familiarity_rating"]),
            "loanword_japanese": external_value(metadata, ["loanword_japanese", "japanese_loanword", "jp_loanword"]),
            "loanword_chinese": external_value(metadata, ["loanword_chinese", "chinese_loanword", "cn_loanword"]),
            "cmudict_found": "1" if phones else "0",
            "metadata_source": "external_csv" if metadata else "computed_local",
        }
        rows.append(row)
    return rows


def expected_pronunciation(l1: str, local_position_index: int, style: str) -> str:
    if l1 == "ENG":
        return "natural"
    even_position = local_position_index % 2 == 0
    even_position_natural = style == "a"
    return "natural" if even_position == even_position_natural else "accented"


def build_unique_slots(
    specs: dict[str, dict[str, list[int]]],
    metrics_by_word: dict[int, dict[str, str]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for style in ["a", "b"]:
        for stimulus_list in sorted(specs):
            list_position = 0
            for l1 in L1_ORDER:
                for local_index, word_number in enumerate(specs[stimulus_list][l1]):
                    list_position += 1
                    metrics = metrics_by_word[word_number]
                    row = {
                        "scope": "unique_list_slots",
                        "counterbalance_cell": "",
                        "list_comb": "",
                        "block_index": "",
                        "stimulus_list": stimulus_list,
                        "pronunciation_style": style,
                        "l1_condition": l1,
                        "pronunciation_condition": expected_pronunciation(l1, local_index, style),
                        "local_position_within_l1": str(local_index + 1),
                        "slot_parity_within_l1": "odd" if local_index % 2 == 0 else "even",
                        "list_word_position": str(list_position),
                        "word_number": str(word_number),
                        "target_word": metrics["target_word"],
                    }
                    row.update({metric: metrics.get(metric, "") for metric in METRIC_COLUMNS})
                    rows.append(row)
    return rows


def build_cell_weighted_slots(unique_slots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_style_list: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in unique_slots:
        by_style_list[(row["pronunciation_style"], row["stimulus_list"])].append(row)

    rows: list[dict[str, Any]] = []
    for index, list_comb in enumerate(LIST_COMBINATIONS):
        for style_offset, style in [(0, "a"), (10, "b")]:
            cell_id = index + 1 + style_offset
            for block_index, stimulus_list in enumerate(list_comb, start=1):
                for row in by_style_list[(style, stimulus_list)]:
                    copied = dict(row)
                    copied.update(
                        {
                            "scope": "cell_weighted",
                            "counterbalance_cell": str(cell_id),
                            "list_comb": list_comb,
                            "block_index": str(block_index),
                        }
                    )
                    rows.append(copied)
    return rows


def numeric(row: dict[str, Any], key: str) -> float | None:
    value = row.get(key, "")
    if value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def summarize_group(rows: list[dict[str, Any]], base: dict[str, str]) -> dict[str, str]:
    out = dict(base)
    out["row_count"] = str(len(rows))
    out["unique_word_count"] = str(len({row.get("word_number", "") for row in rows}))
    for metric in METRIC_COLUMNS:
        values = [value for value in (numeric(row, metric) for row in rows) if value is not None]
        out[f"{metric}_n"] = str(len(values))
        out[f"{metric}_mean"] = fmt(mean(values) if values else None, 6)
        out[f"{metric}_sd"] = fmt(stdev(values) if len(values) > 1 else 0.0 if values else None, 6)
        out[f"{metric}_min"] = fmt(min(values) if values else None, 6)
        out[f"{metric}_max"] = fmt(max(values) if values else None, 6)
    return out


def group_rows(rows: list[dict[str, Any]], keys: list[str]) -> dict[tuple[str, ...], list[dict[str, Any]]]:
    grouped: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[tuple(str(row.get(key, "")) for key in keys)].append(row)
    return grouped


def build_summary(rows: list[dict[str, Any]]) -> tuple[list[dict[str, str]], list[str]]:
    definitions = [
        ("style_l1_pronunciation", ["scope", "pronunciation_style", "l1_condition", "pronunciation_condition"]),
        ("l1_pronunciation_all_styles", ["scope", "l1_condition", "pronunciation_condition"]),
        ("slot_parity_l1", ["scope", "l1_condition", "slot_parity_within_l1"]),
        ("list_style_l1_pronunciation", ["scope", "stimulus_list", "pronunciation_style", "l1_condition", "pronunciation_condition"]),
        ("block_l1_pronunciation", ["scope", "block_index", "l1_condition", "pronunciation_condition"]),
    ]
    summary: list[dict[str, str]] = []
    for summary_type, keys in definitions:
        for values, group in sorted(group_rows(rows, keys).items()):
            if summary_type.startswith("block_") and values[0] != "cell_weighted":
                continue
            base = {column: "" for column in SUMMARY_BASE_COLUMNS}
            base["scope"] = values[0]
            base["summary_type"] = summary_type
            for key, value in zip(keys, values):
                base[key] = value
            summary.append(summarize_group(group, base))
    columns = SUMMARY_BASE_COLUMNS[:]
    for metric in METRIC_COLUMNS:
        columns.extend(
            [
                f"{metric}_n",
                f"{metric}_mean",
                f"{metric}_sd",
                f"{metric}_min",
                f"{metric}_max",
            ]
        )
    return summary, columns


def stats(values: list[float]) -> tuple[int, float | None, float | None]:
    if not values:
        return 0, None, None
    return len(values), mean(values), stdev(values) if len(values) > 1 else 0.0


def add_pairwise(
    rows: list[dict[str, Any]],
    out: list[dict[str, str]],
    scope: str,
    contrast: str,
    l1: str,
    style: str,
    group_a_label: str,
    group_b_label: str,
    group_a: list[dict[str, Any]],
    group_b: list[dict[str, Any]],
    flag_threshold: float,
) -> None:
    del rows
    for metric in METRIC_COLUMNS:
        a_values = [value for value in (numeric(row, metric) for row in group_a) if value is not None]
        b_values = [value for value in (numeric(row, metric) for row in group_b) if value is not None]
        n_a, mean_a, sd_a = stats(a_values)
        n_b, mean_b, sd_b = stats(b_values)
        if mean_a is None or mean_b is None:
            diff = None
            std_diff = None
        else:
            diff = mean_a - mean_b
            pooled = math.sqrt(((sd_a or 0.0) ** 2 + (sd_b or 0.0) ** 2) / 2.0)
            std_diff = diff / pooled if pooled else 0.0
        out.append(
            {
                "scope": scope,
                "contrast": contrast,
                "l1_condition": l1,
                "pronunciation_style": style,
                "metric": metric,
                "group_a": group_a_label,
                "n_a": str(n_a),
                "mean_a": fmt(mean_a, 6),
                "sd_a": fmt(sd_a, 6),
                "group_b": group_b_label,
                "n_b": str(n_b),
                "mean_b": fmt(mean_b, 6),
                "sd_b": fmt(sd_b, 6),
                "mean_diff_a_minus_b": fmt(diff, 6),
                "standardized_diff": fmt(std_diff, 6),
                "imbalance_flag": "1" if std_diff is not None and abs(std_diff) >= flag_threshold else "0",
            }
        )


def build_pairwise(rows: list[dict[str, Any]], flag_threshold: float) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for scope in ["unique_list_slots", "cell_weighted"]:
        scoped = [row for row in rows if row["scope"] == scope]
        for style in ["a", "b"]:
            styled = [row for row in scoped if row["pronunciation_style"] == style]
            for l1 in ["JPN", "CHN"]:
                add_pairwise(
                    styled,
                    out,
                    scope,
                    "natural_minus_accented_within_style",
                    l1,
                    style,
                    "natural",
                    "accented",
                    [row for row in styled if row["l1_condition"] == l1 and row["pronunciation_condition"] == "natural"],
                    [row for row in styled if row["l1_condition"] == l1 and row["pronunciation_condition"] == "accented"],
                    flag_threshold,
                )
        for l1 in ["JPN", "CHN"]:
            l1_rows = [row for row in scoped if row["l1_condition"] == l1]
            add_pairwise(
                l1_rows,
                out,
                scope,
                "odd_minus_even_local_position",
                l1,
                "",
                "odd",
                "even",
                [row for row in l1_rows if row["slot_parity_within_l1"] == "odd"],
                [row for row in l1_rows if row["slot_parity_within_l1"] == "even"],
                flag_threshold,
            )
    return out


def build_missing_metadata(word_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in word_rows:
        missing = {
            "word_number": row["word_number"],
            "target_word": row["target_word"],
            "missing_cmudict": "1" if row["cmudict_found"] != "1" else "0",
            "missing_neighborhood_density": "1" if not row["neighborhood_density"] else "0",
            "missing_concreteness": "1" if not row["concreteness"] else "0",
            "missing_familiarity": "1" if not row["familiarity"] else "0",
            "missing_loanword_japanese": "1" if not row["loanword_japanese"] else "0",
            "missing_loanword_chinese": "1" if not row["loanword_chinese"] else "0",
            "notes": "",
        }
        notes = []
        if missing["missing_cmudict"] == "1":
            notes.append("CMU pronunciation not found; syllables use heuristic proxy.")
        if any(missing[key] == "1" for key in missing if key.startswith("missing_loanword")):
            notes.append("Loanword/familiarity metadata require collaborator-supplied CSV.")
        missing["notes"] = " ".join(notes)
        rows.append(missing)
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--list-specs", type=Path, default=DEFAULT_LIST_SPECS)
    parser.add_argument("--lexical-metadata", type=Path)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--word-metrics-out", default="lexical_balance_word_metrics.csv")
    parser.add_argument("--unique-slots-out", default="lexical_balance_by_slot.csv")
    parser.add_argument("--cell-slots-out", default="lexical_balance_by_cell.csv")
    parser.add_argument("--summary-out", default="lexical_balance_summary.csv")
    parser.add_argument("--pairwise-out", default="lexical_balance_pairwise_differences.csv")
    parser.add_argument("--missing-out", default="lexical_balance_missing_metadata.csv")
    parser.add_argument("--imbalance-threshold", type=float, default=0.25)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = args.manifest.expanduser().resolve()
    list_specs_path = args.list_specs.expanduser().resolve()
    out_dir = args.out_dir.expanduser().resolve()
    words, conflicts = target_words_from_manifest(manifest)
    specs = read_list_specs(list_specs_path)
    missing_word_numbers = sorted(set(range(1, 51)) - set(words))
    if conflicts:
        raise SystemExit(f"Conflicting target words in manifest: {conflicts[:5]}")
    if missing_word_numbers:
        raise SystemExit(f"Manifest missing word numbers: {missing_word_numbers}")
    if set(specs) != set("ABCDEFGHIJ"):
        raise SystemExit("List specs must contain A-J.")

    external_metadata = load_external_metadata(args.lexical_metadata)
    word_rows = word_metrics(words, external_metadata, cmu_entries())
    metrics_by_word = {int(row["word_number"]): row for row in word_rows}
    unique_slots = build_unique_slots(specs, metrics_by_word)
    cell_slots = build_cell_weighted_slots(unique_slots)
    all_slots = unique_slots + cell_slots
    summary_rows, summary_columns = build_summary(all_slots)
    pairwise_rows = build_pairwise(all_slots, args.imbalance_threshold)
    missing_rows = build_missing_metadata(word_rows)

    write_csv(out_dir / args.word_metrics_out, word_rows, WORD_METRIC_COLUMNS)
    write_csv(out_dir / args.unique_slots_out, unique_slots, SLOT_COLUMNS)
    write_csv(out_dir / args.cell_slots_out, cell_slots, SLOT_COLUMNS)
    write_csv(out_dir / args.summary_out, summary_rows, summary_columns)
    write_csv(out_dir / args.pairwise_out, pairwise_rows, PAIRWISE_COLUMNS)
    write_csv(out_dir / args.missing_out, missing_rows, MISSING_COLUMNS)

    flagged = [row for row in pairwise_rows if row["imbalance_flag"] == "1"]
    flag_counts = Counter(row["metric"] for row in flagged)
    print(f"word metrics: {out_dir / args.word_metrics_out}")
    print(f"unique slots: {out_dir / args.unique_slots_out} ({len(unique_slots)} rows)")
    print(f"cell slots: {out_dir / args.cell_slots_out} ({len(cell_slots)} rows)")
    print(f"summary: {out_dir / args.summary_out}")
    print(f"pairwise: {out_dir / args.pairwise_out}")
    print(f"missing metadata: {out_dir / args.missing_out}")
    print(f"pairwise rows flagged at |d| >= {args.imbalance_threshold}: {len(flagged)}")
    for metric, count in flag_counts.most_common():
        print(f"flagged {metric}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
