# Opportunity Tracker Design

Date: 2026-09-02
Status: approved for autonomous implementation

## Goal

Implement the first local, contract-governed Stage 5 company-opportunity tracker. A tracker package records one or more opportunities derived from installed job analyses, their ordered process nodes, user-confirmed node statuses, and references to real local artifacts.

This is a new authoritative local tree. It does not migrate, rewrite, or read the legacy `data/applications.md` tracker.

## Product Shape

Each opportunity is bound to one installed `get-yourself.job-analysis` package by analysis ID and semantic content hash. Company and role must exactly match that analysis. The opportunity records a stable natural identity:

- company
- role
- location, when represented
- recruitment batch
- source

The same natural identity cannot occur twice in an incoming tracker or across installed trackers. IDs do not make duplicates distinct.

Each opportunity stores an ordered node list. The recommended default chain is:

```text
JD analysis -> resume adaptation -> application -> written test
            -> first interview -> second interview -> offer
```

The chain is data, not a fixed state machine. Users and Agent-assisted drafts may add custom nodes and reorder nodes. Reordering preserves each node's status, timing, note, and artifact references because the node object itself moves in the array.

Allowed user-confirmed node statuses match the frontend:

- `todo`
- `active`
- `waiting`
- `passed`
- `failed`
- `offer`

No status is inferred from a report, interview review, capability feedback, JD text, or external web page.

## Artifact References

A node may reference installed local contract artifacts:

| Type | Installed package |
|---|---|
| `job-analysis` | `data/job-analysis/{analysisId}.json` |
| `interview-prep` | `data/interview-prep/{prepId}.json` |
| `interview-review` | `data/interview-review/{reviewId}.json` |
| `capability-feedback` | `data/capability-feedback/{feedbackId}.json` |

Every reference stores the contract ID and semantic content hash. Import fails if the package is missing, its filename does not match its ID, its content cannot be safely canonicalized through installed dependencies, or its hash is stale.

Artifact references are links. They never modify the referenced analysis, preparation, review, feedback, resume, capability asset, or platform data.

## Package Schema

Top-level schema is `get-yourself.opportunity-tracker`, version `1`:

- `schema`
- `schemaVersion`
- `trackerId`
- `generatedAt`
- `traceId`
- `confirmation`
- `opportunities`

`confirmation` must be `user_confirmed`. Unknown fields are rejected at every object level.

Each opportunity contains:

- `id`
- `analysisId`, `analysisContentHash`
- `company`, `role`
- optional `location`, `recruitmentBatch`, `source`
- `nextAction`
- `stages`

Each stage contains:

- `id`
- `name`
- `status`
- optional `scheduledAt`
- optional `note`
- optional `artifactRefs`

An artifact reference contains:

- `type`
- `id`
- `contentHash`

Semantic hashing excludes only top-level `generatedAt`. Every other change, including node ordering, changes the tracker hash.

## Storage And Lifecycle

Applied packages and deterministic reports are:

- `data/opportunity-tracker/{trackerId}.json`
- `reports/opportunity-tracker/{trackerId}.md`

Backups are stored under `data/opportunity-tracker-backups/{trackerId}/`.

The importer follows the shared contract lifecycle:

1. `check` is read-only.
2. `import` defaults to dry-run and writes nothing.
3. `--apply` is required for writing.
4. A different installed package or manually edited report requires `--apply --replace`.
5. Replaced files are backed up first.
6. Identical package and report imports are idempotent.

The JSON package is authoritative. Markdown is a deterministic local review surface.

## Integration

`gy --status` exposes a read-only `opportunityTracker` section:

- `blocked` when installed job analysis cannot be loaded because materials are missing.
- `missing` when no tracker package exists.
- `ready` with tracker, opportunity, stage, and report counts.
- `invalid` when a package, dependency, artifact, or report cannot be inspected safely.

Deterministic routing maps opportunity-write phrases such as adding an interview node, updating process status, or writing a job into a company opportunity to `opportunity-tracker.mjs`. Routing only identifies the workflow; it never bypasses confirmation or command-line write flags.

## Explicit Non-Goals

- No migration from `data/applications.md`.
- No write to old tracker tools or `data/status-log.tsv`.
- No resume mutation.
- No capability evidence or score mutation.
- No fraud-check claim; scam verification remains a separate Stage 5 workstream.
- No cloud/platform sync; Stage 6 remains unfinished.
- No in-page skill execution.

## Verification

Tests must prove canonicalization, analysis binding, artifact-hash validation, unknown-field rejection, duplicate natural identities, unique IDs, valid statuses, ordering-sensitive hashing, dry-run no-write, apply, idempotency, replacement, backups, downstream isolation, read-only status, deterministic Markdown, and routing.
