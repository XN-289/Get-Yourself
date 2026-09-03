# 简历事实链审计契约 v1

本文定义 Get Yourself 本地工作台的只读简历事实链审计。审计回答一个窄问题：素材、STAR 故事、定稿计划、`cv.md`、渲染包、简历版本库与当前投递版之间，哪些身份和内容关系可以被当前文件证明，哪些存在漂移、歧义或契约绑定缺口。

## 权威边界

审计器不创建、修复或同步任何对象。它只读取既有本地文件并向 stdout 输出结果：

1. 不调用 LLM。
2. 不执行 shell 命令。
3. 不访问网络。
4. 不写用户层文件。
5. 不生成备份。
6. 不按内容相似度自动选择渲染包或当前投递版。
7. 不把简历版本库、渲染包或 HTML 反向提升为事实权威。

`data/resume-library.json` 中的外部导入版本只能作为独立候选。审计不得暗示它可以反写 `cv.md`、素材包或定稿计划；复用必须由用户显式派生新草稿并重新确认。

## 命令

在 `cli/` 下执行：

```powershell
node resume-fact-chain.mjs audit
node resume-fact-chain.mjs audit --json
```

`node gy.mjs --status` 与 `--status --json` 也会携带 `resumeFactChain` 摘要，且保持只读。

## 输出 Schema

- Schema：`get-yourself.resume-fact-chain-audit`
- 版本：`1`
- 输出：仅 stdout，不落盘

顶层结果包含：

| 字段 | 含义 |
|---|---|
| `state` | 整体审计结论 |
| `objects` | 七类对象的可观察状态、身份与指纹 |
| `links` | 相邻对象之间的可证明关系 |
| `drifts` | 需要用户处理的漂移与契约缺口 |
| `candidates` | 可用渲染包与当前投递版候选 |
| `limitations` | 当前契约无法证明的边界 |
| `execution` | 只读执行声明 |

`execution` 固定为：

```json
{
  "mode": "read-only-audit",
  "writeCount": 0,
  "automaticRepair": false,
  "backupDirectoryUsed": null
}
```

## 对象状态

对象状态只允许：

| 状态 | 含义 |
|---|---|
| `missing` | 文件不存在，链路尚未建立 |
| `ready` | 文件本身可读且通过当前可观察校验 |
| `invalid` | 文件存在但格式、大小、类型或契约校验失败 |
| `blocked` | 上游对象缺失或身份无法支持当前判断 |

`objects.renderPackages` 与 `objects.currentApplicationVersions` 是数组。渲染包数组为空表示渲染产物 `missing`；当前投递版数组为空表示版本库尚未提供可投递终点，事实链为 `blocked`。

各对象审计重点：

| 对象 | 检查 |
|---|---|
| 简历素材 | 安装契约、`packageId`、素材内容哈希 |
| STAR 故事库 | 是否等于当前素材包的确定性派生结果 |
| 定稿计划 | 计划契约、素材 ID / 哈希、章节引用 |
| `cv.md` | 定稿计划重新渲染后的托管章节是否一致 |
| 渲染包 | 契约、素材绑定、文件名与 `renderId`、HTML 确定性输出 |
| 简历版本库 | 版本库契约、简历线、版本、当前投递版 |
| 当前投递版 | 与 `cv.md` 的全文哈希比较、来源、反写禁止 |

## 整体状态

整体状态按以下优先级输出：

1. `invalid`：任一对象存在但无效。
2. `blocked`：任一链路对象缺失或依赖不可判断。
3. `drifted`：存在内容漂移，例如故事库、`cv.md`、HTML 或当前投递版与确定性预期不同。
4. `ambiguous`：存在多个可用渲染包或多条当前投递版，用户必须先选择候选。
5. `binding-gap`：内容当前一致，但契约缺少身份字段，无法证明完整链路。
6. `ready`：所有对象就绪且相邻链路均可证明。

`binding-gap` 是诚实结论，不是错误。当前渲染包契约只保存素材 ID / 哈希，不保存定稿计划 ID 与 `cv.md` 内容指纹；当前简历版本库契约不保存定稿指纹或导入文件指纹。因此，即使 `cv.md` 与版本全文哈希相同，审计也只能说“内容相同”，不能说“该版本已绑定当前定稿”。

## 链路状态

| Link | 当前可证明性 |
|---|---|
| `materialsToFinalPlan` | 定稿计划保存素材 ID 与内容哈希，可证明 |
| `finalPlanToFinalDocument` | 用当前素材与计划重新渲染托管章节，可比较 |
| `finalDocumentToRenderPackages` | 当前契约缺定稿绑定，只能输出 `unproven` |
| `finalDocumentToCurrentApplicationVersions` | 当前契约缺来源指纹，只能输出 `unproven` |

内容指纹相同不是身份绑定。后续升级渲染包与版本库契约时，必须由用户重新确认新增字段，审计器不得自动补写旧文件。

## 漂移处理

漂移项包含 ID、严重级别、涉及对象、人类可读说明与建议动作。每个漂移项都带：

```json
{ "automaticRepair": false }
```

典型漂移：

| ID | 处理 |
|---|---|
| `story-bank-different` | 展示素材派生结果与手工故事库差异，由用户选择保留或显式恢复 |
| `final-document-different` | 保留用户文本，用户选择重新定稿、接管手工内容或派生新计划 |
| `render-html-different` | 保留手工 HTML，用户选择继续保留或显式替换渲染输出 |
| `library-current-version-different` | 展示两个全文哈希，用户选择重新定稿、导入版本或保持分离 |
| `render-candidate-ambiguous` | 列出全部渲染包，由用户指定本轮候选 |
| `current-version-candidate-ambiguous` | 列出各简历线当前投递版，由用户选择或分线管理 |
| `render-final-binding-missing` | 只作为候选渲染输出，不声称对准当前定稿 |
| `library-final-binding-missing` | 外部导入版本不得反写事实链；复用必须显式派生草稿 |

所有建议动作都必须经过既有契约工具的 check、dry-run、`--apply` 和需要时的 `--replace`。审计器本身不执行这些动作。

## 验收口径

审计通过的标准不是总状态必须为 `ready`，而是：

1. 空工作台输出 `blocked`，且不创建文件。
2. 素材、计划、`cv.md`、渲染 HTML 与版本全文可证明一致时，明确列出剩余契约缺口。
3. 手工修改任何下游产物时，对应漂移 ID 出现，且文件保持不变。
4. 多个渲染包或多条当前投递版时，只列候选，不自动选择。
5. 连续两次审计结果确定且相同。
