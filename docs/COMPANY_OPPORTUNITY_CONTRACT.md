# Company Opportunity Contract

## Purpose

`company-opportunity.mjs` turns one user-confirmed local job analysis into a local company-opportunity object and one linked tracker row. The opportunity is the interview-management object for later process nodes; the tracker row is the compact application progress index.

This is an explicit bridge, not an automatic continuation of job analysis. Installing an analysis does not create a company opportunity. Creating a company opportunity does not submit an application, mount an artifact, synchronize the web platform, or execute a node skill.

## Commands

```powershell
node company-opportunity.mjs check <opportunity.json> [--json]
node company-opportunity.mjs import <opportunity.json> [--json]
node company-opportunity.mjs import <opportunity.json> --apply [--replace] [--json]
node company-opportunity.mjs check-nodes <node-mutation.json> [--json]
node company-opportunity.mjs mutate-nodes <node-mutation.json> [--json]
node company-opportunity.mjs mutate-nodes <node-mutation.json> --apply [--json]
node company-opportunity.mjs check-artifact <artifact-mount.json> [--json]
node company-opportunity.mjs mount-artifact <artifact-mount.json> [--json]
node company-opportunity.mjs mount-artifact <artifact-mount.json> --apply [--json]
```

`check` and `import` without `--apply` are read-only. Import writes only after `--apply`. Replacing a different confirmed package requires `--apply --replace`. Changed package and tracker files are backed up before replacement or status-state synchronization.

Node mutation follows the same explicit boundary: `check-nodes` is read-only, `mutate-nodes` defaults to dry-run, and writes require `--apply`. Mutation uses the shared tracker lock to serialize with opportunity imports, but it never reads or changes tracker content.

## Package Schema

Input schema is `get-yourself.company-opportunity`, version `1`.

Required fields:

- `schema`, `schemaVersion`, `opportunityId`, `generatedAt`, `traceId`
- `analysisId`, `analysisContentHash`
- `company`, `role`, `recruitmentBatch`, `location`
- `confirmation`
- `initialTrackerStatus`
- `processNodes`

`confirmation` must be `user_confirmed`. `analysisId` and `analysisContentHash` must identify the currently installed job analysis, and `company` / `role` must exactly match that analysis. `initialTrackerStatus` must be `Evaluated`; it is a seed value, not the ongoing user status.

Unknown fields are rejected. In particular, an input file cannot supply `trackerStatus`. Installed JSON may contain `trackerStatus` as a local, importer-maintained mirror of the user-owned tracker status. It is excluded from the confirmed-package content hash, so importing the same source package remains idempotent and does not require `--replace`.

The natural identity is:

```text
normalized company + role + location + recruitment batch
```

The same `opportunityId` cannot change that identity, and another `opportunityId` cannot claim an already-installed identity. The batch distinction allows the same company and role to appear in different recruitment cycles.

### Process Nodes

Each node contains:

- `id`, `type`, `title`, `status`
- optional `skillKey`, `note`
- optional installed-only `artifacts`

Allowed types are `jd_analysis`, `resume_adaptation`, `submission`, `interview`, `offer`, `review_sedimentation`, and `custom`. Allowed seed statuses are `todo`, `active`, `waiting`, `passed`, `failed`, and `offer`.

These nodes are initial seeds only. Later node addition, ordering, status changes, and artifact links remain user-owned. This importer does not mutate existing node order or node statuses, and no node skill is executed. Confirmed input files cannot supply `artifacts`; only installed opportunity JSON may carry them after an explicit artifact mount. Node mutation input therefore omits `artifacts`, and the CLI preserves installed artifacts by node ID while applying a confirmed target node list.

### Node Mutation Plans

After installation, node changes use the `get-yourself.company-opportunity-node-mutation` v1 plan. The plan is a complete target node list, not a set of loose instructions. It binds `opportunityId`, `expectedOpportunityContentHash`, a `mutationId`, trace ID, user confirmation, a change summary, and the full ordered `processNodes` result.

The expected content hash prevents a stale plan from overwriting another user-confirmed change. The mutation only replaces `processNodes`; it cannot change company, role, location, batch, analysis binding, tracker status, or other opportunity facts. Repeating the same plan is idempotent, a different plan reusing the same `mutationId` is rejected, and an already-superseded historical plan is reported without another write.

Applied results and trace records are:

- updated `data/company-opportunities/{opportunityId}.json`
- `data/company-opportunity-mutations/{opportunityId}/{mutationId}.json`
- an opportunity backup under `data/company-opportunities-backups/{opportunityId}/`

Node mutation never updates `data/applications.md`, mounts an artifact, executes a node skill, uploads progress, or implies that an application was submitted.

### Artifact Mount Plans

After a real local file exists, mounting it to a process node uses the `get-yourself.company-opportunity-artifact-mount` v1 plan. The plan is separate from node mutation and carries:

- `mountId`, `opportunityId`, `nodeId`
- `generatedAt`, `traceId`, and `confirmation: user_confirmed`
- `expectedOpportunityContentHash`
- `artifact.kind`, `artifact.title`, `artifact.path`, and `artifact.contentHash`

`artifact.contentHash` is the SHA-256 of the actual file bytes. The path must be `/`-separated, relative to the local data root, normalized without `..` or `.` segments, no larger than 5 MB, and stored under a directory approved for its kind:

| Kind | Approved directories | Compatible nodes |
|---|---|---|
| `job_analysis` | `data/job-analysis/`, `reports/job-analysis/` | `jd_analysis`, `custom` |
| `resume_render` | `data/resume-render/`, `output/resume/` | `resume_adaptation`, `submission`, `custom` |
| `interview_prep` | `data/interview-prep/`, `interview-prep/` | `interview`, `custom` |
| `interview_review` | `data/interview-review/`, `interview-prep/sessions/` | `interview`, `review_sedimentation`, `custom` |
| `capability_feedback` | `data/capability-feedback/`, `reports/capability-feedback/` | `review_sedimentation`, `custom` |

`check-artifact` and dry-run are read-only. Explicit `mount-artifact --apply` verifies the opportunity hash, artifact file, regular-file type, size, byte hash, node existence, and kind-node compatibility under the shared tracker lock. It then appends an artifact descriptor with `mountId` to the target node and writes the mount record. Repeating the same plan is idempotent; the same `mountId` with a different plan is rejected. A stale opportunity hash, missing file, changed file bytes, path escape, incompatible node, or duplicate mount is rejected.

Artifact mounting changes only the installed opportunity object, its backup, and the mount record. It never changes a node status, tracker row, skill execution state, cloud record, or external application.

### Frontend File Bridge

The interview-management frontend may participate in this contract through an explicit file exchange only:

1. The user imports an installed `data/company-opportunities/{opportunityId}.json`.
2. The frontend validates and canonicalizes the v1 opportunity. It reads `trackerStatus` only as an installed local mirror and excludes both `trackerStatus` and `generatedAt` from its expected content hash, matching the CLI hash.
3. The frontend shows installed artifact descriptors as read-only local output metadata.
4. The user edits the complete ordered target node list: add, delete, move, retype, rename, or change status.
5. The user confirms the change summary and exports a `get-yourself.company-opportunity-node-mutation v1` JSON download without `artifacts`.
6. The user runs the exported plan through `mutate-nodes` dry-run and, only after review, `mutate-nodes --apply`; the CLI preserves installed artifacts by node ID.
7. After applying, the user may re-import the updated opportunity JSON so the next plan binds the new content hash.

The browser never writes `cli/data`, never contacts the CLI process directly, and never claims that a download is an applied mutation. The downloaded filename can be passed to the CLI from its actual save location. This bridge does not import a cloud record, upload progress, mount an artifact, or execute a node skill.

## Skill Runtime Dispatch

The local Skill Runtime exposes three deterministic bridges from the `opportunity-management` skill:

| Tool | Exact declared targets | Boundary |
|---|---|---|
| `company-opportunity.import` | `data/company-opportunities/{opportunityId}.json`, `data/applications.md` | Imports the confirmed opportunity and links or repairs its tracker row. |
| `company-opportunity-node.mutate` | `data/company-opportunities/{opportunityId}.json`, `data/company-opportunity-mutations/{opportunityId}/{mutationId}.json` | Applies a complete ordered node list and records the mutation. |
| `company-opportunity-artifact.mount` | `data/company-opportunities/{opportunityId}.json`, `data/company-opportunity-artifact-mounts/{opportunityId}/{mountId}.json` | Appends a real-artifact descriptor and records the mount. |

A v2 plan must bind the exact bytes of the corresponding company contract. Runtime derives the target paths from the safe `opportunityId` plus the action's `mutationId` or `mountId`, and rejects a plan whose target objects differ from that derivation. The referenced artifact remains part of the mount contract rather than a Runtime fingerprint target; its exact byte hash is still checked by the deterministic importer before apply.

Runtime preserves the same user-owned boundaries as direct CLI execution: it does not submit an application, infer or change tracker status, execute a node skill, move an artifact, upload progress, or start cloud synchronization. Apply still records target fingerprints and `prepared / dispatched / failed` state; target drift and a different confirmed package require explicit `--replace`.

## Tracker Persistence

The default tracker is `data/applications.md`. Header-aware parsing supports customized columns and Chinese headers, including `日期`, `公司`, `渠道`, `地点`, `岗位`, `评分`, `状态`, `简历`, `报告`, and `备注`; custom column widths and unrelated rows are preserved.

The generated row contains the company, role, location, score, status, report link, and generated metadata in Notes:

```text
opportunityId=...; batch=...; analysisId=...; analysisContentHash=...
```

If location or report columns are absent, those values are added to Notes instead. A row is linked only when its marker and natural identity both match.

Tracker status is user-owned:

- A repeated import with the same package and linked row never resets the row status.
- When a linked row has a new status, `--apply` records it as the installed package's local `trackerStatus` and returns `tracker-state-synced`; a package backup is created first.
- If the tracker is missing a linked row, the importer recreates the row from the installed local `trackerStatus`, not from `initialTrackerStatus`.
- During explicit package replacement, an existing row's current status takes precedence, then the installed local status, then the incoming seed.

Ambiguous or conflicting rows are rejected with `tracker-conflict`. A tracker marker whose authoritative opportunity JSON is missing is rejected with `tracker-orphan`; it is not silently reconstructed.

## Stored Files

Applied files are:

- `data/company-opportunities/{opportunityId}.json`
- `data/applications.md`
- `data/company-opportunity-mutations/{opportunityId}/{mutationId}.json` for applied node plans
- `data/company-opportunity-artifact-mounts/{opportunityId}/{mountId}.json` for applied artifact mounts

Backups are stored under `data/company-opportunities-backups/{opportunityId}/`. The tracker transaction uses the shared tracker lock, so company-opportunity writes are serialized with other tracker writers.

## Status

`gy --status` exposes a read-only `companyOpportunities` section:

- `blocked`: no installed resume-materials package, so installed analyses cannot be resolved.
- `missing`: dependencies are readable, but no opportunity exists.
- `ready`: opportunity count and per-opportunity tracker linkage, row number, installed local status, and current row status.
- `invalid`: an installed package, dependency, or tracker cannot be inspected safely.

Natural-language requests to write a company opportunity route to `company-opportunity.mjs`. Routing does not bypass drafting, user confirmation, `check`, dry-run, or `--apply`.
