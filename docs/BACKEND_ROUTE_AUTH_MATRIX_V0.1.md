# Backend Route Auth Matrix v0.1

Updated: 2026-09-04 18:29
Source of truth: controller and service code under `backend/src/main/java/com/getyourself/backend/`
Inventory baseline: 85 handler methods in 23 request controllers; `GlobalExceptionHandler` is controller advice and is not counted as a route controller

This is the BA-01 route inventory required before Stage 6c design. It records the identity accepted by each route, the user-ownership rule, and the write boundary. It is an explicit review baseline, not a centralized runtime policy; Spring still resolves authorization through controllers and services.

## Identity Types

| Identity | Transport | Meaning |
|---|---|---|
| Public | None | Intentionally unauthenticated, or a legacy gap as marked below |
| Web session | `Authorization: Bearer <opaque token>` | Interactive student login resolved by `CurrentUser.id(request)` |
| Binding code | Request body code | One-time, ten-minute code that can only activate a pending device row |
| Device token | `X-Device-Token` | Active workbench authorization for status and disconnect only |

The binding code and device token are not web sessions. Neither may read account data, evidence, resumes, Trace, or queued sync units. Stage 6c has no implemented endpoint.

## Matrix

### Infrastructure And Identity

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `GET /api/health` | Public | No user data or write | Active health check |
| `POST /api/auth/register` | Public | Creates one account and returns a session | Active |
| `POST /api/auth/login` | Public | Creates one session for the authenticated account | Active |
| `POST /api/auth/wechat-login` | Public | Finds or creates the WeChat identity and returns a session | Active identity adapter |
| `GET /api/auth/me` | Web session | Reads only the resolved user | Active |
| `PUT /api/auth/profile` | Web session | Updates profile fields on the resolved user | Active |
| `POST /api/auth/logout` | Web session | Deletes only the presented session | Active |

### Workbench Device Authorization

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `GET /api/workbench/devices` | Web session | Reads pending and active devices filtered by user ID | Active |
| `POST /api/workbench/devices/code` | Web session | Revokes prior pending code, creates one pending device row | Active |
| `POST /api/workbench/devices/bind` | Binding code | Locks and consumes the code; may revoke same-install prior device; creates active device and one-time token | Active public exchange |
| `POST /api/workbench/devices/status` | Device token | Reads that device and updates only `last_active_at` | Authorization-only |
| `POST /api/workbench/devices/disconnect` | Device token | Revokes only the device represented by the token | Authorization-only |
| `DELETE /api/workbench/devices/{deviceId}` | Web session | Loads by ID and requires matching user ID before revoke | Active |

BA-03 control: the device token is accepted only by the two routes above. It never enters `Authorization`, never resolves through `CurrentUser`, and never creates or uploads a sync unit.

### Growth, Evidence, And Scoring

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `GET /api/achievements/history` | Web session | Reads achievement records by user ID | Active |
| `GET /api/achievements/history/page` | Web session | Reads a user-filtered page | Active |
| `PUT /api/achievements/history/{recordId}/reflection` | Web session | Requires `recordId + userId` ownership before update | Active |
| `GET /api/achievements/summary` | Web session | Reads summary from user-owned records | Active |
| `GET /api/achievements/growth-tags` | Web session | Reads growth tags by user ID | Active |
| `GET /api/achievements/growth-tags/{tagId}` | Web session | Requires `tagId + userId`, then reads user-owned evidence | Active |
| `POST /api/achievements/growth-tags/rebuild` | Web session | Rebuilds derived tags and evidence only from that user's records | Active |
| `PUT /api/achievements/growth-tags/evidences/{evidenceId}/milestone` | Web session | Requires `evidenceId + userId` before milestone update | Active |
| `POST /api/ability-scoring/records/{recordId}/assess` | Web session | Interactive calls require `recordId + userId`; derived assessments, states, results, and Trace inherit that user | Active |
| `GET /api/ability-scoring/states` | Web session | Reads ability states by user ID | Active |
| `GET /api/ability-scoring/clusters` | Web session | Clusters only user-owned ability states | Active |
| `GET /api/ability-scoring/states/{stateId}/evidences` | Web session | Requires state user ID to equal session user before linking evidence | Active; ownership test added |
| `GET /api/ability-scoring/results` | Web session | Reads top 50 score results by user ID | Active |
| `POST /api/ability-scoring/evidence-package/export` | Web session | Reads user-owned states/results/evidence and returns an export; does not persist the request | Active |
| `POST /api/ability-scoring/results/{resultId}/appeals` | Web session | Requires result user ID to equal session user before creating an appeal | Active; ownership test added |
| `GET /api/ability-scoring/appeals` | Web session | Reads appeals by user ID | Active |
| `GET /api/ability-judges` | Web session | Reads top 30 judge tasks by user ID | Active |
| `GET /api/ability-judges/{judgeId}` | Web session | Requires judge user ID before response | Active |
| `POST /api/ability-judges/{judgeId}/start` | Web session | Requires ownership; writes questions, status, Trace, and run state for that user | Active |
| `POST /api/ability-judges/{judgeId}/submit` | Web session | Requires ownership; validates answers and may update judge task, score result, state, profile, and Trace | Active |

### Agent Trace And Student Records

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `GET /api/ai/agent-runs` | Web session | Reads run summaries by user ID | Active |
| `GET /api/ai/agent-runs/{runId}` | Web session | Requires `runId + userId`; reads steps and summary-only artifacts | Active |
| `POST /api/ai/bad-cases` | Web session | Creates feedback for the user; a referenced run must pass `runId + userId` | Active |
| `GET /api/ai/bad-cases` | Web session | Reads bad cases by user ID | Active |
| `GET /api/growth/timeline` | Web session | Composes read models from user-owned achievement, coach, journal, and growth data | Active |
| `GET /api/growth/summary` | Web session | Reads only user-owned summary sources | Active |
| `POST /api/journal` | Web session | Creates one journal row for the user and publishes its derived event | Active; derived flow remains unproven |
| `GET /api/journal/page` | Web session | Reads a user-filtered journal page | Active |
| `GET /api/journal/range` | Web session | Reads user-owned rows in the requested date range | Active |
| `PUT /api/journal/{entryId}` | Web session | Requires `entryId + userId` before update | Active |
| `DELETE /api/journal/{entryId}` | Web session | Requires `entryId + userId` before delete | Active |

Trace artifact persistence itself is service-internal. As of this revision it retains only the bounded sanitized summary plus `summary-only` metadata; the raw Java object passed to `AgentTraceArtifactService.record()` is not serialized or persisted.

### Hidden Support And Historical Sources

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `POST /api/mcp/context` | Public | Resolves deterministic time/location context; writes no user data | Narrow active support; no user-object access |
| `GET /api/coach/messages` | Web session | Reads user messages by user and date | Hidden platform-memory support |
| `POST /api/coach/chat` | Web session | Writes user messages and may derive logs/memory for that user | Hidden; no visible peer module |
| `GET /api/coach/logs` | Web session | Reads user logs by user ID | Hidden |
| `GET /api/coach/memory-reviews` | Web session | Reads user memory reviews | Hidden |
| `POST /api/coach/logs/generate` | Web session | Creates or updates one user log and derived review state | Hidden |
| `GET /api/challenges` | Web session | Reads user challenges by user ID and optional status | Historical growth source |
| `GET /api/challenges/page` | Web session | Reads a user-filtered page | Historical |
| `POST /api/challenges` | Web session | Creates one user challenge | Historical; no UX expansion |
| `POST /api/challenges/{challengeId}/complete` | Web session | Requires ownership; updates challenge and may create achievement evidence | Historical |
| `DELETE /api/challenges/{challengeId}` | Web session | Requires ownership before cancel | Historical |

### Legacy AI And Frozen Domains

| Route | Identity | Ownership and writes | v0.1 state |
|---|---|---|---|
| `POST /api/ai/event-recommendations` | Web session | Reads user context/events and records recommendation Trace | Frozen legacy orchestration |
| `POST /api/ai/action-plans` | Web session | Reads user context and records plan Trace | Frozen legacy orchestration |
| `POST /api/ai/self-analysis` | Web session | Reads user history/tags and records Trace | Frozen legacy orchestration |
| `GET /api/ai/profile-memory` | Web session | Reads the user's platform memory profile | Potentially reusable context; no new route |
| `POST /api/ai/recommend-events` | Public | Calls legacy recommendation service without identity | Frozen gap; no user write |
| `POST /api/events` | Web session | Creates an event with the session user as owner | Frozen |
| `GET /api/events` | Public | Searches published legacy events | Frozen public read |
| `GET /api/events/mine` | Web session | Reads events by owner user ID | Frozen |
| `DELETE /api/events/{eventId}` | Web session | Requires event ownership before delete | Frozen |
| `GET /api/events/{eventId}/quality-report` | Public | Reads a quality report by event ID | Frozen unauth review gap |
| `POST /api/events/{eventId}/quality/reanalyze` | Public | Mutates review/reanalysis state with no role check | Frozen unauth admin gap |
| `POST /api/events/{eventId}/review/approve` | Public | Mutates review approval with no role check | Frozen unauth admin gap |
| `POST /api/events/{eventId}/review/reject` | Public | Mutates review rejection with no role check | Frozen unauth admin gap |
| `GET /api/organizations` | Public | Reads legacy organization list | Frozen public read |
| `GET /api/follows` | Web session | Reads user follows | Frozen |
| `POST /api/follows` | Web session | Creates one follow for the user | Frozen |
| `DELETE /api/follows/{organizationName}` | Web session | Requires user ownership before unfollow | Frozen |
| `GET /api/reservations` | Web session | Reads active reservations by user ID | Frozen |
| `POST /api/reservations` | Web session | Creates one reservation for the user | Frozen |
| `DELETE /api/reservations/{reservationId}` | Web session | Requires ownership before cancel | Frozen |
| `POST /api/reservations/scan-complete` | Web session | Resolves the supplied token within user-owned reservations | Frozen |
| `GET /api/schedule` | Web session | Reads schedule rows by user ID | Frozen |
| `POST /api/schedule` | Web session | Creates one schedule row for the user | Frozen |
| `POST /api/schedule/import-ai-plan` | Web session | Creates user-owned schedule rows from the request | Frozen |
| `PUT /api/schedule/{itemId}` | Web session | Requires ownership before update | Frozen |
| `DELETE /api/schedule/{itemId}` | Web session | Requires ownership before cancel | Frozen |
| `POST /api/ai/retrieval/trace` | Web session | Runs frozen retrieval diagnostics for the user | Frozen |
| `GET /api/ai/retrieval/evaluation` | Web session | Reads/evaluates frozen retrieval data for the user | Frozen |
| `GET /api/ai/retrieval/evaluation/ab` | Web session | Reads frozen A/B evaluation for the user | Frozen |
| `POST /api/ai/retrieval/reindex` | Public | Rebuilds the global legacy event index | Frozen unauth operational gap |

## BA-01 Findings

1. Active account, device, achievement, scoring, judge, Trace, bad-case, journal, and coach routes resolve an interactive web user and scope their primary object reads or writes by user ID.
2. The two ability-score routes that load by numeric ID filter state/result ownership after lookup; focused tests now pin the other-user rejection path.
3. Device authorization is isolated from web sessions. No existing route accepts `X-Device-Token` outside device status and disconnect.
4. The public event-quality mutations, public retrieval reindex, and public legacy simplified recommendation remain real authorization gaps. They are frozen domains and must not be exposed publicly; route disablement or role control needs a separate compatibility and data-retention decision before production.
5. This matrix does not introduce a central Spring Security filter chain, role model, or Stage 6c API. Those remain later hardening work.

## Change Gate

Any new backend route, method, identity type, device-token scope, or ownership rule must update this matrix in the same change. A pull request that adds or changes a route without a matrix row is incomplete. If a route must remain public, the row must say why and list its writes.
