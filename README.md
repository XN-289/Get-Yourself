<div align="center">

# 🌱 Get Yourself

**让真实经历沉淀为可解释的成长**

*A personal growth recording & ability development platform for college students*

[![Java](https://img.shields.io/badge/Java-21-ED8B00?style=flat-square&logo=openjdk&logoColor=white)](https://openjdk.org/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3-6DB33F?style=flat-square&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Vue.js](https://img.shields.io/badge/Vue.js-3-4FC08D?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#license)

</div>

---

## 📖 这个项目是做什么的？

你是否也有过这样的困惑——

> 大学参加了那么多活动，写简历的时候却不知道怎么证明自己的能力？
> 每次被问到「你有什么优势」，只能说一些空洞的形容词？

**Get Yourself** 就是为了解决这个问题而生的。

它是一个 **面向大学生的个人成长记录与能力发展平台**。不同于简单的待办清单或日记本，Get Yourself 会：

- 📝 **记录你的每一次成长** —— 活动参与、挑战完成、每日反思，全部汇聚到一条成长时间线
- 🧠 **用 AI 帮你提炼能力** —— 从你的真实经历中自动抽取能力证据，用数据而非形容词来描述你的成长
- 🤖 **配备专属 AI 教练** —— 基于你的成长背景进行对话，帮你复盘、发现盲区、制定下一步计划
- 🎯 **智能推荐适合你的活动** —— 不是随机推荐，而是基于你已有能力的缺口来匹配

**一句话总结：让「我做了什么」变成「我能证明什么」。**

---

## ✨ 核心功能

<table>
<tr>
<td width="50%">

### 🕐 成长时间线

聚合你所有的成长事件——活动、挑战、教练对话、日记、能力评分变化——按时间排列，一目了然。

顶部统计面板展示：累计经历数、成长天数、活跃方向数。

</td>
<td width="50%">

### 📔 成长日记

不只是日记，更是能力证据。每次记录可以关联心情标签和成长标签，日积月累形成你的能力画像。

</td>
</tr>
<tr>
<td width="50%">

### 🤖 AI 教练

基于你的成长背景进行实时对话。对话结束后自动生成成长日志，并通过间隔重复（1→3→7→14→30天）帮你巩固认知。

</td>
<td width="50%">

### 📊 能力评估系统

LLM 从你的经历中抽取能力证据 → Java 引擎计算分数 → Judge Agent 交叉验证 → HAC 聚类归并能力维度。**四层流水线，让评分可解释、可追溯。**

</td>
</tr>
<tr>
<td width="50%">

### 🏆 挑战系统

设定个人成长目标，完成后自动写入成就记录，触发能力评估。把「我想变得更好」变成可量化的里程碑。

</td>
<td width="50%">

### 🔍 AI 智能推荐

Query Rewrite 理解你的真实意图 → BM25 + Embedding 混合召回 → LLM 生成个性化推荐解释。推荐结果来自真实数据库，不会编造。

</td>
</tr>
</table>

---

## 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                              │
│                    Vue 3 + Vite + TypeScript                  │
│                     Pinia + Vue Router                        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Backend (Spring Boot 3.3)                   │
│                                                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │  Growth     │  │  AI Coach  │  │  Ability   │             │
│  │  Timeline   │  │  & Memory  │  │  Scoring   │             │
│  └────────────┘  └────────────┘  └────────────┘             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐             │
│  │  Challenge  │  │  Retrieval │  │  Agent     │             │
│  │  System     │  │  Engine    │  │  Trace     │             │
│  └────────────┘  └────────────┘  └────────────┘             │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                       Infrastructure                          │
│  ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ MySQL  │  │ Redis  │  │ RabbitMQ │  │ OpenSearch   │    │
│  │  8.4   │  │  7.4   │  │  3.13    │  │   2.15       │    │
│  └────────┘  └────────┘  └──────────┘  └──────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|:---:|:---:|:---|
| **前端** | Vue 3 + Vite 6 | Composition API, `<script setup>`, TypeScript |
| **状态管理** | Pinia 3 | 响应式全局状态 |
| **路由** | Vue Router 4 | History 模式, 路由守卫鉴权 |
| **后端** | Spring Boot 3.3 | Java 21 LTS, Spring Data JPA |
| **数据库** | MySQL 8.4 | 21 个 Flyway 迁移脚本 |
| **缓存** | Redis 7.4 | 会话存储, 7天 TTL |
| **消息队列** | RabbitMQ 3.13 | Outbox Pattern 保证最终一致性 |
| **搜索引擎** | OpenSearch 2.15 | BM25 + Embedding 混合检索 |
| **AI 模型** | 通义千问 | qwen-plus, text-embedding-v4 (OpenAI 兼容) |
| **部署** | Docker + Railway | 多阶段构建, 一键部署 |

---

## 🚀 快速开始

### 前置条件

- **Java 21+** — 安装后运行 `java -version` 确认
- **Maven 3.9+** — 安装后运行 `mvn -v` 确认，需要加到 PATH
- **Node.js 18+** — 安装后运行 `node -v` 确认
- **Docker Desktop** — 必须先启动应用，等左下角显示引擎运行中再操作
- 通义千问 API Key（或其他 OpenAI 兼容 API）

### 1. 启动中间件

> ⚠️ 确保 Docker Desktop 已经启动，`docker version` 能正常输出再继续。

```powershell
cd backend
docker compose up -d
```

启动 MySQL (3306)、Redis (6379)、RabbitMQ (5672/15672)、OpenSearch (9200)。

### 2. 配置环境变量

```powershell
# 已经在 backend 目录，不需要再 cd backend
cp .env.example .env
# 编辑 .env，填入 DASHSCOPE_API_KEY
```

### 3. 启动后端

> ⚠️ 需要先安装 Maven 并确保 `mvn` 命令在 PATH 中可用。

```powershell
# 在 backend 目录
mvn spring-boot:run
# 后端地址: http://localhost:8080
```

### 4. 启动前端

> ⚠️ 前端命令在 `frontend` 目录执行，不是 `backend`。需要另开一个终端窗口。

```powershell
cd frontend
npm install
npm run dev
# 前端地址: http://localhost:5173
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `dockerDesktopLinuxEngine` 报错 | Docker Desktop 没启动 | 打开 Docker Desktop，等引擎启动完成 |
| `mvn` 命令找不到 | Maven 没装或没加 PATH | 安装 Maven，配置 `MAVEN_HOME` 和 `Path` |
| `package.json` 找不到 | 在错误的目录跑 npm | npm 命令在 `frontend` 目录执行 |
| 端口 3306 被占用 | 本机已有 MySQL | 改 `docker-compose.yml` 端口为 `3307:3306` |

---

## 📁 项目结构

```
get-yourself/
├── backend/
│   ├── src/main/java/com/getyourself/backend/
│   │   ├── abilityscore/    # 能力评分：证据抽取 → 计算引擎 → Judge 验证 → HAC 聚类
│   │   ├── achievement/     # 成就记录与成长标签
│   │   ├── ai/              # AI 推荐服务
│   │   ├── agentlog/        # Agent Trace: Run / Step / Artifact
│   │   ├── auth/            # 注册、登录、Token 鉴权
│   │   ├── challenge/       # 挑战系统 CRUD
│   │   ├── coach/           # AI 教练：对话、日志、间隔重复记忆
│   │   ├── event/           # 事件发布与搜索
│   │   ├── eventquality/    # 活动质量预审 Agent
│   │   ├── follow/          # 关注组织
│   │   ├── growth/          # 成长时间线聚合
│   │   ├── journal/         # 成长日记
│   │   ├── mcp/             # MCP 工具上下文（时间、定位）
│   │   ├── memory/          # 用户画像与长期记忆
│   │   ├── mq/              # RabbitMQ + Outbox Pattern
│   │   ├── organization/    # 组织信息管理
│   │   ├── reservation/     # 预约、扫码签到
│   │   ├── retrieval/       # 混合检索：BM25 + Embedding + Reranking
│   │   ├── schedule/        # 日程管理
│   │   └── wechat/          # 微信登录
│   ├── src/main/resources/
│   │   ├── db/migration/    # 21 个 Flyway SQL 迁移
│   │   └── application.yml
│   ├── docker-compose.yml   # 本地中间件一键启动
│   └── Dockerfile           # 多阶段构建
├── frontend/
│   ├── src/
│   │   ├── views/           # 17 个页面组件
│   │   ├── components/      # 通用组件
│   │   ├── api/             # API 调用封装
│   │   ├── stores/          # Pinia 状态管理
│   │   └── router/          # 路由 + 鉴权守卫
│   ├── Dockerfile           # Nginx 生产构建
│   └── index.html
└── docs/                    # 架构设计文档
```

---

## 💡 设计亮点

### 🔒 能力评分解耦

```
用户经历 ──→ LLM 抽取证据 ──→ Java 引擎计算分数 ──→ Judge Agent 交叉验证
                                              ↓
                                    HAC 层次聚类归并能力维度
```

LLM 只负责「理解」，不负责「打分」。评分由确定性 Java 引擎完成，避免 LLM 的随机性影响公平性。

### 📡 AI 全链路可观测

每次 AI 调用都会记录完整的 `Run → Step → Artifact` 链路。当用户反馈「这个推荐不对」时，Bad Case Intake Agent 可以沿着 Trace 自动定位问题环节。

### 🔄 Outbox Pattern 最终一致性

```java
@Transactional
public void completeActivity() {
    save(activity);                    // 业务写入
    save(outboxRecord);                // 同一事务写入 outbox
}
// 异步调度器轮询 outbox → 投递 RabbitMQ → 消费者幂等处理
```

保证业务操作和消息投递的原子性，不丢消息、不重复处理。

### 🧠 间隔重复记忆系统

AI 教练不是一次性对话工具，而是会记住你的成长轨迹。通过 1天→3天→7天→14天→30天 的间隔重复，在后续对话中主动回顾之前的洞察，帮你真正内化成长认知。

---

## 📄 License

[MIT](LICENSE)

---

<div align="center">

**Get Yourself** — 让成长有迹可循，让能力有据可依。

</div>


