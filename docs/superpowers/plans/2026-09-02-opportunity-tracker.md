# Opportunity Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first contract-governed local company-opportunity tracker for Stage 5.

**Architecture:** Add `get-yourself.opportunity-tracker` version 1 as a local JSON contract with deterministic Markdown and backups. Validate every opportunity against installed job analysis and every artifact reference against installed contract packages. Integrate read-only status and deterministic intent routing without touching the legacy Markdown tracker.

**Tech Stack:** Node.js ES modules, `node:test`, existing `contract-kit.mjs` validators, existing contract importers.

## Global Constraints

- Preserve unrelated user files `SYSTEM_DASHBOARD.html`, `docs/项目讲解思维导图.md`, and `docs/项目讲解思维导图.pdf`.
- Use red-green-refactor loops through public interfaces.
- `check` and default `import` write nothing.
- Writes require `--apply`; replacements require `--apply --replace`.
- The module writes only opportunity tracker JSON, deterministic Markdown, and backups.
- Do not modify `data/applications.md`, resume data, capability data, platform data, or cloud sync.
- Do not mark Stage 5 complete after this slice; fraud check and in-page skill execution remain open.

---

### Task 1: Public Contract Tests

**Files:**
- Create: `cli/tests/opportunity-tracker.test.mjs`

**Interfaces:**
- Produces public expectations for `canonicalizeOpportunityTracker(input, dependencies)`, `renderOpportunityTracker(tracker)`, `inspectOpportunityTracker(root)`, and `importOpportunityTracker(filePath, options)`.

- [ ] **Step 1: Write the first failing tracer test**

Create a temporary root, install resume materials, import the existing job-analysis example, and call `canonicalizeOpportunityTracker` with one valid opportunity and ordered stages.

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/opportunity-tracker.test.mjs`

Expected result: module-not-found failure.

- [ ] **Step 3: Add one vertical slice at a time**

Increment tests and implementation for analysis binding, identity de-duplication, stage metadata, status validation, artifact references, ordering-sensitive hashes, dry-run, apply, idempotency, replacement, backups, status, Markdown, isolation, and routing. Run the focused suite after each slice and keep it green before broadening scope.

### Task 2: Deterministic Tracker Importer

**Files:**
- Create: `cli/opportunity-tracker.mjs`
- Create: `cli/templates/opportunity-tracker.example.json`
- Modify: `cli/job-analysis.mjs`
- Modify: `cli/interview-prep.mjs`
- Modify: `cli/capability-feedback.mjs`

**Interfaces:**
- Export `loadInstalledJobAnalysis(root, materials, analysisId)` from `job-analysis.mjs`.
- Export `loadInstalledInterviewPrep(root, materials, prepId)` from `interview-prep.mjs`.
- Export `loadInstalledCapabilityFeedback(root, feedbackId)` from `capability-feedback.mjs`.
- Export `canonicalizeOpportunityTracker`, `renderOpportunityTracker`, `inspectOpportunityTracker`, and `importOpportunityTracker`.

- [ ] **Step 1: Implement schema and canonicalization**

Reject unknown fields, validate IDs and enums, bind opportunity provenance to installed analysis, and derive a stable natural identity key.

- [ ] **Step 2: Implement artifact resolution**

Resolve all four allowed artifact types through their existing installed-package loaders and compare semantic hashes.

- [ ] **Step 3: Implement deterministic rendering**

Render local Markdown containing provenance, every opportunity, every ordered node, status, next action, timing, notes, and artifact hashes.

- [ ] **Step 4: Implement inspection and import lifecycle**

Apply the shared dry-run, apply, replace, backup, idempotency, and report-state rules.

### Task 3: Agent And Documentation Integration

**Files:**
- Modify: `cli/gy.mjs`
- Modify: `cli/lib/intent-router.mjs`
- Modify related `cli/tests/gy-entry.test.mjs` and `cli/tests/intent-router.test.mjs`
- Modify: `cli/AGENTS.md`
- Modify: `cli/DATA_CONTRACT.md`
- Modify: `cli/README.md`
- Modify: `docs/PRODUCT_DESIGN_V0.1.md`
- Create: `docs/OPPORTUNITY_TRACKER_CONTRACT.md`

**Interfaces:**
- `buildStatusPayload(root).opportunityTracker` is read-only.
- Natural-language opportunity phrases route to `opportunity-tracker.mjs`.

- [ ] **Step 1: Add status**

Import and print the tracker section without creating files.

- [ ] **Step 2: Add routing**

Route write, node, status, and company-opportunity phrases to the new contract workflow.

- [ ] **Step 3: Update boundaries**

Document paths, schema, commands, non-goals, and the remaining Stage 5 gaps.

### Task 4: Verification And Ship

- [ ] Run `node --test tests/opportunity-tracker.test.mjs` from `cli/`.
- [ ] Run `npm test` from `cli/`.
- [ ] Run `node --check` for every touched `.mjs` file.
- [ ] Review the complete diff and confirm unrelated user files remain untouched.
- [ ] Commit design, implementation, tests, and docs.
- [ ] Pull `main`, merge the feature branch, rerun full tests, push, and verify local and GitHub alignment.
