# PROJECT_STATE

Updated: 2026-09-01 13:12
Current phase: implementation

## 一句话现状

Agent-first 前端 Demo 已完成并提交，但尚未获得用户明确验收；PRD 已修订为“Agent 唯一入口 + 四个独立模块”，真实 `gy` 本地入口尚未实现。

## 已接受事实

- 企业端、组织活动供给、活动预约、活动推荐已冻结 — `AGENT.md` 与用户会话。
- Agent 是学生端唯一主入口；独立模块为 Agent、能力资产（暂名）、简历管理、面试管理 — `decisions.md`。
- 成长教练不做独立可见模块，原能力沉淀为平台长期记忆上下文 — `decisions.md`。
- 日程不做独立模块，时间信号只服务投递与面试流程 — `decisions.md`。
- 远程仓库固定使用现有 `origin`: `git@github.com:XN-289/Get-Yourself.git` — `git remote -v`。
- 每个完成的改动必须提交 git — `AGENT.md`。

## 决策索引

- 2026-09-01 — Agent-first 信息架构、模块边界、教练/日程收缩、面试主流程、冻结边界、git 纪律 — `decisions.md`。

## 已实现

- 本地工作台前端 Demo — `frontend/`，commit `946d8ec`、`f458f43`、`8ff4130`；以仓库提交记录为证据。
- Agent 工作台与能力资产、简历、面试等模块路由分离 — commit `8ff4130`。
- v0.1 Agent-first 产品设计修订 — `docs/PRODUCT_DESIGN_V0.1.md` 当前工作区；提交后以本次 commit 为证据。

## 已验收

- 暂无。用户尚未对前端 Demo 明确回复“验收通过”。

## 未决问题

- P0 — 前端 Demo 是否通过用户验收 — 用户 — 阻塞进入深度后端集成 — 用户检查 `/student/workbench` 及独立模块路由。
- P1 — “能力资产”最终命名 — 用户 — 不阻塞实现 — 继续使用暂名。
- P1 — 产品与技术评审未完成 — 项目组 — 不阻塞 Stage 1 入口实现 — 修订 PRD 后提交评审。

## 下一步

1. 实现 `gy` 统一入口与确定性意图路由 — 自然语言能映射到现有求职模式，不写用户层数据。
2. 补齐 CLI 测试运行器与路由测试 — `cli/npm test` 通过。
3. 审查差异、提交并推送 — 工作区回到干净状态。

## 恢复上下文

- 前端入口：`frontend/`，开发路由包含 `/student/workbench`。
- CLI 入口目标：`cli/gy.mjs`（待实现）。
- 验证命令：文档为内容复查；前端为 `npm run build`；CLI 为 `npm test`。
- 已知坑：`cli/package.json` 已有 `test` 脚本，但 `cli/test-all.mjs` 与 `cli/tests/` 此前不存在，`npm test` 会失败。

## 最近更新

- 2026-09-01 — 新增项目状态台账与决策留痕；完成 PRD Agent-first、四模块、无独立教练/日程口径修订 — 影响产品文档与后续实现范围。
