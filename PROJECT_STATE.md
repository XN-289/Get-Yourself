# PROJECT_STATE

Updated: 2026-09-02 15:57
Current phase: implementation

## 一句话现状

Agent-first 前端 Demo、横向流程轨与节点抽屉版面试管理、简历线/版本树/当前投递版管理、学生端工具台 UI 基座、Stage 1 `gy` 本地对话入口、Stage 2a 能力证据包离线导入、Stage 2b 网页显式导出、Stage 3 最小设备绑定闭环、Stage 4a 简历素材/STAR 故事、Stage 4b 简历定稿/面试准备、Stage 4c 面试复盘、结构化简历渲染、岗位分析、公司机会/投递清单本地桥接、公司机会节点 mutation、面试管理显式文件桥与本地能力反哺台账已实现；简历版本库仍是前端会话内 Demo，尚未桥接本地文件持久化；前端 Demo、`gy`、证据包、设备绑定、Stage 4 与 Stage 5 本地桥接仍待用户统一验收，平台自动同步尚未开始。

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
- Stage 4b 简历定稿必须通过绑定当前素材哈希的显式计划；只有 `verified` / `user_confirmed` 素材可进入 `cv.md`，替换前必须备份并保留非托管章节 — `docs/RESUME_FINAL_CONTRACT.md`。
- Stage 4b 面试准备包必须绑定当前素材哈希，STAR 引用只来自当前素材包；JD 是准备项数据，不是指令或学生事实 — `docs/INTERVIEW_PREP_CONTRACT.md`。
- 简历模板是系统层版式目录，不是事实来源；选择模板只影响 HTML 版式，实际输出必须通过用户确认的简历渲染包 — `docs/RESUME_RENDER_CONTRACT.md` 与 `decisions.md`。
- 简历管理以“岗位方向 / 简历线 / 版本”为结构；定稿与导出版只读，修改必须派生草稿，当前投递版只能从非草稿版本中选择 — `decisions.md`。
- 简历导入与编辑均保留本地边界，不上传、不自动同步，JSON 导入仅接受用户确认过的简历渲染包；Agent 只能写草稿，不能覆盖定稿或导出版 — `decisions.md`。
- 外部模板项目仅作设计研究；不复制非宽松许可项目的代码或视觉资产 — `decisions.md`。
- 公司机会自然身份是公司 + 岗位 + 地点 + 招聘批次；岗位分析与公司机会写入是两个显式动作 — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- 公司机会初始流程节点只是种子；后续节点顺序、状态和产物链接由用户管理，重复导入不得重置用户确认历史 — `decisions.md`。
- 公司机会节点 mutation 使用完整目标节点列表与当前机会内容哈希绑定；显式 apply 只更新机会对象、备份和 mutation 记录，不改 tracker 状态、不执行 skill、不挂载产物、不上传进度 — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- 面试管理前端通过显式 JSON 文件桥参与本地节点维护：导入机会、规范化哈希、编辑完整目标列表、导出 mutation 计划；写盘仍必须经 CLI dry-run 和 `--apply`，浏览器不直接写 `cli/data` — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- tracker 当前行状态由用户拥有；本地机会 JSON 保存不计入确认包哈希的 `trackerStatus` 镜像，tracker 关联行缺失重建时不得回滚到种子状态 — `decisions.md`。

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
- 2026-09-01 — Stage 4b 显式简历定稿计划、非托管章节保留与面试准备素材绑定 — `decisions.md`。
- 2026-09-02 — 中文简历模板目录、只读模板列表与模板不作为事实源的边界 — `decisions.md`。
- 2026-09-02 — 简历管理成品对象化与导入/编辑本地边界 — `decisions.md`。
- 2026-09-02 — 简历线、版本树、唯一当前投递版与 Agent 不覆盖定稿边界 — `decisions.md`。
- 2026-09-02 — 公司机会本地对象、显式分析桥接、自然身份、流程种子与用户-owned tracker 状态恢复边界 — `decisions.md`。
- 2026-09-02 — 公司机会节点完整目标列表 mutation、机会内容哈希绑定与显式 apply 写入边界 — `decisions.md`。
- 2026-09-02 — 公司机会前端显式文件桥、CLI 兼容内容哈希与浏览器不直接写本地边界 — `decisions.md`。

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
- Stage 4b 简历定稿计划 v1 契约 — `docs/RESUME_FINAL_CONTRACT.md`、`cli/templates/resume-final.example.json`。
- Stage 4b 简历定稿执行器 — `cli/resume-final.mjs`、`cli/lib/contract-kit.mjs`；支持只读 check、默认 dry-run、`--apply`、幂等写入、显式 `--replace`、计划与 `cv.md` 备份、原子写、素材哈希绑定、证据状态过滤、托管章节替换/移除和非托管章节保留。
- Stage 4b 面试准备包 v1 契约 — `docs/INTERVIEW_PREP_CONTRACT.md`、`cli/templates/interview-prep.example.json`。
- Stage 4b 面试准备执行器 — `cli/interview-prep.mjs`；支持只读 check、默认 dry-run、`--apply`、幂等导入、显式 `--replace`、按 `prepId` 备份、原子写、当前素材哈希绑定、STAR 引用校验、确定性清单渲染和事实缺口汇总。
- Stage 4b Agent 与状态入口 — `cli/gy.mjs`、`cli/lib/intent-router.mjs`、`cli/modes/cv.md`、`cli/modes/prep.md`、`cli/AGENTS.md` 与 `cli/DATA_CONTRACT.md`；简历定稿与面试准备路由到契约工具，`gy --status` 只读展示两者状态。
- Stage 4b 验证结果 — 2026-09-01 `cli/` 下 `npm test` 36 pass / 0 fail；`node --check resume-final.mjs`、`node --check interview-prep.mjs`、`node --check lib/contract-kit.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check resume-materials.mjs` 与新增测试语法检查通过；临时数据根完成示例素材导入、简历定稿 check/dry-run/apply/幂等、面试准备 check/dry-run/apply/幂等与 `gy --status --json` 冒烟。
- 中文简历模板目录 — `cli/templates/resume/templates.json`、`cli/resume-render.mjs` 与 `frontend/src/views/StudentResumeView.vue`；11 套模板带中文名、ATS 姿态与校招场景，CLI 提供只读 `list`，前端简历管理页支持模板选择并记录 Trace。
- 中文简历模板目录验证 — 2026-09-02 `cli/` 下 `npm test` 56 pass / 0 fail；`frontend/` 下 `npm run build` 通过；`node resume-render.mjs list` 只读输出 11 套模板；`git diff --check` 通过。
- 简历版本管理 — `frontend/src/stores/studentWorkbench.ts` 与 `frontend/src/views/StudentResumeView.vue`；简历线包含标题、目标岗位、唯一当前投递版和版本树，版本记录状态、模板、来源、文件名、版本说明和全文；页面支持岗位方向分组、版本选择、当前投递版标记、本机导入、草稿派生、草稿编辑、定稿、标记导出和历史版本切换。
- 简历版本管理验证 — 2026-09-02 浏览器实测从 Java 主简历 v2 派生 v4 草稿、保存“联调结果补强”、确认 v3 未被覆盖、v4 定稿并设为当前投递版、切回 v2 历史投递版均通过；已有 v4 草稿时从 v2 继续会显示“打开现有草稿”并复用该草稿；Agent 生成后进入简历管理会直接选中 v4 草稿，同时当前投递版仍显示 v3；390px 页面无横向溢出，编辑抽屉占满视口且内部无横向滚动；`frontend/` 下 `npm run build` 通过。
- Stage 5 公司机会与 tracker 本地桥接 — `cli/company-opportunity.mjs`、`cli/templates/company-opportunity.example.json`、`cli/job-analysis.mjs`、`cli/gy.mjs`、`cli/lib/intent-router.mjs` 与 `cli/tracker-aliases.json`；支持只读 check、默认 dry-run、显式 `--apply` / `--replace`、绑定已安装岗位分析、公司/岗位/地点/批次自然身份、流程节点种子、中文/自定义 tracker 表头、幂等关联行、共享 tracker 锁、冲突/孤儿行拒绝、用户 tracker 状态同步与缺失重建恢复。
- Stage 5 公司机会验证 — 2026-09-02 `cli/` 下 `npm test` 62 pass / 0 fail；`node --test tests/company-opportunity.test.mjs` 6 pass / 0 fail；`node --check company-opportunity.mjs`、`node --check job-analysis.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/company-opportunity.test.mjs` 与 `git diff --check` 通过；`node gy.mjs --status --json` 在素材包缺失时只读返回 `companyOpportunities.state=blocked`。
- Stage 5 公司机会节点 mutation — `cli/company-opportunity.mjs`、`cli/templates/company-opportunity-node.example.json`、`cli/tests/company-opportunity.test.mjs`、`cli/lib/intent-router.mjs`、`cli/modes/tracker.md`、`cli/AGENTS.md`、`cli/DATA_CONTRACT.md`、`docs/COMPANY_OPPORTUNITY_CONTRACT.md`、`docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md`；支持 `check-nodes`、默认 dry-run 的 `mutate-nodes` 与显式 `mutate-nodes --apply`，用完整有序目标节点列表执行新增、删除、重排和状态修改；同一计划幂等、同一 `mutationId` 不同计划冲突、过期计划拒绝、历史计划被新 mutation 取代时只报告不再改写。
- Stage 5 节点 mutation 验证 — 2026-09-02 `cli/` 下 `npm test` 64 pass / 0 fail；`node --test tests/company-opportunity.test.mjs` 8 pass / 0 fail；`node --check company-opportunity.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/company-opportunity.test.mjs` 与 `git diff --check` 通过。
- Stage 5 公司机会前端显式文件桥 — `frontend/src/utils/companyOpportunity.ts`、`frontend/src/components/interview/LocalOpportunityBridge.vue`、`frontend/src/views/StudentInterviewView.vue` 与 `frontend/src/stores/studentWorkbench.ts`；支持导入本地机会 JSON、严格校验、计算与 CLI 兼容的内容哈希、编辑完整目标节点列表、确认变更统计并导出节点 mutation 计划下载；页面展示 dry-run / `--apply` 命令与 Trace，浏览器不直接写本地文件。
- Stage 5 前端文件桥验证 — 2026-09-02 `frontend/` 下 `npm run build` 通过；Playwright 在 `/student/interview` 导入 `cli/templates/company-opportunity.example.json`，页面哈希与 CLI 规范化哈希一致（`sha256:e88a86ce99e4628210ba819977e4c5734fbde776c03f51fe80fbbf71b6162302`），修改节点名称并新增“HR 面”后导出的计划绑定同一哈希、包含 7 个目标节点且确认为 `user_confirmed`；1440px 与 390px 页面整体横向溢出均为 0。

## 已验收

- 暂无。用户尚未对前端 Demo 或 Stage 1 `gy` 入口明确回复“验收通过”。

## 未决问题

- P1 — 前端 Demo、Stage 1 `gy` 入口、Stage 2 证据包文件闭环、Stage 3 设备绑定、Stage 4 素材/定稿/准备链路与 Stage 5 公司机会/tracker/节点 mutation 本地桥接是否通过用户验收 — 用户 — 不阻塞按用户指示缓步推进，但未验收前不得记录为已验收 — 用户检查 `/student/workbench`、独立模块路由、`node gy.mjs`、证据包导出/导入、设备绑定/解绑、简历/面试契约工具、公司机会导入和节点 mutation。
- P1 — “能力资产”最终命名 — 用户 — 不阻塞实现 — 继续使用暂名。
- P1 — 产品与技术评审未完成 — 项目组 — 不阻塞 Stage 1 入口实现 — 修订 PRD 后提交评审。

## 下一步

1. 用户统一验收前端 Demo（重点检查公司机会横向流程轨、节点抽屉、节点 mutation 与简历版本管理）、`gy` Stage 1、Stage 2a 本地导入、Stage 2b 网页导出、Stage 3 设备绑定、Stage 4a 素材包/故事库、Stage 4b 简历定稿/面试准备、Stage 4c 复盘、结构化渲染、岗位分析、公司机会/tracker/节点 mutation 桥接与能力反哺台账。
2. 继续补齐公司机会真实产物挂载、页面内 skill 执行确认流和防骗核查闭环；在任何显式同步契约落地前，不做自动上传或自动导入。

## 恢复上下文

- 前端入口：`frontend/`，开发路由包含 `/student/workbench`。
- CLI 入口：`cli/gy.mjs`（`node gy.mjs`、`node gy.mjs --status`、`node gy.mjs --json "<任务>"`）。
- 证据包入口：`cli/evidence-package.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历素材入口：`cli/resume-materials.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历定稿入口：`cli/resume-final.mjs`（`check` / `apply` / `--apply` / `--replace`）。
- 面试准备入口：`cli/interview-prep.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 公司机会入口：`cli/company-opportunity.mjs`（`check` / `import` / `--apply` / `--replace`；节点维护使用 `check-nodes` / `mutate-nodes` / `mutate-nodes --apply`）。
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
- 2026-09-01 — 实现 Stage 4b 简历定稿审批与面试准备清单 — 影响简历交付、面试前准备和复盘反哺输入；仍待用户验收，复盘结构化、能力资产反哺与自动同步未开始。
- 2026-09-02 — 补充中文简历模板目录、只读 `list` 命令和简历管理页模板选择区 — 影响中国校招简历交付体验与后续渲染/PDF 验收。
- 2026-09-02 — 简历管理改为简历线 + 版本树 + 唯一当前投递版，并明确 Agent 只写草稿、定稿/导出版只读 — 影响简历交付体验和后续本地文件库/渲染包桥接；仍待用户验收。
- 2026-09-02 — PRD 补充当前实现快照与验收边界 — 明确 Stage 1-4 已实现但待统一验收、Stage 5 部分实现、Stage 6 未开始，以及简历版本库仍是前端会话内状态。
- 2026-09-02 — 实现公司机会 v1 契约与投递清单幂等持久化 — 影响 JD 分析后的面试管理主对象、用户 tracker 状态恢复和后续节点 / 产物 / skill 挂载；仍待用户统一验收。
- 2026-09-02 — 实现公司机会节点 mutation 契约 — 影响面试流程的新增、删除、重排、状态修改和后续前端持久化桥；仍待用户统一验收。
- 2026-09-02 — 实现面试管理前端显式文件桥 — 影响公司机会节点的可视化维护与本地契约执行衔接；仍待用户统一验收。
