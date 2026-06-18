#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/practice_audio"
MANIFEST="$ROOT_DIR/practice_manifest.csv"

if ! command -v say >/dev/null 2>&1; then
  echo "ERROR: macOS say command is required." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg is required." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"/{english,japanese,chinese}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

write_wav() {
  local voice="$1"
  local rate="$2"
  local text="$3"
  local output="$4"
  local aiff="$tmp_dir/input.aiff"

  say -v "$voice" -r "$rate" -o "$aiff" -- "$text"
  ffmpeg -hide_banner -loglevel error -y -i "$aiff" -ac 1 -ar 44100 -sample_fmt s16 "$output"
}

cat > "$MANIFEST" <<'CSV'
audio_file,target_word,participant_id,native_language,condition,accent_condition,talker,pass_number,trial_number,word_number,take_number,spoken_form,practice_note
CSV

add_item() {
  local word="$1"
  local en_text="$2"
  local ja_text="$3"
  local zh_text="$4"
  local number="$5"

  write_wav "Samantha" "170" "$en_text" "$OUT_DIR/english/${word}.wav"
  write_wav "Kyoko" "150" "$ja_text" "$OUT_DIR/japanese/${word}.wav"
  write_wav "Tingting" "150" "$zh_text" "$OUT_DIR/chinese/${word}.wav"

  printf 'practice_audio/english/%s.wav,%s,practice,english,practice,english,Samantha,,%s,%s,,%s,Native English TTS practice sample\n' "$word" "$word" "$number" "$number" "$en_text" >> "$MANIFEST"
  printf 'practice_audio/japanese/%s.wav,%s,practice,japanese,practice,japanese,Kyoko,,%s,%s,,%s,Japanese katakana-shaped practice sample\n' "$word" "$word" "$number" "$number" "$ja_text" >> "$MANIFEST"
  printf 'practice_audio/chinese/%s.wav,%s,practice,chinese,practice,chinese,Tingting,,%s,%s,,%s,Chinese cognate/loanword-shaped practice sample\n' "$word" "$word" "$number" "$number" "$zh_text" >> "$MANIFEST"
}

add_item "chocolate" "chocolate" "チョコレート" "巧克力" "1"
add_item "coffee" "coffee" "コーヒー" "咖啡" "2"
add_item "pizza" "pizza" "ピザ" "披萨" "3"
add_item "sofa" "sofa" "ソファ" "沙发" "4"

cat <<MSG
Created practice audio:
  $OUT_DIR

Created manifest:
  $MANIFEST

These samples are synthetic practice materials only. They use native-language TTS
forms to make English/Japanese/Chinese accent conditions easy to distinguish.
MSG
