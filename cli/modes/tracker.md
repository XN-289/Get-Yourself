# 模式: tracker —— 求职进度管理

查看和管理求职进度表（`data/applications.md`）。

## 查看

- 默认显示全表：按状态分组（进行中优先）
- 支持筛选：状态 / 公司 / 评分 / 城市
- `--json` 输出结构化数据（给脚本用）

## 更新状态

**规范更新路径（绝不手工编辑 applications.md）：**

```bash
node set-status.mjs <报告#|公司> <状态> [--note "备注"] [--force]
```

状态必须是 `templates/states.yml` 的规范值（大小写不敏感）：
`evaluated / applied / responded / interview / offer / signed / hired / rejected / discarded / skip`

中文别名也接受：`已投递 / 面试中 / 已签三方 / 被拒` 等。

## 新增行

**绝不手工往 applications.md 加行。** 正确流程：

1. 评估完写报告 → 写 TSV 到 `batch/tracker-additions/` → `node merge-tracker.mjs`
2. 或直接 `node add-entry.mjs`（手动加一个未评估的投递，如内推/线下投递）
3. 已安装岗位分析确认后 → 生成公司机会 JSON → `node company-opportunity.mjs import <opportunity.json> --apply`

公司机会行的自然身份是公司 + 岗位 + 地点 + 招聘批次，Notes 中必须保留 `opportunityId` / `batch` / `analysisId` / `analysisContentHash` 元数据。重复导入同一机会不会新增行；用户手工更新的状态优先于 `initialTrackerStatus`，不会被重复导入重置。若同身份或 marker 出现歧义，先人工处理冲突，不做静默合并。

## 公司机会流程节点

节点新增、删除、移动和状态确认不直接改 JSON。正确路径是：

```bash
node company-opportunity.mjs check-nodes <node-mutation.json>
node company-opportunity.mjs mutate-nodes <node-mutation.json>
node company-opportunity.mjs mutate-nodes <node-mutation.json> --apply
```

节点计划必须绑定当前机会内容哈希，并给出确认后的完整节点列表。该操作只更新机会对象、备份和变更记录，不更新投递清单状态，不执行 skill，不挂载产物。

## 公司机会产物挂载

JD 分析报告、简历渲染、面试准备、面试复盘和能力反哺产物不能混入节点 mutation。真实文件存在后，单独生成 artifact-mount 计划：

```bash
node company-opportunity.mjs check-artifact <artifact-mount.json>
node company-opportunity.mjs mount-artifact <artifact-mount.json>
node company-opportunity.mjs mount-artifact <artifact-mount.json> --apply
```

计划绑定当前机会哈希、目标节点和真实文件字节哈希；产物路径必须位于该类型允许的本地目录内。挂载只把产物 descriptor 追加到对应节点并保存挂载记录，不改节点状态，不改投递清单，不执行 skill，不上传。

## 状态语义（校招版）

| 状态 | 含义 |
|------|------|
| evaluated | 已评估，待决定投不投 |
| applied | 已投递（网申/内推） |
| responded | 公司回复（约笔试/面试） |
| interview | 笔试/面试流程中 |
| offer | 收到 offer |
| signed | 已签三方 |
| hired | 已入职（终态） |
| rejected | 被拒 |
| discarded | 放弃/失效 |
| skip | 不投 |

## 维护命令

```bash
node verify-pipeline.mjs     # 健康检查
node normalize-statuses.mjs  # 状态标准化
node dedup-tracker.mjs       # 去重
node stats.mjs               # 统计（投递数/各状态数量/漏斗）
```

## 双线提醒

如果 `profile.yml` 标记了考研/考公并行，tracker 视图同时显示 `data/exam-plan.md` 的备考进度，检测时间冲突（如 12 月考研 vs 秋招终面）。**（求职版 v1 仅检测提醒，不深度集成。）**
