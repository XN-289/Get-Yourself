# Capability Feedback Implementation Plan

## Goal

Implement Stage 4d as a local, contract-governed capability feedback ledger that maps confirmed interview-review candidates to existing abilities without modifying any source-of-truth or platform state.

## Global Constraints

- Preserve the unrelated user files `SYSTEM_DASHBOARD.html`, `docs/项目讲解思维导图.md`, and `docs/项目讲解思维导图.pdf`.
- Use test-driven development and commit each completed phase.
- Default import is dry-run; write requires `--apply`; replacement requires `--replace`.
- The contract writes only `data/capability-feedback/{feedbackId}.json`, `reports/capability-feedback/{feedbackId}.md`, and its backups.
- Do not claim platform sync; it remains Stage 6.

## Task 1: Contract Tests

Create `cli/tests/capability-feedback.test.mjs`.

- [ ] Install evidence, materials, preparation, and review fixtures in a temporary root.
- [ ] Validate canonical mappings, hashes, and derived candidates.
- [ ] Reject unknown fields, missing dependencies, stale hashes, duplicate IDs, and broken references.
- [ ] Verify dry-run no-write, apply, downstream isolation, idempotence, replacement, backups, status, and routing.
- [ ] Observe the new suite fail before production code exists.

## Task 2: Deterministic Importer

Create `cli/capability-feedback.mjs` and `cli/templates/capability-feedback.example.json`.

- [ ] Implement schema `get-yourself.capability-feedback` version `1`.
- [ ] Load and bind the installed evidence package, materials package, and review.
- [ ] Canonicalize selected gap and story mappings into local follow-ups and evidence candidates.
- [ ] Render deterministic Markdown.
- [ ] Implement check, dry-run import, apply, replacement, backups, and inspection.
- [ ] Export a small installed-review loader from `interview-review.mjs` instead of duplicating its preparation-aware logic.
- [ ] Make the focused suite pass.

## Task 3: Agent And Product Integration

Modify:

- `cli/gy.mjs`
- `cli/lib/intent-router.mjs`
- `cli/tests/gy-entry.test.mjs`
- `cli/tests/intent-router.test.mjs`
- `cli/AGENTS.md`
- `cli/DATA_CONTRACT.md`
- `cli/README.md`
- `docs/PRODUCT_DESIGN_V0.1.md`
- `docs/INTERVIEW_REVIEW_CONTRACT.md`

Create `docs/CAPABILITY_FEEDBACK_CONTRACT.md`.

- [ ] Add read-only `capabilityFeedback` status.
- [ ] Route capability feedback phrases to the new module.
- [ ] Document current paths, write boundaries, commands, and Stage 4 completion.
- [ ] Continue to mark platform sync as Stage 6 work.

## Task 4: Verification And Ship

- [ ] Run `npm test` from `cli/`.
- [ ] Run syntax checks for all touched `.mjs` files.
- [ ] Review the full diff and preserve unrelated user files.
- [ ] Commit implementation and integration.
- [ ] Merge `codex/capability-feedback` into `main`.
- [ ] Push `main` to GitHub.
