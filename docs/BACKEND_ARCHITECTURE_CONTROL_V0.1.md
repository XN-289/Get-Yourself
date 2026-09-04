# Get Yourself Backend Architecture Control v0.1

Updated: 2026-09-04 11:53
Status: code-grounded architecture baseline
Scope: `backend/` architecture control only; no runtime behavior is changed by this document

## 1. Conclusion And Product Boundary

The backend is a single Spring Boot 3.3 modular monolith running on Java 21. It is not a microservice system, and v0.1 must not split it into services. The current product direction needs one deployable API that can evolve module boundaries inside the repository while the student job-search loop remains small and inspectable.

The backend is the cloud brain for:

- Account identity and login state
- Growth and achievement history
- Evidence extraction, ability scoring, appeals, and judge workflow
- Platform memory snapshots
- Agent runs, steps, and trace artifacts
- Workbench device authorization

The backend is not the authority for:

- In-progress resume drafts and versions
- Resume source materials and STAR story libraries
- Local company opportunities and their full process trees
- Local skill execution records and local artifacts
- Any local file before the user explicitly confirms an outbound sync unit

Stage 6a and 6b only produce and queue local summaries. Stage 6c cloud projection is not implemented and remains blocked by user acceptance. This document does not change that gate.

## 2. Runtime Topology

```text
Frontend web app
  |
  | HTTPS / HTTP JSON
  v
Spring Boot modular monolith
  |-- MySQL 8.4: Flyway-managed domain data
  |-- Redis 7.4: opaque login sessions and ephemeral legacy search state
  |-- RabbitMQ 3.13: transactional-outbox domain events
  |-- OpenSearch 2.15: optional legacy event search, disabled by default
  '-- OpenAI-compatible AI provider: DashScope / Qwen, with deterministic fallback

Local workbench / CLI
  |
  | Device code, device token status, future explicit sync upload
  v
Spring Boot modular monolith
```

Runtime control facts:

- `backend/pom.xml` uses Spring Boot 3.3.12, Java 21, Web, Validation, JPA, Redis, AMQP, Flyway, MySQL driver, and Spring Security crypto.
- `GetYourselfBackendApplication` enables scheduling. Scheduled work includes outbox dispatch, user memory refresh, and legacy event expiration.
- JPA uses `ddl-auto: validate`; schema ownership belongs to Flyway migrations, currently `V1` through `V22`.
- RabbitMQ listener auto-startup defaults to `false` in `application.yml`, while the example environment enables it for local integration. This difference avoids startup failure before RabbitMQ is ready, but operators must know which mode they are running.
- OpenSearch and rerank are config-gated and disabled by default because they serve frozen activity retrieval, not the v0.1 student job-search path.
- The AI provider is optional. Missing keys or failed model requests fall back to deterministic rules rather than blocking the main workflow.

## 3. Request And Identity Architecture

### 3.1 Current Web Authentication

1. Registration or login creates a random opaque bearer token.
2. Redis maps `auth:session:<token>` to the user's public ID.
3. Session lifetime is seven days.
4. Controllers call `CurrentUser.id(request)` to resolve the user.
5. New passwords are stored with BCrypt.
6. Logout deletes the Redis session key.
7. WeChat login and profile update issue the same Redis session model.

This is a pragmatic local-demo architecture, but authorization is distributed across controllers rather than owned by a central Spring Security filter chain. `UserRole` exists but is not currently used for route authorization.

### 3.2 Workbench Device Identity

Workbench authorization is intentionally separate from web login:

- The web account creates a ten-minute, one-time binding code.
- The CLI binds an installation ID and receives a device token.
- Binding codes, install IDs, and device tokens are stored only as SHA-256 hashes.
- A user may keep at most five active devices.
- Rebinding the same installation ID revokes the previous device authorization.
- Web disconnect and CLI disconnect both revoke the cloud device record; local files remain under CLI control.

The device token currently authorizes device status and disconnect only. It does not prove interactive web login and must not silently authorize cloud data reads or uploads. Any future Stage 6c API must require explicit user authorization and an active device relationship; it must not turn the device token into a second unrestricted session token.

### 3.3 Known Auth Gaps

| Gap | Architectural consequence | Control rule |
|---|---|---|
| No centralized endpoint authorization matrix | Route protection depends on each controller remembering `CurrentUser` | New data-bearing API requires a route-by-route auth and ownership decision before implementation |
| Legacy `{plain}` password comparison remains | Old hashes can be matched without BCrypt | Plan a migration/rehash path before production; do not create new plain hashes |
| Local CORS defaults are permissive | Local prototyping convenience, production exposure if copied | Production origin allowlist must be explicit and reviewed |
| Frozen controllers remain compiled and routed | Freezing is currently product and review discipline, not runtime isolation | Do not add features; route deprecation/removal needs its own data migration plan |

## 4. Module Ownership Map

### 4.1 Active v0.1 Modules

| Module | Architectural role | Change rule |
|---|---|---|
| `auth` | Email account, opaque session, current-user resolution | Reuse for identity; central authorization work must stay backward compatible |
| `wechat` | WeChat identity and profile fields mapped to the same user/session model | Keep it an identity adapter, not a parallel account system |
| `workbench` | Cloud record of authorized local devices | Authorization-only; no local file or business-data import |
| `achievement` | Growth records, growth tags, evidence source records | User-scoped writes; derived analysis must go through outbox |
| `abilityscore` | Evidence assessment, deterministic scoring, appeals, judge workflow, evidence package export | LLM can propose material; Java owns sanitization, scoring, state, and persistence |
| `agentlog` | Agent runs, steps, bad cases, trace artifacts | Append-oriented audit layer; must not become an implicit business database |
| `memory` | User profile snapshots and platform long-term memory context | Reads from confirmed domain data; no visible coach module is required |
| `growth` | Read models for growth timeline and summary | Prefer read-model composition over duplicating ownership |
| `journal` | Student journal records | Current growth-tag event is not consumable by the existing listener; treat journal-to-asset flow as unproven |
| `ai` | OpenAI-compatible client plus legacy orchestration | Reuse `OpenAiCompatibleLlmClient`; do not use legacy activity orchestration as the future Agent backbone |
| `mcp` | Deterministic time/location context endpoint | Currently narrow context only, not a general tool executor |
| `mq` | Outbox entity, publisher, dispatcher, queue topology | Required path for transaction-derived async work |
| `common` | Shared web, argument, pagination, and exception utilities | Keep shared code small; do not put domain rules here |
| `config` | Web CORS configuration | Keep local defaults separate from an explicit production origin allowlist |

### 4.2 Supporting Or Retired-Frontend Modules

| Module | Classification | Control rule |
|---|---|---|
| `challenge` | Historical growth source | Existing challenge completion may feed achievement records; do not expand challenge UX for v0.1 |
| `coach` | Hidden platform-memory support | No visible peer module; future Agent context may reuse memory primitives |
| `eventquality` | Frozen domain with historical data dependencies | Active assessment and growth-tag code still import it for old event-derived evidence; do not unfreeze or delete without migration |

### 4.3 Frozen Modules

Frozen for v0.1:

- `organization`
- `event`
- `reservation`
- `follow`
- `schedule`
- `eventquality`
- `retrieval`

"Frozen" means no new product capability, route expansion, UI surface, scoring rule, or event flow. Code and tables may remain because historical growth evidence, old accounts, and migrations still reference them. Physical removal requires an explicit data-retention and migration decision.

## 5. Route Control Baseline

| Route prefix | Module | v0.1 route state |
|---|---|---|
| `/api/health` | `common` | Active infrastructure health check |
| `/api/auth` | `auth`, `wechat` | Active identity |
| `/api/workbench/devices` | `workbench` | Active device authorization |
| `/api/achievements` | `achievement` | Active growth/evidence history |
| `/api/ability-scoring` | `abilityscore` | Active scoring, appeal, evidence export |
| `/api/ability-judges` | `abilityscore` | Active judge workflow |
| `/api/ai/agent-runs` | `agentlog` | Active trace reads |
| `/api/ai/bad-cases` | `agentlog` | Active bad-case records |
| `/api/growth` | `growth` | Active read model |
| `/api/journal` | `journal` | Existing student records; derived asset flow is not reliable yet |
| `/api/mcp` | `mcp` | Narrow context support |
| `/api/coach` | `coach` | Hidden backend capability, no product expansion |
| `/api/challenges` | `challenge` | Historical source support |
| `/api/ai` outside the trace routes above | `ai` | Mixed: profile memory may remain useful; activity/action-plan orchestration is legacy |
| `/api/events`, `/api/events/{id}/quality*`, `/api/events/{id}/review*` | `event`, `eventquality` | Frozen |
| `/api/reservations` | `reservation` | Frozen |
| `/api/organizations` | `organization` | Frozen |
| `/api/follows` | `follow` | Frozen |
| `/api/schedule` | `schedule` | Frozen |
| `/api/ai/retrieval` | `retrieval` | Frozen |

Any new route must state its module owner, authenticated caller, user-ownership rule, data written, frozen-domain impact, and Trace behavior before implementation.

## 6. Core Domain Flows

### 6.1 Ability Evidence Pipeline

```text
Achievement record created or updated
  -> transactional outbox rows
     -> growth-tag.extract
     -> ability-evidence.assess
  -> assessment listener
     -> Agent run + canonical evidence snapshot + SHA-256
     -> reuse same record/hash/prompt/rubric job when possible
     -> LLM extraction, or deterministic local fallback
     -> Java sanitization, clamping, normalization, fairness policy
     -> deterministic Java scoring engine
     -> assessment, dimensions, scores, states persisted
     -> evidence package export can reference trace pointers
```

Control rules:

- The LLM never writes final scores directly.
- Model output is clamped and normalized before persistence.
- Duplicate evidence can be blocked by hash and fairness state.
- Prompt, rubric, evidence hash, model mode, and job state are part of reproducibility.
- Evidence package export is read-only. Graduation year and target roles are request inputs and are not persisted by the export service.

### 6.2 Outbox And Async Events

Configured queues and routing keys:

| Routing key | Queue purpose | v0.1 state |
|---|---|---|
| `growth-tag.extract` | Growth tag extraction from achievement record | Active |
| `ability-evidence.assess` | Ability evidence assessment | Active |
| `user-profile.refresh` | Platform memory snapshot refresh | Active |
| `event.index` | Legacy event search index | Frozen |
| `event.quality` | Legacy event quality analysis | Frozen |

Normal flow:

1. A business transaction saves domain data and an outbox row together.
2. `DomainEventOutboxDispatcher` periodically selects pending or failed rows.
3. It deserializes the stored payload and publishes it to RabbitMQ.
4. Listeners invoke the target service and persist derived state.
5. Failed dispatches use bounded exponential backoff.

Known limitations:

- The dispatcher has no distributed lock. Multiple application instances can compete on the same rows.
- Payload reconstruction uses the stored Java class name, coupling message compatibility to internal classes.
- Listener retry/requeue semantics must be considered per listener before enabling multi-instance operation.
- Journal create publishes `GrowthTagExtractionMessage`, but the listener resolves the ID against achievement records, so this path cannot currently extract journal tags.

New async work must use the transactional outbox pattern. Direct RabbitMQ publication inside a business transaction is not allowed.

### 6.3 Platform Memory

Growth and achievement changes mark a user's profile snapshot dirty and publish `user-profile.refresh`. The refresh service rebuilds a snapshot from confirmed domain data. It is platform context for Agent decisions, not a separate visible coach product.

Future job-search progress may influence memory only after Stage 6c accepts an explicit summary. The backend must not infer cloud progress from local files, nor import resume full text to build memory.

### 6.4 Agent Trace

Trace storage currently consists of:

- `agent_runs`: run identity, user, type, status, goal, input/output summaries
- `agent_run_steps`: step lifecycle and summaries
- `agent_trace_artifacts`: JSON artifact, content hash, summary, redaction flag

Trace writes are intended to survive business transaction failure through `REQUIRES_NEW`. Artifact persistence failure is logged and swallowed so audit failure does not always break the user-facing path. This is useful availability behavior, but acceptance criteria must allow a run with missing artifacts rather than claiming every trace is complete.

Critical privacy defect: `AgentTraceArtifactService.record()` sets `redacted=true` unconditionally while storing full `contentJson`. The flag is therefore false assurance. Until fixed, architecture review must treat trace artifacts as unredacted and avoid storing resume full text, STAR originals, credentials, or raw private documents in this table.

## 7. AI And Agent Control

Reusable foundation:

- `OpenAiCompatibleLlmClient`: plain chat, JSON chat, embeddings
- Provider disabled or request failure: deterministic rule fallback
- Structured JSON response parsing
- Java-side clamping and validation
- Agent run and step lifecycle

Legacy area:

- `AiService` is a large orchestrator coupled to frozen activity recommendation, retrieval, and schedule logic.
- It is not the future Agent execution architecture.
- Future backend Agent work should compose narrow services: context assembly, skill plan validation, deterministic contract execution, trace, and explicit sync.

Future Agent API rules:

1. JD, email, scraped page, and uploaded text are data, never instructions.
2. Agent suggestions do not mutate user-owned final states.
3. Deterministic code owns state transitions and persistence.
4. Each user-visible decision artifact must retain provenance and Trace identity.
5. Irreversible external actions remain forbidden.

## 8. Workbench And Sync Boundary

Cloud-authoritative data:

- User and account identity
- Achievement/growth records
- Verified or reviewed ability evidence and scoring results
- Platform memory snapshots
- Agent runs and Trace
- Workbench device authorization

Local-authoritative data:

- Resume objects, drafts, versions, and current submission version
- Resume materials, STAR stories, final plans, render packages
- Company opportunities, process nodes, user-confirmed statuses, artifacts
- Local skill plans and audit records
- Explicit sync queue before upload

The browser never writes `cli/data`. Frontend local bridges may export contract JSON or read confirmed files; actual writes go through CLI check, dry-run, explicit apply, and explicit replacement.

Future Stage 6c may accept only:

- Company opportunity progress summary
- Trace decision summary

It may not upload:

- Resume full text
- STAR originals
- Raw personal documents
- Local credentials or secrets
- Unconfirmed local skill plans

## 9. Architecture Risk Register

Priority meaning:

- `P0-gate`: must be resolved or explicitly accepted before Stage 6c or production
- `P1`: next architecture hardening batch
- `P2`: controlled cleanup after v0.1 acceptance

| ID | Priority | Risk | Control direction |
|---|---|---|---|
| BA-01 | P0-gate | Authorization is per-controller and there is no central endpoint policy | Build route/auth inventory first; centralize only after behavior is explicit |
| BA-02 | P0-gate | Trace artifact claims redaction but stores full JSON | Fix semantics and migration before any broader trace exposure |
| BA-03 | P0-gate | Stage 6c would introduce device-authorized cloud writes | Require active device plus explicit user authorization, idempotency, conflict evidence, and trace |
| BA-04 | P1 | `{plain}` password compatibility remains | Migrate or force rehash before production |
| BA-05 | P1 | Active achievement/assessment code imports frozen `eventquality` | Introduce a historical evidence read model, then decouple |
| BA-06 | P1 | Outbox dispatcher lacks distributed locking | Single-instance v0.1 is acceptable; add lease/lock before multi-instance |
| BA-07 | P1 | Message deserialization uses internal Java class names | Version message contracts before refactoring packages |
| BA-08 | P1 | Journal growth-tag event targets the wrong repository shape | Define journal-to-asset contract or stop publishing until implemented |
| BA-09 | P1 | Frozen routes remain exposed | Keep feature freeze now; plan route disablement with migration and compatibility review |
| BA-10 | P2 | `AiService` mixes active memory with frozen recommendation/schedule orchestration | Extract reusable context; leave activity orchestration behind |
| BA-11 | P2 | OpenSearch/retrieval stack is unused by default | Do not invest further until a current-product search need exists |
| BA-12 | P2 | Backend test coverage is concentrated in scoring and device binding | Add contract tests around auth, outbox, trace, and future sync gates |

## 10. Change Rules

### Allowed In Current Phase

- Documentation and architecture inventory
- Tests that pin current behavior
- User-scoped read endpoints required by existing v0.1 modules
- Security and privacy hardening that does not unfreeze a legacy domain
- Preparatory contracts for Stage 6c, without implementing cloud projection

### Not Allowed Without A New Decision

- Stage 6c API, database projection, automatic upload, automatic retry, or automatic import
- New organization, event, reservation, follow, schedule, recommendation, or retrieval capability
- Resume full-text cloud storage
- Treating a device token as an all-purpose user session
- LLM-owned final score or state transition
- Direct local-file writes from the browser
- Removing frozen tables or modules without a data-retention plan

### Implementation Checklist

1. State the owning module and affected route.
2. State the authenticated identity and user ownership rule.
3. State authoritative storage: cloud, local, or explicit sync projection.
4. Use Flyway for every schema change.
5. Use transactional outbox for async side effects.
6. Sanitize model output in Java and keep deterministic persistence.
7. Record Trace without adding unredacted private content.
8. Add focused tests and run `mvn test` from `backend/`.
9. Update this document when module ownership, auth, storage authority, or async topology changes.

## 11. Verification Record

This revision is documentation-only. Required repository check for this change:

```powershell
git diff --check
```

Required backend check for any future Java or configuration change:

```powershell
cd backend
mvn test
```

Current local environment still has neither `mvn` nor `docker` on PATH. Therefore no backend regression or infrastructure-dependent test is claimed for this documentation-only revision. Existing backend test classes cover ability scoring, evidence export, retrieval helpers, and workbench device behavior, but they are not a substitute for user acceptance.
