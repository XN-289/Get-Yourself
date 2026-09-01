# 简历定稿计划契约 v1

本文定义 Get Yourself 本地 Agent 在用户确认后写入 `cv.md` 的审批计划。该契约属于 Stage 4b，连接“已确认简历素材”与“最终可交付简历”，不引入网页同步、PDF 自动生成或 LLM 自动定稿。

## 目标与边界

简历定稿计划回答一个问题：当前素材包中的哪些章节和条目，经用户确认后可以进入 `cv.md`。

权威关系：

1. `data/resume-materials.json` 是候选素材权威。
2. `data/resume-final-plan.json` 是一次用户确认的章节选择与溯源计划。
3. `cv.md` 是最终简历事实权威。
4. PDF 是导出产物，不是事实权威。

禁止：

- 把 `missing` 或 `external` 素材渲染成已确认成果。
- 在素材包变更后沿用旧哈希继续定稿。
- 绕过 dry-run / apply / replace 审批直接覆盖用户简历。
- 自动上传简历、计划或备份。
- 在计划中保存联系方式、证件、账号凭证或原始材料内容。

## 文件格式

- 计划必须是 UTF-8 JSON，最大 128 KiB。
- `cv.md` 最大 512 KiB，且必须是常规文件。
- 顶层和嵌套对象使用字段白名单，未知字段拒绝。
- ID 使用安全字符：`A-Z`、`a-z`、`0-9`、`_`、`.`、`-`，长度 1 到 64。
- 时间使用 ISO-8601 UTC 字符串。
- `confirmation` 只允许 `user_confirmed`。
- `materialsPackageId` 与 `materialsContentHash` 必须精确匹配当前安装素材包。
- `sections` 为 1 到 5 项，章节不重复；条目引用必须存在、同章节、且全局不重复。
- 只有 `verified` 或 `user_confirmed` 素材可以进入定稿。

```json
{
  "schema": "get-yourself.resume-final-plan",
  "schemaVersion": 1,
  "planId": "resume-final-demo-2026-09-01",
  "generatedAt": "2026-09-01T12:00:00.000Z",
  "traceId": "trace.resume-final-demo",
  "materialsPackageId": "resume-materials-demo-2026-09-01",
  "materialsContentHash": "sha256:...",
  "confirmation": "user_confirmed",
  "sections": [
    { "section": "internship", "entryRefs": ["internship-repair-backend"] },
    { "section": "project", "entryRefs": ["project-frontend-contract"] }
  ]
}
```

章节枚举与渲染标题：

| 值 | 标题 |
|---|---|
| `internship` | 实习经历 |
| `project` | 项目经历 |
| `competition` | 竞赛获奖 |
| `campus_work` | 学生工作 |
| `skill` | 技能证书 |

## 本地命令

先导入并确认当前素材包，再在 `cli/` 执行：

`resume-final.example.json` 中的哈希绑定当前示例素材包；示例文件变更时必须同步重新计算。

```powershell
node resume-final.mjs check templates/resume-final.example.json
node resume-final.mjs apply ../path/to/resume-final-plan.json
node resume-final.mjs apply ../path/to/resume-final-plan.json --apply
node resume-final.mjs apply ../path/to/resume-final-plan.json --apply --replace
```

行为：

1. `check` 只读校验计划，不写文件。
2. `apply` 默认 dry-run，返回目标路径、章节变更和期望 Markdown。
3. 首次写入需要 `--apply`，同时写入计划与 `cv.md`。
4. 语义内容相同的重复应用是幂等操作；`generatedAt` 不参与内容哈希。
5. 覆盖不同计划或被手工修改过的 `cv.md` 必须显式 `--apply --replace`。
6. 替换前备份旧计划与旧简历到 `data/resume-final-backups/`，每类最多保留最近 10 个。
7. 写入使用原子替换。

## Markdown 替换规则

| 字段 | 约束 |
|---|---|
| `planId` | 安全 ID，标识本次计划 |
| `generatedAt` | ISO-8601 UTC；不参与内容哈希 |
| `traceId` | 安全 ID，当前允许本地 Trace 指针 |
| `materialsPackageId` | 必须等于当前素材包 ID |
| `materialsContentHash` | 必须等于当前素材包语义哈希 |
| `confirmation` | 固定 `user_confirmed` |
| `sections[].section` | 章节枚举，计划内不重复 |
| `sections[].entryRefs` | 1 到 100 个素材 ID，同章节且全局不重复 |

- 渲染按计划章节生成二级标题、素材组织和 bullet。
- 已存在的计划章节按标题整节替换。
- 不存在的计划章节追加到文件末尾。
- 上一份计划管理过但新计划移除的章节会整节移除。
- 教育背景、自我评价等未由计划管理的章节保持原样。
- 同名二级标题出现多次时拒绝写入，避免误替换。

这个设计保留用户手工维护的非托管内容，同时让计划管理过的章节有明确生命周期。

## 状态与消费

`node gy.mjs --status` 只读展示：

- `blocked`：尚未导入素材包。
- `missing`：素材包可用但没有定稿计划。
- `ready`：计划可用，并显示章节、素材数和 `cv.md` 是否与当前渲染一致。
- `invalid`：计划、素材引用或简历文件无效，显示错误但不自动修复。

Agent 消费规则：

1. 先展示拟进入定稿的章节、条目、来源和证据状态。
2. 素材包哈希变化时重新生成计划，不沿用旧审批。
3. 用户确认后先 dry-run，再显式 `--apply`。
4. 覆盖手工修改或不同计划时，单独确认 `--replace`。
5. 导出 PDF 继续走 `generate-pdf.mjs`，覆盖 PDF 前另行确认。
