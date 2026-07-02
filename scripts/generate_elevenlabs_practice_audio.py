#!/usr/bin/env python3
"""Generate ElevenLabs practice/calibration audio for this experiment.

The text sent to ElevenLabs is intentionally only the target word. For a
single-word stimulus, Japanese-like or Chinese-like accentedness should be
controlled mainly by the selected voice ID, not by adding prompt instructions to
the speech text. Use --search-shared-voices or predefined environment variables
to select accent-appropriate voices, then have collaborators audit the audio.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import tempfile
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError as exc:  # pragma: no cover - user environment guard
    raise SystemExit("Missing dependency: pip install requests") from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "practice_training_audio" / "elevenlabs"
API_BASE = "https://api.elevenlabs.io"


@dataclass(frozen=True)
class PracticeItem:
    item_id: str
    l1_condition: str
    gender: str
    target_word: str
    text: str
    expected_accentedness_min: int
    expected_accentedness_max: int
    voice_env_names: tuple[str, ...]
    accent_goal: str


DEFAULT_ITEMS = [
    PracticeItem(
        item_id="chocolate",
        l1_condition="ENG",
        gender="female",
        target_word="chocolate",
        text="chocolate",
        expected_accentedness_min=1,
        expected_accentedness_max=2,
        voice_env_names=("ELEVENLABS_ENG_FEMALE_VOICE_ID", "ELEVENLABS_FEMALE_VOICE_ID"),
        accent_goal="Native English reference voice; low accentedness.",
    ),
    PracticeItem(
        item_id="coffee",
        l1_condition="JPN",
        gender="male",
        target_word="coffee",
        text="coffee",
        expected_accentedness_min=3,
        expected_accentedness_max=5,
        voice_env_names=("ELEVENLABS_JPN_MALE_VOICE_ID", "ELEVENLABS_MALE_VOICE_ID"),
        accent_goal="English word produced with a Japanese-like accent; moderate accentedness.",
    ),
    PracticeItem(
        item_id="pizza",
        l1_condition="JPN",
        gender="female",
        target_word="pizza",
        text="pizza",
        expected_accentedness_min=5,
        expected_accentedness_max=7,
        voice_env_names=("ELEVENLABS_JPN_FEMALE_VOICE_ID", "ELEVENLABS_FEMALE_VOICE_ID"),
        accent_goal="English word produced with a Japanese-like accent; higher accentedness.",
    ),
    PracticeItem(
        item_id="sofa",
        l1_condition="CHN",
        gender="male",
        target_word="sofa",
        text="sofa",
        expected_accentedness_min=7,
        expected_accentedness_max=9,
        voice_env_names=("ELEVENLABS_CHN_MALE_VOICE_ID", "ELEVENLABS_MALE_VOICE_ID"),
        accent_goal="English word produced with a Chinese-like accent; high accentedness.",
    ),
]

LEGACY_CALIBRATION_ITEMS = [
    PracticeItem(
        item_id="ENG_Female_appreciation_Practice",
        l1_condition="ENG",
        gender="female",
        target_word="appreciation",
        text="appreciation",
        expected_accentedness_min=1,
        expected_accentedness_max=3,
        voice_env_names=("ELEVENLABS_ENG_FEMALE_VOICE_ID", "ELEVENLABS_FEMALE_VOICE_ID"),
        accent_goal="Native English reference voice; low accentedness.",
    ),
    PracticeItem(
        item_id="JPN_Male_pesticide_Practice",
        l1_condition="JPN",
        gender="male",
        target_word="pesticide",
        text="pesticide",
        expected_accentedness_min=3,
        expected_accentedness_max=5,
        voice_env_names=("ELEVENLABS_JPN_MALE_VOICE_ID", "ELEVENLABS_MALE_VOICE_ID"),
        accent_goal="English word produced with a Japanese-like accent; moderate accentedness.",
    ),
    PracticeItem(
        item_id="JPN_Female_quality_Practice",
        l1_condition="JPN",
        gender="female",
        target_word="quality",
        text="quality",
        expected_accentedness_min=5,
        expected_accentedness_max=7,
        voice_env_names=("ELEVENLABS_JPN_FEMALE_VOICE_ID", "ELEVENLABS_FEMALE_VOICE_ID"),
        accent_goal="English word produced with a Japanese-like accent; higher accentedness.",
    ),
    PracticeItem(
        item_id="CHN_Male_shelter_Practice",
        l1_condition="CHN",
        gender="male",
        target_word="shelter",
        text="shelter",
        expected_accentedness_min=7,
        expected_accentedness_max=9,
        voice_env_names=("ELEVENLABS_CHN_MALE_VOICE_ID", "ELEVENLABS_MALE_VOICE_ID"),
        accent_goal="English word produced with a Chinese-like accent; high accentedness.",
    ),
]

DEMO_PRACTICE_ITEMS = [
    PracticeItem(
        item_id="chocolate",
        l1_condition="PRACTICE",
        gender="",
        target_word="chocolate",
        text="chocolate",
        expected_accentedness_min=0,
        expected_accentedness_max=0,
        voice_env_names=(),
        accent_goal="Legacy practice target word; voice variants define the intended accent condition.",
    ),
    PracticeItem(
        item_id="coffee",
        l1_condition="PRACTICE",
        gender="",
        target_word="coffee",
        text="coffee",
        expected_accentedness_min=0,
        expected_accentedness_max=0,
        voice_env_names=(),
        accent_goal="Legacy practice target word; voice variants define the intended accent condition.",
    ),
    PracticeItem(
        item_id="pizza",
        l1_condition="PRACTICE",
        gender="",
        target_word="pizza",
        text="pizza",
        expected_accentedness_min=0,
        expected_accentedness_max=0,
        voice_env_names=(),
        accent_goal="Legacy practice target word; voice variants define the intended accent condition.",
    ),
    PracticeItem(
        item_id="sofa",
        l1_condition="PRACTICE",
        gender="",
        target_word="sofa",
        text="sofa",
        expected_accentedness_min=0,
        expected_accentedness_max=0,
        voice_env_names=(),
        accent_goal="Legacy practice target word; voice variants define the intended accent condition.",
    ),
]

ITEM_SETS = {
    "selected-practice": DEFAULT_ITEMS,
    "demo-practice": DEMO_PRACTICE_ITEMS,
    "legacy-calibration": LEGACY_CALIBRATION_ITEMS,
}


def load_dotenv(start: Path) -> Path | None:
    for directory in [start, *start.parents]:
        candidate = directory / ".env"
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return candidate
    return None


def output_extension(output_format: str) -> str:
    prefix = output_format.split("_", 1)[0].lower()
    if prefix in {"mp3", "wav", "pcm", "ulaw", "alaw"}:
        return f".{prefix}"
    return ".audio"


def require_api_key(args: argparse.Namespace) -> str:
    api_key = args.api_key or os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        raise SystemExit("ELEVENLABS_API_KEY is missing. Put it in .env or pass --api-key.")
    return api_key


def voice_overrides(entries: list[str]) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for entry in entries:
        if "=" not in entry:
            raise SystemExit(f"--voice-id must look like ITEM_ID=VOICE_ID, got: {entry}")
        key, value = entry.split("=", 1)
        if not key.strip() or not value.strip():
            raise SystemExit(f"--voice-id must look like ITEM_ID=VOICE_ID, got: {entry}")
        overrides[key.strip()] = value.strip()
    return overrides


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    slug = re.sub(r"_+", "_", slug).strip("_.-")
    return slug or "voice"


def parse_voice_variant(entry: str) -> tuple[str, str, str]:
    parts = entry.split("=", 2)
    if len(parts) != 3 or not all(part.strip() for part in parts):
        raise SystemExit(
            "--voice-variant must look like ITEM_ID=LABEL=VOICE_ID, "
            f"got: {entry}"
        )
    return parts[0].strip(), slugify(parts[1]), parts[2].strip()


def explicit_voice_variants(entries: list[str]) -> dict[str, list[tuple[str, str, str]]]:
    variants: dict[str, list[tuple[str, str, str]]] = {}
    for entry in entries:
        item_id, label, voice_id = parse_voice_variant(entry)
        variants.setdefault(item_id, []).append((label, voice_id, f"--voice-variant {label}"))
    return variants


def resolve_voice_id(item: PracticeItem, overrides: dict[str, str]) -> tuple[str, str]:
    if item.item_id in overrides:
        return overrides[item.item_id], f"--voice-id {item.item_id}"
    for env_name in item.voice_env_names:
        voice_id = os.environ.get(env_name, "").strip()
        if voice_id:
            return voice_id, env_name
    return "", "missing"


def variants_for_item(
    item: PracticeItem,
    overrides: dict[str, str],
    variants: dict[str, list[tuple[str, str, str]]],
    include_default: bool,
) -> list[tuple[str, str, str]]:
    selected = [
        *variants.get("ALL", []),
        *variants.get("*", []),
        *variants.get(item.item_id, []),
    ]
    if include_default or not selected:
        voice_id, voice_source = resolve_voice_id(item, overrides)
        if voice_id:
            selected.insert(0, ("default", voice_id, voice_source))
        elif not selected:
            selected.insert(0, ("default", "", voice_source))

    deduped: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for label, voice_id, voice_source in selected:
        key = (label, voice_id)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((label, voice_id, voice_source))
    return deduped


def request_json(api_key: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(
        f"{API_BASE}{path}",
        headers={"xi-api-key": api_key},
        params={key: value for key, value in params.items() if value not in ("", None)},
        timeout=45,
    )
    if not response.ok:
        raise SystemExit(f"ElevenLabs GET {path} failed: {response.status_code} {response.text[:500]}")
    return response.json()


def format_voice_line(voice: dict[str, Any]) -> str:
    labels = voice.get("labels") or {}
    voice_id = voice.get("voice_id") or voice.get("id") or ""
    public_owner_id = voice.get("public_owner_id") or ""
    name = voice.get("name") or ""
    category = voice.get("category") or ""
    gender = labels.get("gender") or voice.get("gender") or ""
    accent = labels.get("accent") or voice.get("accent") or ""
    language = labels.get("language") or labels.get("locale") or voice.get("language") or ""
    preview = voice.get("preview_url") or ""
    label_text = json.dumps(labels, ensure_ascii=False, sort_keys=True) if labels else "{}"
    return (
        f"{voice_id}\t{name}\tcategory={category}\tgender={gender}\t"
        f"accent={accent}\tlanguage={language}\tpublic_owner_id={public_owner_id}\t"
        f"labels={label_text}\tpreview={preview}"
    )


def list_voices(api_key: str, args: argparse.Namespace) -> None:
    data = request_json(
        api_key,
        "/v2/voices",
        {
            "search": args.voice_search,
            "page_size": args.page_size,
        },
    )
    voices = data.get("voices") or data.get("data") or []
    for voice in voices:
        print(format_voice_line(voice))


def search_shared_voices(api_key: str, args: argparse.Namespace) -> None:
    data = request_json(
        api_key,
        "/v1/shared-voices",
        {
            "search": args.voice_search,
            "accent": args.accent,
            "gender": args.gender,
            "language": args.language,
            "locale": args.locale,
            "page_size": args.page_size,
        },
    )
    voices = data.get("voices") or data.get("data") or []
    for voice in voices:
        print(format_voice_line(voice))


def generation_payload(item: PracticeItem, args: argparse.Namespace, seed: int | None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "text": item.text,
        "model_id": args.model_id,
        "voice_settings": {
            "stability": args.stability,
            "similarity_boost": args.similarity_boost,
            "style": args.style,
            "speed": args.speed,
            "use_speaker_boost": args.speaker_boost,
        },
        "apply_text_normalization": args.apply_text_normalization,
    }
    if seed is not None:
        payload["seed"] = seed
    if args.apply_language_text_normalization:
        payload["apply_language_text_normalization"] = True
    if args.language_code:
        if args.model_id == "eleven_multilingual_v2" and not args.force_language_code:
            print(
                "Skipping language_code because eleven_multilingual_v2 does not support it; "
                "use --force-language-code to send it anyway.",
                file=sys.stderr,
            )
        else:
            payload["language_code"] = args.language_code
    return payload


def generate_audio(
    api_key: str,
    item: PracticeItem,
    voice_id: str,
    output_path: Path,
    args: argparse.Namespace,
    seed: int | None,
) -> None:
    if output_path.exists() and not args.overwrite:
        raise SystemExit(f"Refusing to overwrite existing file: {output_path}")

    response = requests.post(
        f"{API_BASE}/v1/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": api_key,
            "content-type": "application/json",
        },
        params={"output_format": args.output_format},
        json=generation_payload(item, args, seed),
        timeout=120,
    )
    if not response.ok:
        raise SystemExit(
            f"ElevenLabs TTS failed for {item.item_id}: {response.status_code} {response.text[:500]}"
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.content)


def convert_to_wav(source: Path, args: argparse.Namespace) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required for --make-wav but was not found in PATH.")
    if source.suffix.lower() == ".wav":
        wav_path = source.with_name(f"{source.stem}_{args.wav_sample_rate}hz_mono.wav")
    else:
        wav_path = source.with_suffix(".wav")
    if wav_path.exists() and not args.overwrite:
        raise SystemExit(f"Refusing to overwrite existing WAV file: {wav_path}")
    command = [
        ffmpeg,
        "-y" if args.overwrite else "-n",
        "-i",
        str(source),
        "-ac",
        str(args.wav_channels),
        "-ar",
        str(args.wav_sample_rate),
        "-sample_fmt",
        "s16",
        str(wav_path),
    ]
    subprocess.run(command, check=True)
    return wav_path


def normalize_loudness(source: Path, args: argparse.Namespace) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("ffmpeg is required for --normalize-loudness but was not found in PATH.")
    suffix = source.suffix or ".audio"
    with tempfile.NamedTemporaryFile(prefix=f"{source.stem}_norm_", suffix=suffix, delete=False) as handle:
        tmp_path = Path(handle.name)
    try:
        command = [
            ffmpeg,
            "-y",
            "-i",
            str(source),
            "-af",
            f"loudnorm=I={args.loudnorm_i}:LRA={args.loudnorm_lra}:TP={args.loudnorm_tp}",
            "-ac",
            str(args.normalized_channels),
            "-ar",
            str(args.normalized_sample_rate),
            "-codec:a",
            "libmp3lame" if source.suffix.lower() == ".mp3" else "pcm_s16le",
        ]
        if source.suffix.lower() == ".mp3":
            command.extend(["-b:a", args.normalized_mp3_bitrate])
        command.append(str(tmp_path))
        subprocess.run(command, check=True)
        tmp_path.replace(source)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    columns = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--api-key", default="", help="Overrides ELEVENLABS_API_KEY.")
    parser.add_argument(
        "--word-set",
        default="selected-practice",
        choices=sorted(ITEM_SETS),
        help="Which practice item set to generate.",
    )
    parser.add_argument("--model-id", default=os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2"))
    parser.add_argument("--output-format", default=os.environ.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"))
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dry-run", action="store_true", help="Print the generation plan without calling TTS.")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--seed", type=int, default=20260703, help="Base seed. Use --no-seed to omit.")
    parser.add_argument("--no-seed", action="store_true")
    parser.add_argument("--voice-id", action="append", default=[], help="Override one item: ITEM_ID=VOICE_ID")
    parser.add_argument(
        "--voice-variant",
        action="append",
        default=[],
        help="Generate an additional variant: ITEM_ID=LABEL=VOICE_ID",
    )
    parser.add_argument(
        "--include-default-voice",
        action="store_true",
        help="Also generate each item's default/fallback voice when --voice-variant is used.",
    )
    parser.add_argument("--stability", type=float, default=0.50)
    parser.add_argument("--similarity-boost", type=float, default=0.75)
    parser.add_argument("--style", type=float, default=0.20)
    parser.add_argument("--speed", type=float, default=0.95)
    parser.add_argument("--speaker-boost", dest="speaker_boost", action="store_true", default=True)
    parser.add_argument("--no-speaker-boost", dest="speaker_boost", action="store_false")
    parser.add_argument("--apply-text-normalization", default="auto", choices=["auto", "on", "off"])
    parser.add_argument("--apply-language-text-normalization", action="store_true")
    parser.add_argument("--language-code", default="", help="Optional language_code. Not sent to multilingual_v2 by default.")
    parser.add_argument("--force-language-code", action="store_true")
    parser.add_argument("--make-wav", action="store_true", help="Convert generated output to PCM WAV with ffmpeg.")
    parser.add_argument("--wav-sample-rate", type=int, default=48000)
    parser.add_argument("--wav-channels", type=int, default=1)
    parser.add_argument("--normalize-loudness", action="store_true", help="Normalize generated audio with ffmpeg loudnorm.")
    parser.add_argument("--loudnorm-i", type=float, default=-23.0)
    parser.add_argument("--loudnorm-lra", type=float, default=7.0)
    parser.add_argument("--loudnorm-tp", type=float, default=-2.0)
    parser.add_argument("--normalized-sample-rate", type=int, default=44100)
    parser.add_argument("--normalized-channels", type=int, default=1)
    parser.add_argument("--normalized-mp3-bitrate", default="128k")
    parser.add_argument("--list-voices", action="store_true", help="List voices from /v2/voices and exit.")
    parser.add_argument("--search-shared-voices", action="store_true", help="Search /v1/shared-voices and exit.")
    parser.add_argument("--voice-search", default="", help="Voice search query for list/search modes.")
    parser.add_argument("--accent", default="", help="Shared voice accent filter, e.g. japanese or chinese.")
    parser.add_argument("--gender", default="", help="Shared voice gender filter.")
    parser.add_argument("--language", default="", help="Shared voice language filter.")
    parser.add_argument("--locale", default="", help="Shared voice locale filter.")
    parser.add_argument("--page-size", type=int, default=30)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate ElevenLabs practice stimuli for the selected four-word practice set.",
    )
    add_common_args(parser)
    return parser.parse_args()


def main() -> int:
    load_dotenv(Path(__file__).resolve().parent)
    args = parse_args()
    api_key = require_api_key(args)

    if args.list_voices:
        list_voices(api_key, args)
        return 0
    if args.search_shared_voices:
        search_shared_voices(api_key, args)
        return 0

    overrides = voice_overrides(args.voice_id)
    explicit_variants = explicit_voice_variants(args.voice_variant)
    extension = output_extension(args.output_format)
    args.output_dir.mkdir(parents=True, exist_ok=True) if not args.dry_run else None

    rows: list[dict[str, Any]] = []
    metadata: dict[str, Any] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "word_set": args.word_set,
        "model_id": args.model_id,
        "output_format": args.output_format,
        "output_dir": str(args.output_dir),
        "items": [],
        "note": "Accent target is controlled by voice selection; generated files require auditory validation.",
    }

    items = ITEM_SETS[args.word_set]
    for index, item in enumerate(items):
        item_variants = variants_for_item(
            item,
            overrides,
            explicit_variants,
            args.include_default_voice,
        )
        for variant_index, (variant_label, voice_id, voice_source) in enumerate(item_variants):
            seed_offset = index * 100 + variant_index
            seed = None if args.no_seed else args.seed + seed_offset
            file_stem = (
                f"{item.item_id}__{variant_label}"
                if variant_label != "default"
                else item.item_id
            )
            audio_path = args.output_dir / f"{file_stem}{extension}"
            wav_path = ""
            plan = {
                **asdict(item),
                "voice_variant": variant_label,
                "voice_id": voice_id or "<missing>",
                "voice_source": voice_source,
                "model_id": args.model_id,
                "output_format": args.output_format,
                "audio_file": str(audio_path),
                "wav_file": wav_path,
                "seed": seed if seed is not None else "",
                "stability": args.stability,
                "similarity_boost": args.similarity_boost,
                "style": args.style,
                "speed": args.speed,
                "use_speaker_boost": args.speaker_boost,
                "normalized_loudness": args.normalize_loudness,
                "loudnorm_i": args.loudnorm_i if args.normalize_loudness else "",
                "loudnorm_lra": args.loudnorm_lra if args.normalize_loudness else "",
                "loudnorm_tp": args.loudnorm_tp if args.normalize_loudness else "",
            }
            if args.dry_run:
                print(json.dumps(plan, ensure_ascii=False, sort_keys=True))
                continue
            if not voice_id:
                envs = ", ".join(item.voice_env_names)
                env_text = f" Set one of: {envs}" if envs else " Pass --voice-variant ITEM_ID=LABEL=VOICE_ID."
                raise SystemExit(f"Missing voice ID for {item.item_id}.{env_text}")
            generate_audio(api_key, item, voice_id, audio_path, args, seed)
            if args.normalize_loudness:
                normalize_loudness(audio_path, args)
            if args.make_wav:
                wav_path = str(convert_to_wav(audio_path, args))
                plan["wav_file"] = wav_path
            rows.append(plan)
            metadata["items"].append(plan)
            print(f"wrote {audio_path}")

    if not args.dry_run:
        write_csv(args.output_dir / "generation_manifest.csv", rows)
        (args.output_dir / "generation_metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"wrote {args.output_dir / 'generation_manifest.csv'}")
        print(f"wrote {args.output_dir / 'generation_metadata.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
