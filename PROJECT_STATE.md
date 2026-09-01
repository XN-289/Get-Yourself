# PROJECT_STATE

Updated: 2026-09-01 16:33
Current phase: implementation

## 一句话现状

Agent-first 前端 Demo、公司机会流程树版面试管理、学生端工具台 UI 基座、Stage 1 `gy` 本地对话入口、Stage 2a 能力证据包离线导入与 Stage 2b 网页显式导出已实现；前端 Demo、`gy` Stage 1 与证据包闭环仍未获得用户明确验收，账号绑定与自动同步尚未开始。

## 已接受事实

- 企业端、组织活动供给、活动预约、活动推荐已冻结 — `AGENT.md` 与用户会话。
- Agent 是学生端唯一主入口；独立模块为 Agent、能力资产（暂名）、简历管理、面试管理 — `decisions.md`。
- 成长教练不做独立可见模块，原能力沉淀为平台长期记忆上下文 — `decisions.md`。
- 日程不做独立模块，时间信号只服务投递与面试流程 — `decisions.md`。
- 远程仓库固定使用现有 `origin`: `git@github.com:XN-289/Get-Yourself.git` — `git remote -v`。
- 每个完成的改动必须提交 git — `AGENT.md`。
- Stage 1 `gy` 采用确定性意图路由，不伪装 LLM 调用，不持久化用户原句，不写用户层文件 — `decisions.md` 与 `cli/lib/intent-router.mjs`。
- Stage 2a 先做离线能力证据包导入，不做账号绑定、token 存储、后端 API 变更或自动同步 — `decisions.md` 与 `docs/EVIDENCE_PACKAGE_CONTRACT.md`。
- Stage 2b 先做网页显式证据包导出，毕业年份与目标方向只在导出请求中使用，不持久化；不做账号绑定、token 存储、自动下载契约或自动同步 — `decisions.md`。
- 学生端前端采用可组合小组件与 headless primitives，不引入整套后台组件库；Agent 输出 Markdown 禁 raw HTML 并做 sanitize — `decisions.md`。
- 面试管理以公司机会为主对象，流程轮次由用户手工扩展；通过、未通过与 Offer 状态由用户确认，Agent 不自动改写 — `decisions.md`。

## 决策索引

- 2026-09-01 — Agent-first 信息架构、模块边界、教练/日程收缩、面试主流程、冻结边界、git 纪律 — `decisions.md`。
- 2026-09-01 — Stage 1 确定性路由、只读状态检查、简历模式审批边界 — `decisions.md`。
- 2026-09-01 — Stage 2a 离线证据包、显式导入/替换、规范化存储与数据非指令边界 — `decisions.md`。
- 2026-09-01 — Stage 2b 网页显式导出、导出输入不落库、语义内容 `packageId` 与评分结果溯源指针 — `decisions.md`。
- 2026-09-01 — 学生端工具台 UI 基座：Reka UI、VueUse、Vue Query 与安全 Markdown 渲染的技术边界 — `decisions.md`。
- 2026-09-01 — 公司机会流程树、人工状态确认、skill 关联预留与流程内鼓励反馈 — `decisions.md`。

## 已实现

- 本地工作台前端 Demo — `frontend/`，commit `946d8ec`、`f458f43`、`8ff4130`；以仓库提交记录为证据。
- Agent 工作台与能力资产、简历、面试等模块路由分离 — commit `8ff4130`。
- 学生端工具台 UI 基座 — `frontend/src/components/ui/`、`frontend/src/components/agent/AgentMarkdown.vue` 与四个学生端模块页；统一面板、按钮、状态胶囊与确认弹窗，Agent 消息改为安全 Markdown 渲染，证据包导出接入 Vue Query mutation。
- 学生端 UI 基座验证 — `frontend/` 下 `npm run build` 通过，`npm audit --json` 0 vulnerabilities；`/student/workbench`、`/student/assets`、`/student/resume`、`/student/interview` 在 1440px 桌面与 390px 窄屏完成布局检查，确认弹窗在窄屏完成居中、焦点、Esc 关闭与滚动锁定恢复检查，Agent Markdown 完成 raw HTML 禁用与 sanitize 冒烟。
- 公司机会流程树版面试管理 — `frontend/src/stores/studentWorkbench.ts` 与 `frontend/src/views/StudentInterviewView.vue`；支持公司机会、可扩展流程节点、人工通过/未通过/Offer 标记、skill 关联展示、流程内鼓励文案和 Offer 庆祝反馈。
- 面试流程树验证 — `frontend/` 下 `npm run build` 通过；390px 窄屏无横向溢出，人工追加“交叉面”、进入处理、标记通过与添加节点弹窗 Esc 关闭检查通过，Offer 节点庆祝反馈可见。
- v0.1 Agent-first 产品设计修订 — `docs/PRODUCT_DESIGN_V0.1.md`，commit `d153802`。
- Stage 1 `gy` 本地入口 — `cli/gy.mjs`、`cli/lib/intent-router.mjs`、`cli/modes/cv.md`；`npm test` 结果 9 pass / 0 fail，`node gy.mjs --status` 与自然语言路由人工检查通过。
- CLI 测试运行器 — `cli/test-all.mjs`、`cli/tests/*.test.mjs`；自动发现 Node 内置 test runner 用例，修复原 `npm test` 无法执行的问题。
- 能力证据包 v1 契约 — `docs/EVIDENCE_PACKAGE_CONTRACT.md`、`cli/templates/evidence-package.example.json`。
- Stage 2a 本地证据包校验与导入 — `cli/evidence-package.mjs`；支持只读 check、dry-run、`--apply`、幂等导入、显式 `--replace`、规范化备份和内容哈希。
- Stage 2a 验证结果 — `cli/` 下 `npm test` 15 pass / 0 fail；`node --check` 通过；示例包 check、dry-run、apply、幂等导入与 `gy --status` 冒烟通过。
- `gy --status` 能力证据包状态 — `data/evidence-package.json` 缺失 / 可用 / 无效均只读展示。
- “导入能力证据包”意图路由到能力资产模块，并指向 `evidence-package.mjs`。
- Stage 2b 网页能力证据包导出 — `POST /api/ability-scoring/evidence-package/export`、`EvidencePackageExportService` 与能力资产页显式导出表单；输出 v1 契约 JSON 并由浏览器保存本地文件。
- Stage 2b 验证结果 — `backend/` 下 `mvn test` 35 pass / 0 fail；`frontend/` 下 `npm run build` 通过；`cli/` 下 `npm test` 15 pass / 0 fail；能力资产页导出表单在桌面与 390px 窄屏完成布局检查。
- Stage 2 真实链路回归 — 2026-09-01 在 `demo_student` 账号创建并完成挑战、显式评估、重建成长标签后导出 v1 证据包（2 能力 / 3 证据 / `trace.ability-score-1`）；CLI 在临时数据根完成 `check`、dry-run、`--apply`、重复导入幂等与 `gy --status` 展示；当前网页登录账号 `123` 触发导出时正确返回账号隔离空态；复跑 `cli/` `npm test` 15 pass / 0 fail。

## 已验收

- 暂无。用户尚未对前端 Demo 或 Stage 1 `gy` 入口明确回复“验收通过”。

## 未决问题

- P1 — 前端 Demo、Stage 1 `gy` 入口与 Stage 2 证据包文件闭环是否通过用户验收 — 用户 — 不阻塞按用户指示缓步推进，但未验收前不得记录为已验收 — 用户检查 `/student/workbench`、独立模块路由、`node gy.mjs` 和证据包导出/导入。
- P1 — “能力资产”最终命名 — 用户 — 不阻塞实现 — 继续使用暂名。
- P1 — 产品与技术评审未完成 — 项目组 — 不阻塞 Stage 1 入口实现 — 修订 PRD 后提交评审。

## 下一步

1. 用户统一验收前端 Demo（重点检查公司机会流程树）、`gy` Stage 1、Stage 2a 本地导入与 Stage 2b 网页导出。
2. 验收通过后再评估是否进入 Stage 3 账号与设备绑定；在此之前不实现自动同步。

## 恢复上下文

- 前端入口：`frontend/`，开发路由包含 `/student/workbench`。
- CLI 入口：`cli/gy.mjs`（`node gy.mjs`、`node gy.mjs --status`、`node gy.mjs --json "<任务>"`）。
- 证据包入口：`cli/evidence-package.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 验证命令：文档为内容复查；前端为 `npm run build`；CLI 为 `npm test`。
- 已知坑：仓库根当前缺用户层 `cv.md`、`modes/_profile.md`、`portals.yml` 属于正常 onboarding 状态；`gy --status` 只报告，不自动创建。证据包 v1 没有签名，离线文件来源信任由用户选择文件承担。
- 已知坑：当前 H2 演示能力数据种在 `demo_student`（用户名 `demo_student` / 密码 `demo123456`）；浏览器若仍登录临时账号 `123`，能力证据包导出会按预期提示“当前账号还没有可导出的能力证据”。

## 最近更新

- 2026-09-01 — 新增项目状态台账与决策留痕；完成 PRD Agent-first、四模块、无独立教练/日程口径修订 — 影响产品文档与后续实现范围。
- 2026-09-01 — 实现 Stage 1 `gy` 确定性对话入口、只读状态检查、简历模式映射与 CLI 测试运行器 — 影响 CLI 入口、用户层写入边界和后续 Stage 2 节奏。
- 2026-09-01 — 实现 Stage 2a 能力证据包契约、严格校验、显式导入/替换、状态展示与路由 — 影响能力资产模块、简历证据引用边界和后续网页导出。
- 2026-09-01 — 实现 Stage 2b 网页能力证据包显式导出 — 影响能力资产页、后端只读导出接口与本地 v1 契约闭环。
- 2026-09-01 — 完成 Stage 2 后端真实数据导出到本地 CLI 导入的端到端回归 — 影响用户验收准备；未进入 Stage 3 账号绑定或自动同步。
- 2026-09-01 — 建立学生端工具台 UI 基座并完成桌面/窄屏、弹窗与安全 Markdown 验证 — 影响后续学生端前端实现的一致性；仍待用户统一验收。
- 2026-09-01 — 面试管理重构为公司机会流程树 — 影响后续 JD 分析、简历适配、面试准备和复盘 skill 的节点挂载方式；仍待用户验收。
