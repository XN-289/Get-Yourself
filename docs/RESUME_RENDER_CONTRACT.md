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
- `finalPlanId`
- `finalPlanContentHash`
- `finalDocumentContentHash`

The fields form two optional compatibility groups:

- `materialsPackageId` and `materialsContentHash` must appear together and match the installed resume materials package.
- `finalPlanId`, `finalPlanContentHash`, and `finalDocumentContentHash` must appear together. When present, `check`, `import`, and installed-render inspection require the first two fields to match the installed final plan and the third field to match the raw UTF-8 SHA-256 of the current `cv.md`.

A render package without final provenance remains a valid legacy v1 package. It can still bind materials and render deterministic HTML, but the fact-chain audit reports it as a `binding-gap` instead of claiming that it targets the current final resume. The importer never adds, upgrades, or backfills these fields automatically; producing them requires a newly user-confirmed render package.

All content hashes use `sha256:<64 lowercase hex>`. Optional provenance fields participate in the package semantic hash.

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

The catalog is stored in `cli/templates/resume/templates.json`. Every template has an ID, Chinese display name, ATS posture, readable font-size floor, and at most four Chinese campus-recruiting use cases. Catalog IDs must exactly match the renderer allowlist.

| ID | Chinese name | Posture | Recommended use |
|---|---|---|---|
| `classic-ats` | 经典 ATS | friendly | 通用校招 / 国央企 / 银行金融 / 传统行业 |
| `ledger` | 账目风 | friendly | 通用校招 / 财务会计 / 供应链 / 银行金融 |
| `tech-compact` | 技术紧凑 | acceptable | 互联网技术 / 软件实习 / 项目密集 / 竞赛密集 |
| `modern-sidebar` | 现代侧栏 | limited | 产品设计 / 运营市场 / 创意岗位 / 作品集型简历 |
| `pillar` | 栏式结构 | limited | 产品运营 / 综合经历密集 / 双栏阅读 |
| `elegant-serif` | 雅致衬线 | limited | 研究型岗位 / 教育公共事务 / 文社科背景 |
| `atelier` | 工作室 | limited | 设计岗位 / 视觉作品集 / 创意实习 |
| `timeline` | 时间线 | limited | 成长主线清晰 / 多段实习 / 项目演进叙事 |
| `swiss` | 瑞士网格 | limited | 数据严谨岗位 / 咨询研究 / 结构化表达 |
| `executive` | 稳重型 | limited | 管理培训生 / 市场商务 / 综合能力叙事 |
| `colorblock` | 色块强调 | limited | 新媒体运营 / 校园招聘会打印版 / 视觉强调 |

The eleven visual systems are adapted from the MIT-licensed local offer toolkit. The Chinese catalog metadata is project-authored. Template files contain no sample people, companies, metrics, or contact details. They only define local CSS and one content-injection marker.

## Storage

- Package: `data/resume-render/{renderId}.json`
- HTML: `output/resume/{renderId}.html`
- Backups: `data/resume-render-backups/{renderId}/`

The same canonical package and template always produce byte-identical HTML. `generatedAt` is visible in the package but excluded from its semantic hash.

## CLI

```powershell
node resume-render.mjs list [--json]
node resume-render.mjs check <render.json> [--json]
node resume-render.mjs import <render.json> [--apply] [--replace] [--json]
```

`list` is read-only and works even when no materials package is installed.

`import` defaults to dry-run. Writing requires `--apply`. Replacing a different package or manually edited HTML requires `--replace`; the importer backs up the replaced user files first.

## Boundaries

- Rendering facts come only from the package, never from a template.
- All user text and URL attributes are HTML-escaped.
- Empty sections are omitted.
- Contact details remain plain, selectable text.
- Output is self-contained local HTML with no script or external stylesheet.
- The importer never opens a browser or uploads output.
- The importer does not modify `cv.md`, the final plan, resume materials, story bank, tracker, capability assets, or platform data.
- A final-bound render that points to a missing, different, or stale final plan / `cv.md` is rejected on CLI check and import; it is not repaired or accepted as current.
- Resume text is sensitive local data and must not be sent to external services for rendering.
