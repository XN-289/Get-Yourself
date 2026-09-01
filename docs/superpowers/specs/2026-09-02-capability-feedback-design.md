# Capability Feedback Contract Design

Date: 2026-09-02
Stage: Stage 4d
Status: implemented, pending unified user acceptance

## Goal

Complete the local half of the capability feedback loop. A user-confirmed interview review can now be mapped to existing ability IDs in the installed evidence package. Gap mappings create local follow-up records, and STAR mappings create local `user_confirmed` evidence candidates.

This contract is a ledger, not a mutation into the current evidence package. It never invents scores, never edits source packages, and never synchronizes the platform.

## Workflow

1. The Agent reads an installed review and identifies its gap and STAR candidates.
2. The user maps each selected gap or story to one or more existing ability IDs from the installed evidence package.
3. For each gap, the user confirms a concrete follow-up action.
4. For each STAR story, the user confirms a concise evidence summary suitable for later evidence review.
5. `capability-feedback.mjs check` validates the draft without writing.
6. `capability-feedback.mjs import` previews the deterministic report.
7. Only explicit `--apply` writes the local ledger package and report.
8. Replacing different content requires `--apply --replace`.

The deterministic importer owns schema checks, provenance checks, hashing, backups, persistence, and rendering. The Agent may draft mappings, but cannot bypass explicit confirmation.

## Scope

Included:

- Schema `get-yourself.capability-feedback`, version `1`.
- CLI module `cli/capability-feedback.mjs`.
- Input template `cli/templates/capability-feedback.example.json`.
- Contract documentation `docs/CAPABILITY_FEEDBACK_CONTRACT.md`.
- Local packages under `data/capability-feedback/`.
- Deterministic reports under `reports/capability-feedback/`.
- Backups under `data/capability-feedback-backups/{feedbackId}/`.
- Read-only status in `gy --status`.
- Intent routing for capability feedback requests.

Excluded:

- No write to `data/evidence-package.json`.
- No write to `data/resume-materials.json`, `interview-prep/story-bank.md`, or `cv.md`.
- No write to installed interview preparation or review files.
- No tracker update.
- No score, level, confidence, or recommendation calculation.
- No platform, cloud, or Agent Trace write.
- No automatic promotion from candidate to current evidence.

## Data Contract

The input is UTF-8 JSON, limited to 128 KiB, with strict field whitelists. IDs use the existing safe-ID pattern, timestamps use ISO-8601 UTC, and semantic hashing excludes only `generatedAt`.

Required top-level fields:

- `schema`: fixed to `get-yourself.capability-feedback`.
- `schemaVersion`: fixed to `1`.
- `feedbackId`: safe ID used in local filenames.
- `generatedAt`: UTC timestamp, excluded from the semantic hash.
- `traceId`: local trace pointer.
- `evidencePackageId` and `evidenceContentHash`: must match the installed evidence package.
- `materialsPackageId` and `materialsContentHash`: must match the installed resume materials package.
- `reviewId` and `reviewContentHash`: must match the installed review package.
- `confirmation`: only `user_confirmed`.
- `gapFeedback`: zero to twenty gap mappings.
- `storyFeedback`: zero to twenty STAR mappings.

At least one mapping must be selected. A mapping cannot silently alter an unselected review candidate.

Gap feedback fields:

- `id`: safe unique feedback record ID.
- `reviewGapId`: must identify a candidate in the referenced review.
- `abilityId`: must identify an ability in the installed evidence package.
- `followUp`: concrete local follow-up action.

Canonical gap feedback additionally retains the review's capability label and description. It represents a local gap/follow-up task, not an ability score change.

Story feedback fields:

- `id`: safe unique feedback record ID.
- `reviewStoryId`: must identify a STAR candidate in the referenced review.
- `evidenceId`: safe ID reserved for the local evidence candidate.
- `abilityIds`: one to ten existing ability IDs.
- `evidenceSummary`: concise user-confirmed summary, one to 240 characters.

Canonical story feedback derives a local evidence candidate with:

- The review story's title.
- The user-confirmed evidence summary.
- The review occurrence time.
- `sourceType: interview_review`.
- `sourceId` fixed to the review story candidate ID.
- `verification: user_confirmed`.
- The selected existing ability IDs.
- The feedback trace ID.

The candidate is a local ledger record. It is not inserted into the current evidence package.

## Validation Rules

- Unknown fields at every level are rejected.
- IDs are unique within each collection.
- Review, evidence, and materials IDs and hashes must match installed packages.
- The selected `reviewId` must resolve through the installed materials package and installed preparation packages.
- Gap and story references must resolve in that exact review.
- Ability references must resolve in the exact installed evidence package.
- Semantic content that differs only in `generatedAt` is idempotent.
- Dry-run writes nothing.
- Different existing JSON or report content requires explicit replacement.
- Replaced files are backed up before writing.
- Atomic writes touch only the new ledger JSON and report.

## Rendering

The report states the local-only boundary and shows:

- Evidence, materials, and review provenance.
- Each selected gap with its ability mapping and follow-up action.
- Each selected STAR story with its reserved evidence candidate and ability mappings.
- Explicit warnings that scores are unchanged and the current evidence package is unchanged.

The same canonical package always renders byte-identical Markdown.

## Status And Routing

`gy --status` exposes `capabilityFeedback`:

- `blocked`: a required evidence, materials, or review dependency is missing.
- `missing`: dependencies are readable but no feedback packages exist.
- `ready`: package count, candidate counts, and report state.
- `invalid`: a package, dependency, or report cannot be inspected safely.

The router sends explicit capability feedback requests to `capability-feedback.mjs`, before generic review and capability routes. The route repeats the write boundary and requires the normal dry-run / apply / replace workflow.

## Testing

Tests must cover:

- Strict schema and reference validation.
- Dependency hash and ID validation.
- Semantic hash stability across `generatedAt`.
- Dry-run no-write behavior.
- Apply writes only ledger JSON and report.
- Downstream isolation from evidence package, materials, story bank, review files, and `cv.md`.
- Idempotent identical import.
- Different content and report drift require replacement.
- Backup behavior.
- Read-only blocked, missing, ready, and invalid status.
- Status and intent routing integration.

Required verification:

```powershell
cd cli
npm test
node --check capability-feedback.mjs
node --check interview-review.mjs
node --check gy.mjs
node --check lib/intent-router.mjs
```
