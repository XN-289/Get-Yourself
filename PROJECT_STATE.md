# PROJECT_STATE

Updated: 2026-09-04 11:53
Current phase: implementation

## 一句话现状

Agent-first 前端 Demo、横向流程轨与节点抽屉版面试管理、以一份简历为主对象的版本管理、选区证据门槛兜底 skill、简历版本库显式文件桥、简历事实链显式身份绑定与只读审计、学生端工具台 UI 基座、页面内 skill 显式确认流、本地 Skill Runtime v0.1 审批账本与 v0.2 全量 11 条契约执行桥、Stage 6a 同步单元本地 builder / validator、Stage 6b 显式本地同步队列、Stage 1 `gy` 本地对话入口、Stage 2a 能力证据包离线导入、Stage 2b 网页显式导出、Stage 3 最小设备绑定闭环、Stage 4a 简历素材/STAR 故事、Stage 4b 简历定稿/面试准备、Stage 4c 面试复盘、结构化简历渲染、岗位分析、本地防骗核查、公司机会/投递清单本地桥接、公司机会节点 mutation、真实产物挂载、面试管理显式文件桥与本地能力反哺台账已实现；前端 Demo、`gy`、证据包、设备绑定、Stage 4、Stage 5 本地桥接、显式事实链身份绑定、Runtime v0.2 与 Stage 6a/6b 仍待用户统一验收，平台自动同步尚未开始。

2026-09-03 下午补充：Stage 6a 已落地本地确定性构建 / 校验纯函数与 14 个专项测试，Stage 6b 已落地显式本地队列与 9 个专项测试，覆盖自然身份、内容指纹、禁传字段、basis 冲突、append-only Trace、队列持久化、幂等入队、认证 / 网络阻断、用户触发重试、重绑确认、冲突证据、取消隔离和删除墓碑。6c 授权 API / 数据库 / 云端投影与 6d 网页摘要 / Trace 汇总均未开始；平台自动同步尚未开始。

2026-09-03 晚间补充：简历管理已从“岗位方向 / 简历线 / 版本”收敛为“一份简历对象 / 版本”；左侧平铺简历对象，目标岗位、模板、导入来源、历史和当前投递版是元数据或次级面板。手工修改与 Agent 修改共享每份简历的唯一草稿；编辑器支持选中文本和右键拖拽选区触发证据门槛兜底 skill，替换先落编辑缓冲区，保存前不写入版本。用户统一验收仍未完成。

2026-09-04 补充：PRD 已校准至 v0.1 r7。产品目标不变；本轮只区分仓库实现、仓库验证与用户验收三件事。Stage 1-5 已实现的本地 / 前端能力仍全部待用户统一验收；简历右键拖拽必须由用户用真实鼠标在未滚动与滚动后的编辑器中复测；6a / 6b 已通过仓库测试但未获用户本地侧验收，6c 不得启动。

2026-09-04 验收准备补充：已新增 `docs/UNIFIED_ACCEPTANCE_V0.1.md`，按 A0-A7 覆盖环境预检、Agent、能力资产、简历、面试、Skill Runtime、Stage 6a 与 6b。清单保留真实用户鼠标右键拖拽、滚动后选区映射和 6c 前置门槛；当前所有用户验收结论仍为“待验收”。本轮准备基线为 CLI 129 pass / 0 fail、Stage 6a 14 pass / 0 fail、Stage 6b 9 pass / 0 fail、Skill Runtime 示例 dry-run 通过、前端 build 通过但有 chunk 体积警告；本机缺 Maven 与 Docker，后端回归和真实网页导出闭环无法复验。

2026-09-04 后端架构补充：已新增 `docs/BACKEND_ARCHITECTURE_CONTROL_V0.1.md`，基于当前代码完成运行拓扑、身份与设备边界、模块/路由归属、数据权威、outbox、证据评分链路、AI/Agent Trace 与风险登记。后端结论是 Spring Boot 模块化单体；本轮只做架构掌控与变更规则，不启动 6c，不修改后端运行行为。

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
- 简历管理以“一份简历对象 / 版本”为结构；岗位、模板、导入来源、历史和当前投递版是元数据或次级面板；定稿与导出版只读，修改必须派生草稿，当前投递版只能从非草稿版本中选择 — `decisions.md` 2026-09-03。
- 手工修改与 Agent 修改共享每份简历的唯一草稿；选区兜底 skill 是证据门槛型，不能新增事实、指标或经历，生成与替换均记录 Trace，替换只改编辑缓冲区，保存前不写入简历版本 — `decisions.md` 2026-09-03。
- 简历导入与编辑均保留本地边界，不上传、不自动同步，JSON 导入仅接受用户确认过的简历渲染包；Agent 只能写草稿，不能覆盖定稿或导出版 — `decisions.md`。
- 简历版本库是独立的工作台目录权威，保存简历对象、版本与当前投递版，但不替代 `cv.md`、素材、定稿计划或渲染包；浏览器只能显式导出 / 读取契约 JSON，写盘必须经 CLI check、dry-run、`--apply` 与替换时的 `--replace`。外部显式契约 ID 优先锁定，本地默认 ID 避让；时间统一毫秒 UTC，`generatedAt` 与 `traceId` 不参与语义哈希；对象化 UI 不改变 `get-yourself.resume-library v1` 契约 — `docs/RESUME_LIBRARY_CONTRACT.md` 与 `decisions.md`。
- 外部模板项目仅作设计研究；不复制非宽松许可项目的代码或视觉资产 — `decisions.md`。
- 公司机会自然身份是公司 + 岗位 + 地点 + 招聘批次；岗位分析与公司机会写入是两个显式动作 — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- 公司机会初始流程节点只是种子；后续节点顺序、状态和产物链接由用户管理，重复导入不得重置用户确认历史 — `decisions.md`。
- 公司机会节点 mutation 使用完整目标节点列表与当前机会内容哈希绑定；显式 apply 只更新机会对象、备份和 mutation 记录，不改 tracker 状态、不执行 skill、不挂载产物、不上传进度 — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- 公司机会产物挂载是独立显式计划；必须绑定当前机会哈希、节点、真实文件字节哈希和用户确认，只写机会对象、备份与挂载记录，不改节点状态、tracker、skill、云端数据或原始产物文件 — `decisions.md` 2026-09-02 第 18 条与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- 面试管理前端通过显式 JSON 文件桥参与本地节点维护：导入机会、规范化哈希、编辑完整目标列表、导出 mutation 计划；写盘仍必须经 CLI dry-run 和 `--apply`，浏览器不直接写 `cli/data` — `decisions.md` 与 `docs/COMPANY_OPPORTUNITY_CONTRACT.md`。
- tracker 当前行状态由用户拥有；本地机会 JSON 保存不计入确认包哈希的 `trackerStatus` 镜像，tracker 关联行缺失重建时不得回滚到种子状态 — `decisions.md`。
- 防骗核查是本地契约化报告；Agent 只起草证据和信号，红色信号一票否决推进建议，黄色信号生成核实动作，证据不足不给绿灯；不自动联网核查、不修改公司机会或投递进度 — `docs/SCAM_CHECK_CONTRACT.md`。
- 页面内 skill 写入必须先生成显式计划并经用户确认；计划展示目标模块、将写入对象和不会改动对象，取消则目标模块不变 — `decisions.md`。
- 页面内 skill 确认流只写前端会话对象并记录 Trace，不写本地文件、不执行 CLI skill、不改用户拥有的流程结果、不同步云端 — `decisions.md`。
- 本地 Skill Runtime 是 PRD 细化后的最高实现优先级；skill 必须仓库注册、先出计划、经用户审批、只调用既有确定性契约工具，且只写声明目标 — `decisions.md` 2026-09-03。
- Skill Runtime v0.2 开放全部 11 个注册契约工具执行桥；v2 计划必须绑定契约文件精确字节哈希，动态目标必须与契约身份字段派生目标一致，公司机会目标必须由同一 `opportunityId` 派生，执行记录必须包含目标前后指纹和 `prepared / dispatched / failed` 状态 — `decisions.md` 2026-09-03。
- 简历事实链是第二优先级；素材、定稿计划、`cv.md`、渲染包、简历版本库和当前投递版必须保留身份与内容指纹，漂移只提示用户选择，不后台自动修复 — `decisions.md` 2026-09-03。
- 简历来源身份采用 v1 可选兼容扩展，不升级 schema version；字段必须显式成组、哈希严格、由新确认包产生，旧文件不自动升级或补写 — `decisions.md` 2026-09-03。
- 事实链 `ready` / `proven` 只来自显式匹配当前定稿计划与 `cv.md`；显式过期绑定输出 `drifted`，导入来源指纹不授予反写权限，事实链始终只读 — `decisions.md` 2026-09-03。
- v0.1 冷启动分为无证据无旧简历、已有本机旧简历、平台证据成熟三类；粘贴 JD 是 P0 主路径，链接解析是 P1 辅助路径 — `docs/PRODUCT_DESIGN_V0.1.md`。
- Stage 6 必须先定义同步单元、幂等键、冲突、删除、多设备、断网和重试规则，再设计字段与接口 — `docs/PRODUCT_DESIGN_V0.1.md`。
- Stage 6 首批同步单元只有公司机会进度摘要与 Trace 决策摘要；前者是自然身份 + basis 内容指纹的可变更快照，后者是设备 + Trace ID 的 append-only 记录，多设备冲突必须由用户选择 — `docs/SYNC_UNIT_CONTRACT.md` 与 `decisions.md` 2026-09-03 第 17-18 条。
- 同步队列只保存用户确认过的摘要；重试复用同一幂等键，重绑设备后旧队列默认阻断并需重新确认；删除网页摘要只隐藏投影并保留幂等墓碑，不删除本机会、tracker、报告或产物 — `docs/SYNC_UNIT_CONTRACT.md` 与 `decisions.md` 2026-09-03 第 19 条。
- Stage 6 按 6a 本地确定性构建 / 校验、6b 显式本地队列、6c 授权 API 与云端投影、6d 网页摘要与 Trace 汇总顺序推进，前置门槛未通过不得进入后续实现 — `docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md` 2026-09-03 第 20 条。
- Stage 6b 队列只写 `data/sync-queue.json` 与 `data/sync-queue-backups/*`，不联网、不上传、不后台重试、不修改业务对象；`pending` 只表示本地待发 — `cli/sync-queue.mjs`、`cli/tests/sync-queue.test.mjs` 与 `cli/DATA_CONTRACT.md`。
- 仓库验证与用户验收是两个门槛：6a 测试通过允许并行推进 6b 实现与用户统一验收，但不能记录为用户验收；进入 6c 授权 API / 云端投影前，6b 必须通过仓库测试并获得用户对本地侧边界的验收 — `docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md` 2026-09-03 第 21 条。
- 后端当前形态是 Spring Boot 3.3 / Java 21 模块化单体；云侧权威是账号、成长证据、评分、记忆、Trace 与设备授权，本侧权威是简历、素材、STAR、机会流程与本地 Runtime 产物 — `docs/BACKEND_ARCHITECTURE_CONTROL_V0.1.md`。
- Agent Trace artifact 当前 `redacted=true` 只是无条件标记，并未真实脱敏；在修复前不得把简历全文、STAR 原文、凭据或原始个人文件写入 trace artifact — `docs/BACKEND_ARCHITECTURE_CONTROL_V0.1.md`。

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
- 2026-09-02 — 公司机会真实产物独立挂载计划、真实文件哈希与节点 mutation 自动保留产物边界 — `decisions.md`。
- 2026-09-02 — 吸收 career-ops Block G / interview-redflag / liveness 思路，落地证据引用式本地防骗核查契约 — `decisions.md`。
- 2026-09-02 — 页面内 skill 写入显式审批与会话/本地 runtime 边界 — `decisions.md`。
- 2026-09-02 — 简历版本库独立目录权威与浏览器显式文件桥 / CLI 写盘边界 — `docs/RESUME_LIBRARY_CONTRACT.md` 与 `decisions.md`。
- 2026-09-03 — Skill Runtime 优先级、封闭 skill 集、简历事实链、三类冷启动、粘贴 JD 主路径与 Stage 6 同步单元合同 — `decisions.md` 与 `docs/PRODUCT_DESIGN_V0.1.md`。
- 2026-09-03 — Skill Runtime v0.2 契约 dispatcher 先开放简历素材与 JD 分析两个导入桥，后续扩展为当前全部 11 个注册工具，并要求契约哈希、契约身份绑定目标、目标指纹与显式替换 — `decisions.md`。
- 2026-09-03 — 简历来源身份可选兼容扩展、旧文件不补写、显式绑定 ready / proven、显式过期 drifted 与导入指纹不授予反写权限 — `decisions.md`。
- 2026-09-03 — Stage 6 首批同步单元、basis 冲突、append-only Trace、多设备合并、显式队列、删除墓碑与 6a-6d 本地优先实施顺序 — `docs/SYNC_UNIT_CONTRACT.md`、`docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md`。
- 2026-09-03 — 仓库验证与用户验收分离；6b 可与统一验收并行，6c 前必须有 6b 测试与本地侧用户验收 — `docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md` 第 21 条。
- 2026-09-03 — 简历管理以一份简历为唯一可见主对象，手工与 Agent 共享唯一草稿，选区兜底 skill 采用证据门槛，简历库 v1 契约不变 — `docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md`。
- 2026-09-04 — 建立后端架构控制基线：确认模块化单体、模块/路由归属、云本地数据权威、事务 outbox、AI/Trace 边界与 P0-gate / P1 / P2 风险清单；不改变实现和用户验收状态 — `docs/BACKEND_ARCHITECTURE_CONTROL_V0.1.md`。

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
- 简历对象管理 — `frontend/src/stores/studentWorkbench.ts`、`frontend/src/views/StudentResumeView.vue` 与 `frontend/src/utils/resumeSelectionSkill.ts`；每份简历包含标题、目标岗位、唯一当前投递版、唯一待处理草稿和版本树，版本记录状态、模板、来源、文件名、版本说明和全文；页面支持平铺对象列表、版本预览、当前投递版标记、本机导入、草稿派生、草稿编辑、选区兜底 skill、定稿、标记导出、历史抽屉和历史版本切换。
- 简历版本管理验证 — 2026-09-02 浏览器实测从 Java 主简历 v2 派生 v4 草稿、保存“联调结果补强”、确认 v3 未被覆盖、v4 定稿并设为当前投递版、切回 v2 历史投递版均通过；已有 v4 草稿时从 v2 继续会显示“打开现有草稿”并复用该草稿；Agent 生成后进入简历管理会直接选中 v4 草稿，同时当前投递版仍显示 v3；390px 页面无横向溢出，编辑抽屉占满视口且内部无横向滚动；`frontend/` 下 `npm run build` 通过。
- 简历版本库文件桥 — `cli/resume-library.mjs`、`cli/templates/resume-library.example.json`、`frontend/src/utils/resumeLibrary.ts`、`frontend/src/components/resume/LocalResumeLibraryBridge.vue` 与 `frontend/src/stores/studentWorkbench.ts`；CLI 支持 v1 严格校验、只读 check、默认 dry-run、显式 `--apply` / `--replace`、幂等导入、备份和原子写，前端支持导出会话版本库、读取本地版本库并确认后替换会话对象，`gy --status` 只读展示版本库状态；契约 ID 分配先锁定外部显式 ID、本地默认 ID 避让，时间统一毫秒 UTC，`generatedAt` 与 `traceId` 均不参与语义哈希，标题 / 岗位 / 全文 / 控制字符 / 文件名和 Windows 保留设备名在两端与前端会话层均有校验。
- 简历版本库验证 — 2026-09-02 `cli/` 下 `npm test` 74 pass / 0 fail，新增 3 个 Node 测试通过；示例库 `check`、dry-run、`--apply`、幂等导入、不同库替换保护和备份隔离已覆盖；`frontend/` 下 `npm run build` 通过；浏览器实测真实导出、CLI `check` 与前后端内容哈希一致（`sha256:b84e7f1ce47877c91b0e02026fb42b461d9ec81dd9ee38015f9da56ddf2dc07b`）、示例库读取确认后正确替换为 1 线 / 2 版且浏览器未写 `cli/data`；1280px 与 390px 页面横向溢出均为 0，导出 / 读取确认弹窗在窄屏完整可见，Esc 取消后无残留弹窗与滚动锁定；修复 `WorkbenchPanel` 窄屏被内容最小宽度撑开的问题。
- 简历版本库对抗检验 — 2026-09-02 发现并修复三类身份漂移：外部显式契约 ID 被误避让为 `-2`、展示时间丢秒后回导漂移、每次新 `traceId` 参与语义哈希导致同内容重导出被误判变更；浏览器连续导出两份仅 `generatedAt` / `traceId` 不同的 JSON，内容哈希均一致（`sha256:23f2e45b91aef316578e68d36f94a16afa083aa64d3abda586dbc045859d4e0e`），CLI `check` 同哈希，临时数据根第一次导入为 `imported`、第二次为 `unchanged` 且未生成备份；`cli/` 下 `npm test` 74 pass / 0 fail、`frontend/` 下 `npm run build` 通过、`git diff --check` 通过。
- Stage 5 公司机会与 tracker 本地桥接 — `cli/company-opportunity.mjs`、`cli/templates/company-opportunity.example.json`、`cli/job-analysis.mjs`、`cli/gy.mjs`、`cli/lib/intent-router.mjs` 与 `cli/tracker-aliases.json`；支持只读 check、默认 dry-run、显式 `--apply` / `--replace`、绑定已安装岗位分析、公司/岗位/地点/批次自然身份、流程节点种子、中文/自定义 tracker 表头、幂等关联行、共享 tracker 锁、冲突/孤儿行拒绝、用户 tracker 状态同步与缺失重建恢复。
- Stage 5 公司机会验证 — 2026-09-02 `cli/` 下 `npm test` 62 pass / 0 fail；`node --test tests/company-opportunity.test.mjs` 6 pass / 0 fail；`node --check company-opportunity.mjs`、`node --check job-analysis.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/company-opportunity.test.mjs` 与 `git diff --check` 通过；`node gy.mjs --status --json` 在素材包缺失时只读返回 `companyOpportunities.state=blocked`。
- Stage 5 公司机会节点 mutation — `cli/company-opportunity.mjs`、`cli/templates/company-opportunity-node.example.json`、`cli/tests/company-opportunity.test.mjs`、`cli/lib/intent-router.mjs`、`cli/modes/tracker.md`、`cli/AGENTS.md`、`cli/DATA_CONTRACT.md`、`docs/COMPANY_OPPORTUNITY_CONTRACT.md`、`docs/PRODUCT_DESIGN_V0.1.md` 与 `decisions.md`；支持 `check-nodes`、默认 dry-run 的 `mutate-nodes` 与显式 `mutate-nodes --apply`，用完整有序目标节点列表执行新增、删除、重排和状态修改；同一计划幂等、同一 `mutationId` 不同计划冲突、过期计划拒绝、历史计划被新 mutation 取代时只报告不再改写。
- Stage 5 节点 mutation 验证 — 2026-09-02 `cli/` 下 `npm test` 64 pass / 0 fail；`node --test tests/company-opportunity.test.mjs` 8 pass / 0 fail；`node --check company-opportunity.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/company-opportunity.test.mjs` 与 `git diff --check` 通过。
- Stage 5 公司机会前端显式文件桥 — `frontend/src/utils/companyOpportunity.ts`、`frontend/src/components/interview/LocalOpportunityBridge.vue`、`frontend/src/views/StudentInterviewView.vue` 与 `frontend/src/stores/studentWorkbench.ts`；支持导入本地机会 JSON、严格校验、计算与 CLI 兼容的内容哈希、编辑完整目标节点列表、确认变更统计并导出节点 mutation 计划下载；页面展示 dry-run / `--apply` 命令与 Trace，浏览器不直接写本地文件。
- Stage 5 前端文件桥验证 — 2026-09-02 `frontend/` 下 `npm run build` 通过；Playwright 在 `/student/interview` 导入 `cli/templates/company-opportunity.example.json`，页面哈希与 CLI 规范化哈希一致（`sha256:e88a86ce99e4628210ba819977e4c5734fbde776c03f51fe80fbbf71b6162302`），修改节点名称并新增“HR 面”后导出的计划绑定同一哈希、包含 7 个目标节点且确认为 `user_confirmed`；1440px 与 390px 页面整体横向溢出均为 0。
- Stage 5 公司机会真实产物挂载 — `cli/company-opportunity.mjs`、`cli/templates/company-opportunity-artifact.example.json`、`cli/tests/company-opportunity.test.mjs`、`frontend/src/utils/companyOpportunity.ts` 与 `frontend/src/components/interview/LocalOpportunityBridge.vue`；CLI 支持 `check-artifact`、默认 dry-run 的 `mount-artifact` 与显式 `mount-artifact --apply`，校验产物类型、允许目录、节点类型兼容、标准化相对路径、真实文件字节 SHA-256、机会哈希、mountId/path 冲突与幂等恢复；前端导入已安装机会时可只读展示节点产物与本地产物汇总，编辑与导出计划会剥离 `artifacts`。
- Stage 5 产物挂载验证 — 2026-09-02 `cli/` 下 `npm test` 66 pass / 0 fail，`node --test tests/company-opportunity.test.mjs` 10 pass / 0 fail，`node --check company-opportunity.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/company-opportunity.test.mjs` 与 `frontend/` 下 `npm run build` 通过；浏览器实测 CLI 挂载后的机会 JSON 导入 `/student/interview` 后页面哈希与安装哈希一致，导出的节点计划不含 `artifacts`，CLI dry-run 按节点 ID 保留 1 个 JD 分析产物；桌面与 390px 窄屏页面本体无横向溢出，节点表在内部滚动，产物列与类型/状态列对齐。
- Stage 5 本地防骗核查 — `cli/scam-check.mjs`、`cli/templates/scam-check.example.json`、`docs/SCAM_CHECK_CONTRACT.md`、`cli/modes/scam-check.md`、`cli/gy.mjs` 与 `cli/lib/intent-router.mjs`；支持证据引用式校验、红/黄信号与岗位存活观察、确定性结论、只读 check、默认 dry-run、显式 `--apply` / `--replace`、幂等导入、报告渲染、备份和只读状态展示；报告只展示证据索引，不回显外部原文。
- Stage 5 防骗核查验证 — 2026-09-02 `cli/` 下 `npm test` 71 pass / 0 fail；`node --check scam-check.mjs`、`node --check gy.mjs`、`node --check lib/intent-router.mjs`、`node --check tests/scam-check.test.mjs` 通过；示例包 `check` 输出 `high_risk / stop`、红色 1 条 / 黄色 0 条 / 证据 2 条；仓库根 `git diff --check` 通过。
- Agent 页面内 skill 确认流 — `frontend/src/stores/studentWorkbench.ts` 与 `frontend/src/views/StudentAgentConsoleView.vue`；经历结构化、能力资产结构化、简历生成和复盘反哺先生成执行计划，展示目标模块、将写入对象和不会改动对象；用户确认后写入当前会话对象并记录 Trace，取消则不改目标模块；岗位评估、面试准备和周计划保持只读，不伪装沉淀。
- Agent skill 确认流验证 — 2026-09-02 `frontend/` 下 `npm run build` 通过；浏览器实测“生成简历”确认后简历线新增 / 复用唯一草稿且当前投递版、定稿和导出版未被覆盖，“复盘反哺”取消后目标能力资产状态保持不变；执行卡状态可在待确认、已执行、已取消间正确流转，确认与取消均记录 Trace；390px 下页面与执行卡无横向溢出，测试后浏览器视口已恢复默认。
- 本地 Skill Runtime v0.1 审批账本 — `cli/skill-runtime.mjs`、`cli/templates/skill-runtime.example.json`、`docs/SKILL_RUNTIME_CONTRACT.md`、`cli/tests/skill-runtime.test.mjs`、`cli/gy.mjs`、`cli/AGENTS.md`、`cli/README.md` 与 `cli/DATA_CONTRACT.md`；提供 6 个封闭 skill、只读发现、严格计划校验、skill/tool 双重目标白名单、默认 dry-run、显式 `--apply` 审批记录、幂等导入、同 `runId` 冲突保护、替换备份与 `gy --status` 只读状态；记录显式标记 `approval-ledger` 且工具调用数、目标写入数为 0。
- Skill Runtime v0.1 验证 — 2026-09-03 `node --check skill-runtime.mjs`、`node --check gy.mjs`、`node --check tests/skill-runtime.test.mjs`、`node --test tests/skill-runtime.test.mjs`（3 pass / 0 fail）与 `cli/` 下 `npm test`（77 pass / 0 fail）通过；示例计划 `check` 通过，dry-run 不创建数据目录，apply 只写 `data/skill-runs/{runId}.json`，重复 apply 幂等，同 runId 不同计划拒绝，显式 replace 生成备份，目标对象不被写入。
- 本地 Skill Runtime v0.2 基础契约 dispatcher（历史阶段） — `cli/skill-runtime.mjs`、`cli/templates/skill-runtime.example.json`、`cli/tests/skill-runtime.test.mjs`、`docs/SKILL_RUNTIME_CONTRACT.md`、`docs/PRODUCT_DESIGN_V0.1.md`、`cli/README.md`、`cli/AGENTS.md` 与 `cli/DATA_CONTRACT.md`；v1 计划继续只登记审批，v2 计划绑定契约文件 `/` 分隔相对路径与精确字节 SHA-256，并在 check / dry-run / apply 前重验；该历史阶段 8 条执行桥覆盖素材、JD 分析、防骗核查、定稿、渲染、面试准备、复盘与能力反哺，固定目标必须精确匹配，动态目标必须由契约内安全身份字段派生且与计划目标一致；apply 先写 `prepared`，成功写 `dispatched`，失败写 `failed`，记录目标 before / after 指纹、bridge 专属工具结果与备份路径；目标冲突、同 runId 冲突、契约漂移、身份目标不匹配、目录目标、依赖缺失和最终记录写失败均显式失败。
- 本地 Skill Runtime v0.2 契约 dispatcher（当前） — `cli/skill-runtime.mjs`、`cli/templates/skill-runtime.example.json`、`cli/tests/skill-runtime.test.mjs`、`docs/SKILL_RUNTIME_CONTRACT.md`、`docs/PRODUCT_DESIGN_V0.1.md`、`cli/README.md`、`cli/AGENTS.md` 与 `cli/DATA_CONTRACT.md`；v1 计划继续只登记审批，v2 计划绑定契约文件 `/` 分隔相对路径与精确字节 SHA-256，并在 check / dry-run / apply 前重验；当前 11 条执行桥覆盖素材、JD 分析、防骗核查、定稿、渲染、面试准备、复盘、能力反哺、公司机会导入、节点 mutation 与产物挂载，固定目标必须精确匹配，动态目标必须由契约内安全身份字段派生且与计划目标一致，公司机会两条记录桥必须复用同一安全 `opportunityId`；apply 先写 `prepared`，成功写 `dispatched`，失败写 `failed`，记录目标 before / after 指纹、bridge 专属工具结果与备份路径；目标冲突、同 runId 冲突、契约漂移、身份目标不匹配、目录目标、依赖缺失和最终记录写失败均显式失败。
- Skill Runtime v0.2 公司机会扩展验证 — 2026-09-03 `cli/` 下全量 `npm test`（106 pass / 0 fail）、`node --check skill-runtime.mjs`、`node --check tests/skill-runtime.test.mjs`、`node --check company-opportunity.mjs` 通过；测试覆盖公司机会导入 dry-run / apply / 幂等 / 显式替换与 tracker 用户状态保留、节点 mutation、真实产物挂载、契约身份目标绑定、目录目标、mutation ID 冲突与依赖缺失拒绝。统一用户验收仍未完成。
- 简历事实链只读审计 — `cli/resume-fact-chain.mjs`、`cli/tests/resume-fact-chain.test.mjs`、`docs/RESUME_FACT_CHAIN_CONTRACT.md` 与 `cli/gy.mjs`；汇总素材、STAR 故事库、定稿计划、`cv.md`、渲染包、简历版本库与当前投递版的对象状态、内容哈希、链路、漂移、候选、限制和只读执行声明；支持空链路 `blocked`、内容漂移 `drifted`、多候选 `ambiguous`、契约缺口 `binding-gap` 与完整显式绑定 `ready`，`gy --status` 只读展示摘要。
- 简历事实链显式身份绑定 — `cli/resume-final.mjs`、`cli/resume-render.mjs`、`cli/resume-library.mjs`、`cli/resume-fact-chain.mjs`、`frontend/src/stores/studentWorkbench.ts`、`frontend/src/utils/resumeLibrary.ts` 与 `frontend/src/views/StudentResumeView.vue`；渲染包可选绑定当前定稿计划 ID / 计划哈希 / `cv.md` 原文哈希，版本库可选记录成组定稿、导入渲染与导入文件指纹；CLI 对过期渲染绑定拒绝，前端保留真实来源指纹且不伪造 `renderContentHash`。
- 简历事实链边界 — 审计不调用 LLM、不执行 shell、不联网、不写用户层、不生成备份、不自动选择候选、不自动修复漂移；外部导入版本不反写 `cv.md`、素材或定稿。旧渲染包 / 旧版本缺少显式身份字段时输出 `binding-gap`；唯一渲染包与唯一当前投递版显式匹配当前定稿时可输出 `ready` / `proven`；显式身份过期输出 `drifted`，不因内容相同而静默修复。
- 简历事实链验证 — 2026-09-03 `node --check resume-fact-chain.mjs`、`node --check gy.mjs`、`node --check tests/resume-fact-chain.test.mjs`、`node --check resume-final.mjs`、`node --check resume-render.mjs`、`node --check resume-library.mjs`、`cli/` 下全量 `npm test`（102 pass / 0 fail）与 `frontend/` 下 `npm run build` 通过；测试覆盖旧文件零改写下的 `binding-gap`、完整成组绑定到达 `ready`、显式 stale 定稿 / 渲染绑定在对象与链路层输出 `drifted`、来源字段成组 / 生命周期限制、来源字段参与语义哈希，以及导入文件哈希只作为来源证明。
- PRD v0.1 状态校准 — `docs/PRODUCT_DESIGN_V0.1.md`；当前实现快照、9.5.1 简历事实链、Stage 4 当前实现边界与 14.0 验收边界补充来源指纹语义哈希、当前投递版对象状态、集合汇总不降级漂移子对象、过期渲染来源绑定与 102 项 CLI 测试证据；本轮为文档校准，不改变产品目标、阶段状态或用户验收结论。
- Stage 6 同步单元合同 v0.1 — `docs/SYNC_UNIT_CONTRACT.md`；定义首批 `opportunity.progress.v1` 与 `trace.decision.v1`、单元 envelope、canonical 哈希、自然身份、basis 冲突、append-only Trace、多设备合并、显式队列与重试、重绑阻断、删除墓碑、隐私红线和本地构建器实现门槛。此轮为文档与决策落盘，没有 API、数据库、CLI 队列或前端同步实现。
- Stage 6 PRD 实施顺序校准 — `docs/PRODUCT_DESIGN_V0.1.md`；明确 6a 本地确定性构建 / 校验、6b 显式本地队列、6c 授权 API 与云端投影、6d 网页摘要与 Trace 汇总的先后边界，并补充 6a / 6b 的实现门槛验收点。此轮为文档校准，不代表同步实现开始。
- Stage 6a 本地同步单元 builder / validator — `cli/sync-unit.mjs` 与 `cli/tests/sync-unit.test.mjs`；提供 canonical JSON / SHA-256、公司机会自然身份、两类摘要构建、完整 envelope 严格校验、幂等键重算、first / idempotent / accepted / conflict 分类、Trace append-only 冲突、认证失败、重绑、取消、冲突重试限制与删除墓碑防护。用户可见文本保留原文，自然身份才做规范化；builder 会校验用户确认内容哈希，防止伪造确认。
- Stage 6a 验证 — 2026-09-03 `node --check sync-unit.mjs`、`node --check tests/sync-unit.test.mjs`、`node --test tests/sync-unit.test.mjs`（14 pass / 0 fail）与 `cli/` 下全量 `npm test`（120 pass / 0 fail）通过。专项测试覆盖合同门槛八类规则；6b/6c/6d 未开始，统一用户验收仍未完成。
- Stage 6b 显式本地同步队列 — `cli/sync-queue.mjs`、`cli/tests/sync-queue.test.mjs`、`cli/gy.mjs`、`cli/tests/gy-entry.test.mjs`、`docs/SYNC_UNIT_CONTRACT.md`、`cli/DATA_CONTRACT.md`、`cli/README.md` 与 `cli/AGENTS.md`；提供队列 list / 状态过滤、dry-run 与 apply 入队、同单元幂等、同对象唯一当前条目、用户触发重试、认证 / 网络阻断、重绑后精确重确认、云端哈希冲突证据、取消审计隔离、删除墓碑、有界备份和 `gy --status` 只读摘要。队列不联网、不自动上传、不后台重试、不修改本地业务对象。
- Stage 6b 验证 — 2026-09-03 `node --check sync-queue.mjs`、`node --check gy.mjs`、`node --test tests/sync-queue.test.mjs`（9 pass / 0 fail）、`node --test tests/gy-entry.test.mjs`（3 pass / 0 fail）与 `cli/` 下全量 `npm test`（129 pass / 0 fail）通过。统一用户验收仍未完成，6c 尚未开始。
- 后端架构控制基线 — `docs/BACKEND_ARCHITECTURE_CONTROL_V0.1.md`；基于当前 Java 代码与配置梳理 Spring Boot 模块化单体运行拓扑、Redis opaque session 与独立设备 token、active/supporting/frozen 模块和路由归属、云本地数据权威、事务 outbox 与五条队列、能力证据到确定性评分链路、AI/Agent Trace 边界、12 项架构风险与后续变更检查单。本轮不修改运行行为，Stage 6c 仍未启动。

- 2026-09-03 — 简历管理修订为以一份简历为唯一主对象，并实现唯一草稿汇流、历史抽屉、右键拖拽选区和证据门槛兜底 skill — 影响简历交付体验、Agent 片段改写边界和后续统一验收；`get-yourself.resume-library v1` 契约保持不变。
- 简历对象管理验证 — 2026-09-03 19:11 `frontend/` 下 `npm run build` 通过；浏览器实测无能力证据时生成安全替换会被阻断，经 Agent 确认临时导入“跨端协作”证据后能生成保守替换稿并显示证据缺口，替换先进入编辑缓冲区，保存只写入 v4 草稿且当前投递版仍为 v3；确认定稿后当前投递版切到 v4，历史抽屉可显式切回 v3，本机简历文件桥保持收起。右键拖拽路径完成释放顺序、指针捕获与滚动偏移映射实现复查，但当前浏览器自动化接口无法发送真实右键拖动，待用户统一验收时用真实鼠标复测；390px 本轮未重复实测。
- 2026-09-04 — PRD 校准至 v0.1 r7 — 明确当前实现、仓库验证与用户验收分离；补充真实右键拖拽、编辑器滚动映射、资产上下文与建议 / 替换 Trace 的人工验收项，并重申 6c 前必须完成 6a / 6b 用户本地侧验收；不改变产品目标、模块边界或契约版本。
- 2026-09-04 — 新增用户统一验收包 — 按 A0-A7 固化真实路由、CLI 命令、预期结果、禁止行为和待验收结论；记录本轮 CLI / 前端 / 6a / 6b / Runtime 基线与后端环境阻断，验收结论不得由仓库测试替代。
- 2026-09-04 — 新增后端架构控制基线 — 确认模块化单体与云本地权威边界，登记鉴权、Trace 脱敏、legacy 密码、冻结域耦合、outbox 并发与 journal 事件错配等风险；本轮为文档掌控，不代表后端重构或 Stage 6c 开始。

## 已验收

- 暂无。用户尚未对前端 Demo 或 Stage 1 `gy` 入口明确回复“验收通过”。

## 未决问题

- P1 — 前端 Demo、Stage 1 `gy` 入口、Stage 2 证据包文件闭环、Stage 3 设备绑定、Stage 4 素材/定稿/准备/简历对象管理/选区兜底 skill/版本库/显式事实链身份绑定链路、Stage 5 公司机会/tracker/节点 mutation/产物挂载本地桥接、Skill Runtime v0.2 审批账本 / 全量 11 条契约执行桥与 Stage 6 合同 + 6a builder / validator + 6b 显式队列是否通过用户验收 — 用户 — 不阻塞按用户指示缓步推进，但未验收前不得记录为已验收 — 用户检查 `/student/workbench`、独立模块路由、`node gy.mjs`、证据包导出/导入、设备绑定/解绑、简历/面试契约工具、公司机会导入、节点 mutation、产物挂载、`resume-fact-chain.mjs`、`skill-runtime.mjs`、`sync-unit.mjs`、`sync-queue.mjs list/enqueue/retry/cancel/mark/reconfirm` 与 `node --test tests/sync-queue.test.mjs`。
- P1 — “能力资产”最终命名 — 用户 — 不阻塞实现 — 继续使用暂名。
- P1 — 产品与技术评审未完成 — 项目组 — 不阻塞 Stage 1 入口实现 — 修订 PRD 后提交评审。

## 下一步

1. 与用户执行 `docs/UNIFIED_ACCEPTANCE_V0.1.md`：按 A0-A7 顺序检查 Agent、能力资产、简历管理、面试管理、本地 Runtime、Stage 6a 与 Stage 6b；逐项记录通过 / 需修改 / 阻断，简历管理必须包含真实鼠标右键拖拽与滚动后选区复测。
2. 修复统一验收中的体验阻断；修复优先级高于继续扩展云端能力。
3. 6b 获得用户本地侧验收前，不启动 6c 授权 API、数据库或云端投影；不做自动上传、自动重试或自动导入。

## 恢复上下文

- 前端入口：`frontend/`，开发路由包含 `/student/workbench`。
- CLI 入口：`cli/gy.mjs`（`node gy.mjs`、`node gy.mjs --status`、`node gy.mjs --json "<任务>"`）。
- 证据包入口：`cli/evidence-package.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历素材入口：`cli/resume-materials.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历定稿入口：`cli/resume-final.mjs`（`check` / `apply` / `--apply` / `--replace`）。
- 简历版本库入口：`cli/resume-library.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 简历事实链入口：`cli/resume-fact-chain.mjs`（`audit` / `audit --json`，只读）。
- 面试准备入口：`cli/interview-prep.mjs`（`check` / `import` / `--apply` / `--replace`）。
- 公司机会入口：`cli/company-opportunity.mjs`（`check` / `import` / `--apply` / `--replace`；节点维护使用 `check-nodes` / `mutate-nodes` / `mutate-nodes --apply`）。
- 防骗核查入口：`cli/scam-check.mjs`（`check` / `import` / `--apply` / `--replace`）。
- Skill Runtime 入口：`cli/skill-runtime.mjs`（`list` / `check` / `run` / `run --apply` / `run --apply --replace`；v1 只写审批记录，v2 当前执行全部 11 条注册契约桥）。
- 同步单元合同：`docs/SYNC_UNIT_CONTRACT.md`；Stage 6a 实现在 `cli/sync-unit.mjs`，Stage 6b 队列入口为 `cli/sync-queue.mjs`（`list` / `enqueue` / `retry` / `cancel` / `mark` / `reconfirm`，写入必须 `--apply`）。当前无上传 API 或前端同步入口。
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
- 2026-09-02 — PRD 补充当前实现快照与验收边界 — 明确 Stage 1-4 已实现但待统一验收、Stage 5 部分实现、Stage 6 未开始；当时的“简历版本库仍是前端会话内状态”结论已由当日后续文件桥实现与对抗检验取代。
- 2026-09-02 — 实现公司机会 v1 契约与投递清单幂等持久化 — 影响 JD 分析后的面试管理主对象、用户 tracker 状态恢复和后续节点 / 产物 / skill 挂载；仍待用户统一验收。
- 2026-09-02 — 实现公司机会节点 mutation 契约 — 影响面试流程的新增、删除、重排、状态修改和后续前端持久化桥；仍待用户统一验收。
- 2026-09-02 — 实现面试管理前端显式文件桥 — 影响公司机会节点的可视化维护与本地契约执行衔接；仍待用户统一验收。
- 2026-09-02 — 实现公司机会真实产物挂载与前端只读展示 — 影响 JD 分析、简历、面试准备、复盘和能力反哺产物进入流程节点的方式；仍待用户统一验收。
- 2026-09-02 — 实现 career-ops 借鉴的本地防骗核查契约 — 影响岗位推进前的安全门槛、证据留痕和后续岗位 liveness / 官方渠道核查扩展；仍待用户统一验收。
- 2026-09-02 — 实现 Agent 页面内 skill 显式确认流 — 影响 Agent 写入型输出的信任边界、模块沉淀口径和后续本地 runtime / 文件桥衔接；仍待用户统一验收。
- 2026-09-02 — 实现简历版本库显式文件桥 — 影响简历线 / 版本 / 当前投递版的本地持久化、CLI 写盘审批和后续与定稿 / 渲染事实链的衔接；仍待用户统一验收。
- 2026-09-02 — 完成简历版本库文件桥对抗检验并修复契约 ID 避让、时间精度、Trace 哈希与输入校验边界 — 影响浏览器 / CLI 的同语义幂等导入和本机简历身份稳定性；仍待用户统一验收。
- 2026-09-03 — PRD 完成实现进度再校准 — 修正简历版本库“仍为前端会话状态”的过期结论，补充稳定身份契约与验收边界；整体目标与阶段状态不变。
- 2026-09-03 — PRD 细化执行合同 — 新增本地 Skill Runtime 生命周期、封闭 skill 集、简历事实链、三类冷启动、面试状态转换表、JD 输入分层、AI 调用边界与 Stage 6 同步单元规则 — 影响后续 CLI 实现顺序与验收口径。
- 2026-09-03 — 实现本地 Skill Runtime v0.1 审批账本 — 新增 6 个封闭 skill、计划校验、目标双重白名单、dry-run、幂等审批记录与替换备份，并接入 `gy --status` 与 PRD / 数据契约；不调用模型、不执行契约工具、不写目标对象，dispatcher 留待下一步。
- 2026-09-03 — 实现简历事实链只读审计 — 新增素材 / STAR / 定稿 / `cv.md` / 渲染包 / 版本库 / 当前投递版的身份与漂移审计，并接入 `gy --status`；内容一致时诚实输出 `binding-gap`，不自动绑定、不修复、不同步，仍待用户验收。
- 2026-09-03 — 实现本地 Skill Runtime v0.2 基础契约 dispatcher — v2 计划绑定契约文件精确字节哈希，历史阶段开放当时全部 8 个注册契约工具执行桥，并记录目标前后指纹与 prepared / dispatched / failed 状态；未注册工具仍不可执行，仍待用户验收。
- 2026-09-03 — 完成简历事实链显式身份绑定升级 — 渲染包与版本库支持成组可选来源指纹，事实链可证明当前定稿 `ready` / `proven` 并识别显式过期 `drifted`；旧文件保持 `binding-gap` 且零补写，仍待用户验收。
- 2026-09-03 — 完成显式身份绑定的对抗性复检 — 当前投递版对象状态与定稿 / 渲染绑定和 `cv.md` 全文比较保持一致，集合层不再把过期子对象聚合为 `ready`；来源指纹参与语义哈希有显式断言，仍待用户统一验收。
- 2026-09-03 — PRD v0.1 完成事实链实现状态校准 — 补充当前投递版对象 / 集合状态一致性、来源指纹语义哈希敏感性与过期渲染绑定验收点；整体目标与阶段状态不变，仍待用户统一验收。
- 2026-09-03 — 实现公司机会导入、节点 mutation 与真实产物挂载的 Skill Runtime 派发桥 — Runtime 扩展为 7 个封闭 skill / 11 条注册工具，公司机会目标由同一 `opportunityId` 派生并保留用户-owned 状态；`cli/` 106 项测试通过，仍待用户统一验收。
- 2026-09-03 — 定义 Stage 6 同步单元合同 v0.1 — 收窄首批同步对象为公司机会进度摘要与 Trace 决策摘要，确定自然身份、basis 冲突、append-only Trace、多设备合并、显式队列、重绑阻断、删除墓碑与隐私红线；下一步才实现本地构建器与校验器。
- 2026-09-03 — PRD 补充 Stage 6 实施顺序 — 固定本地确定性构建 / 校验、显式本地队列、授权 API 与云端投影、网页摘要与 Trace 汇总的推进顺序，并把每一步的不可越界项写入当前验收边界；不改变产品目标，也不代表同步实现开始。
- 2026-09-03 — 实现 Stage 6a 本地同步单元 builder / validator 并校准 PRD — 覆盖 canonical 哈希、自然身份、内容指纹、禁传字段、basis 冲突、Trace append-only、队列动作纯规则、删除墓碑与确认哈希校验；`cli/` 全量 120 项测试通过，下一步进入 6b 显式本地队列，仍待用户统一验收。
- 2026-09-03 — PRD 修订至 v0.1 r4 — 明确 6b 显式本地队列的产品交付、仓库验证与用户验收分离、6c 前置门槛和统一验收顺序；不改变产品目标，也不代表新增实现或用户验收。
- 2026-09-03 — 实现 Stage 6b 显式本地同步队列并修订 PRD 至 v0.1 r5 — 支持本地待发摘要、幂等入队、状态过滤、用户触发重试、认证 / 重绑阻断、冲突证据、取消审计、删除墓碑、有界备份和 `gy --status` 摘要；`cli/` 全量 129 项测试通过，仍不联网、不上传、不后台重试，待用户统一验收。
