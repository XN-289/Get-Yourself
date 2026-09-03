# Sync Unit Contract v0.1

## Status

This is the Stage 6 contract baseline. The local deterministic builder and validator are implemented in `cli/sync-unit.mjs` and covered by `cli/tests/sync-unit.test.mjs`; queue-action and tombstone rules are exercised as pure state functions only. The repository has not implemented cloud synchronization, a persistent queue, a user-facing CLI queue command, API, database, or frontend projection.

## Purpose

A synchronization unit is the smallest user-visible local object summary that can be explicitly uploaded to the web platform. It is not an entire tracker, resume library, report directory, or local data root.

The first Stage 6 batch contains exactly two unit types:

1. `opportunity.progress.v1`: the current progress summary of one company opportunity.
2. `trace.decision.v1`: one append-only local decision or execution summary.

Job-analysis conclusions, interview-review feedback, and capability-feedback summaries stay out of the first batch. They may become later units only after the first two prove idempotency, conflict handling, retry, deletion, and privacy boundaries.

## Unit Envelope

Every outbound unit has one conceptual envelope:

| Field | Meaning | Hash rule |
|---|---|---|
| `unitType` | One value from the closed v0.1 catalog. | Included in identity binding. |
| `objectIdentityHash` | Stable identity of the user-visible object, independent of its current state. | Separate SHA-256. |
| `contentHash` | SHA-256 of the canonical summary payload. | Required. |
| `basisContentHash` | Cloud content hash on which a mutable snapshot is based; absent for the first snapshot. | Required for later mutable updates. |
| `sourceDeviceId` | Server-assigned device ID from the binding. | Envelope only; not part of the summary payload. |
| `stateUpdatedAt` | Last semantic state time from the local object. | Included in the summary payload. |
| `summaryGeneratedAt` | Time the outbound summary was generated. | Envelope only; excluded from `contentHash`. |
| `userConfirmation` | Explicit confirmation of this outbound payload. | Envelope only; server records it separately. |
| `tracePointer` | Optional Trace ID plus summary identity used to explain the state. | Envelope only; never changes progress semantics or `contentHash`. |

The payload never contains the device token, installation ID, local absolute paths, terminal logs, account credentials, or web bearer session.

Canonical hashing uses UTF-8 JSON with sorted object keys, `/` path separators, LF text normalization where the unit owns text, no BOM, and no insignificant whitespace. User-visible text is never silently trimmed or rewritten to make a hash match. Hash format is `sha256:<64 lowercase hex>`.

Natural-identity normalization is separate from payload hashing. For identity only, text is Unicode NFC normalized, outer whitespace is removed, repeated whitespace becomes one ASCII space, Unicode simple lowercase folding is applied, and the four identity fields are joined with `/`. This normalization never rewrites the displayed company, role, location, or batch text.

## First Units

### Opportunity Progress

`opportunity.progress.v1` is a mutable current-state snapshot.

Object identity is the canonical natural identity of the company opportunity:

```text
normalized company + role + location + recruitment batch + schema version
```

The local `opportunityId` is useful locally, but it is not the cross-device identity. Two devices that independently create the same natural identity address the same cloud projection. A local `opportunityId` may never change that natural identity.

The summary payload may contain:

- Company, role, location, and recruitment batch.
- Job-analysis ID and content hash used by the opportunity.
- User-owned tracker status and state-updated time.
- Ordered node IDs, types, titles, statuses, and next actions.
- Artifact mount IDs, kinds, titles, and byte content hashes.
- Whether the state was user-confirmed.

The summary payload must not contain:

- JD or job-analysis report full text.
- Resume content or resume file paths.
- Node private notes, HR contacts, application-account details, or credentials.
- Artifact bytes, local absolute paths, or external URLs.
- Anything outside the v0.1 opportunity summary schema.

Progress summaries never imply that an application was submitted. They also do not authorize the web to edit the local opportunity, tracker, nodes, artifacts, reports, or resume files.

### Trace Decision

`trace.decision.v1` is append-only.

Its object identity binds the server-assigned source device ID with the local Trace ID. A Trace ID is therefore unique per workbench and is not assumed to be globally generated.

The summary payload may contain:

- Skill or deterministic tool key.
- Execution action and final `prepared`, `dispatched`, or `failed` result.
- Target module and target object identity.
- Target before and after content hashes.
- Contract identity and exact-byte contract hash when a Skill Runtime plan used one.
- User-confirmation and completion times.
- Short deterministic result reason.

The summary payload must not contain:

- User prompts, conversation text, or JD text.
- Terminal output or complete logs.
- Resume, report, review, or artifact full text.
- File contents, credentials, tokens, or local absolute paths.
- Model provider request or response bodies.

Repeating the same identity and hash is idempotent. Reusing the same device-bound Trace ID with a different content hash is a hard conflict and cannot be repaired by overwrite.

## Idempotency And Conflict

For `opportunity.progress.v1`:

- The idempotency key is `unitType + objectIdentityHash + contentHash`.
- The same natural identity and content hash returns the existing cloud summary record, even when another authorized device submitted it.
- A new snapshot must carry the `basisContentHash` of the cloud summary it was based on.
- An absent basis is valid only when no cloud projection exists for the natural identity.
- If the cloud current hash equals the incoming content hash, the submission is idempotent.
- If the cloud current hash equals the basis and differs from the incoming hash, the submission becomes current.
- If the cloud current hash differs from both the basis and the incoming hash, the submission becomes a conflict. It never uses last-write-wins.

For `trace.decision.v1`:

- The idempotency key is `unitType + device-bound objectIdentityHash + contentHash`.
- Identical submissions are acknowledged without creating another Trace record.
- The same identity with a different content hash is rejected as an identity collision.
- Deletion is a display tombstone, not a rewrite of the append-only identity ledger.

## Multi-Device Rules

- Opportunity projections merge by canonical natural identity, not by device or local file name.
- Devices with the same content hash converge to one cloud summary; the server may retain multiple device observations for audit.
- Devices with different content for the same natural identity produce a conflict queue.
- The web shows both content hashes, state times, basis hashes, and source devices; the student explicitly chooses one presentation.
- Choosing a cloud presentation does not modify any local object. Other devices discover the divergence only through an explicit refresh and then make their own local choice.
- Trace summaries never merge across devices. They form an append-only audit stream keyed by device and Trace ID.
- The web projection is read-only in v0.1. It cannot edit tracker status, node status, resumes, reports, artifacts, or local queues.

## Explicit Queue And Retry

1. The local tool builds a read-only summary and shows the unit type, target object, semantic fields, and no-write scope.
2. The student explicitly confirms that exact summary for outbound upload.
3. Only then does the unit enter the local pending queue. The queue stores summaries and fingerprints, never full local files.
4. A retry reuses the same unit identity, content hash, basis hash, and idempotency key.
5. Network, timeout, and server-unavailable failures may be retried. Until an acknowledgement is durably recorded locally, the unit remains one queued submission rather than spawning a duplicate.
6. Authentication failure marks the queue blocked. Rebinding the device does not automatically revive old pending units; the student must review and reconfirm them.
7. Conflict responses mark the unit conflicted. Retrying the unchanged conflicting payload is invalid; the student must refresh, compare, and explicitly choose a new basis.
8. Canceling before upload removes only the queue entry. It never changes the local business object.

v0.1 retries are user-triggered. Background retry of already confirmed units can be considered only after the explicit path proves safe.

## Deletion

- Deleting or disconnecting a web opportunity summary hides the cloud projection and records a tombstone.
- The tombstone retains identity and idempotency semantics so a retry of the same content hash cannot resurrect the deleted presentation.
- Deleting the web summary never deletes the local opportunity, tracker row, node history, artifact, report, backup, or resume.
- Deleting a local opportunity never deletes cloud history automatically. A separate, explicit web-removal action is required.
- Trace summaries are not edited. A web-side Trace display may be hidden by a tombstone while the append-only identity and collision ledger remains.

## Boundaries

- Device authorization alone never creates a queue or uploads data.
- Every outbound upload is a separate user-confirmed action; batch confirmation must still list each unit and its semantic content.
- The web never imports automatically into the local tracker.
- Local authority remains with the opportunity, tracker, report, resume, artifact, and runtime files.
- Cloud authority is limited to account, device binding, displayed sync projection, conflict choices, and Trace summaries.
- No synchronization unit may contain resume full text, STAR story full text, raw personal documents, JD full text, full report text, private notes, contacts, credentials, or terminal logs.

## Implementation Gate

Before any endpoint or persistence work, implement a local deterministic builder and validator with tests for:

1. Natural-identity stability across reordered display fields and re-exports.
2. `summaryGeneratedAt` exclusion and `stateUpdatedAt` inclusion.
3. Prohibited-field rejection.
4. First snapshot, idempotent retry, valid basis update, and stale basis conflict.
5. Cross-device convergence and conflict classification.
6. Append-only Trace deduplication and identity collision.
7. Queue retry without duplicate enqueue, blocked-after-rebind, and cancel behavior.
8. Deletion tombstones that prevent resurrection without deleting local objects.

No implementation may describe itself as automatic sync. Stage 6 remains explicit, user-confirmed, and auditable until all tests above pass.
