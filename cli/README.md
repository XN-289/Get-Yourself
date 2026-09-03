# 🌱 Get Yourself Agent — 中国大学生求职作战指挥中心

> 对标 [career-ops](https://github.com/santifer/career-ops) 的架构哲学，专为中国校招场景设计。
> **用一句人话进入 Agent，让 AI 帮你筛岗位、整理简历、准备面试并管理从网申到三方的全过程。你负责最终决定。**

## Agent 入口

```bash
npm install

# 默认进入交互式对话
npm run gy

# 一句话路由
npm run gy -- "把我这段实习整理成简历条目"
npm run gy -- "这家公司值得投吗"
npm run gy --json "帮我准备明天的面试"

# 只读检查资料是否就绪（不会写入用户层）
npm run gy -- --status --json

# 绑定网页账号生成的本地工位（绑定码 10 分钟内有效）
npm run gy -- connect GY-XXXX-XXXX
npm run gy -- connect GY-XXXX-XXXX --server http://localhost:8080 --device-name "我的本机工位"
npm run gy -- disconnect

# 校验并导入网页导出的能力证据包
node evidence-package.mjs check ../path/to/evidence-package.json
node evidence-package.mjs import ../path/to/evidence-package.json
node evidence-package.mjs import ../path/to/evidence-package.json --apply
node resume-materials.mjs check ../path/to/resume-materials.json
node resume-final.mjs check ../path/to/resume-final-plan.json
node resume-render.mjs list
node resume-render.mjs check ../path/to/resume-render.json
node resume-fact-chain.mjs audit
node job-analysis.mjs check ../path/to/job-analysis.json
node scam-check.mjs check ../path/to/scam-check.json
node interview-prep.mjs check ../path/to/interview-prep.json
node interview-review.mjs check ../path/to/interview-review.json
node capability-feedback.mjs check ../path/to/capability-feedback.json
node capability-feedback.mjs import ../path/to/capability-feedback.json --apply
node skill-runtime.mjs list
node skill-runtime.mjs check ../path/to/skill-run-plan.json
node skill-runtime.mjs run ../path/to/skill-run-plan.json
node skill-runtime.mjs run ../path/to/skill-run-plan.json --apply
node skill-runtime.mjs run ../path/to/skill-run-plan.json --apply --replace
```

当前 `gy` 是确定性对话入口加最小设备绑定：识别意图、选择落点模块和后台模式、提示需要补充的信息与审批边界；`connect` / `disconnect` 只维护设备凭证，不自动导入证据或同步求职数据。`gy` 本身不假装调用 LLM，也不直接写简历、tracker 或个人材料；素材导入、简历定稿与渲染、简历事实链审计、岗位分析、防骗核查、公司机会管理、面试准备、面试复盘和能力反哺台账由用户确认或显式调用对应契约工具完成，实际任务由宿主 AI CLI 按 `AGENTS.md` 与对应 `modes/*.md` 继续。事实链对旧文件输出 `binding-gap`，对显式匹配的当前定稿输出 `ready` / `proven`，对显式过期绑定输出 `drifted`，全程零写入。`skill-runtime.mjs` v0.2 是封闭注册表、计划校验和窄口径契约 dispatcher：v1 计划只登记审批；v2 计划能执行全部 11 个注册契约工具，并记录目标前后指纹。

## 它解决什么问题

中国大学生求职的痛点：
- **信息过载** —— 秋招几万个岗位，不知道哪些值得投
- **不会评估** —— 海投海面，把时间浪费在不匹配/有风险的岗位上
- **简历没亮点** —— 不知道怎么把学生经历写出证据感
- **offer 不会比** —— 五险一金、户口、培养、加班，哪些更重要？
- **容易被骗** —— 培训贷、"包就业"、黑中介，学生是重灾区

## 核心能力

| 命令 | 作用 |
|------|------|
| `eval <JD/URL>` | 校招岗位全维度评估（A-G，1-5 分，含防骗核查） |
| `cv` | 生成中文学生简历（11 套 A4 版式） |
| `scan` | 扫描校招信息源（腾讯/阿里/美团校招官网，零 token） |
| `tracker` | 求职进度管理（网申→笔试→面试→offer→三方） |
| `compare` | offer 对比（总包/到手/户口/培养/加班） |
| `prep` | 校招面试准备（技术八股/群面/HR面） |
| `gap` | 能力差距分析（对照目标岗位出学习计划） |
| `scam-check` | 防诈骗核查（培训贷/黑中介/包就业） |
| `contract` | 三方协议/劳动合同解读 |
| `outcome` | 记录结果（offer/拒信，沉淀经验） |

## 高级命令入口

```bash
# 1. 安装依赖
npm install

# 2. 检查就绪状态（会引导你设置简历/档案/目标公司）
node doctor.mjs

# 3. 在你的 AI CLI 里打开（Claude Code / Qwen / Kimi / DeepSeek / Codex 均可）
claude   # 或 codex / qwen / kimi
```

首次启动会引导你完成：简历（cv.md）、个人档案（profile.yml）、目标公司（portals.yml）。

## 工作原理

```
粘贴岗位 URL / JD
        │
        ▼
┌──────────────────┐
│ 岗位方向识别      │  技术(后端/前端/算法…) / 非技术(产品/运营…)
└────────┬─────────┘
         ▼
┌──────────────────┐
│ A-G 评估          │  匹配度·方向·平台培养·待遇·城市户口·红线·真实性
│ (读取 cv.md)      │  G 真实性独立：🔴 一票否决（防骗）
└────────┬─────────┘
        ▼
   岗位分析 JSON + 本地报告；tracker 登记必须后续显式确认
```

## 技术架构

- **本地优先**：一切在你机器上，数据不上云
- **AI 无关**：逻辑在 `modes/*.md` 模式文件里，任何 AI CLI 都能跑
- **人在环中**：AI 评估起草，你决定点击；AI 永不自动提交
- **文件即真相**：Markdown 数据文件是唯一权威
- **零 token 扫描**：校招官网公共 API 直接抓取，不消耗 LLM
- **免费可跑**：DeepSeek/Qwen/Kimi 免费档或本地 Ollama

## 项目结构

```
get-yourself-cli/
├── gy.mjs                 # Agent 统一入口与只读状态检查
├── evidence-package.mjs   # 能力证据包校验与显式导入
├── resume-materials.mjs   # 简历素材包与 STAR 故事库
├── resume-final.mjs       # cv.md 定稿审批
├── resume-render.mjs      # 11 套结构化简历 HTML 模板渲染
├── resume-fact-chain.mjs  # 简历事实链只读审计
├── job-analysis.mjs       # JD 拆解、证据匹配与本地报告
├── scam-check.mjs         # 校招防骗核查与风险报告
├── interview-prep.mjs     # 面试准备包与清单
├── interview-review.mjs   # 面试复盘包与会话记录
├── capability-feedback.mjs # 复盘候选到本地能力台账的反哺
├── skill-runtime.mjs      # 封闭 skill 注册表、审批记录与全量契约 dispatcher
├── lib/intent-router.mjs  # 确定性意图路由
├── AGENTS.md              # AI 指令（规范来源）
├── CLAUDE.md / QWEN.md / KIMI.md / CODEX.md   # 各 CLI 入口
├── modes/                 # 模式文件（AI 的"大脑"）
│   ├── _shared.md         # 领域模型 + 评分系统
│   ├── eval.md            # 岗位评估
│   ├── cv.md / scan.md / tracker.md / compare.md
│   ├── prep.md / gap.md / scam-check.md / contract.md / outcome.md
├── providers/             # 校招信息源模块（腾讯/阿里/美团）
├── templates/             # 简历 HTML 模板、状态机、配置模板
├── scripts/ + *.mjs       # 工具脚本（doctor/tracker/merge/scan...）
├── tests/                 # 测试
└── data/                  # 用户数据（求职进度/报告，gitignored）
```

## 与 career-ops 的关系

- **架构哲学移植**（本地优先/AI 无关/人在环中/系统用户分层/文件即真相）
- **产品完全重做**（领域模型、评分维度、数据文件面向中国校招）
- 不搬社招死代码（谈判/职级/LinkedIn/ATS/外企平台）
- 中国校招专属：应届生身份、三方协议、五险一金、秋招春招、防骗红线

## 免责声明

本地开源工具，非托管服务。数据留在你的机器上。AI 评估只是建议不是真相。请遵守招聘平台服务条款，不要海投垃圾申请。使用本工具前务必自行核实 AI 生成内容。

## License

MIT
