# Local Skill Runtime Contract

## Version Boundary

The local Skill Runtime is a closed registry, plan validator, approval ledger, and narrowly scoped contract dispatcher. It does **not** call an LLM, execute shell commands, contact the network, infer new executable skills, or accept skills registered from user input.

Two plan versions are accepted:

- **v1 approval ledger**: records the user-confirmed plan only. It has no target-file dispatcher.
- **v2 contract dispatch**: may execute exactly one deterministic tool bridge declared by the approved plan.

The v2 executable bridges are:

```text
experience-structuring
  -> resume-materials.import
  -> data/resume-materials.json
  -> interview-prep/story-bank.md
```

```text
jd-analysis
  -> job-analysis.import
  -> data/job-analysis/{analysisId}.json
  -> reports/job-analysis/{analysisId}.md
```

All other registry skills and tools remain discoverable and plannable but are not executable by the Runtime dispatcher. They must continue through their own contract CLI commands until a bridge is explicitly implemented, tested, and documented.

## Commands

```bash
node skill-runtime.mjs list [--json]
node skill-runtime.mjs check <plan.json> [--json]
node skill-runtime.mjs run <plan.json> [--json]
node skill-runtime.mjs run <plan.json> --apply [--json]
node skill-runtime.mjs run <plan.json> --apply --replace [--json]
```

`list` is read-only and exposes only the repository registry; its `dispatchable` flag identifies the two implemented bridges. `check` is read-only. `run` defaults to dry-run and creates no run record or target object.

## Registry Rules

Registry entries live only in `cli/skill-runtime.mjs`. User input, JD text, web content, session history, and imported packages cannot add or modify registry entries.

The closed v0.1 skill set is:

| Skill | Allowed tools |
|---|---|
| `experience-structuring` | `resume-materials.import` |
| `jd-analysis` | `job-analysis.import` |
| `scam-check` | `scam-check.import` |
| `resume-generation` | `resume-final.import`, `resume-render.import` |
| `interview-preparation` | `interview-prep.import` |
| `interview-review` | `interview-review.import`, `capability-feedback.import` |

Every registry entry declares target modules, input kinds, allowed target paths, no-write targets, and a downgrade path. A plan cannot use a tool that its skill did not declare.

## Plan Contract

Schema: `get-yourself.skill-run-plan`, version 1 or 2.

Required fields:

- `runId`: safe stable run identity.
- `generatedAt`: ISO-8601 UTC timestamp.
- `traceId`: safe trace identity.
- `confirmation`: must be `user_confirmed`.
- `userIntent`: short human-readable intent summary. This is not raw sensitive input.
- `skillKey`: one registry key.
- `inputFingerprints`: input kind plus SHA-256 content hash. Raw input is not stored in the plan or Trace.
- `toolCalls`: closed list of `toolKey` plus declared target objects.
- v2 only, for the dispatchable call:
  - `contractFile`: `/`-separated path relative to the CLI data root.
  - `contractFileHash`: exact-byte SHA-256 hash of that contract file.
- `failureRecovery`: user-readable recovery path.

Validation rejects unknown fields, unregistered skills, unconfirmed plans, unsupported input kinds, undeclared tools, paths outside the shared skill/tool whitelist, duplicate target writes, and target paths containing traversal or absolute-path syntax. Every tool-call target must be allowed by both the selected skill and that exact tool. A v2 dispatch plan must contain exactly one call, and its target list must exactly match the selected bridge's declared target set. A v1 plan cannot carry v2 dispatch fields.

For `job-analysis.import`, both target paths must use the same safe `analysisId`. Before check, dry-run, and apply, Runtime parses the hash-bound contract, reads its `analysisId`, and compares the contract-derived target paths with the plan-declared paths. A mismatch fails with `dispatch-target-contract-mismatch` before a run record or target object is written.

The plan content hash covers the complete canonical plan, including `generatedAt`. Reusing a `runId` for a different plan is a conflict and requires explicit `--replace`.

Before `check`, dry-run, and apply, the Runtime recomputes the v2 contract file's exact-byte SHA-256. If the file changed after approval, execution fails with `dispatch-contract-drift`; the old approval never silently accepts new contract bytes.

## Run Record

Schema: `get-yourself.skill-run-record`; the record version follows the plan version.

Runtime records are user-layer files:

- `data/skill-runs/{runId}.json`
- backups: `data/skill-run-backups/{runId}/`

The record contains the intent summary, skill, plan generation time, input fingerprints, plan hash, calls, targets, no-write targets, recovery path, trace ID, and execution boundary. It does not contain raw resumes, complete JDs, HR messages, credentials, terminal logs, or full sensitive source text.

### v1 Execution Record

A v1 record explicitly reports:

- `execution.mode = approval-ledger`
- `execution.status = recorded`
- `dispatchedToolCount = 0`
- `targetWriteCount = 0`

It does not execute a contract tool or mutate target objects.

### v2 Execution Record

A v2 record uses `execution.mode = contract-dispatch` and records target state before and after the tool call:

```text
targetFingerprints.before
targetFingerprints.after
```

Each fingerprint covers the exact declared target and reports either `missing` or a regular-file SHA-256 content hash. The execution status progresses honestly:

| Status | Meaning |
|---|---|
| `prepared` | Target shape and before fingerprints passed; the run record was written before execution. |
| `dispatched` | The deterministic tool returned success and the final record, including after fingerprints, was written. |
| `failed` | The tool returned an error; after fingerprints are stored when observable, and the error identifies the tool error code. |

Apply order is:

1. Revalidate the skill/tool whitelist and approved contract-file hash.
2. Inspect target shape and record before fingerprints.
3. Write the `prepared` record.
4. Invoke the existing deterministic importer.
5. Record after fingerprints and replace the record with `dispatched`.
6. On tool failure, record `failed` with observable after state.

If the tool succeeds but the final record cannot be written, the `prepared` record remains on disk and the command fails with `skill-run-record-write-failed`; Runtime does not fabricate success. A later apply of the same unchanged plan may resume from that record.

Repeated `run --apply` with the same already-dispatched v2 plan is idempotent. A different plan with the same `runId` fails with `skill-run-conflict`; explicit replacement backs up the previous record and records `replacesPlanContentHash`.

Different current bridge targets also require explicit `--replace`. Without it, apply fails with `skill-target-conflict` before writing the run record. With explicit replacement, the underlying importer creates its own target-specific backups and the run record stores their relative paths.

Tool-result records remain bridge-specific. The resume-materials result stores `packageId` plus `materials` / `storyBank` backup paths. The job-analysis result stores `objectId` (the `analysisId`) plus `package` / `markdown` backup paths. Both include the tool key, action, and incoming contract content hash.

Invalid target shape, such as a directory where a target file must be, fails with `invalid-target-state` before approval or target execution.

## Dispatcher Expansion Boundary

A later bridge may execute only the exact tool call named in an approved v2 plan. It must:

1. Re-check the registered skill and plan hash.
2. Bind and recheck its contract file's exact-byte hash.
3. Run its dry-run before apply.
4. Record before/after target fingerprints.
5. Stop at the first failure and report completed versus pending calls.
6. Keep run-record semantics at least as strict as `prepared`, `dispatched`, and `failed`.
