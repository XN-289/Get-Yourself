# Company Opportunity Contract

## Purpose

`company-opportunity.mjs` turns one user-confirmed local job analysis into a local company-opportunity object and one linked tracker row. The opportunity is the interview-management object for later process nodes; the tracker row is the compact application progress index.

This is an explicit bridge, not an automatic continuation of job analysis. Installing an analysis does not create a company opportunity. Creating a company opportunity does not submit an application, mount an artifact, synchronize the web platform, or execute a node skill.

## Commands

```powershell
node company-opportunity.mjs check <opportunity.json> [--json]
node company-opportunity.mjs import <opportunity.json> [--json]
node company-opportunity.mjs import <opportunity.json> --apply [--replace] [--json]
```

`check` and `import` without `--apply` are read-only. Import writes only after `--apply`. Replacing a different confirmed package requires `--apply --replace`. Changed package and tracker files are backed up before replacement or status-state synchronization.

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

Allowed types are `jd_analysis`, `resume_adaptation`, `submission`, `interview`, `offer`, `review_sedimentation`, and `custom`. Allowed seed statuses are `todo`, `active`, `waiting`, `passed`, `failed`, and `offer`.

These nodes are initial seeds only. Later node addition, ordering, status changes, and artifact links remain user-owned. This importer does not mutate existing node order or node statuses, and no node skill is executed.

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

Backups are stored under `data/company-opportunities-backups/{opportunityId}/`. The tracker transaction uses the shared tracker lock, so company-opportunity writes are serialized with other tracker writers.

## Status

`gy --status` exposes a read-only `companyOpportunities` section:

- `blocked`: no installed resume-materials package, so installed analyses cannot be resolved.
- `missing`: dependencies are readable, but no opportunity exists.
- `ready`: opportunity count and per-opportunity tracker linkage, row number, installed local status, and current row status.
- `invalid`: an installed package, dependency, or tracker cannot be inspected safely.

Natural-language requests to write a company opportunity route to `company-opportunity.mjs`. Routing does not bypass drafting, user confirmation, `check`, dry-run, or `--apply`.
