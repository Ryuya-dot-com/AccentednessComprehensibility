# Project TODO

## Upcoming Operational Tasks

- [ ] Add final stimulus audio when collaborators send the files.
  - Convert received stimulus files to `.mp3`.
  - Add the `.mp3` files to the GitHub working copy.
  - Update `remote_manifest.csv` so all stimulus paths point to the committed `.mp3` files.
  - Verify the counterbalance manifest and dry-run flow locally.
  - Commit and push to `Ryuya-dot-com/AccentednessComprehensibility`.

- [ ] Add participant questionnaire support if collaborators request it.
  - Add the requested questionnaire fields to the participant flow.
  - Persist questionnaire responses in the server-backed data model.
  - Include questionnaire responses in the downloadable admin export files.
  - Verify that completed participant sessions can be downloaded with questionnaire data included.
