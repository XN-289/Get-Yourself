# Local Skill Runtime Contract

## v0.1 Boundary

The local Skill Runtime is an approval ledger and dispatch whitelist. It does **not** call an LLM, execute shell commands, mutate target objects, contact the network, or infer new executable skills.

`run --apply` records one user-confirmed plan under `data/skill-runs/{runId}.json`. A record explicitly reports:

- `execution.mode = approval-ledger`
- `dispatchedToolCount = 0`
- `targetWriteCount = 0`

Target writes still require the named deterministic contract tool and that tool's own `check`, dry-run, explicit `--apply`, and where applicable `--replace`.

## Commands

```bash
node skill-runtime.mjs list [--json]
node skill-runtime.mjs check <plan.json> [--json]
node skill-runtime.mjs run <plan.json> [--json]
node skill-runtime.mjs run <plan.json> --apply [--json]
node skill-runtime.mjs run <plan.json> --apply --replace [--json]
```

`list` is read-only and exposes only the repository registry. `check` is read-only. `run` defaults to dry-run and creates nothing.

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

Schema: `get-yourself.skill-run-plan` version 1.

Required fields:

- `runId`: safe stable run identity.
- `generatedAt`: ISO-8601 UTC timestamp.
- `traceId`: safe trace identity.
- `confirmation`: must be `user_confirmed`.
- `userIntent`: short human-readable intent summary. This is not raw sensitive input.
- `skillKey`: one registry key.
- `inputFingerprints`: input kind plus SHA-256 content hash. Raw input is not stored in the plan or Trace.
- `toolCalls`: closed list of `toolKey` plus declared target objects.
- `failureRecovery`: user-readable recovery path.

Validation rejects unknown fields, unregistered skills, unconfirmed plans, unsupported input kinds, undeclared tools, paths outside the shared skill/tool whitelist, duplicate target writes, and target paths containing traversal or absolute-path syntax. Every tool-call target must be allowed by both the selected skill and that exact tool.

The plan content hash covers the complete canonical plan, including `generatedAt`. Reusing a `runId` for a different plan is a conflict and requires explicit `--replace`.

## Run Record

Schema: `get-yourself.skill-run-record` version 1.

Runtime records are user-layer files:

- `data/skill-runs/{runId}.json`
- backups: `data/skill-run-backups/{runId}/`

The record contains the intent summary, skill, plan generation time, input fingerprints, plan hash, calls, targets, no-write targets, recovery path, trace ID, and execution boundary. It does not contain raw resumes, complete JDs, HR messages, credentials, terminal logs, or full sensitive source text.

Repeated `run --apply` with the same plan is idempotent. A different plan with the same `runId` fails with `skill-run-conflict`; explicit replacement backs up the previous record and records `replacesPlanContentHash`.

## Future Dispatcher Boundary

A later contract dispatcher may execute only the exact tool call named in an approved record. It must:

1. Re-check the registered skill and plan hash.
2. Invoke the existing deterministic CLI contract only.
3. Run its dry-run before apply.
4. Record before/after target fingerprints.
5. Stop at the first failure and report completed versus pending calls.
6. Never claim a target write in the v0.1 approval-ledger record.
