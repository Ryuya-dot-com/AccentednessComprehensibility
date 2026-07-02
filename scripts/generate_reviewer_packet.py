#!/usr/bin/env python3
"""Generate reviewer-facing files for practice ratings and audio repair decisions."""

from __future__ import annotations

import argparse
import csv
import html
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACKAGE_ROOT = PROJECT_ROOT / "Stimuli_OSF_Release_20260703"
DEFAULT_SELECTED_PRACTICE = DEFAULT_PACKAGE_ROOT / "metadata" / "selected_practice_manifest.csv"
DEFAULT_AUDIO_REPAIR_SUMMARY = (
    DEFAULT_PACKAGE_ROOT / "metadata" / "audio_repair_candidates" / "audio_repair_candidate_summary.csv"
)
DEFAULT_OUT_DIR = DEFAULT_PACKAGE_ROOT / "metadata" / "review_packet_20260703"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def rel_from_packet(package_relative_path: str) -> str:
    return "../../" + package_relative_path.lstrip("/")


def practice_review_rows(selected_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in selected_rows:
        rows.append(
            {
                "review_item_type": "practice_reference_rating",
                "trial_index": row.get("trial_index", ""),
                "target_word": row.get("target_word", ""),
                "l1_condition": row.get("l1_condition", ""),
                "pronunciation_condition": row.get("pronunciation_condition", ""),
                "voice_variant": row.get("voice_variant", ""),
                "package_relative_path": row.get("package_relative_path", ""),
                "browser_audio_src": rel_from_packet(row.get("package_relative_path", "")),
                "current_comprehensibility_1_9": row.get("expert_comprehensibility_1_9", ""),
                "current_accentedness_1_9": row.get("expert_accentedness_1_9", ""),
                "final_comprehensibility_1_9": "",
                "final_accentedness_1_9": "",
                "accepted_for_practice": "",
                "regenerate_requested": "",
                "reviewer": "",
                "review_date": "",
                "notes": "",
            }
        )
    return rows


def repair_review_rows(repair_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for row in repair_rows:
        candidate = Path(row.get("candidate_file", "")).name
        rows.append(
            {
                "review_item_type": "audio_repair_candidate",
                "source_relative_path": row.get("source_relative_path", ""),
                "candidate_file": row.get("candidate_file", ""),
                "source_browser_audio_src": rel_from_packet(row.get("source_relative_path", "")),
                "candidate_browser_audio_src": f"../audio_repair_candidates/{candidate}",
                "target_word": row.get("target_word", ""),
                "l1_condition": row.get("l1_condition", ""),
                "pronunciation_condition": row.get("pronunciation_condition", ""),
                "participant_id": row.get("participant_id", ""),
                "counterbalance_word_number": row.get("counterbalance_word_number", ""),
                "source_word_number": row.get("source_word_number", ""),
                "full_scale_sample_count": row.get("full_scale_sample_count", ""),
                "original_peak_abs": row.get("original_peak_abs", ""),
                "repaired_peak_abs": row.get("repaired_peak_abs", ""),
                "decision": "",
                "accepted_by": "",
                "accepted_date": "",
                "notes": "",
            }
        )
    return rows


def practice_table(rows: list[dict[str, str]]) -> str:
    body = []
    for row in rows:
        body.append(
            "<tr>"
            f"<td>{html.escape(row['trial_index'])}</td>"
            f"<td>{html.escape(row['target_word'])}</td>"
            f"<td>{html.escape(row['l1_condition'])}/{html.escape(row['pronunciation_condition'])}</td>"
            f"<td>{html.escape(row['voice_variant'])}</td>"
            f"<td><audio controls preload=\"metadata\" src=\"{html.escape(row['browser_audio_src'])}\"></audio></td>"
            f"<td>{html.escape(row['current_comprehensibility_1_9'])}</td>"
            f"<td>{html.escape(row['current_accentedness_1_9'])}</td>"
            "<td><input data-field=\"final_comprehensibility_1_9\" data-kind=\"practice\" "
            f"data-id=\"{html.escape(row['trial_index'])}\" type=\"number\" min=\"1\" max=\"9\"></td>"
            "<td><input data-field=\"final_accentedness_1_9\" data-kind=\"practice\" "
            f"data-id=\"{html.escape(row['trial_index'])}\" type=\"number\" min=\"1\" max=\"9\"></td>"
            "<td><select data-field=\"accepted_for_practice\" data-kind=\"practice\" "
            f"data-id=\"{html.escape(row['trial_index'])}\"><option></option><option value=\"1\">accept</option><option value=\"0\">reject</option></select></td>"
            "<td><input data-field=\"notes\" data-kind=\"practice\" "
            f"data-id=\"{html.escape(row['trial_index'])}\" type=\"text\"></td>"
            "</tr>"
        )
    return "\n".join(body)


def repair_table(rows: list[dict[str, str]]) -> str:
    body = []
    for index, row in enumerate(rows, start=1):
        body.append(
            "<tr>"
            f"<td>{html.escape(row['target_word'])}</td>"
            f"<td>{html.escape(row['l1_condition'])}/{html.escape(row['pronunciation_condition'])}</td>"
            f"<td>{html.escape(row['participant_id'])}</td>"
            f"<td><audio controls preload=\"metadata\" src=\"{html.escape(row['source_browser_audio_src'])}\"></audio></td>"
            f"<td><audio controls preload=\"metadata\" src=\"{html.escape(row['candidate_browser_audio_src'])}\"></audio></td>"
            f"<td>{html.escape(row['full_scale_sample_count'])}</td>"
            f"<td>{html.escape(row['original_peak_abs'])} -> {html.escape(row['repaired_peak_abs'])}</td>"
            "<td><select data-field=\"decision\" data-kind=\"repair\" "
            f"data-id=\"{index}\"><option></option><option value=\"use_candidate\">use candidate</option>"
            "<option value=\"accept_original\">accept original</option><option value=\"request_new_recording\">request new recording</option></select></td>"
            "<td><input data-field=\"notes\" data-kind=\"repair\" "
            f"data-id=\"{index}\" type=\"text\"></td>"
            "</tr>"
        )
    return "\n".join(body)


def html_page(practice_rows: list[dict[str, str]], repair_rows: list[dict[str, str]]) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accentedness Stimulus Review Packet</title>
  <style>
    body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; line-height: 1.45; color: #1f2933; }}
    h1, h2 {{ margin-top: 28px; }}
    table {{ border-collapse: collapse; width: 100%; margin: 12px 0 24px; }}
    th, td {{ border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }}
    th {{ background: #f1f5f9; text-align: left; }}
    audio {{ width: 220px; }}
    input, select {{ width: 100%; min-width: 80px; box-sizing: border-box; }}
    button {{ padding: 8px 12px; }}
    .note {{ max-width: 900px; }}
  </style>
</head>
<body>
  <h1>Accentedness Stimulus Review Packet</h1>
  <p class="note">Review the selected practice reference ratings and the clipped-audio repair candidate. Use the CSV templates as the source of record after review. This page stores nothing remotely.</p>
  <p>
    Reviewer <input id="reviewer-name" type="text" style="width: 220px;">
    Review date <input id="review-date" type="date" style="width: 160px;">
  </p>

  <h2>Practice Reference Ratings</h2>
  <p>Enter final 1-9 reference ratings and mark whether each practice item is accepted.</p>
  <table>
    <thead>
      <tr><th>#</th><th>Word</th><th>Condition</th><th>Voice</th><th>Audio</th><th>Current comp.</th><th>Current accent.</th><th>Final comp.</th><th>Final accent.</th><th>Accept</th><th>Notes</th></tr>
    </thead>
    <tbody>{practice_table(practice_rows)}</tbody>
  </table>

  <h2>Audio Repair Candidate</h2>
  <p>Compare the original clipped file and the candidate. Choose whether to use the candidate, accept the original, or request a new recording.</p>
  <table>
    <thead>
      <tr><th>Word</th><th>Condition</th><th>Speaker</th><th>Original</th><th>Candidate</th><th>Repaired samples</th><th>Peak abs</th><th>Decision</th><th>Notes</th></tr>
    </thead>
    <tbody>{repair_table(repair_rows)}</tbody>
  </table>

  <button id="export-review">Export filled review CSV</button>
  <script>
    const practiceRows = {json.dumps(practice_rows, ensure_ascii=False)};
    const repairRows = {json.dumps(repair_rows, ensure_ascii=False)};
    function csvEscape(value) {{
      const text = String(value ?? "");
      return /[",\\n\\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
    }}
    function collect(kind, rows) {{
      return rows.map((row, index) => {{
        const id = kind === "practice" ? row.trial_index : String(index + 1);
        document.querySelectorAll(`[data-kind="${{kind}}"][data-id="${{id}}"]`).forEach((el) => {{
          row[el.dataset.field] = el.value;
        }});
        return row;
      }});
    }}
    document.getElementById("export-review").addEventListener("click", () => {{
      const reviewer = document.getElementById("reviewer-name").value;
      const reviewDate = document.getElementById("review-date").value;
      const rows = [...collect("practice", practiceRows), ...collect("repair", repairRows)];
      rows.forEach((row) => {{
        if (row.review_item_type === "practice_reference_rating") {{
          if (!row.reviewer) row.reviewer = reviewer;
          if (!row.review_date) row.review_date = reviewDate;
        }}
        if (row.review_item_type === "audio_repair_candidate") {{
          if (!row.accepted_by) row.accepted_by = reviewer;
          if (!row.accepted_date) row.accepted_date = reviewDate;
        }}
      }});
      const columns = Array.from(rows.reduce((set, row) => {{
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }}, new Set()));
      const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column] || "")).join(","))].join("\\n") + "\\n";
      const blob = new Blob([csv], {{ type: "text/csv;charset=utf-8" }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "completed_stimulus_review.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }});
  </script>
</body>
</html>
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selected-practice", type=Path, default=DEFAULT_SELECTED_PRACTICE)
    parser.add_argument("--audio-repair-summary", type=Path, default=DEFAULT_AUDIO_REPAIR_SUMMARY)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args()

    selected_rows = read_csv(args.selected_practice.expanduser().resolve())
    repair_rows_source = read_csv(args.audio_repair_summary.expanduser().resolve())
    practice_rows = practice_review_rows(selected_rows)
    repair_rows = repair_review_rows(repair_rows_source)

    out_dir = args.out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    practice_path = out_dir / "practice_reference_rating_review_template.csv"
    repair_path = out_dir / "audio_repair_review_template.csv"
    html_path = out_dir / "stimulus_review_packet.html"
    readme_path = out_dir / "README.md"

    write_csv(practice_path, practice_rows, list(practice_rows[0].keys()) if practice_rows else [])
    write_csv(repair_path, repair_rows, list(repair_rows[0].keys()) if repair_rows else [])
    html_path.write_text(html_page(practice_rows, repair_rows), encoding="utf-8")
    readme_path.write_text(
        "\n".join(
            [
                "# Stimulus Review Packet",
                "",
                "Open `stimulus_review_packet.html` in a browser, listen to each item, and export the completed CSV.",
                "",
                "Files:",
                "",
                "- `practice_reference_rating_review_template.csv`: source template for final practice reference ratings.",
                "- `audio_repair_review_template.csv`: source template for the clipping repair decision.",
                "- `stimulus_review_packet.html`: browser listening form.",
                "",
                "Do not update the production app until the completed review CSV has been applied and preflight passes.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"review packet: {out_dir}")
    print(f"practice template: {practice_path}")
    print(f"repair template: {repair_path}")
    print(f"html: {html_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
