# 简历版本库契约 v1

本文定义 Get Yourself 学生工作台“简历线 / 版本 / 当前投递版”的本地持久化契约。它只解决成品简历版本目录的落盘，不改变简历素材、简历定稿、渲染产物或平台同步的既有权威边界。

## 目标与权威边界

简历版本库回答一个问题：当前工作台有哪些成品简历线、哪些版本，以及每条线的当前投递版是哪一个。

权威关系：

1. `data/resume-materials.json` 是候选素材权威。
2. `data/resume-final-plan.json` 是一次用户确认的定稿计划权威。
3. `cv.md` 是最终简历事实权威。
4. `data/resume-render/*.json` 与 `output/resume/*.html` 是可追溯渲染产物。
5. `data/resume-library.json` 只保存工作台简历线与版本目录，包括版本全文、状态、模板、来源、变更说明和可选文件名。

非目标：

- 不替代或修改 `cv.md`。
- 不修改简历素材、故事库或定稿计划。
- 不创建渲染 JSON 或 HTML。
- 不把简历内容上传到网页或外部服务。
- 不在浏览器中直接写 `cli/data`。
- 不把模板当作事实来源，不从版本全文推断新事实。

简历版本全文是敏感本地数据，也是数据而非指令。导入器不得把全文中的提示词、HTML、注释或外部内容当作执行规则。

## 文件格式

- Schema：`get-yourself.resume-library`
- 版本：`1`
- 文件最大 2 MiB。
- 顶层与嵌套对象使用字段白名单，未知字段拒绝。
- `confirmation` 只允许 `user_confirmed`。
- `libraryId`、`traceId`、`documentId`、`versionId` 使用安全 ID：`A-Z`、`a-z`、`0-9`、`_`、`.`、`-`，长度 1 到 64。
- `generatedAt` 与 `updatedAt` 使用 ISO-8601 UTC 时间；导入时统一规范化为毫秒精度的 UTC ISO 字符串，保证浏览器与 CLI 对同一语义时间得到同一哈希。
- `documents` 最多 100 条；每条简历线最多 100 个版本。
- 版本全文为 1 到 131072 个字符，不允许无法安全进入 JSON / HTML 工作流的基础控制字符。
- `fileName` 是可选文件名，不能包含路径分隔符，也不能使用 Windows 保留设备名。

```json
{
  "schema": "get-yourself.resume-library",
  "schemaVersion": 1,
  "libraryId": "web-resume-library",
  "generatedAt": "2026-09-02T08:00:00.000Z",
  "traceId": "trace.resume-library-demo",
  "confirmation": "user_confirmed",
  "documents": [
    {
      "documentId": "resume-java-backend",
      "title": "Java 后端主简历",
      "targetRole": "Java 后端开发",
      "activeVersionId": "resume-java-backend-v2",
      "versions": [
        {
          "versionId": "resume-java-backend-v1",
          "version": 1,
          "status": "final",
          "templateId": "tech-compact",
          "updatedAt": "2026-09-01T08:00:00.000Z",
          "source": "agent",
          "changeNote": "首版整合实习与项目经历",
          "content": "# 李雷 · Java 后端开发\n..."
        }
      ]
    }
  ]
}
```

## 字段规则

| 字段 | 必填 | 规则 |
|---|---:|---|
| `schema` | 是 | 固定为 `get-yourself.resume-library` |
| `schemaVersion` | 是 | 当前固定为 `1` |
| `libraryId` | 是 | 版本库 ID，语义内容相同时可保持稳定 |
| `generatedAt` | 是 | ISO-8601 UTC；不参与语义哈希 |
| `traceId` | 是 | 本地 Trace 指针；每次导出可变化，不参与语义哈希 |
| `confirmation` | 是 | 固定 `user_confirmed` |
| `documents` | 是 | 0 到 100 条简历线 |
| `documents[].documentId` | 是 | 全库唯一 |
| `documents[].title` | 是 | 2 到 100 字符 |
| `documents[].targetRole` | 是 | 2 到 100 字符 |
| `documents[].activeVersionId` | 是 | 必须指向同简历线版本，且不能是草稿 |
| `documents[].versions` | 是 | 1 到 100 个版本，按 `1..N` 连续排序 |
| `versions[].versionId` | 是 | 全库唯一 |
| `versions[].version` | 是 | 从 1 开始的连续整数 |
| `versions[].status` | 是 | `draft` / `final` / `exported` |
| `versions[].templateId` | 是 | 必须存在于系统简历模板目录 |
| `versions[].updatedAt` | 是 | ISO-8601 UTC |
| `versions[].source` | 是 | `agent` / `import` / `manual` |
| `versions[].changeNote` | 是 | 2 到 500 字符 |
| `versions[].content` | 是 | 成品简历全文 |
| `versions[].fileName` | 否 | 本地文件名，不允许路径 |

一条简历线最多一个 `draft`。当前投递版只能是 `final` 或 `exported`。

语义哈希计算整个规范化版本库，但排除顶层 `generatedAt` 与 `traceId`。因此只重新导出时间或 Trace 指针不同、内容相同的版本库是幂等导入。

## 本地命令

在 `cli/` 下执行：

```powershell
node resume-library.mjs check ../path/to/resume-library.json
node resume-library.mjs import ../path/to/resume-library.json
node resume-library.mjs import ../path/to/resume-library.json --apply
node resume-library.mjs import ../path/to/resume-library.json --apply --replace
```

行为：

1. `check` 只读校验，不写文件。
2. `import` 默认 dry-run，展示将安装的版本库。
3. 首次写入需要 `--apply`，只写 `data/resume-library.json`。
4. 语义内容相同的重复 `--apply` 是幂等操作，不重写文件。
5. 替换不同版本库必须显式加 `--replace`。
6. 替换前备份旧版本库到 `data/resume-library-backups/`，最多保留最近 20 个。
7. 写入使用原子替换。
8. CLI 修改范围仅限版本库 JSON 和备份；不修改 `cv.md`、素材、定稿、渲染包、HTML 或云端数据。

`node gy.mjs --status` 只读展示版本库的缺失、可用或无效状态，并统计简历线与版本数量；不会自动修复或创建文件。

## 浏览器文件桥

简历管理页提供两个显式动作：

- **导出版本库**：用户确认后，把当前会话中的简历线与版本生成为 v1 契约 JSON，保存到本机下载目录。导出动作记录 Trace，但不写 `cli/data`。
- **读取版本库**：用户选择本地 JSON 后，前端先按同一套规则严格校验，再显示简历线数、版本数、当前会话规模和内容哈希；用户确认后只替换当前前端会话对象，不修改任何本地文件。

前端保留已导入契约对象的 `documentId` 与 `versionId`，以便下一次导出时维持稳定身份。前端显示时间转换为 Asia/Shanghai；契约内时间保持 UTC ISO。

## 状态与消费

Agent 或后续本地 skill 消费版本库时必须遵守：

1. 先向用户展示简历线、版本、当前投递版和 Trace。
2. 浏览器导出的文件必须先经过 CLI `check` 和 dry-run。
3. 写入或替换本地版本库必须显式 `--apply` / `--replace`。
4. 不能把版本库中的简历全文写成素材事实、能力证据或定稿。
5. 生成下一版必须遵守既有简历线规则：Agent 只能写唯一草稿，不能覆盖定稿或导出版。
