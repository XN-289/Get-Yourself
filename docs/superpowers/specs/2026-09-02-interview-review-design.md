# Interview Review Contract Design

Date: 2026-09-02
Stage: Stage 4c
Status: approved direction, pending implementation

## Goal

Add a local, contract-governed interview review workflow after Stage 4a / 4b. The review captures what happened in a specific written test or interview, which answers were weak, what should change next time, and which STAR stories need reinforcement or follow-up.

This stage turns a review into inspectable local data. It does not complete the later ability-asset feedback loop.

## Product Shape

A review is tied to one company, role, and interview occasion. It may reference the matching interview preparation package and current resume materials package. The user confirms the structured review before any file is written.

The workflow is:

1. The user describes or pastes a review into the Agent.
2. The Agent drafts a structured review candidate.
3. The user edits and confirms facts, question assessments, improvements, gaps, and next steps.
4. `interview-review.mjs check` validates the draft without writing.
5. `interview-review.mjs import` previews the deterministic Markdown.
6. Only explicit `--apply` writes the review package and Markdown.
7. Replacing different content or a manually edited Markdown file requires `--replace`.

The Agent may draft, but deterministic validation owns schema checks, reference checks, hashes, persistence, and rendering.

## Scope

Included:

- New CLI contract: `get-yourself.interview-review`, version 1.
- Local package storage under `data/interview-review/`.
- Deterministic review Markdown under `interview-prep/sessions/`.
- Explicit dry-run, apply, replace, backup, and atomic write behavior.
- Read-only status inspection through `gy --status`.
- Intent routing and a review mode that instruct the Agent to draft only user-confirmed facts.
- References to the current materials package and, when supplied, an installed interview preparation package.
- STAR reinforcement references and new story candidates.
- Capability-gap candidates and next actions as local review data.

Excluded:

- No automatic upload or web synchronization.
- No direct write to `data/resume-materials.json`, `interview-prep/story-bank.md`, or `cv.md`.
- No direct write to platform ability assets, growth records, or Agent Trace.
- No automatic update of application status or interview node status.
- No LLM call embedded in the deterministic importer.
- No storage of raw external pages, transcripts, contact notes, credentials, tokens, or cookies.
- No claim that a JD requirement is a student ability.

## Data Contract

The review package is UTF-8 JSON, limited to 128 KiB, with strict top-level and nested field whitelists. IDs use the existing safe-ID pattern. Timestamps use ISO-8601 UTC. Semantic hashing excludes `generatedAt`, matching prior contracts.

Required top-level fields:

- `schema`: fixed to `get-yourself.interview-review`.
- `schemaVersion`: fixed to `1`.
- `reviewId`: unique safe ID used for JSON and Markdown filenames.
- `generatedAt`: UTC timestamp, excluded from semantic hash.
- `traceId`: local trace pointer.
- `materialsPackageId`: must match the installed materials package.
- `materialsContentHash`: must match the installed materials semantic hash.
- `company`: 1 to 80 characters.
- `role`: 1 to 60 characters.
- `occasion`: written test, technical interview, manager interview, HR interview, group interview, mixed, or other.
- `occurredAt`: UTC timestamp for the interview or test.
- `confirmation`: only `user_confirmed`.
- `questions`: one to fifty structured question records.
- `improvements`: zero to thirty structured improvement records.
- `capabilityGaps`: zero to twenty gap candidates.
- `storyCandidates`: zero to twenty STAR candidates.
- `nextSteps`: zero to ten actions.
- `openQuestions`: zero to ten unresolved facts.

Optional top-level field:

- `prepId`: when present, must identify an installed preparation package whose materials package ID and hash match this review.

Question records contain:

- Safe unique ID.
- Question text.
- Performance: `strong`, `adequate`, `weak`, or `unknown`.
- Optional answer note.
- Optional current-story references.
- Optional improvement focus.

Improvement records contain:

- Safe unique ID.
- Focus category: technical, story, communication, process, company research, logistics, or other.
- What to improve.
- Concrete next action.
- Optional linked question IDs.

Capability-gap candidates contain:

- Safe unique ID.
- Capability label.
- Signal source: interview question, user observation, JD requirement, or other external clue.
- Gap description.
- Candidate-only confirmation state. They are not ability evidence until a later explicit feedback contract accepts them.

STAR story candidates mirror the Stage 4a story shape:

- Safe unique ID.
- Title and Situation / Task / Action / Result.
- Tags.
- References to current material entries.
- Source type fixed to `interview_review`.
- Optional open questions.

A story candidate must only state facts confirmed by the user in the review. A JD-derived requirement can create a gap or preparation action, never a student story fact.

## Storage And Rendering

Applied files:

- `data/interview-review/{reviewId}.json`
- `interview-prep/sessions/{reviewId}.md`

Backups:

- `data/interview-review-backups/{reviewId}/`

The package is the authoritative structured record. The Markdown is a deterministic rendering for human review. The Markdown header states that it is a review record, not ability evidence and not a synced platform summary.

The Markdown includes:

- Company, role, occasion, and occurrence time.
- Materials and preparation provenance.
- Question, performance, answer note, and linked story.
- Improvements grouped by focus.
- Capability-gap candidates, explicitly marked as local candidates.
- STAR candidates with their material references.
- Next actions and open questions.

Rendering is deterministic: the same canonical package always produces byte-identical Markdown.

## Validation Rules

- Unknown fields at any level are rejected.
- All IDs are unique within their collection.
- Cross-references must resolve inside the same package.
- `storyRefs` and candidate `entryRefs` must exist in the current materials package.
- A supplied `prepId` must resolve to an installed preparation package with the same materials provenance.
- Semantic content that differs only in `generatedAt` is idempotent.
- Writing different content over an existing review requires `--replace`.
- Repairing manually edited Markdown requires `--replace`.
- Replaced JSON and Markdown files are backed up before write, with at most ten recent backup pairs per review ID.
- Writes are atomic and never touch unrelated user-layer files.

## CLI Interface

From `cli/`:

```powershell
node interview-review.mjs check templates/interview-review.example.json
node interview-review.mjs import path/to/review.json
node interview-review.mjs import path/to/review.json --apply
node interview-review.mjs import path/to/review.json --apply --replace
```

`check` is read-only. `import` defaults to dry-run and returns the expected Markdown. Errors distinguish invalid JSON, unsupported versions, contract violations, unavailable dependencies, unsafe paths, and replacement requirements.

`gy --status` reports review state as:

- `blocked`: no installed materials package.
- `missing`: no review packages.
- `ready`: package count and Markdown state.
- `invalid`: broken package, dependency, or Markdown state.

The status command remains read-only.

## Agent Integration

Add a `review` mode and route phrases containing review language to it. The mode requires the Agent to:

1. Confirm company, role, occasion, and time.
2. Ask for the questions and user's own assessment.
3. Separate user facts from JD and interviewer cues.
4. Draft gap and story candidates without inventing outcomes.
5. Generate the contract JSON only after user confirmation.
6. Run dry-run before apply.

Review language does not automatically mean a negative result. The mode should preserve what went well and convert weak answers into concrete next actions without anxiety-driven copy.

## Testing

CLI tests should cover:

- Canonicalization and semantic-hash stability across `generatedAt` changes.
- Strict rejection of unknown fields, unconfirmed packages, invalid enums, duplicate IDs, and broken references.
- Materials and optional preparation dependency matching.
- Dry-run writes nothing.
- Apply writes package and Markdown and does not touch materials, story bank, or `cv.md`.
- Identical import is idempotent.
- Different content and manually edited Markdown require explicit replacement.
- Backups and Markdown determinism.
- Read-only missing, ready, and invalid status inspection.
- Intent routing and `gy --status` integration.

Required verification:

```powershell
cd cli
npm test
node --check interview-review.mjs
node --check gy.mjs
node --check lib/intent-router.mjs
```

Any documentation-only changes are reviewed against the current repository state. No backend or frontend build is required unless implementation later touches those areas.

## Future Extension

The next stage after this contract should define an explicit ability-asset feedback package. It can consume confirmed review gaps and story candidates, but must require a separate user confirmation before any platform write. This preserves the boundary between local review facts, resume materials, and cloud ability assets.
