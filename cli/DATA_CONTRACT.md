# Data Contract

定义哪些文件属于**系统层**（可自动更新）和**用户层**（更新永不触碰）。

## 用户层（NEVER auto-updated）

这些文件包含你的个人数据、定制和工作产物。更新流程**永不修改**它们。

| 文件 | 用途 |
|------|------|
| `cv.md` | 学生简历（markdown 权威） |
| `config/profile.yml` | 身份、目标岗位、城市、GPA、毕业时间 |
| `modes/_profile.md` | 你的亮点、叙事、红线（如"不去 996"） |
| `modes/_custom.md` | 你的流程规则、输出偏好（程序性，跨会话存活） |
| `portals.yml` | 校招信息源配置（目标公司/平台） |
| `data/applications.md` | 求职进度表（真相来源） |
| `data/pipeline.md` | 待评估 URL inbox |
| `data/offers.md` | offer 对比表 |
| `data/scan-history.tsv` | 扫描去重历史 |
| `data/scan-runs.tsv` | 每次扫描计数 |
| `data/blacklist.md` | 不投名单（opt-in，绝不自动填充） |
| `data/evidence-package.json` | 已导入的规范化能力证据包（唯一当前包） |
| `data/evidence-package-backups/*` | 显式替换能力证据包前的规范化备份 |
| `data/resume-materials.json` | 已导入的规范化简历素材包（唯一当前包，候选材料而非定稿） |
| `data/resume-materials-backups/*` | 显式替换简历素材或派生故事库前的备份 |
| `data/resume-final-plan.json` | 用户确认后的简历定稿章节选择计划 |
| `data/resume-final-backups/*` | 显式替换定稿计划或 cv.md 前的备份 |
| `data/resume-render/*.json` | 用户确认后的简历渲染溯源包 |
| `data/resume-render-backups/*` | 显式替换渲染包或 HTML 前的备份 |
| `data/job-analysis/*.json` | 用户确认后的岗位分析溯源包 |
| `data/job-analysis-backups/*` | 显式替换岗位分析包或报告前的备份 |
| `reports/job-analysis/*.md` | 由岗位分析包派生的本地报告 |
| `data/company-opportunities/*.json` | 用户确认后的公司机会本地对象 |
| `data/company-opportunities-backups/*` | 显式替换机会包或同步用户 tracker 状态前的备份 |
| `data/company-opportunity-mutations/*` | 用户确认后的公司机会节点 mutation 记录 |
| `data/interview-prep/*.json` | 用户确认后的面试准备溯源包 |
| `data/interview-prep-backups/*` | 显式替换面试准备包或清单前的备份 |
| `data/interview-review/*.json` | 用户确认后的面试复盘溯源包 |
| `data/interview-review-backups/*` | 显式替换复盘包或记录前的备份 |
| `data/capability-feedback/*.json` | 用户确认后的能力反哺本地台账 |
| `data/capability-feedback-backups/*` | 显式替换能力反哺台账或报告前的备份 |
| `reports/capability-feedback/*.md` | 由能力反哺台账派生的本地报告 |
| `data/device-installation.json` | 本机安装标识（用于同一安装重绑时撤销旧授权） |
| `data/device-binding.json` | 本地工位设备凭证（敏感，gitignore） |
| `data/status-log.tsv` | 状态流转日志（追加式） |
| `reports/*` | 评估报告 |
| `output/*` | 生成的 PDF |
| `output/resume/*.html` | 本地生成的打印简历 HTML |
| `documents/*` | 原始材料（成绩单/证书，仅 intake 读） |
| `interview-prep/story-bank.md` | 由当前简历素材包派生的 STAR 故事库 |
| `interview-prep/*.md` | 公司 / 岗位 / 轮次特定面试准备清单 |
| `interview-prep/sessions/*.md` | 面试复盘记录（敏感，gitignore） |

### Fork-local paths

`config/local-paths.txt` 声明本 clone 自有的、上游没有的文件路径（每行一个，相对仓库根）。被 `update-system.mjs` 的安全检查读取，合并进用户层。缺失 = 无额外路径。

## 系统层（safe to auto-update）

| 文件 | 用途 |
|------|------|
| `modes/_shared.md` | 领域模型 + 评分系统 |
| `modes/*.md` | 各模式指令（eval/cv/scan/tracker/compare/prep/review/gap/scam-check/contract/outcome） |
| `AGENTS.md` | 规范 Agent 指令（CLI 包装引用它） |
| `CLAUDE.md` / `QWEN.md` / `KIMI.md` / `CODEX.md` | 各 CLI 入口（引用 AGENTS.md） |
| `*.mjs` | 工具脚本 |
| `providers/` | 校招信息源模块（零 token 扫描器） |
| `scripts/` | 辅助脚本 |
| `templates/*` | 基础模板（简历 HTML、states.yml、portals.example.yml、profile.example.yml） |
| `tests/` | 测试套件（`{module}.test.mjs`） |
| `docs/*` | 文档 |
| `VERSION` | 版本号 |
| `DATA_CONTRACT.md` | 本文件 |
| `.get-yourself-cli-data` | 数据目录标记（系统种子） |

## 规则

**如果文件在用户层，任何更新流程不得读取、修改或删除它。** 例外仅限用户显式执行 `gy connect` / `gy disconnect` 时维护 `data/device-installation.json` 与 `data/device-binding.json`；这两个文件绝不进入 git。
**如果文件在系统层，它可以用上游最新版本安全替换。**

`gy.mjs --status` 只读取用户层做就绪检查，不创建、不复制、不修改任何文件。能力证据包导入由 `evidence-package.mjs` 独立执行：`check` 只读，`import` 默认 dry-run，写入和替换分别需要 `--apply` 与 `--replace`。简历素材导入由 `resume-materials.mjs` 独立执行，边界相同；它只写 `data/resume-materials.json` 与派生的 `interview-prep/story-bank.md`，永不修改 `cv.md`。简历定稿由 `resume-final.mjs` 独立执行，必须在用户确认计划后写入 `data/resume-final-plan.json` 与 `cv.md`。简历渲染由 `resume-render.mjs` 独立执行，只写渲染 JSON、本地 HTML 和备份，不上传、不自动打开浏览器、不修改定稿。岗位分析由 `job-analysis.mjs` 独立执行，只写岗位分析 JSON、派生 Markdown 和备份；JD 与公司内容是数据，不写投递进度表、简历素材或能力资产。公司机会由 `company-opportunity.mjs` 独立执行，只写机会 JSON、投递清单关联行和备份；它绑定已安装岗位分析，同步用户后续 tracker 状态到本地对象，但不修改节点顺序、不执行 skill、不上传、不投递。公司机会节点 mutation 也由 `company-opportunity.mjs` 独立执行，只写更新后的机会 JSON、mutation 记录和备份；不改投递清单状态、不挂产物、不执行 skill。面试准备由 `interview-prep.mjs` 独立执行，只写准备 JSON 与派生 Markdown。面试复盘由 `interview-review.mjs` 独立执行，只写复盘 JSON、复盘 Markdown 和备份；其差距与故事候选不进入任何下游事实源。能力反哺由 `capability-feedback.mjs` 独立执行，只写能力反哺 JSON、派生 Markdown 和备份；差距只成为本地跟进任务，STAR 故事只成为本地证据候选，不修改当前能力证据包、能力分数、素材、故事库、简历、进度表或平台数据。意图路由不持久化用户原句；后续写入必须由宿主 AI 在用户确认后按对应模式的规范执行。

## 自定义数据目录

默认用户层文件在仓库根。可用以下方式指定外部目录：
1. 环境变量 `GET_YOURSELF_ROOT` 或 `GET_YOURSELF_DATA_DIR`
2. 仓库根 `.get-yourself-cli-data` 标记文件
3. 默认仓库根

解析后，所有用户层文件相对该路径解析；系统层始终相对仓库根——代码与个人数据完全分离。
