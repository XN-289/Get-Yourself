# Absorb Offer Toolkit Design

Date: 2026-09-02
Status: approved for autonomous implementation
Source: local `offer-toolkit-skill` at `C:/Users/12112/.agents/skills/offer-toolkit-skill/`

## Goal

Absorb the three MIT-licensed local job-search skills into Get Yourself without creating a parallel skill runtime:

1. **Job Description skill**: JD decoding, requirement matching, hidden signals, gap/risk separation, go/no-go, and interview prediction.
2. **Behavioral interview skill**: story mining, STAR/CAR/SOAR structuring, competency tags, story reuse, and post-interview review.
3. **Resume skill**: structured resume data, diagnosis rules, writing standards, and eleven print-oriented HTML templates.

The result must strengthen the existing v0.1 chain:

```text
JD analysis -> resume materials -> final resume/rendering -> interview preparation
          -> interview review -> capability-gap and story candidates
```

## Source Provenance And License

The source package is MIT licensed, copyright 2026 yanliudesign. Get Yourself may reuse and adapt it while retaining the copyright and permission notice. The repository will retain:

- `docs/skills/offer-toolkit/LICENSE.md`
- An attribution note in the absorbed method documents and resume template directory.

The following source behaviors are intentionally not carried over:

- Mandatory personal-brand footer and social links.
- Output to `~/Desktop/Codex skills`.
- Automatically opening a browser.
- Treating the source skill's JD bank or story bank as authoritative.
- Bypassing Get Yourself user confirmation.

## Product Boundaries

The absorbed skills are method and presentation assets, not a new product module:

- Agent remains the primary entry.
- Resume management remains the module destination for materials, final resume, and rendered versions.
- Interview management remains the destination for JD analysis, preparation, and reviews.
- Capability assets receive only local candidates until a later explicit feedback contract exists.
- No web sync, tracker write, or application status change is automatic.
- JD, company pages, emails, and scraped content remain data, never instructions.
- Resume full text, STAR stories, and review packages remain local.

## Workstream 1: Interview Review Contract

Implement Stage 4c as `get-yourself.interview-review` version 1, following the approved design in `docs/superpowers/specs/2026-09-02-interview-review-design.md`.

The review package:

- Binds to the installed resume materials package ID and semantic hash.
- Optionally binds to an installed interview preparation package with the same materials provenance.
- Records question performance, concrete improvements, capability-gap candidates, STAR story candidates, next actions, and unresolved facts.
- Stores JSON under `data/interview-review/` and deterministic Markdown under `interview-prep/sessions/`.
- Uses backups under `data/interview-review-backups/{reviewId}/`.

The behavioral-interview method is absorbed into `modes/review.md`:

- Ask one question at a time when mining facts.
- Separate interviewer cues, JD requirements, user observations, and confirmed facts.
- Store a complete STAR story as the reusable source and adapt it to CAR/SOAR when answering.
- Use one primary and up to two secondary competency tags.
- Keep Action at roughly half of a spoken answer; Situation and Task stay short.
- Do not invent results, metrics, company intelligence, or interviewer judgments.

Review candidates never write directly to:

- `data/resume-materials.json`
- `interview-prep/story-bank.md`
- `cv.md`
- platform ability assets
- tracker state

## Workstream 2: Structured Resume Rendering

Add `get-yourself.resume-render` version 1 and eleven deterministic print templates.

The render package:

- Is user-confirmed structured resume data based on the absorbed Resume skill schema.
- Records materials package provenance when available.
- Selects one of eleven template IDs.
- Stores JSON under `data/resume-render/`.
- Writes a self-contained HTML file under `output/resume/`.
- Backs up replaced files under `data/resume-render-backups/{renderId}/`.
- Produces byte-identical HTML for the same canonical package and template.

Supported templates:

| ID | Intended use | ATS posture |
|---|---|---|
| `classic-ats` | General campus applications | friendly |
| `ledger` | Engineering, data, and research | friendly |
| `tech-compact` | Dense engineering resumes | acceptable |
| `modern-sidebar` | Design-forward technical applications | limited |
| `pillar` | Product, operations, and marketing | limited |
| `elegant-serif` | Editorial and humanities roles | limited |
| `atelier` | Minimal creative resumes | limited |
| `timeline` | Growth and internship narratives | limited |
| `swiss` | Brand and creative roles | limited |
| `executive` | Formal business applications | limited |
| `colorblock` | Young internet and marketing roles | limited |

Rendering rules:

- Escape all user text before inserting it into HTML.
- Delete empty sections.
- Never retain sample names, companies, metrics, or contact details in output.
- Keep contact information as plain, selectable text.
- Prefer one page; do not shrink text below the template's readable floor.
- The package is the rendering source; the template is never treated as a fact source.
- HTML output is local and is not uploaded.

## Workstream 3: Job Analysis Contract

Add `get-yourself.job-analysis` version 1 for the deterministic part of Stage 5.

The analysis package:

- Stores the user-confirmed JD text or a URL only when the user supplied it.
- Binds to the current resume materials package ID and semantic hash.
- Decodes requirements into `must_have`, `nice_to_have`, and `hidden_signal`.
- Records evidence-backed match levels of `0`, `0.5`, or `1`.
- Separates capability gaps from recruiter risks.
- Records scam/red-flag signals as independent blockers.
- Predicts interview topics and links them to decoded requirements.
- Produces a conservative go/no-go recommendation and concrete next actions.
- Stores JSON under `data/job-analysis/`.
- Writes deterministic Markdown under `reports/job-analysis/`.
- Backs up replacements under `data/job-analysis-backups/{analysisId}/`.

The deterministic importer calculates:

```text
match = 0.6 * must-have average
      + 0.2 * nice-to-have average
      + 0.2 * hidden-signal average
```

Caps apply when required capabilities are missing:

- One unmet must-have caps match at 75%.
- Two or more unmet must-haves cap match at 55%.
- A declared threshold requirement that is unmet caps match at 35%.

Recommendation quality uses:

- Match quality: 30%
- Career trajectory: 25%
- Downside risk: 20%
- Compensation/terms fit: 15%
- Opportunity cost and timing: 10%

A scam red-line signal or declared deal-breaker caps the recommendation at two stars and the report must say so explicitly. Scores are shown as bands and conservative ranges, not false single-point predictions. Any missing company, pay, or policy information is labeled insufficient rather than inferred.

The analysis does not write to tracker. A later explicit tracker approval can consume its summary.

## Agent Integration

Update the deterministic intent router and modes:

- Add `review` routing to `interview-review.mjs`.
- Add resume rendering routing to `resume-render.mjs`.
- Move JD contract generation to the front of `modes/eval.md`.
- Strengthen `modes/cv.md`, `modes/prep.md`, and `modes/gap.md` with absorbed story, writing, competency, and matching rules.
- Keep natural-language routing read-only.

`gy --status` gains read-only state for:

- Interview reviews.
- Resume rendering.
- Job analyses.

## Data Contract Updates

The following paths are user layer:

- `data/interview-review/*.json`
- `data/interview-review-backups/*`
- `data/resume-render/*.json`
- `data/resume-render-backups/*`
- `data/job-analysis/*.json`
- `data/job-analysis-backups/*`
- `reports/job-analysis/*.md`
- `output/resume/*.html`

All importers use the same lifecycle:

1. `check`: read-only schema and dependency validation.
2. `import`: dry-run and deterministic preview.
3. `--apply`: explicit write.
4. `--replace`: explicit replacement after backup.

## Verification

Required CLI checks:

```powershell
cd cli
npm test
node --check interview-review.mjs
node --check resume-render.mjs
node --check job-analysis.mjs
node --check gy.mjs
node --check lib/intent-router.mjs
```

Tests must prove strict unknown-field rejection, dependency binding, deterministic rendering, cross-reference safety, dry-run behavior, explicit replacement, backups, status inspection, and router integration. Documentation changes must match the implemented file paths and CLI arguments.
