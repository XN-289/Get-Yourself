# Interview Review Contract

## Purpose

`interview-review.mjs` stores a user-confirmed local record of one written test or interview. It turns weak answers into concrete actions, and keeps capability gaps and STAR stories as local candidates. It is not ability evidence and does not sync to the platform.

## Commands

```powershell
node interview-review.mjs check <review.json> [--json]
node interview-review.mjs import <review.json> [--json]
node interview-review.mjs import <review.json> --apply [--replace] [--json]
```

`check` and `import` without `--apply` are read-only. Different existing content or manually edited Markdown requires `--apply --replace`; replaced files are backed up before writing.

## Package Schema

Top-level schema is `get-yourself.interview-review`, version `1`.

Required fields:

- `schema`, `schemaVersion`, `reviewId`, `generatedAt`, `traceId`
- `materialsPackageId`, `materialsContentHash`
- `company`, `role`, `occasion`, `occurredAt`
- `confirmation`
- `questions`, `improvements`, `capabilityGaps`, `storyCandidates`
- `nextSteps`, `openQuestions`

Optional field:

- `prepId`, which must identify an installed preparation package generated from the same materials package.

Unknown fields are rejected at every level. IDs must be safe and unique within their collection. Cross-references must resolve. `storyRefs` and candidate `entryRefs` must exist in the installed materials package. `confirmation` must be `user_confirmed`. Semantic hashing excludes only `generatedAt`.

### Questions

Fields: `id`, `question`, `performance`, and optional `answerNote`, `storyRefs`, `improvementFocus`.

Allowed performance values: `strong`, `adequate`, `weak`, `unknown`.

### Improvements

Fields: `id`, `focus`, `what`, `action`, and optional `questionRefs`.

Allowed focus values: `technical`, `story`, `communication`, `process`, `company_research`, `logistics`, `other`.

### Capability Gap Candidates

Fields: `id`, `capability`, `signalSource`, `description`.

Allowed signal sources: `interview_question`, `user_observation`, `jd_requirement`, `other_external_clue`. These records remain local candidates until `capability-feedback.mjs` maps the user-confirmed subset into the local capability-feedback ledger.

### STAR Story Candidates

Fields: `id`, `title`, `situation`, `task`, `action`, `result`, `tags`, `entryRefs`, `sourceType`, and optional `openQuestions`.

`sourceType` is fixed to `interview_review`. Candidate facts must be user-confirmed and may only reference installed material entries.

## Stored Files

Applied packages and rendered records are:

- `data/interview-review/{reviewId}.json`
- `interview-prep/sessions/{reviewId}.md`

Backups are stored under `data/interview-review-backups/{reviewId}/`.

The package is authoritative. The Markdown is deterministic and intended for human review. Import never modifies resume materials, the story bank, `cv.md`, capability assets, tracker state, or external systems. Capability feedback also remains local: it may create follow-up tasks and evidence candidates in its own ledger, but it does not update this review, the current evidence package, capability scores, or platform data.

## Status

`gy --status` exposes a read-only `interviewReview` section:

- `blocked`: no installed resume materials package.
- `missing`: no review packages.
- `ready`: package count and per-package Markdown state.
- `invalid`: a package, dependency, or Markdown cannot be inspected safely.
