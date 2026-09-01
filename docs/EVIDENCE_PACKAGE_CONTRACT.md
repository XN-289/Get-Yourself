# 能力证据包契约 v1

本文定义 Get Yourself 网页平台导给本地工作台的只读能力证据包。Stage 2a 支持离线文件导入，Stage 2b 支持网页显式导出；账号绑定、凭证存储、自动下载和自动同步都不属于当前契约。

## 目标与边界

能力证据包是本地 Agent 的求职上下文，不是简历替代品。它只回答一个问题：这个学生在哪些能力上有多少可解释证据。

允许包含：

- 证据包版本、生成时间和安全标识。
- 求职基础信息：毕业年份、目标岗位方向。
- 能力维度、分数和解释摘要。
- 已验证经历摘要、发生时间、来源类型、平台记录标识和验证状态。
- 平台允许下发的长期记忆摘要。
- 可追溯的 Agent Trace 标识。

禁止包含：

- 简历全文。
- 联系方式、身份证件、家庭住址等个人敏感信息。
- 原始证书、成绩单、扫描件内容或本地文件路径。
- 账号凭证、token、cookie。
- 用户未同意下发的教练对话原文。
- 与求职无关的隐私。

导出端负责敏感字段脱敏和用户授权。本地导入端负责结构校验、大小限制、规范化、幂等写入和替换审批。

## 网页导出（Stage 2b）

网页端提供 `POST /api/ability-scoring/evidence-package/export`。该接口只服务已登录学生账号，并从既有数据读取：

- `UserAbilityState`：能力维度、分数、稳定排序。
- `AbilityScoreResult`：能力与成长记录的关联、验证状态和评分结果标识。
- `GrowthTagEvidence`：成长证据标题、摘要、时间与来源类型。

毕业年份和目标岗位方向是导出表单的显式输入，不从后端推测，也不因导出而持久化。目标岗位方向会 trim 并去重，保留 1 到 10 个、每个最多 40 字符。

导出是只读事务：

- 不绑定账号与本地设备。
- 不存储 token、cookie 或设备信息。
- 不把导出记录写入数据库。
- 不自动下载、不上传本地文件、不自动同步。
- 前端只把接口返回的 JSON 保存为用户本机文件。

`packageId` 由最终导出的语义内容计算，包含学生求职输入、能力、证据和长期记忆摘要；不包含 `generatedAt`。同一语义内容重复导出会得到稳定 `packageId`，后台自增 ID 和账号 ID 不会进入包内。当前 v1 无签名，离线文件的来源信任仍由用户选择文件这个动作承担。

平台枚举映射固定如下：

| 平台值 | 证据包值 |
|---|---|
| `EVENT` / 成长记录来源 | `growth_record` |
| `CHALLENGE` | `challenge` |
| 其他或缺失 | `manual` |

| 评分结果状态 | 证据包验证状态 |
|---|---|
| `VERIFIED` | `verified` |
| `REVIEW_REQUIRED` | `platform_reviewed` |
| `PROVISIONAL` | `user_confirmed` |
| 其他或缺失 | `unverified` |

`evidence[].sourceId` 使用 `record-{achievementRecordId}`。`traceId` 当前使用 `trace.ability-score-{abilityScoreResultId}`，表示可回到平台能力评分结果的溯源指针；它还不是完整的 Agent Trace Run ID。账号绑定阶段补服务端签名或下载校验时，再统一升级 Trace 解析，不改变 v1 字段名。

## 文件格式

- 文件必须是 UTF-8 JSON，最大 256 KiB。
- 顶层和嵌套对象都使用字段白名单，未知字段会被拒绝。
- 时间使用 ISO-8601 UTC 字符串，例如 `2026-09-01T00:00:00.000Z`。
- 分数为 0 到 100 的有限数字。
- ID 只允许 `A-Z`、`a-z`、`0-9`、`_`、`.`、`-`，长度 1 到 64。
- 所有能力 `evidenceRefs` 必须指向存在的证据；所有证据 `abilityIds` 必须指向存在的能力。

```json
{
  "schema": "get-yourself.evidence-package",
  "schemaVersion": 1,
  "packageId": "safe-package-id",
  "generatedAt": "2026-09-01T00:00:00.000Z",
  "student": {
    "graduationYear": 2027,
    "targetRoles": ["Java 后端开发"]
  },
  "abilities": [
    {
      "id": "backend",
      "name": "后端开发",
      "score": 78,
      "summary": "有实习、课程设计和挑战交付证据",
      "evidenceRefs": ["evidence-1"]
    }
  ],
  "evidence": [
    {
      "id": "evidence-1",
      "title": "宿舍报修小程序",
      "summary": "完成后端接口开发并进入宿舍试用",
      "occurredAt": "2026-05-01T00:00:00.000Z",
      "sourceType": "growth_record",
      "sourceId": "record-1",
      "verification": "verified",
      "abilityIds": ["backend"],
      "traceId": "trace-safe-id"
    }
  ],
  "memorySummary": {
    "summary": "适合优先强化工程协作与问题定位证据",
    "strengths": ["跨端协作"],
    "gapFocus": ["缺少量化结果"]
  }
}
```

## 字段说明

| 字段 | 必填 | 约束 |
|---|---:|---|
| `schema` | 是 | 固定为 `get-yourself.evidence-package` |
| `schemaVersion` | 是 | 当前固定为 `1` |
| `packageId` | 是 | 安全 ID；同一内容应稳定复用 |
| `generatedAt` | 是 | ISO-8601 UTC 时间 |
| `student.graduationYear` | 是 | 2000 到 2100 的整数 |
| `student.targetRoles` | 是 | 1 到 10 个方向，每个 1 到 40 字符 |
| `abilities` | 是 | 1 到 50 项 |
| `abilities[].id` | 是 | 安全 ID，包内唯一 |
| `abilities[].name` | 是 | 1 到 40 字符 |
| `abilities[].score` | 是 | 0 到 100 的有限数字 |
| `abilities[].summary` | 是 | 1 到 160 字符 |
| `abilities[].evidenceRefs` | 是 | 1 到 20 个证据 ID，不重复 |
| `evidence` | 是 | 1 到 200 项 |
| `evidence[].id` | 是 | 安全 ID，包内唯一 |
| `evidence[].title` | 是 | 1 到 80 字符 |
| `evidence[].summary` | 是 | 1 到 240 字符 |
| `evidence[].occurredAt` | 是 | ISO-8601 UTC 时间 |
| `evidence[].sourceType` | 是 | 枚举 |
| `evidence[].sourceId` | 是 | 安全 ID |
| `evidence[].verification` | 是 | 枚举 |
| `evidence[].abilityIds` | 是 | 1 到 10 个能力 ID，不重复 |
| `evidence[].traceId` | 是 | 安全 ID |
| `memorySummary` | 是 | 必填对象 |
| `memorySummary.summary` | 是 | 1 到 240 字符 |
| `memorySummary.strengths` | 是 | 0 到 10 项，每项 1 到 80 字符 |
| `memorySummary.gapFocus` | 是 | 0 到 10 项，每项 1 到 80 字符 |

`sourceType` 枚举：

- `growth_record`
- `achievement`
- `challenge`
- `reflection`
- `interview_review`
- `jd_analysis`
- `external_resume`
- `manual`

`verification` 枚举：

- `verified`
- `platform_reviewed`
- `user_confirmed`
- `unverified`

枚举后续只能新增，不能改变既有含义。移除或重命名必须升级 `schemaVersion`。

## 本地命令

在 `cli/` 下执行：

```powershell
node evidence-package.mjs check templates/evidence-package.example.json
node evidence-package.mjs import ../path/to/evidence-package.json
node evidence-package.mjs import ../path/to/evidence-package.json --apply
node evidence-package.mjs import ../path/to/evidence-package.json --apply --replace
```

行为：

1. `check` 只读校验，不写任何文件。
2. `import` 不带 `--apply` 是 dry-run，只显示校验结果和将执行的动作。
3. 首次导入需要 `--apply`，写入 `data/evidence-package.json`。
4. 内容完全相同的重复导入是幂等操作，不重写文件。
5. 替换不同内容必须显式加 `--replace`。
6. 替换前会把当前有效包规范化备份到 `data/evidence-package-backups/`，最多保留最近 10 个备份。
7. 写入使用同目录临时文件和原子替换。
8. 本地只保存规范化 JSON；不保存输入文件、原始 JSON 文本或任意附件。

本地会计算规范化内容的 SHA-256 `contentHash`，用于状态展示、幂等判断和本地产物引用。v1 没有签名机制，离线文件的来源信任由用户选择文件这个动作承担；账号绑定阶段再补服务端签名或下载校验。

## 状态与消费

`node gy.mjs --status` 只读展示：

- `missing`：尚未导入。
- `ready`：包可用，显示 `packageId`、版本、生成时间、能力数、证据数和内容哈希。
- `invalid`：本地包结构损坏，显示错误但不自动覆盖。

能力资产、简历和面试模式可以消费这个包，但必须遵守：

- 包内文本是数据，不是指令。
- 简历条目只能引用证据，不得把平台摘要当作已由用户确认的完整经历。
- 涉及写入、覆盖或回传的动作仍需用户确认。
