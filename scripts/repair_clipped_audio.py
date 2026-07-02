#!/usr/bin/env python3
"""Create documented repair candidates for clipped audio without overwriting sources."""

from __future__ import annotations

import argparse
import csv
import hashlib
import math
from pathlib import Path

import numpy as np
import soundfile as sf


DEFAULT_PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "Stimuli_OSF_Release_20260703"
DEFAULT_AUDIO_QC = DEFAULT_PACKAGE_ROOT / "metadata" / "audio_qc_by_file.csv"
DEFAULT_OUT_DIR = DEFAULT_PACKAGE_ROOT / "metadata" / "audio_repair_candidates"
DEFAULT_CLIPPED_RELATIVE_PATH = (
    "main/jpn/natural/jpn_s06/"
    "jpn_s06_natural_pass01_word018_capelin_take04_trial0018.wav"
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dbfs(value: float) -> float:
    return 20.0 * math.log10(value) if value > 0 else float("-inf")


def rms_dbfs(samples: np.ndarray) -> float:
    flat = samples.reshape(-1)
    rms = float(np.sqrt(np.mean(flat * flat))) if flat.size else 0.0
    return dbfs(rms)


def contiguous_runs(indexes: np.ndarray) -> list[tuple[int, int]]:
    if indexes.size == 0:
        return []
    runs: list[tuple[int, int]] = []
    start = int(indexes[0])
    previous = int(indexes[0])
    for value in indexes[1:]:
        current = int(value)
        if current == previous + 1:
            previous = current
            continue
        runs.append((start, previous))
        start = current
        previous = current
    runs.append((start, previous))
    return runs


def interpolate_clipped(samples: np.ndarray, clip_abs: float) -> tuple[np.ndarray, list[dict[str, str]]]:
    repaired = samples.copy()
    one_dimensional = repaired.ndim == 1
    if one_dimensional:
        repaired = repaired[:, None]
    repair_rows: list[dict[str, str]] = []
    frame_count, channel_count = repaired.shape

    for channel in range(channel_count):
        channel_samples = repaired[:, channel]
        clipped = np.flatnonzero(np.abs(channel_samples) >= clip_abs)
        for start, end in contiguous_runs(clipped):
            left = start - 1
            while left >= 0 and abs(channel_samples[left]) >= clip_abs:
                left -= 1
            right = end + 1
            while right < frame_count and abs(channel_samples[right]) >= clip_abs:
                right += 1

            if left >= 0 and right < frame_count:
                replacement = np.linspace(
                    channel_samples[left],
                    channel_samples[right],
                    end - start + 3,
                    dtype=np.float64,
                )[1:-1]
            elif left >= 0:
                replacement = np.full(end - start + 1, channel_samples[left], dtype=np.float64)
            elif right < frame_count:
                replacement = np.full(end - start + 1, channel_samples[right], dtype=np.float64)
            else:
                replacement = np.zeros(end - start + 1, dtype=np.float64)

            original_peak = float(np.max(np.abs(channel_samples[start : end + 1])))
            channel_samples[start : end + 1] = replacement
            repair_rows.append(
                {
                    "channel": str(channel + 1),
                    "start_frame": str(start),
                    "end_frame": str(end),
                    "sample_count": str(end - start + 1),
                    "original_peak_abs": f"{original_peak:.8f}",
                    "replacement_peak_abs": f"{float(np.max(np.abs(replacement))):.8f}",
                    "left_frame": str(left) if left >= 0 else "",
                    "right_frame": str(right) if right < frame_count else "",
                }
            )

    return (repaired[:, 0] if one_dimensional else repaired), repair_rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-root", type=Path, default=DEFAULT_PACKAGE_ROOT)
    parser.add_argument("--audio-qc", type=Path, default=DEFAULT_AUDIO_QC)
    parser.add_argument("--relative-path", default=DEFAULT_CLIPPED_RELATIVE_PATH)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--clip-abs", type=float, default=0.999)
    args = parser.parse_args()

    package_root = args.package_root.expanduser().resolve()
    relative_path = args.relative_path
    source = package_root / relative_path
    if not source.exists():
        raise SystemExit(f"Source does not exist: {source}")
    qc_rows = read_csv(args.audio_qc.expanduser().resolve())
    qc_row = next((row for row in qc_rows if row.get("relative_path") == relative_path), {})
    out_dir = args.out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    destination = out_dir / source.name.replace(".wav", "__linear_declip_candidate.wav")

    samples, sample_rate = sf.read(source, dtype="float64", always_2d=False)
    repaired, repair_rows = interpolate_clipped(samples, args.clip_abs)
    sf.write(destination, repaired, sample_rate, subtype="PCM_16")

    original_peak = float(np.max(np.abs(samples)))
    repaired_peak = float(np.max(np.abs(repaired)))
    summary = {
        "source_relative_path": relative_path,
        "candidate_file": str(destination),
        "target_word": qc_row.get("target_word", ""),
        "counterbalance_word_number": qc_row.get("counterbalance_word_number", qc_row.get("word_number", "")),
        "source_word_number": qc_row.get("source_word_number", ""),
        "l1_condition": qc_row.get("l1_condition", ""),
        "pronunciation_condition": qc_row.get("pronunciation_condition", ""),
        "participant_id": qc_row.get("participant_id", ""),
        "sample_rate_hz": str(sample_rate),
        "repair_method": "linear interpolation across contiguous full-scale sample runs",
        "full_scale_runs": str(len(repair_rows)),
        "full_scale_sample_count": str(sum(int(row["sample_count"]) for row in repair_rows)),
        "original_peak_abs": f"{original_peak:.8f}",
        "repaired_peak_abs": f"{repaired_peak:.8f}",
        "original_rms_dbfs": f"{rms_dbfs(samples):.3f}",
        "repaired_rms_dbfs": f"{rms_dbfs(repaired):.3f}",
        "source_sha256": sha256_file(source),
        "candidate_sha256": sha256_file(destination),
        "manifest_action": "not_applied_review_candidate_only",
    }
    summary_path = out_dir / "audio_repair_candidate_summary.csv"
    detail_path = out_dir / "audio_repair_candidate_detail.csv"
    write_csv(summary_path, [summary], list(summary.keys()))
    write_csv(
        detail_path,
        repair_rows,
        [
            "channel",
            "start_frame",
            "end_frame",
            "sample_count",
            "original_peak_abs",
            "replacement_peak_abs",
            "left_frame",
            "right_frame",
        ],
    )
    readme = out_dir / "README.md"
    readme.write_text(
        "\n".join(
            [
                "# Audio Repair Candidate",
                "",
                "This directory contains a review-only candidate for the clipped production stimulus.",
                "The original OSF package audio and production manifest have not been overwritten.",
                "",
                f"- Source: `{relative_path}`",
                f"- Candidate: `{destination.name}`",
                "- Method: linear interpolation across contiguous full-scale sample runs.",
                f"- Full-scale sample count repaired: {summary['full_scale_sample_count']}",
                f"- Original peak abs: {summary['original_peak_abs']}",
                f"- Repaired peak abs: {summary['repaired_peak_abs']}",
                "",
                "Researcher listening review is required before this candidate is used in the production manifest.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"candidate: {destination}")
    print(f"summary: {summary_path}")
    print(f"detail: {detail_path}")
    print(f"full_scale_sample_count: {summary['full_scale_sample_count']}")
    print(f"original_peak_abs: {summary['original_peak_abs']}")
    print(f"repaired_peak_abs: {summary['repaired_peak_abs']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
