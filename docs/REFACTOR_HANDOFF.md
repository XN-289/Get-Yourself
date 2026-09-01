# Get Yourself 重构交接包（Handoff Package）

> 用法：把这个文件（+ 仓库本身）作为新窗口的初始上下文。按「工作流 → 项目全景 → 环境搭建 → 重构规范 → 路线图」顺序执行，每步完成人工验证后再进下一步。
> 主规范：`docs/AI_MAINTAINABLE_SPEC.md`（本文件已内嵌全部内容，自包含）。

---

## 一、工作流总览（五个环节）

```
① 环境搭建  →  ② 产品设计  →  ③ 技术设计  →  ④ 产品实现  →  ⑤ 人工验证
   docker/env     读懂产品     按规范定结构    分步落地       每步验收
```

| 环节 | 做什么 | 对应文档 |
|---|---|---|
| ① 环境搭建 | 起中间件、配 env、启动前后端 | 本文档「三、环境搭建」 |
| ② 产品设计 | 理解产品定位、核心功能、业务流程 | 本文档「二、项目全景」+ README + docs/ |
| ③ 技术设计 | 用「六、重构规范」的模块模板审视/设计目标结构 | 本文档「六」 |
| ④ 产品实现 | 按「七、路线图」分步落地，每步一个 MR | 本文档「七」 |
| ⑤ 人工验证 | 每步验收清单 + 核心链路手工回归 | 每步的「验收标准」 |

**铁律：不跳步、不并行、每步独立验收可回滚。**

---

## 二、项目全景

### 2.1 产品定位

**Get Yourself** —— 面向大学生的「个人成长记录与能力发展平台」。
让「我做了什么」变成「我能证明什么」：记录活动/挑战/反思 → AI 提炼能力证据 → 能力评分可解释 → 专属 AI 教练复盘 → 智能推荐补能力缺口。

### 2.2 核心功能（产品设计）

| 功能 | 逻辑要点 |
|---|---|
| 成长时间线 | 聚合活动、挑战、教练对话、日记、能力评分变化；顶部统计（累计经历/成长天数/活跃方向） |
| 成长日记 | 关联心情标签 + 成长标签，形成能力画像 |
| AI 教练 | 基于成长背景实时对话；对话结束自动生成成长日志；间隔重复记忆（1→3→7→14→30 天） |
| 能力评估系统 | **四层流水线**：LLM 抽取证据 → Java 引擎算分 → Judge Agent 交叉验证 → HAC 聚类归并 |
| 挑战系统 | 设目标 → 完成 → 自动写成就 → 触发能力评估 |
| AI 智能推荐 | Query Rewrite → BM25+Embedding 混合召回 → LLM 在**真实候选集内**选并生成理由 |
| 活动生态 | 企业发布活动 → 安全质量预审（eventquality）→ 学生预约/扫码签到（reservation）→ 关注组织（follow） |
| 微信登录 | wechat 模块 |

### 2.3 技术架构（技术设计）

```
Frontend: Vue 3 + Vite 6 + TS 5.7 + Pinia 3 + Vue Router 4
  └─ src/api/client.ts 统一封装（api.get/post/put/delete，401 自动登出）
Backend: Spring Boot 3.3 / Java 21 / Spring Data JPA
  ├─ 19 个业务模块（见 2.4）
  ├─ common/: ApiException, GlobalExceptionHandler, PageResponse, CurrentUser
  └─ config/: CorsConfig
Infra: MySQL 8.4（21 个 Flyway 迁移）/ Redis 7.4（会话 7 天 TTL）/
       RabbitMQ 3.13（Outbox Pattern）/ OpenSearch 2.15（BM25+Embedding）
AI: 通义千问 qwen-plus + text-embedding-v4（OpenAI 兼容）
Deploy: Docker + Railway（monorepo 双服务）
```

### 2.4 后端模块地图（19 模块 + 文件数）

| 模块 | 职责 | 文件数 |
|---|---|---|
| abilityscore | 能力评分四层流水线（证据/计算/Judge/HAC/申诉） | 48 |
| agentlog | Agent Trace: Run / Step / Artifact | 24 |
| retrieval | 混合检索：QueryRewrite / BM25 / Embedding / Rerank / Trace | 12 |
| achievement | 成就记录与成长标签 | 12 |
| coach | AI 教练：对话、日志、间隔重复记忆 | 11 |
| event | 活动 CRUD 与搜索 | 9 |
| mq | RabbitMQ + Outbox Pattern（8 个类） | 8 |
| memory | 用户画像与长期记忆 | 7 |
| schedule | 日程管理 | 7 |
| ai | AI 推荐服务（6 个文件） | 6 |
| auth | 注册/登录/Token 鉴权（分层标准范本） | 6 |
| challenge | 挑战系统 CRUD | 6 |
| eventquality | 活动质量预审 Agent | 6 |
| reservation | 预约、扫码签到 | 6 |
| follow | 关注组织 | 5 |
| journal | 成长日记 | 5 |
| organization | 组织信息管理 | 5 |
| wechat | 微信登录 | 4 |
| growth | 成长时间线聚合 | 3 |
| mcp | MCP 工具上下文（时间、定位） | 3 |
| common / config | 公共设施 | 6 |

### 2.5 关键机制（实现逻辑）

1. **能力评估四层流水线**：LLM 只负责「理解」（抽证据），不负责「打分」；分数由确定性 Java 引擎计算，避免随机性影响公平 → Judge Agent 交叉验证 → HAC 层次聚类归并能力维度。
2. **Outbox Pattern 最终一致性**：`@Transactional` 同事务写业务 + outbox → 调度器轮询投递 RabbitMQ → 消费者幂等处理。保证不丢消息、不重复处理。
3. **AI 推荐防编造**（PROBLEM_LOG 001 教训）：后端先召回真实候选 `eventId` 集 → Prompt 硬约束只能用候选中的 id → 后端 normalize 过滤不存在的 id。**AI 永不直接生成活动。**
4. **Agent Trace 可观测**：每次 AI 调用记录 Run→Step→Artifact，Bad Case 可沿 Trace 定位。
5. **间隔重复记忆**：教练对话后按 1/3/7/14/30 天节奏回顾，主动带出历史洞察。

### 2.6 已有知识资产（新窗口必读，排障先查）

| 文档 | 内容 |
|---|---|
| `backend/PROBLEM_LOG.md` | 已解决问题：原因+解法（AI 排障先查这里） |
| `docs/待处理问题.md` | 未定稿优化方向（AI 方案设计前先看） |
| `backend/AGENT_OPTIMIZATION_BACKLOG.md` | AI/Agent 优化 backlog |
| `docs/Java确定性能力评分引擎_v2.md` | 评分引擎设计 |
| `docs/能力Judge系统_v1.md` / `能力评分公平性与防刷分_v2.md` | Judge 与防刷 |
| `docs/能力评分系统数据模型_v2.md` | 数据模型 |
| `docs/RAG召回评测集_30条_v1.md` | 检索评测集 |
| `docs/Evidence_Assessment_Agent_v2.md` | 证据抽取 Agent |
| `docs/get-yourself-architecture.svg` | 架构图 |

---

## 三、环境搭建

### 3.1 前置

- Java 21+（`java -version`）、Maven 3.9+（在 PATH）、Node 18+、Docker Desktop（必须启动引擎）

### 3.2 步骤

```bash
# 1. 起中间件（MySQL 3306 / Redis 6379 / RabbitMQ 5672+15672 / OpenSearch 9200）
cd backend
docker compose up -d

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：填入 DASHSCOPE_API_KEY；默认 SEARCH_ENABLED=false（OpenSearch 可不开）

# 3. 起后端（http://localhost:8080）
mvn spring-boot:run

# 4. 另开终端起前端（http://localhost:5173，/api 代理到 8080）
cd frontend
npm install
npm run dev
```

### 3.3 环境自检清单

- [ ] `docker compose ps` 四个服务 healthy
- [ ] 后端启动无异常，`http://localhost:8080` 可访问（HealthController）
- [ ] 前端 `npm run dev` 无报错，打开 5173 能注册/登录
- [ ] 注册新用户 → 走通「登录 → 写日记 → 能力评估」基本链路

---

## 四、已摸清的现状（直接可用的事实）

- **死代码（已确认）**：`frontend/legacy-index.html`(36KB) + `app.js`(152KB) + `styles.css`(48KB) 三件套互相引用，但入口 `index.html` 只加载 `/src/main.ts`，**不参与 Vite 构建** → 可删（先确认无人工直接访问）。
- **后端分层良好**：auth 模块是标准范本（Controller/Dtos/Service/Entity/Repository/Role）；common/ 已有统一异常与分页。**不要推倒重来，保持并固化。**
- **测试现状**：仅 10 个单测（abilityscore 8 + retrieval 2），无 E2E、无视觉回归、无 MR 流水线。
- **无 AGENTS.md**：整个仓库没有任何 AI 上下文文件。
- **git 历史**：项目由别的项目改名而来（日本→国内、warma 残留清理），可能有残留引用需排查。

---

## 五、重构规范（内嵌自 `docs/AI_MAINTAINABLE_SPEC.md`）

> 依据方法论：从胡言乱语到精准改代码——AI 上下文工程五步法。

### 5.0 总纲：方法论 → 落地阶段

| 方法论 | 落地阶段 | 交付物 |
|---|---|---|
| ① AI 上下文工程 | 阶段 A：知识底座 | 根 AGENTS.md + 模块 AGENTS.md |
| ② 移除不再起作用的代码 | 阶段 B：清死代码 | 死代码清单 + 清理 MR |
| ③ 做减法，复杂架构简单化 | 阶段 C：架构收敛 | 简化方案 + 落地 |
| ④ 定规范，约束边界 | 阶段 D：规范约束 | 代码结构标准 |
| ⑤ 建设自动化测试工程 | 阶段 E：质量护栏 | 单测/E2E/视觉回归/MR 流水线 |
| ⑥ 债务治理常态化 | 阶段 F：长效机制 | 问题日志流转 + 治理节奏 |

### 5.1 根 AGENTS.md（模板，按仓库实际填）

```markdown
# Get Yourself

面向大学生的个人成长记录与能力发展平台（Spring Boot 3.3 + Vue 3 + TS 前后端分离）。

## 知识索引
| 领域 | 位置 | 摘要 |
|---|---|---|
| 系统架构总览 | `README.md` | 模块清单、技术栈、部署方式 |
| 能力评分系统 | `docs/Java确定性能力评分引擎_v2.md` 等 | 四层流水线 |
| 检索推荐链路 | `backend/src/.../retrieval/` + `docs/RAG召回评测集_30条_v1.md` | BM25 + Embedding 混合召回 |
| 问题日志（已解决） | `backend/PROBLEM_LOG.md` | 历史问题原因与解法 |
| 待处理问题 | `docs/待处理问题.md` | 未定稿方向 |
| 优化 backlog | `backend/AGENT_OPTIMIZATION_BACKLOG.md` | AI/Agent 优化项 |
| 重构规范 | `docs/AI_MAINTAINABLE_SPEC.md` | 本仓库规范之母 |

## 项目规范（强制）
- commit message 带类型前缀（feat:/fix:/refactor:/docs:/test:），单行 ≤ 72 字符。
- 模块级知识就近落盘到模块 AGENTS.md，并同步更新本索引。

## 知识落盘规范
- 根 AGENTS.md 只保留「路径 + 1~2 句摘要」，细节放模块级文档。
- 对话中出现可复用的规则/兼容性/排障结论，必须就近落盘。
- 发现索引过期或不准确时，主动修改。
```

### 5.2 模块级 AGENTS.md

- 后端每个业务模块放一个：职责边界、关键类地图（C/S/E/R 各是哪个）、依赖关系、已踩的坑。
- 前端 `src/api/`、`src/stores/`、`src/views/` 各一个：API 约定、状态边界、页面职责。
- **只写 AI 查不到或查起来很贵的信息**（运行链路、历史决策、兼容性约束、未跑通的尝试）。

### 5.3 清死代码

1. 引用分析（IDE/grep 找无引用类/方法/文件；注意「互相引用但不被入口引用」的死岛）。
2. 环境分支排查：`grep -rn "环境判断" src`，对照 `.env.example` / `railway.toml` 确认变量真实存在。
3. **有引用但不确定是否运行 → 加日志/断点跑真实场景确认，不能只靠静态引用判断。**
4. 删除纪律：一次一个主题，跑通测试+本地全链路验证再提交；禁止大爆炸删除。
5. 沉淀：删除结论写进模块 AGENTS.md（"XX 已下线，勿再引用"）。

### 5.4 做减法（复杂度体检）

| 检查项 | 判断标准 |
|---|---|
| RabbitMQ + Outbox | 是否所有场景都需要最终一致性？低频场景可否改同步调用？ |
| 检索链路 | 打分权重是否过复杂？`docs/待处理问题.md` 有优化方向 |
| Redis 缓存 | 是否有过期缓存无人清理？ |
| Agent Trace | 追踪粒度是否过细？ |

简化原则：架构的价值是**把复杂度压下来**；立足于现在，不为想象中的未来设计；每次重构只解决一个问题且**必须彻底**（不彻底的重构产生新债务）；两个"否"就砍（没人用？可见未来用不上？）。

### 5.5 后端标准结构（新模块模板）

```text
<module>/
├── <Module>Controller.java  # 只做参数校验 + 调 Service + 返回 DTO，不写业务
├── <Module>Service.java     # 业务逻辑唯一住所
├── <Module>Entity.java      # JPA 实体
├── <Module>Repository.java  # 只声明查询方法
├── <Module>Dtos.java        # 请求/响应 DTO
└── <Module>AGENTS.md        # 模块知识
```

强制约定：
- 业务错误一律抛 `ApiException` → `GlobalExceptionHandler` 统一转 JSON；禁止 Controller try-catch 吞异常。
- 分页统一 `PageResponse<T>`；当前用户从 `CurrentUser` 取，禁止 Controller 解析 Token。
- 依赖单向：Controller→Service→Repository；Service 间禁止循环依赖。
- 新增表一律 Flyway 迁移脚本，禁止 `ddl-auto: update`。

### 5.6 前端标准

| 目录 | 职责 | 禁止 |
|---|---|---|
| `src/api/` | 每个领域一个文件，统一走 client.ts | 组件直接 fetch |
| `src/stores/` | 全局状态（仅 auth，新增需论证） | 页面局部状态放 store |
| `src/views/` | 一个路由一个 view | 跨页复制大段逻辑 |
| `src/components/` | 可复用组件 | 为单页造通用组件 |
| `src/router/` | 路由+鉴权守卫 | 组件内绕过守卫 |

约定：API 错误统一走 `ApiError`（401 已自动登出），页面不得重复处理；DTO 类型放 `src/types/` 与后端一一对应。

### 5.7 自动化测试

- 单测：确定性逻辑必测（计算/判断/边界），Mock 数据，`mvn test`。
- E2E（待建）：多页面链路（登录→时间线→日记→教练→能力评估→挑战），真实环境+测试账号+**测试数据定期清理**（防触上限）。
- 视觉回归（待建）：大截图测布局（阈值放宽）+ 组件级小用例测细节（阈值严格）；产物随仓库走，MR 可见。
- MR 流水线（目标形态）：`提交 → 单测 → E2E → 视觉回归 → AI 评审（规范检测）→ 人工 review → 合入`。

### 5.8 债务治理常态化

1. 问题日志闭环：`待处理问题.md`（未定稿）→ 落地后迁移 `PROBLEM_LOG.md`（已解决+原因+解法）。
2. 日常顺手治理：迭代新功能时顺手按规范重构历史代码，小步提交，不攒大专项。
3. AI 评审兜底：MR 时检测规范违规，机制强制而非人自觉。
4. 定期复盘：每季度过 `待处理问题.md`，避免"起了头没下文"。

---

## 六、执行路线图（一步一步来）

| 步骤 | 内容 | 工作量 | 验收标准（人工验证） |
|---|---|---|---|
| **Step 0** | 建根 `AGENTS.md` + 知识索引 | 0.5 天 | 新窗口/AI 读 AGENTS.md 能答出项目结构 |
| **Step 1** | 清死代码：legacy 三件套 + 引用扫描 + 环境分支排查 | 1~2 天 | `mvn test` 全绿 + `npm run build` 通过 + 核心链路手工回归 + 结论落盘 |
| **Step 2** | 复杂度体检，砍 1 个过度设计（候选：MQ 场景精简 / 检索打分简化） | 1~2 天 | 简化前后对比记录 + 1 个发布周期无反馈 |
| **Step 3** | 写核心模块 AGENTS.md（abilityscore/retrieval/coach/auth 优先） | 1~2 天 | 模块知识底座就绪 |
| **Step 4** | 单测补强（核心链路确定性逻辑） | 2~3 天 | 覆盖率报告 + 全绿 |
| **Step 5** | E2E 框架 + P0 用例 | 3~5 天 | P0 链路用例通过 + 脏数据治理脚本 |
| **Step 6** | 视觉回归 + MR 流水线 + AI 评审规则 | 3~5 天 | 流水线全通过 + 评审规则文件 |
| **Step 7** | 常态化治理机制 | 持续 | 机制文档 + 每季度复盘 |

**每步独立 MR、独立验收、可回滚；Step 0~1 是地基，先让 AI 有眼睛（AGENTS.md）、代码干净（清死代码），再做自动化。**

---

## 七、常见坑（来自文章与项目实况）

- AI 判断"代码是否运行"不能只靠引用 → 用运行链路验证。
- 不彻底的重构 = 新债务 → 每次重构必须做完、验收。
- 为"想象中的未来"设计（如 OT 协同）是过度设计 → 先问"现在有人用吗"。
- 测试数据不治理 → 账号触上限 → 每次 E2E 后清理。
- 规范没人执行 → 用 AI 评审机制兜底，不靠自觉。
