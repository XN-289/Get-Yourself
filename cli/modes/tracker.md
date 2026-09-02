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
