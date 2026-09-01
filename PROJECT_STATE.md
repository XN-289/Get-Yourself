# PROJECT_STATE

Updated: 2026-09-01 19:36
Current phase: implementation

## 一句话现状

Agent-first 前端 Demo、横向流程轨与节点抽屉版面试管理、学生端工具台 UI 基座、Stage 1 `gy` 本地对话入口、Stage 2a 能力证据包离线导入、Stage 2b 网页显式导出、Stage 3 最小设备绑定闭环与 Stage 4a 简历素材/STAR 故事本地合同已实现；PRD 已完成目标校准并明确整体目标不变；前端 Demo、`gy` Stage 1、证据包闭环、设备绑定与 Stage 4a 仍待用户统一验收，自动同步尚未开始。

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
- 面试流程节点顺序由用户手工管理；拖拽只在同一公司机会内生效，Agent 可以建议但不能静默重排用户确认过的流程历史 — `decisions.md`。
- 面试外层采用横向紧凑流程轨，节点详情与状态切换进入右侧抽屉；外部小按钮只打开切换逻辑，不直接改状态 — `decisions.md`。
- Stage 3 设备绑定只建立本地工位授权，不复制网页登录态，不自动导入证据包，也不自动同步简历、报告、STAR 故事、原始材料或求职进度 — `docs/DEVICE_BINDING_CONTRACT.md`。
- 一个账号最多保留 5 台活跃本地工位；绑定码 10 分钟一次性有效；服务端只保存绑定码、安装 ID 与设备 token 的 SHA-256 哈希 — `docs/DEVICE_BINDING_CONTRACT.md`。
- 同一安装 ID 重新绑定时撤销旧设备授权；网页解绑保留所有本地文件，CLI 断开只在服务端确认后删除本地设备凭证 — `docs/DEVICE_BINDING_CONTRACT.md`。
- Stage 4a 简历素材包与 `cv.md` 定稿分权；素材导入必须用户确认，故事库由素材包派生，导入器不执行 LLM 抽取、不修改定稿、不上传网页 — `docs/RESUME_MATERIALS_CONTRACT.md`。

## 决策索引

- 2026-09-01 — Agent-first 信息架构、模块边界、教练/日程收缩、面试主流程、冻结边界、git 纪律 — `decisions.md`。
- 2026-09-01 — Stage 1 确定性路由、只读状态检查、简历模式审批边界 — `decisions.md`。
- 2026-09-01 — Stage 2a 离线证据包、显式导入/替换、规范化存储与数据非指令边界 — `decisions.md`。
- 2026-09-01 — Stage 2b 网页显式导出、导出输入不落库、语义内容 `packageId` 与评分结果溯源指针 — `decisions.md`。
- 2026-09-01 — 学生端工具台 UI 基座：Reka UI、VueUse、Vue Query 与安全 Markdown 渲染的技术边界 — `decisions.md`。
- 2026-09-01 — 公司机会流程树、人工状态确认、skill 关联预留与流程内鼓励反馈 — `decisions.md`。
- 2026-09-01 — 面试流程节点手工拖拽排序与重排保真边界 — `decisions.md`。
- 2026-09-01 — 横向流程轨、右侧节点抽屉与外层状态入口只读边界 — `decisions.md`。
- 2026-09-01 — Stage 3 显式设备绑定、授权-only 边界、设备数量上限与同安装重绑规则 — `decisions.md`。
- 2026-09-01 — Stage 4a 用户确认素材包、派生故事库与简历定稿分权 — `decisions.md`。

## 已实现

- 本地工作台前端 Demo — `frontend/`，commit `946d8ec`、`f458f43`、`8ff4130`；以仓库提交记录为证据。
- Agent 工作台与能力资产、简历、面试等模块路由分离 — commit `8ff4130`。
- 学生端工具台 UI 基座 — `frontend/src/components/ui/`、`frontend/src/components/agent/AgentMarkdown.vue` 与四个学生端模块页；统一面板、按钮、状态胶囊与确认弹窗，Agent 消息改为安全 Markdown 渲染，证据包导出接入 Vue Query mutation。
- 学生端 UI 基座验证 — `frontend/` 下 `npm run build` 通过，`npm audit --json` 0 vulnerabilities；`/student/workbench`、`/student/assets`、`/student/resume`、`/student/interview` 在 1440px 桌面与 390px 窄屏完成布局检查，确认弹窗在窄屏完成居中、焦点、Esc 关闭与滚动锁定恢复检查，Agent Markdown 完成 raw HTML 禁用与 sanitize 冒烟。
- 公司机会横向流程轨版面试管理 — `frontend/src/stores/studentWorkbench.ts`、`frontend/src/views/StudentInterviewView.vue`、`frontend/src/components/ui/WorkbenchDrawer.vue` 与 `frontend/package.json`；支持公司机会、可扩展节点、横向紧凑总览、右侧节点抽屉、抽屉左移/右移、SortableJS 同公司内真实拖拽排序、人工状态确认、skill 关联展示、流程内鼓励文案和 Offer 庆祝反馈。
- 横向流程轨验证 — 2026-09-01 `frontend/` 下 `npm run build` 与 `npm audit --json` 通过（0 vulnerabilities）；1440x900 Playwright 真实鼠标序列把“JD 分析”向右拖拽后顺序从 JD/简历/投递变为简历/投递/JD，页面无整体横向溢出；390px 下流程轨保持 `row` 且内部滚动、页面本体溢出为 0、节点状态与小按钮不越界；节点卡片与外部小按钮均能打开抽屉，状态切换、抽屉左移、Esc 关闭与焦点返回、Offer 从等待中重新确认均实测通过。
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
- Stage 3 账号与设备绑定最小闭环 — `backend/src/main/java/com/getyourself/backend/workbench/`、`backend/src/main/resources/db/migration/V22__add_workbench_devices.sql`、`frontend/src/api/workbenchDevice.ts`、Agent 工作台绑定区与 `cli/device-binding.mjs`；支持网页生成 10 分钟一次性绑定码、CLI 换取仅返回一次的设备 token、设备列表轮询、网页解绑、CLI 断开、同安装 `--replace` 重绑、5 台活跃设备上限与行级锁并发绑定保护。
- Stage 3 安全边界 — 服务端仅保存绑定码 / 安装 ID / 设备 token 哈希，撤销时清空哈希；CLI 不接触网页 bearer token；`cli/data/` 已 gitignore，`--status` 不输出设备 token；绑定不自动导入或同步任何产品数据。
- Stage 3 验证结果 — 2026-09-01 后端 `mvn test` 44 pass / 0 fail；前端 `npm run build` 通过；CLI `npm test` 21 pass / 0 fail；`node --check device-binding.mjs`、`node --check gy.mjs` 与 `git diff --check` 通过。
- Stage 3 真实链路回归 — 2026-09-01 在 `demo_student` 账号完成网页生成绑定码、CLI `connect`、网页 3 秒轮询 pending→active、网页解绑、同安装 `connect --replace` 与 CLI `disconnect`；CLI 断开后网页自动回落“未绑定”，本地 `device-binding.json` 被删除、`device-installation.json` 保留且整个 `cli/data/` 保持 ignored。回归中发现并修复绑定成功后网页停止轮询、旧绑定码残留两个状态问题。
- Agent 对话区亮色工具台改造 — `frontend/src/views/StudentAgentConsoleView.vue` 与 `frontend/src/components/agent/AgentMarkdown.vue`；深色控制台改为白底轻边框，Assistant 消息改为开放式轻左线段落，用户消息保留浅绿气泡，设备绑定、快捷任务、输入区与 Agent Trace 统一降为辅助层级，Markdown 代码块/引用同步亮色化。
- Agent 对话区视觉验证 — 2026-09-01 1280px 桌面与 390px 窄屏检查通过，页面均无横向溢出；桌面截图平均亮度 247/255、深色像素占比 0.4%；`frontend/` 下 `npm run build` 通过。
- PRD 目标校准 — `docs/PRODUCT_DESIGN_V0.1.md`；明确战略目标不变，记录 Agent-first、独立模块、面试实践闭环、授权-only、显式证据包和亮色工具台等实现校准，补充 Stage 0-6 当前状态，并把已决的绑定码、证据包与多设备问题移入决策记录。
- Stage 4a 简历素材包 v1 契约 — `docs/RESUME_MATERIALS_CONTRACT.md`、`cli/templates/resume-materials.example.json`。
- Stage 4a 简历素材校验、导入与派生故事库 — `cli/resume-materials.mjs`；支持只读 check、默认 dry-run、`--apply`、幂等导入、显式 `--replace`、素材/故事库备份、原子写、能力证据引用校验、JD 外部线索限制和 `cv.md` 隔离。
- Stage 4a Agent 与状态入口 — `cli/modes/cv.md`、`cli/lib/intent-router.mjs`、`cli/gy.mjs`、`cli/AGENTS.md` 与 `cli/DATA_CONTRACT.md`；简历路由指向合同化导入流程，`gy --status` 只读展示素材包与故事库状态。
- Stage 4a 验证结果 — 2026-09-01 `cli/` 下 `npm test` 28 pass / 0 fail；`node --check resume-materials.mjs`、`node --check gy.mjs` 与 `node --check lib/intent-router.mjs` 通过。

## 已验收

- 暂无。用户尚未对前端 Demo 或 Stage 1 `gy` 入口明确回复“验收通过”。

## 未决问题

- P1 — 前端 Demo、Stage 1 `gy` 入口、Stage 2 证据包文件闭环与 Stage 3 设备绑定是否通过用户验收 — 用户 — 不阻塞按用户指示缓步推进，但未验收前不得记录为已验收 — 用户检查 `/student/workbench`、独立模块路由、`node gy.mjs`、证据包导出/导入和设备绑定/解绑。
- P1 — “能力资产”最终命名 — 用户 — 不阻塞实现 — 继续使用暂名。
- P1 — 产品与技术评审未完成 — 项目组 — 不阻塞 Stage 1 入口实现 — 修订 PRD 后提交评审。

## 下一步

1. 用户统一验收前端 Demo（重点检查公司机会横向流程轨与节点抽屉）、`gy` Stage 1、Stage 2a 本地导入、Stage 2b 网页导出、Stage 3 设备绑定与 Stage 4a 素材包/故事库。
2. Stage 4a 验收后继续设计简历定稿审批与面试准备清单；在任何显式同步契约落地前，不做自动上传或自动导入。

## 恢复上下文

- 前端入口：`frontend/`，开发路由包含 `/student/workbench`。
- CLI 入口：`cli/gy.mjs`（`node gy.mjs`、`node gy.mjs --status`、`node gy.mjs --json "<任务>"`）。
- 证据包入口：`cli/evidence-package.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历素材入口：`cli/resume-materials.mjs`（`check` / `import` / `--apply` / `--replace`）。
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
- 2026-09-01 — 面试流程节点支持同公司内手工拖拽排序 — 影响后续流程树保存契约与 Agent 建议排序的确认边界；仍待用户验收。
- 2026-09-01 — 面试流程树收敛为横向流程轨 + 右侧节点抽屉 — 影响面试管理信息密度、状态确认边界和后续 skill 挂载入口；仍待用户验收。
- 2026-09-01 — 完成 Stage 3 最小设备绑定闭环与真实网页/CLI 冒烟 — 影响账号授权、本地凭证边界和后续数据协同；仍待用户验收，未开始自动同步。
- 2026-09-01 — Agent 对话区从深色终端风调整为亮色 Codex 式工具台 — 影响主入口的长期使用氛围与信息层级；仍待用户验收。
- 2026-09-01 — PRD 完成实现校准修订 — 明确整体目标不变、当前阶段状态、Stage 5 前端/后端边界与前端技术底座决策；仍待产品与技术评审和用户统一验收。
- 2026-09-01 — 实现 Stage 4a 简历素材包与派生 STAR 故事库 — 影响简历管理、面试准备素材和后续复盘反哺；仍待用户验收，简历定稿审批与自动同步未开始。
