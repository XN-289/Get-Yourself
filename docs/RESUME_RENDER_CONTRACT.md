# Resume Render Contract

## Purpose

`resume-render.mjs` renders a user-confirmed structured resume into deterministic, self-contained, print-oriented HTML. It absorbs the local offer toolkit's resume method and template systems without retaining sample resume facts.

## Schema

Schema: `get-yourself.resume-render`

Version: `1`

Top-level required fields:

- `schema`
- `schemaVersion`
- `renderId`
- `generatedAt`
- `traceId`
- `templateId`
- `confirmation`
- `resume`

Optional provenance:

- `materialsPackageId`
- `materialsContentHash`

The two provenance fields must appear together. When present, they must match the installed resume materials package.

`confirmation` must be `user_confirmed`. Unknown fields are rejected at every object level.

### Resume Fields

Required sections:

- `header`: `name`, `headline`; optional `location`, `email`, `phone`, `links`
- `experience`: at least one item with `company`, `role`, `start`, `end`, `bullets`; optional `location`
- `education`: at least one item with `school`, `degree`, `end`; optional `location`, `start`, `detail`
- `skills`: at least one group with `group`, `items`

Optional sections:

- `summary`
- `projects`
- `certifications`
- `awards`
- `languages`
- `publications`
- `volunteer`

Exact field definitions are shown in `cli/templates/resume-render.example.json`.

## Templates

| ID | Posture |
|---|---|
| `classic-ats` | ATS friendly |
| `ledger` | ATS friendly |
| `tech-compact` | ATS acceptable |
| `modern-sidebar` | ATS limited |
| `pillar` | ATS limited |
| `elegant-serif` | ATS limited |
| `atelier` | ATS limited |
| `timeline` | ATS limited |
| `swiss` | ATS limited |
| `executive` | ATS limited |
| `colorblock` | ATS limited |

The eleven visual systems are adapted from the MIT-licensed local offer toolkit. Template files contain no sample people, companies, metrics, or contact details. They only define local CSS and one content-injection marker.

## Storage

- Package: `data/resume-render/{renderId}.json`
- HTML: `output/resume/{renderId}.html`
- Backups: `data/resume-render-backups/{renderId}/`

The same canonical package and template always produce byte-identical HTML. `generatedAt` is visible in the package but excluded from its semantic hash.

## CLI

```powershell
node resume-render.mjs check <render.json> [--json]
node resume-render.mjs import <render.json> [--apply] [--replace] [--json]
```

`import` defaults to dry-run. Writing requires `--apply`. Replacing a different package or manually edited HTML requires `--replace`; the importer backs up the replaced user files first.

## Boundaries

- Rendering facts come only from the package, never from a template.
- All user text and URL attributes are HTML-escaped.
- Empty sections are omitted.
- Contact details remain plain, selectable text.
- Output is self-contained local HTML with no script or external stylesheet.
- The importer never opens a browser or uploads output.
- The importer does not modify `cv.md`, resume materials, story bank, tracker, capability assets, or platform data.
- Resume text is sensitive local data and must not be sent to external services for rendering.
