#!/usr/bin/env python3
"""Audit acoustic properties for production and practice audio files."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import subprocess
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PACKAGE_ROOT = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
DEFAULT_APP_PRACTICE_ROOT = (
    REPO_ROOT
    / "practice_training_audio"
    / "elevenlabs_selected_chocolate_coffee_pizza_sofa_20260703"
)
AUDIO_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac"}
DETAIL_COLUMNS = [
    "qc_scope",
    "asset_role",
    "current_app_practice",
    "relative_path",
    "absolute_path",
    "target_word",
    "l1_condition",
    "pronunciation_condition",
    "participant_id",
    "talker",
    "word_number",
    "counterbalance_word_number",
    "source_word_number",
    "stimulus_list",
    "source_format",
    "voice_variant",
    "extension",
    "size_bytes",
    "sha256",
    "file_exists",
    "ffprobe_ok",
    "decode_ok",
    "codec_name",
    "format_name",
    "sample_rate_hz",
    "channels",
    "bits_per_sample",
    "duration_s",
    "decoded_duration_s",
    "peak_abs",
    "peak_dbfs",
    "rms",
    "rms_dbfs",
    "praat_intensity_db_spl_est",
    "integrated_lufs",
    "true_peak_dbfs",
    "loudness_range_lu",
    "leading_silence_s",
    "trailing_silence_s",
    "silence_threshold_dbfs",
    "clipped_sample_count",
    "near_clipped_sample_count",
    "dc_offset_max_abs",
    "failure_flags",
    "review_flags",
    "error",
]
SUMMARY_COLUMNS = [
    "asset_role",
    "l1_condition",
    "pronunciation_condition",
    "extension",
    "file_count",
    "decode_error_count",
    "failure_row_count",
    "review_row_count",
    "duration_min_s",
    "duration_mean_s",
    "duration_max_s",
    "peak_min_abs",
    "peak_mean_abs",
    "peak_max_abs",
    "rms_dbfs_mean",
    "praat_intensity_mean_db_spl_est",
    "integrated_lufs_mean",
    "sample_rates_hz",
    "channels",
    "bits_per_sample",
    "failure_flags",
    "review_flags",
]


@dataclass(frozen=True)
class Thresholds:
    min_duration_s: float
    max_duration_s: float
    max_leading_silence_s: float
    max_trailing_silence_s: float
    silence_threshold_dbfs: float
    main_sample_rate_hz: int
    main_channels: int
    main_bits_per_sample: int
    main_intensity_db_spl: float
    main_intensity_tolerance_db: float
    peak_target_abs: float
    peak_target_tolerance_abs: float
    near_clip_abs: float
    clip_abs: float
    practice_lufs: float
    practice_lufs_tolerance: float


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


def run_json(cmd: list[str]) -> dict[str, Any]:
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def ffprobe(path: Path) -> dict[str, Any]:
    return run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample,duration",
            "-show_entries",
            "format=format_name,duration",
            "-of",
            "json",
            str(path),
        ]
    )


def decode_float32(path: Path, channels: int) -> np.ndarray:
    result = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-",
        ],
        check=True,
        capture_output=True,
    )
    samples = np.frombuffer(result.stdout, dtype=np.float32)
    if channels > 1 and samples.size:
        frame_count = samples.size // channels
        samples = samples[: frame_count * channels].reshape(frame_count, channels)
    return samples


def measure_lufs(path: Path) -> tuple[str, str, str]:
    result = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter_complex",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "", "", ""
    text = result.stderr
    lufs = re.findall(r"I:\s*([-+]?\d+(?:\.\d+)?)\s*LUFS", text)
    lra = re.findall(r"LRA:\s*([-+]?\d+(?:\.\d+)?)\s*LU", text)
    peaks = re.findall(r"Peak:\s*([-+]?\d+(?:\.\d+)?)\s*dBFS", text)
    return (
        lufs[-1] if lufs else "",
        peaks[-1] if peaks else "",
        lra[-1] if lra else "",
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dbfs(value: float) -> float | None:
    if value <= 0:
        return None
    return 20.0 * math.log10(value)


def praat_intensity(value: float) -> float | None:
    if value <= 0:
        return None
    return 20.0 * math.log10(value / 0.00002)


def silence_edges(samples: np.ndarray, sample_rate: int, threshold_dbfs: float) -> tuple[float, float]:
    if sample_rate <= 0 or samples.size == 0:
        return 0.0, 0.0
    if samples.ndim == 2:
        frame_abs = np.max(np.abs(samples), axis=1)
    else:
        frame_abs = np.abs(samples)
    threshold = 10.0 ** (threshold_dbfs / 20.0)
    voiced = np.flatnonzero(frame_abs > threshold)
    duration = frame_abs.size / sample_rate
    if voiced.size == 0:
        return duration, duration
    leading = voiced[0] / sample_rate
    trailing = (frame_abs.size - voiced[-1] - 1) / sample_rate
    return leading, trailing


def metadata_indexes(
    remote_manifest: Path,
    selected_practice_manifest: Path,
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    manifest_by_audio = {
        row.get("audio_file", ""): row for row in read_csv(remote_manifest) if row.get("audio_file")
    }
    selected_rows = read_csv(selected_practice_manifest)
    selected_by_package = {
        row.get("package_relative_path", ""): row
        for row in selected_rows
        if row.get("package_relative_path")
    }
    selected_by_app = {
        row.get("app_relative_path", ""): row for row in selected_rows if row.get("app_relative_path")
    }
    return manifest_by_audio, selected_by_package, selected_by_app


def package_asset_role(relative_path: str, selected_by_package: dict[str, dict[str, str]]) -> str:
    if relative_path.startswith("main/"):
        return "main"
    if relative_path in selected_by_package:
        return "selected_practice_package_copy"
    if relative_path.startswith("practice/calibration/"):
        return "practice_calibration_package"
    if relative_path.startswith("practice/elevenlabs/"):
        return "practice_elevenlabs_candidate"
    return "package_audio"


def audio_rows(
    package_root: Path,
    app_practice_root: Path | None,
    selected_by_package: dict[str, dict[str, str]],
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if package_root.exists():
        for path in sorted(package_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            relative_path = path.relative_to(package_root).as_posix()
            if relative_path.startswith("metadata/"):
                continue
            rows.append(
                {
                    "qc_scope": "osf_package",
                    "asset_role": package_asset_role(relative_path, selected_by_package),
                    "relative_path": relative_path,
                    "absolute_path": str(path),
                }
            )
    if app_practice_root and app_practice_root.exists():
        repo_relative_root = app_practice_root.relative_to(REPO_ROOT)
        for path in sorted(app_practice_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            rows.append(
                {
                    "qc_scope": "app_static_practice",
                    "asset_role": "selected_practice_app_asset",
                    "relative_path": (repo_relative_root / path.relative_to(app_practice_root)).as_posix(),
                    "absolute_path": str(path),
                }
            )
    return rows


def enrich_metadata(
    base: dict[str, str],
    manifest_by_audio: dict[str, dict[str, str]],
    selected_by_package: dict[str, dict[str, str]],
    selected_by_app: dict[str, dict[str, str]],
) -> dict[str, str]:
    relative_path = base["relative_path"]
    metadata = manifest_by_audio.get(relative_path, {})
    selected = selected_by_package.get(relative_path) or selected_by_app.get(relative_path) or {}
    row = {**base}
    row.update(
        {
            "target_word": metadata.get("target_word") or selected.get("target_word", ""),
            "l1_condition": metadata.get("l1_condition") or selected.get("l1_condition", ""),
            "pronunciation_condition": metadata.get("pronunciation_condition")
            or selected.get("pronunciation_condition", ""),
            "participant_id": metadata.get("participant_id", ""),
            "talker": metadata.get("talker", ""),
            "word_number": metadata.get("word_number", ""),
            "counterbalance_word_number": metadata.get("counterbalance_word_number", ""),
            "source_word_number": metadata.get("source_word_number", ""),
            "stimulus_list": metadata.get("stimulus_list", ""),
            "source_format": metadata.get("source_format", ""),
            "voice_variant": selected.get("voice_variant", ""),
            "current_app_practice": "1" if selected else "0",
        }
    )
    return row


def should_measure_lufs(row: dict[str, Any], mode: str) -> bool:
    if mode == "off":
        return False
    if mode == "all":
        return True
    role = str(row.get("asset_role", ""))
    return row.get("extension") == ".mp3" and (
        role.startswith("practice_") or role.startswith("selected_practice_")
    )


def collect_failures(row: dict[str, Any], thresholds: Thresholds) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    reviews: list[str] = []
    role = row.get("asset_role", "")
    extension = row.get("extension", "")
    duration = row.get("duration_s_float")
    peak = row.get("peak_abs_float")
    intensity = row.get("praat_intensity_float")
    lufs = row.get("integrated_lufs_float")

    if row.get("file_exists") != "1":
        failures.append("file_missing")
    if row.get("ffprobe_ok") != "1":
        failures.append("ffprobe_failed")
    if row.get("decode_ok") != "1":
        failures.append("decode_failed")
    if duration is not None and duration < thresholds.min_duration_s:
        reviews.append("duration_short_review")
    if duration is not None and duration > thresholds.max_duration_s:
        reviews.append("duration_long_review")
    if row.get("clipped_sample_count_int", 0) > 0:
        failures.append("full_scale_clipping")
    if row.get("near_clipped_sample_count_int", 0) > 0:
        reviews.append("near_clipping_review")
    if row.get("leading_silence_float", 0.0) > thresholds.max_leading_silence_s:
        reviews.append("leading_silence_long_review")
    if row.get("trailing_silence_float", 0.0) > thresholds.max_trailing_silence_s:
        reviews.append("trailing_silence_long_review")

    if role == "main":
        if extension != ".wav":
            failures.append("main_not_wav")
        if row.get("sample_rate_hz") and int(row["sample_rate_hz"]) != thresholds.main_sample_rate_hz:
            reviews.append("main_sample_rate_unexpected_review")
        if row.get("channels") and int(row["channels"]) != thresholds.main_channels:
            reviews.append("main_channel_count_unexpected_review")
        bits = row.get("bits_per_sample")
        if bits and int(bits) != thresholds.main_bits_per_sample:
            reviews.append("main_bit_depth_unexpected_review")
        if intensity is not None:
            delta = abs(intensity - thresholds.main_intensity_db_spl)
            if delta > thresholds.main_intensity_tolerance_db:
                reviews.append("main_intensity_not_near_70_review")
        if peak is not None and abs(peak - thresholds.peak_target_abs) > thresholds.peak_target_tolerance_abs:
            reviews.append("peak_not_near_0_99_review")

    if role == "selected_practice_app_asset":
        if extension != ".mp3":
            failures.append("selected_practice_not_mp3")
        if lufs is not None and abs(lufs - thresholds.practice_lufs) > thresholds.practice_lufs_tolerance:
            reviews.append("selected_practice_lufs_outside_target_review")

    return failures, reviews


def audit_one(
    row: dict[str, str],
    thresholds: Thresholds,
    lufs_mode: str,
) -> dict[str, Any]:
    path = Path(row["absolute_path"])
    out: dict[str, Any] = {column: "" for column in DETAIL_COLUMNS}
    out.update(row)
    out["extension"] = path.suffix.lower()
    out["silence_threshold_dbfs"] = fmt(thresholds.silence_threshold_dbfs, 1)
    out["file_exists"] = "1" if path.exists() else "0"

    if not path.exists():
        failures, reviews = collect_failures(out, thresholds)
        out["failure_flags"] = ";".join(failures)
        out["review_flags"] = ";".join(reviews)
        return out

    out["size_bytes"] = str(path.stat().st_size)
    out["sha256"] = sha256_file(path)

    try:
        info = ffprobe(path)
        stream = (info.get("streams") or [{}])[0]
        fmt_info = info.get("format") or {}
        out["codec_name"] = stream.get("codec_name", "")
        out["format_name"] = fmt_info.get("format_name", "")
        out["sample_rate_hz"] = stream.get("sample_rate", "")
        out["channels"] = stream.get("channels", "")
        out["bits_per_sample"] = (
            stream.get("bits_per_sample") or stream.get("bits_per_raw_sample") or ""
        )
        duration = stream.get("duration") or fmt_info.get("duration") or ""
        out["duration_s"] = fmt(float(duration), 6) if duration else ""
        out["duration_s_float"] = float(duration) if duration else None
        out["ffprobe_ok"] = "1"
    except Exception as exc:  # pragma: no cover - exercised by corrupt audio.
        out["ffprobe_ok"] = "0"
        out["error"] = f"ffprobe: {exc}"

    try:
        sample_rate = int(out["sample_rate_hz"])
        channels = int(out["channels"])
        samples = decode_float32(path, channels)
        flat = samples.reshape(-1) if samples.ndim == 2 else samples
        frame_count = samples.shape[0] if samples.ndim == 2 else samples.size
        decoded_duration = frame_count / sample_rate if sample_rate else None
        peak = float(np.max(np.abs(flat))) if flat.size else 0.0
        rms = float(np.sqrt(np.mean(flat * flat))) if flat.size else 0.0
        leading, trailing = silence_edges(samples, sample_rate, thresholds.silence_threshold_dbfs)
        clipped = int(np.sum(np.abs(flat) >= thresholds.clip_abs))
        near_clipped = int(np.sum(np.abs(flat) >= thresholds.near_clip_abs))
        dc_offset = float(np.max(np.abs(np.mean(samples, axis=0)))) if samples.ndim == 2 else float(abs(np.mean(flat)))

        out["decoded_duration_s"] = fmt(decoded_duration, 6)
        out["peak_abs"] = fmt(peak, 6)
        out["peak_abs_float"] = peak
        out["peak_dbfs"] = fmt(dbfs(peak), 3)
        out["rms"] = fmt(rms, 8)
        out["rms_dbfs"] = fmt(dbfs(rms), 3)
        out["praat_intensity_db_spl_est"] = fmt(praat_intensity(rms), 3)
        out["praat_intensity_float"] = praat_intensity(rms)
        out["leading_silence_s"] = fmt(leading, 6)
        out["leading_silence_float"] = leading
        out["trailing_silence_s"] = fmt(trailing, 6)
        out["trailing_silence_float"] = trailing
        out["clipped_sample_count"] = str(clipped)
        out["clipped_sample_count_int"] = clipped
        out["near_clipped_sample_count"] = str(near_clipped)
        out["near_clipped_sample_count_int"] = near_clipped
        out["dc_offset_max_abs"] = fmt(dc_offset, 8)
        out["decode_ok"] = "1"
    except Exception as exc:  # pragma: no cover - exercised by corrupt audio.
        out["decode_ok"] = "0"
        out["error"] = f"{out.get('error', '')}; decode: {exc}".strip("; ")

    if should_measure_lufs(out, lufs_mode):
        lufs, true_peak, lra = measure_lufs(path)
        out["integrated_lufs"] = lufs
        out["true_peak_dbfs"] = true_peak
        out["loudness_range_lu"] = lra
        out["integrated_lufs_float"] = float(lufs) if lufs else None

    failures, reviews = collect_failures(out, thresholds)
    out["failure_flags"] = ";".join(failures)
    out["review_flags"] = ";".join(reviews)
    return {key: fmt(value) for key, value in out.items() if key in DETAIL_COLUMNS}


def numeric(row: dict[str, Any], key: str) -> float | None:
    value = row.get(key, "")
    if value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def summarize(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    grouped: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = (
            row.get("asset_role", ""),
            row.get("l1_condition", ""),
            row.get("pronunciation_condition", ""),
            row.get("extension", ""),
        )
        grouped[key].append(row)

    summary_rows: list[dict[str, str]] = []
    for key, group in sorted(grouped.items()):
        durations = [value for value in (numeric(row, "duration_s") for row in group) if value is not None]
        peaks = [value for value in (numeric(row, "peak_abs") for row in group) if value is not None]
        rms_values = [value for value in (numeric(row, "rms_dbfs") for row in group) if value is not None]
        intensities = [
            value
            for value in (numeric(row, "praat_intensity_db_spl_est") for row in group)
            if value is not None
        ]
        lufs_values = [
            value for value in (numeric(row, "integrated_lufs") for row in group) if value is not None
        ]
        failure_flags = Counter(
            flag
            for row in group
            for flag in str(row.get("failure_flags", "")).split(";")
            if flag
        )
        review_flags = Counter(
            flag
            for row in group
            for flag in str(row.get("review_flags", "")).split(";")
            if flag
        )
        summary_rows.append(
            {
                "asset_role": key[0],
                "l1_condition": key[1],
                "pronunciation_condition": key[2],
                "extension": key[3],
                "file_count": str(len(group)),
                "decode_error_count": str(sum(1 for row in group if row.get("decode_ok") != "1")),
                "failure_row_count": str(sum(1 for row in group if row.get("failure_flags"))),
                "review_row_count": str(sum(1 for row in group if row.get("review_flags"))),
                "duration_min_s": fmt(min(durations) if durations else None, 6),
                "duration_mean_s": fmt(mean(durations) if durations else None, 6),
                "duration_max_s": fmt(max(durations) if durations else None, 6),
                "peak_min_abs": fmt(min(peaks) if peaks else None, 6),
                "peak_mean_abs": fmt(mean(peaks) if peaks else None, 6),
                "peak_max_abs": fmt(max(peaks) if peaks else None, 6),
                "rms_dbfs_mean": fmt(mean(rms_values) if rms_values else None, 3),
                "praat_intensity_mean_db_spl_est": fmt(mean(intensities) if intensities else None, 3),
                "integrated_lufs_mean": fmt(mean(lufs_values) if lufs_values else None, 3),
                "sample_rates_hz": ";".join(sorted({row.get("sample_rate_hz", "") for row in group if row.get("sample_rate_hz")})),
                "channels": ";".join(sorted({row.get("channels", "") for row in group if row.get("channels")})),
                "bits_per_sample": ";".join(sorted({row.get("bits_per_sample", "") for row in group if row.get("bits_per_sample")})),
                "failure_flags": ";".join(f"{flag}:{count}" for flag, count in failure_flags.most_common()),
                "review_flags": ";".join(f"{flag}:{count}" for flag, count in review_flags.most_common()),
            }
        )
    return summary_rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-root", type=Path, default=DEFAULT_PACKAGE_ROOT)
    parser.add_argument("--remote-manifest", type=Path)
    parser.add_argument("--selected-practice-manifest", type=Path)
    parser.add_argument("--app-practice-root", type=Path, default=DEFAULT_APP_PRACTICE_ROOT)
    parser.add_argument("--out-dir", type=Path)
    parser.add_argument("--detail-out", default="audio_qc_by_file.csv")
    parser.add_argument("--summary-out", default="audio_qc_summary.csv")
    parser.add_argument("--issues-out", default="audio_qc_issues.csv")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--lufs-mode", choices=["off", "practice_mp3", "all"], default="practice_mp3")
    parser.add_argument("--min-duration-s", type=float, default=0.25)
    parser.add_argument("--max-duration-s", type=float, default=3.0)
    parser.add_argument("--max-leading-silence-s", type=float, default=0.25)
    parser.add_argument("--max-trailing-silence-s", type=float, default=0.35)
    parser.add_argument("--silence-threshold-dbfs", type=float, default=-40.0)
    parser.add_argument("--main-sample-rate-hz", type=int, default=48000)
    parser.add_argument("--main-channels", type=int, default=1)
    parser.add_argument("--main-bits-per-sample", type=int, default=16)
    parser.add_argument("--main-intensity-db-spl", type=float, default=70.0)
    parser.add_argument("--main-intensity-tolerance-db", type=float, default=0.5)
    parser.add_argument("--peak-target-abs", type=float, default=0.99)
    parser.add_argument("--peak-target-tolerance-abs", type=float, default=0.05)
    parser.add_argument("--near-clip-abs", type=float, default=0.99)
    parser.add_argument("--clip-abs", type=float, default=0.999)
    parser.add_argument("--practice-lufs", type=float, default=-23.0)
    parser.add_argument("--practice-lufs-tolerance", type=float, default=1.0)
    return parser.parse_args()


def main() -> int:
    if not shutil.which("ffprobe") or not shutil.which("ffmpeg"):
        raise SystemExit("ffprobe and ffmpeg are required for acoustic QC.")

    args = parse_args()
    package_root = args.package_root.expanduser().resolve()
    remote_manifest = (
        args.remote_manifest.expanduser().resolve()
        if args.remote_manifest
        else package_root / "remote_manifest.csv"
    )
    selected_practice_manifest = (
        args.selected_practice_manifest.expanduser().resolve()
        if args.selected_practice_manifest
        else package_root / "metadata" / "selected_practice_manifest.csv"
    )
    out_dir = args.out_dir.expanduser().resolve() if args.out_dir else package_root / "metadata"
    app_practice_root = args.app_practice_root.expanduser().resolve() if args.app_practice_root else None
    thresholds = Thresholds(
        min_duration_s=args.min_duration_s,
        max_duration_s=args.max_duration_s,
        max_leading_silence_s=args.max_leading_silence_s,
        max_trailing_silence_s=args.max_trailing_silence_s,
        silence_threshold_dbfs=args.silence_threshold_dbfs,
        main_sample_rate_hz=args.main_sample_rate_hz,
        main_channels=args.main_channels,
        main_bits_per_sample=args.main_bits_per_sample,
        main_intensity_db_spl=args.main_intensity_db_spl,
        main_intensity_tolerance_db=args.main_intensity_tolerance_db,
        peak_target_abs=args.peak_target_abs,
        peak_target_tolerance_abs=args.peak_target_tolerance_abs,
        near_clip_abs=args.near_clip_abs,
        clip_abs=args.clip_abs,
        practice_lufs=args.practice_lufs,
        practice_lufs_tolerance=args.practice_lufs_tolerance,
    )

    manifest_by_audio, selected_by_package, selected_by_app = metadata_indexes(
        remote_manifest,
        selected_practice_manifest,
    )
    rows = [
        enrich_metadata(row, manifest_by_audio, selected_by_package, selected_by_app)
        for row in audio_rows(package_root, app_practice_root, selected_by_package)
    ]
    if args.limit:
        rows = rows[: args.limit]

    detail_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        detail_rows.append(audit_one(row, thresholds, args.lufs_mode))
        if index % 250 == 0:
            print(f"audited {index}/{len(rows)}")

    summary_rows = summarize(detail_rows)
    issue_rows = [
        row
        for row in detail_rows
        if row.get("failure_flags") or row.get("review_flags") or row.get("error")
    ]

    detail_path = out_dir / args.detail_out
    summary_path = out_dir / args.summary_out
    issues_path = out_dir / args.issues_out
    write_csv(detail_path, detail_rows, DETAIL_COLUMNS)
    write_csv(summary_path, summary_rows, SUMMARY_COLUMNS)
    write_csv(issues_path, issue_rows, DETAIL_COLUMNS)

    failure_count = sum(1 for row in detail_rows if row.get("failure_flags"))
    review_count = sum(1 for row in detail_rows if row.get("review_flags"))
    print(f"detail: {detail_path}")
    print(f"summary: {summary_path}")
    print(f"issues: {issues_path}")
    print(f"audio rows: {len(detail_rows)}")
    print(f"rows with failure flags: {failure_count}")
    print(f"rows with review flags: {review_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
