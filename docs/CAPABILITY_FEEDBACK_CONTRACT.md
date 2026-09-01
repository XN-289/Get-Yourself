# Capability Feedback Contract

## Purpose

`capability-feedback.mjs` stores a user-confirmed local ledger that maps interview-review candidates to abilities in the installed evidence package. Gap mappings become local follow-up actions. STAR-story mappings become local `user_confirmed` evidence candidates.

This is a ledger, not a mutation layer. It does not update the current evidence package, materials, story bank, `cv.md`, tracker state, capability scores, or platform data.

## Commands

```powershell
node capability-feedback.mjs check <feedback.json> [--json]
node capability-feedback.mjs import <feedback.json> [--json]
node capability-feedback.mjs import <feedback.json> --apply [--replace] [--json]
```

`check` and `import` without `--apply` are read-only. An import writes only after `--apply`. Replacing different installed content or a manually edited report requires `--apply --replace`; replaced files are backed up first.

## Package Schema

Top-level schema is `get-yourself.capability-feedback`, version `1`.

Required fields:

- `schema`, `schemaVersion`, `feedbackId`, `generatedAt`, `traceId`
- `evidencePackageId`, `evidenceContentHash`
- `materialsPackageId`, `materialsContentHash`
- `reviewId`, `reviewContentHash`
- `confirmation`
- `gapFeedback`, `storyFeedback`

`confirmation` must be `user_confirmed`. The evidence, materials, and review IDs and hashes must match the installed packages. The review must resolve through the installed materials and preparation packages. At least one gap or story mapping must be selected. Semantic hashing excludes only `generatedAt`; all other content changes produce a different hash.

Unknown fields are rejected at every level. IDs use the shared safe-ID rules and are unique within their collection.

### Gap Feedback

Each item contains:

- `id`
- `reviewGapId`, which must identify a capability-gap candidate in the selected review
- `abilityId`, which must identify an ability in the selected evidence package
- `followUp`, a concrete local action of at most 300 characters

Canonical import derives the gap label and description from the review. The input cannot supply those derived values. The result is a local follow-up task, not an ability-score change.

### Story Feedback

Each item contains:

- `id`
- `reviewStoryId`, which must identify a STAR candidate in the selected review
- `evidenceId`, a safe ID reserved for the local evidence candidate
- `abilityIds`, one to ten unique IDs from the selected evidence package
- `evidenceSummary`, a user-confirmed summary of at most 240 characters

Canonical import derives one local evidence candidate per story:

- title from the review story
- user-confirmed summary
- occurrence time from the review
- `sourceType: interview_review`
- `sourceId` equal to the review story ID
- `verification: user_confirmed`
- selected existing ability IDs
- feedback trace ID

The input cannot supply the derived candidate object. The candidate remains in this ledger and is not inserted into the current evidence package.

## Stored Files

Applied packages and rendered reports are:

- `data/capability-feedback/{feedbackId}.json`
- `reports/capability-feedback/{feedbackId}.md`

Backups are stored under `data/capability-feedback-backups/{feedbackId}/`.

The JSON package is authoritative. The Markdown report is deterministic and intended for local review. Import never modifies the evidence package, resume materials, story bank, `cv.md`, interview preparation or review files, tracker state, capability scores, or external systems.

## Status

`gy --status` exposes a read-only `capabilityFeedback` section:

- `blocked`: the evidence package, materials, or reviews required by the local workflow are missing.
- `missing`: dependencies are readable, but no feedback package exists.
- `ready`: package count, mapping counts, and report state.
- `invalid`: a package, dependency, or report cannot be inspected safely.

Natural-language requests that ask to feed review results back to capability assets route to `capability-feedback.mjs`. Routing is only an instruction to draft and validate the contract; it does not bypass user confirmation or `--apply`.
