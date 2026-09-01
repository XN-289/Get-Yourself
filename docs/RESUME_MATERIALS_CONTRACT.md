# 简历素材包契约 v1

本文定义 Get Yourself 本地 Agent 在用户确认后落地的简历素材与 STAR 故事候选。该契约属于 Stage 4a，只解决本地结构化沉淀，不改变简历定稿、网页同步或自动上传边界。

## 目标与边界

简历素材包回答一个问题：哪些已经由用户确认的经历表述，可以继续用于简历定稿和面试准备。

允许包含：

- 契约版本、生成时间、目标岗位方向和 Agent Trace 指针。
- 用户确认过的简历条目候选：组织、角色、时间、bullet、来源和证据状态。
- 用户确认过的 STAR 故事候选及其关联素材。
- 保留的事实缺口与待追问问题。

禁止包含：

- 未获得用户确认的 AI 推断表述。
- 联系方式、身份证件、家庭住址等个人敏感信息。
- 原始证书、成绩单、扫描件内容或本地文件路径。
- 账号凭证、token、cookie。
- 简历定稿全文。

`cv.md` 仍然是简历定稿权威。`data/resume-materials.json` 是候选素材权威；`interview-prep/story-bank.md` 是由当前素材包派生的用户确认故事库。导入器不会修改 `cv.md`，也不会把素材包同步回网页。

## 文件格式

- 文件必须是 UTF-8 JSON，最大 256 KiB。
- 顶层和嵌套对象都使用字段白名单，未知字段会被拒绝。
- 时间使用 ISO-8601 UTC 字符串。
- ID 只允许 `A-Z`、`a-z`、`0-9`、`_`、`.`、`-`，长度 1 到 64。
- `confirmation` 当前只允许 `user_confirmed`。Agent 必须先展示条目、来源、证据状态和将写入的文件，获得用户确认后才能调用导入。
- `entries` 至少 1 项、最多 100 项；`stories` 可以为空，最多 100 项。
- 故事 `entryRefs` 必须指向存在的素材条目，且不能重复。
- 非空 `evidenceRefs` 必须指向本地当前能力证据包中的证据；未导入能力证据包时只能使用空数组。

```json
{
  "schema": "get-yourself.resume-materials",
  "schemaVersion": 1,
  "packageId": "resume-materials-demo-2026-09-01",
  "generatedAt": "2026-09-01T00:00:00.000Z",
  "traceId": "trace.resume-materials-demo",
  "targetRole": "Java 后端开发",
  "confirmation": "user_confirmed",
  "entries": [
    {
      "id": "internship-repair-backend",
      "section": "internship",
      "organization": "校园技术团队",
      "role": "后端开发实习生",
      "timeframe": "2026.03 - 2026.06",
      "bullet": "设计并实现宿舍报修小程序的后端接口，支撑报修流程进入宿舍试用",
      "sourceType": "user_statement",
      "sourceId": "user-statement-repair-internship",
      "evidenceStatus": "user_confirmed",
      "evidenceRefs": [],
      "openQuestions": ["服务规模和稳定性结果还需要用户补充"]
    }
  ],
  "stories": [
    {
      "id": "story-repair-api",
      "title": "把报修流程从口头沟通推进到线上试用",
      "situation": "宿舍报修依赖群聊消息，报修状态容易丢失。",
      "task": "作为后端开发实习生，需要把报修流程拆成可维护的接口。",
      "action": "与前端同学确认接口契约，设计并实现报修创建、状态更新和查询接口。",
      "result": "报修流程进入宿舍试用，状态可以在小程序内追踪。",
      "tags": ["后端开发", "跨端协作"],
      "entryRefs": ["internship-repair-backend"],
      "sourceType": "user_statement"
    }
  ]
}
```

## 字段说明

| 字段 | 必填 | 约束 |
|---|---:|---|
| `schema` | 是 | 固定为 `get-yourself.resume-materials` |
| `schemaVersion` | 是 | 当前固定为 `1` |
| `packageId` | 是 | 安全 ID；同一语义内容应稳定复用 |
| `generatedAt` | 是 | ISO-8601 UTC 时间；不参与内容哈希 |
| `traceId` | 是 | 安全 ID；当前允许本地 Trace 指针 |
| `targetRole` | 是 | 1 到 40 字符 |
| `confirmation` | 是 | 当前固定为 `user_confirmed` |
| `entries` | 是 | 1 到 100 项 |
| `entries[].id` | 是 | 安全 ID，包内唯一 |
| `entries[].section` | 是 | 枚举 |
| `entries[].organization` | 是 | 1 到 80 字符 |
| `entries[].role` | 是 | 1 到 60 字符 |
| `entries[].timeframe` | 是 | 1 到 40 字符 |
| `entries[].bullet` | 是 | 1 到 180 字符 |
| `entries[].sourceType` | 是 | 枚举 |
| `entries[].sourceId` | 是 | 安全 ID |
| `entries[].evidenceStatus` | 是 | 枚举 |
| `entries[].evidenceRefs` | 是 | 0 到 10 个能力证据 ID，不重复 |
| `entries[].openQuestions` | 是 | 0 到 5 项，每项 1 到 120 字符 |
| `stories[].id` | 是 | 安全 ID，包内唯一 |
| `stories[].title` | 是 | 1 到 80 字符 |
| `stories[].situation` / `task` / `action` / `result` | 是 | 每项 1 到 500 字符 |
| `stories[].tags` | 是 | 0 到 10 项，每项 1 到 30 字符 |
| `stories[].entryRefs` | 是 | 1 到 10 个素材 ID，不重复 |
| `stories[].sourceType` | 是 | 枚举 |

`section` 枚举：

- `internship`
- `project`
- `competition`
- `campus_work`
- `skill`

素材条目 `sourceType` 枚举：

- `user_statement`
- `resume`
- `evidence_package`
- `interview_review`
- `jd_analysis`
- `manual`

STAR 故事 `sourceType` 使用同一组来源标签，但不允许 `jd_analysis`。JD 只能提示差距和追问，不能成为学生经历的事实来源。

`evidenceStatus` 枚举：

- `verified`
- `user_confirmed`
- `missing`
- `external`

额外校验规则：

- `sourceType` 为 `evidence_package` 时必须提供至少一个 `evidenceRefs`。
- `evidenceStatus` 为 `verified` 时，至少一个引用证据在当前能力证据包中为 `verified`。
- 非 `evidence_package` 来源不得携带 `evidenceRefs`；用户口述来源使用 `user_confirmed` 或 `missing` 表述可信度。
- `jd_analysis` 条目必须使用 `external`，`external` 也只保留给 `jd_analysis`；这类条目只能作为待核查线索，不得进入简历定稿。

## 本地命令

在 `cli/` 下执行：

```powershell
node resume-materials.mjs check templates/resume-materials.example.json
node resume-materials.mjs import ../path/to/resume-materials.json
node resume-materials.mjs import ../path/to/resume-materials.json --apply
node resume-materials.mjs import ../path/to/resume-materials.json --apply --replace
```

行为：

1. `check` 只读校验，不写任何文件；如素材引用能力证据，会同时读取本地当前证据包。
2. `import` 不带 `--apply` 是 dry-run，只显示校验结果和将执行的动作。
3. 首次导入需要 `--apply`，写入 `data/resume-materials.json`，并生成 `interview-prep/story-bank.md`。
4. 语义内容完全相同的重复导入是幂等操作，不重写文件；`generatedAt` 变化不影响语义哈希。
5. 替换不同素材包或覆盖不同故事库必须显式加 `--replace`。
6. 替换前会把将被覆盖的规范化 JSON 和故事库备份到 `data/resume-materials-backups/`，每类最多保留最近 10 个备份。
7. 写入使用同目录临时文件和原子替换。
8. 本地只保存规范化 JSON 和确定性格式的故事库；不保存输入文件、原始 JSON 文本或任意附件。

`interview-prep/story-bank.md` 只包含当前素材包中 `confirmation=user_confirmed` 的故事。文件头部会明确说明它不是简历定稿；证据缺口不会被渲染成已完成事实。

## 状态与消费

`node gy.mjs --status` 只读展示：

- `missing`：尚未导入素材包。
- `ready`：素材包可用，显示方向、素材数、故事数、内容哈希和故事库状态。
- `invalid`：本地素材包结构损坏或派生故事库不可读，显示错误但不自动覆盖。

简历模式可以消费素材包，但必须遵守：

- 素材包是候选材料，不等于 `cv.md` 定稿。
- 写入 `cv.md` 前必须单独展示 diff 并获得确认。
- `external` 和 `missing` 状态不能被渲染成已验证成果。
- 面试复盘或 JD 分析生成的新素材必须先形成候选、经用户确认，再走本导入器。
