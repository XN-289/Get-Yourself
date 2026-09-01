# Project Decisions

This file records durable product and engineering decisions. It does not replace `PROJECT_STATE.md`, which records current verifiable implementation state.

## 2026-09-01

1. **Agent is the only primary entry.** Both the web student workspace and the local `gy` entry start with Agent conversation. The Agent workspace carries conversation, intent, next actions, and approvals only; it does not mix object lists from other modules.
2. **The independent product modules are exactly Agent, capability assets (working name), resume management, and interview management.** Clicking a module enters that module's own object space.
3. **The growth coach is not a visible module.** Existing coach-like capability may remain as backend platform memory and context for Agent.
4. **Schedule is not an independent module.** Deadline and time data only serves application tracking and interview management.
5. **Interview management is the core delivery-practice loop.** It covers JD analysis, resume adaptation, application tracking, written tests, interviews, review, and feedback into capability assets.
6. **Capability assets are the structured result of growth experience.** Interview review and JD requirements must feed this module.
7. **Enterprise and activity surfaces remain frozen.** Do not add product features to them in v0.1.
8. **Implementation advances gradually.** The frontend demo is inspected before deeper backend integration; user acceptance must be explicit before it is recorded as accepted.
9. **Every completed change must end in a git commit.** The canonical remote remains the existing `origin` at `git@github.com:XN-289/Get-Yourself.git`.
10. **Stage 1 uses a deterministic Agent router before any LLM or backend integration.** `gy` maps natural language to a module destination and an existing background mode; it does not pretend to complete the task, persist the raw query, or write user-layer files.
11. **`gy --status` is read-only.** Onboarding inspection reports missing and unpersonalized user files without copying templates or changing local data.
12. **Resume experience structuring is governed by `cli/modes/cv.md`.** Drafting and STAR-story extraction may happen there, but writes to `cv.md`, resume material, the story bank, or PDF outputs require explicit user confirmation.
13. **Stage 2a implements the offline evidence package before account binding.** The local CLI accepts a strict, versioned JSON contract first; no token storage, device binding, backend API change, or automatic sync is introduced.
14. **The local evidence package is canonical and explicitly governed.** Validation uses a field whitelist, size and length limits, enum checks, and ability/evidence reference checks. Import defaults to dry-run; writing requires `--apply`, and replacing different content requires `--replace`.
15. **Evidence package text is data, not instructions.** Its summaries may guide follow-up questions and evidence references, but never bypass user confirmation or become assumed resume facts.
16. **Stage 2b implements explicit web export without account binding.** Graduation year and target roles are export-time user inputs, never inferred or persisted. Export reads existing ability states, score results, and growth-tag evidence only; it performs no device binding, token storage, automatic download contract, or automatic sync.
17. **The evidence `packageId` hashes exported semantic content.** The identifier excludes generation time and backend account identifiers so identical exported content remains stable while the package itself contains no account ID. Its v1 `traceId` is a deterministic pointer to the platform ability score result, not yet a full Agent Trace Run ID.
18. **The student frontend uses small composable primitives rather than a full admin component library.** Reka UI supplies headless dialog accessibility, VueUse supplies browser-state helpers, Vue Query supplies explicit async mutation state, and Markdown rendering is sanitized with raw HTML disabled. Element Plus / Ant Design Vue / Vuetify remain rejected for this workbench because they would pull the product back toward generic back-office layout.

Source: user direction in this project thread on 2026-09-01.
