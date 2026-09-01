# 模式: cv —— 证据驱动的简历整理

把学生口述经历、平台能力证据或既有简历内容整理成可追溯的简历条目。事实来自用户和证据，措辞可以优化，事实不得编造。

## 输入

- 用户粘贴或口述的实习、项目、竞赛、学生工作经历
- `cv.md`（既有权威简历事实）
- `config/profile.yml` 与 `modes/_profile.md`（方向、偏好、叙事）
- `data/evidence-package.json`（如已导入，先按契约确认其版本和验证状态）
- `data/resume-materials.json`（如已导入，读取用户确认过的候选素材；它不是简历定稿）

## 工作流

1. **抽取事实**：识别时间、组织、角色、任务、动作、结果、协作对象和可验证证据。
2. **追问缺口**：缺少时间、结果或归属时先追问；用户不补充就保留缺口，不生成看似完整的表述。
3. **生成条目候选**：每段经历输出一至两条适合简历的 bullet，优先动作、方法和结果。
4. **标注证据状态**：`已验证` / `待确认` / `缺证据` / `外部信息`。
5. **生成素材包候选**：按 `docs/RESUME_MATERIALS_CONTRACT.md` 输出结构化 JSON 草稿，`confirmation=user_confirmed` 只能在用户确认后使用。
6. **等待确认并导入**：用户确认素材包后先执行 `node resume-materials.mjs import <draft.json>` dry-run，再经确认加 `--apply`；覆盖不同内容必须显式确认 `--replace`。
7. **生成定稿计划**：需要写入 `cv.md` 时，按 `docs/RESUME_FINAL_CONTRACT.md` 输出章节、条目引用和当前素材哈希，先执行 `node resume-final.mjs check <plan.json>`。
8. **修改定稿**：用户确认计划后先执行 `node resume-final.mjs apply <plan.json>` dry-run，再经确认加 `--apply`；覆盖不同计划或手工修改过的 `cv.md` 必须显式确认 `--replace`。
9. **导出**：生成或修改 HTML 后调用 `node generate-pdf.mjs <input.html> <output.pdf>`；覆盖已有 PDF 前必须确认。

## 输出结构

```markdown
# 简历条目候选

| 候选条目 | 来源 | 证据状态 | 待确认问题 |
|---|---|---|---|
| ... | 用户陈述 / cv.md / 能力证据包 | 已验证 / 待确认 / 缺证据 | ... |

## 建议写入位置
## 事实缺口与追问
## 可沉淀的 STAR 故事
```

## 规则

- 量化结果只能来自用户陈述、权威文件或已验证证据；不得推断百分比、金额和规模。
- 不把工具使用写成工具作者，不把团队结果写成个人结果。
- 不把 JD 或公司页面中的要求写成学生能力。
- 能力证据包摘要只能作为证据引用和追问线索；写入简历前仍需用户确认对应事实。
- `cv.md` 是简历定稿权威；草稿和候选条目不得绕过确认直接写入。
- `data/resume-materials.json` 是候选素材权威；`interview-prep/story-bank.md` 是它的派生故事库，不是定稿事实来源。
- `data/resume-final-plan.json` 只记录一次用户确认的章节选择；`cv.md` 仍是最终事实权威。
- JD 分析结果不能写成学生经历；外部要求只能转化为差距提示或待确认问题。
- 输出全中文，写入前必须获得用户确认。
