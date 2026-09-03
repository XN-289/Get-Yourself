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
| `drifted` | 文件记录的显式身份仍存在，但与当前上游身份或指纹不一致；当前投递版全文与 `cv.md` 不一致时也按此状态输出 |

`objects.renderPackages` 与 `objects.currentApplicationVersions` 是数组。渲染包数组为空表示渲染产物 `missing`；当前投递版数组为空表示版本库尚未提供可投递终点，事实链为 `blocked`。
数组中的单个对象状态必须与该对象自己的绑定与内容结论一致；集合层只做聚合，不得把已经 `drifted` 的子对象降级成 `ready`。

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
3. `drifted`：存在内容漂移或显式身份绑定过期，例如故事库、`cv.md`、HTML、渲染包定稿绑定或当前投递版来源与当前可验证对象不一致。
4. `ambiguous`：存在多个可用渲染包或多条当前投递版，用户必须先选择候选。
5. `binding-gap`：文件仍是合法旧版 v1，缺少显式身份字段；即使内容当前一致，也不能推断完整链路。
6. `ready`：所有对象就绪，且唯一渲染包与唯一当前投递版都通过显式身份绑定证明对准当前定稿。

`binding-gap` 是兼容结论，不是错误。渲染包 v1 现在有可选的 `finalPlanId` / `finalPlanContentHash` / `finalDocumentContentHash`；简历版本库 v1 也有可选的定稿、渲染包与导入文件指纹。缺少这些字段的旧文件继续有效并输出 `binding-gap`。审计器不会为旧文件自动升级、补写或推断身份。

## 链路状态

| Link | 判定 |
|---|---|
| `materialsToFinalPlan` | 定稿计划保存素材 ID 与内容哈希，可证明 |
| `finalPlanToFinalDocument` | 用当前素材与计划重新渲染托管章节，可比较 |
| `finalDocumentToRenderPackages` | 无定稿绑定为 `unproven`；显式匹配当前计划与 `cv.md` 指纹为 `proven`；显式身份过期为 `drifted`；依赖缺失为 `blocked` |
| `finalDocumentToCurrentApplicationVersions` | 无定稿来源为 `unproven`；显式匹配当前计划与 `cv.md` 指纹为 `proven`；显式来源过期为 `drifted`；依赖缺失为 `blocked` |

内容指纹相同不是身份绑定；身份优先于内容相等。一个版本如果显式绑定旧定稿，即使全文仍与当前 `cv.md` 相同，也按显式身份输出漂移。渲染包来源指纹还必须能在本地找到同 ID、同内容哈希且有效的渲染包；来源缺失或不一致时，版本保留为独立历史对象并报告 `library-render-binding-stale`。

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
| `render-final-binding-stale` | 标记渲染包对准旧定稿；用户重新确认当前定稿后再生成或导入 |
| `library-final-binding-missing` | 旧版本缺少显式定稿来源；即使内容一致也保持 `binding-gap` |
| `library-final-binding-stale` | 保留历史投递身份；用户确认当前定稿后重新生成或导入版本 |
| `library-render-binding-stale` | 绑定的渲染包缺失或指纹不一致；保留独立导入线，不自动修复 |

所有建议动作都必须经过既有契约工具的 check、dry-run、`--apply` 和需要时的 `--replace`。审计器本身不执行这些动作。

## 验收口径

审计通过的标准不是总状态必须为 `ready`，而是：

1. 空工作台输出 `blocked`，且不创建文件。
2. 旧渲染包或旧版本库内容一致但缺少显式身份时，明确列出 `binding-gap` 且不写入文件。
3. 手工修改任何下游产物时，对应漂移 ID 出现，且文件保持不变。
4. 显式绑定的定稿计划 ID、计划哈希或 `cv.md` 哈希过期时，对应对象与链路输出 `drifted`，且文件保持不变。
5. 完整成组绑定唯一渲染包与唯一当前投递版时，事实链可输出 `ready`，且审计仍保持零写入。
6. 多个渲染包或多条当前投递版时，只列候选，不自动选择。
7. 连续两次审计结果确定且相同。
