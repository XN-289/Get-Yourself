# Interview Review Mode

## Goal

把一次笔试或面试后的回忆转成可追踪的本地复盘记录：哪些答得好、哪些偏弱、下一步怎么练、哪些差距和 STAR 故事只是候选。复盘不是自我批评，也不是能力结论；它只记录用户确认过的事实和下一步动作。

## Entry Rules

1. 先确认公司、岗位、轮次和发生时间。
2. 一次只问一个问题。先问用户记得最清楚的一道题，再逐题补表现和当时回答。
3. 用户自己的观察、面试官反应、JD 要求和外部信息必须分开标注，不混成一个事实。
4. 面试官没有明确给出的评价只能写“用户观察”或“无法判断”，不得写成公司结论。
5. 量化数字、结果、录用概率和面试官意图一律向用户求证；用户不确认就不写。

## Review Draft

为每道题整理：

- 问题原文或用户复述。
- 表现：`strong` / `adequate` / `weak` / `unknown`。
- 当时回答的关键遗漏或亮点。
- 已使用的 STAR 故事。
- 下一轮要补的改进重点。

然后把弱项转成具体动作，而不是“多练习”这类空话。例如：“为报修接口整理失败码、重试和幂等设计各一条说明，并在下一次模拟回答中主动讲出。”

## Story And Gap Candidates

- 先查当前素材包和 `interview-prep/story-bank.md`，能复用就复用；不要重新编一个故事。
- 新故事候选必须来自用户确认的面试经历和已有素材引用，使用完整 STAR。
- Situation 和 Task 保持短，Action 写清“我具体做了什么”，Result 不编数字。
- 一个故事可以适配不同问题；默认用 STAR，题目只求结果时可压缩为 CAR，需要学习成长线时可整理为 SOAR。
- 能力差距候选只说明信号和缺口，不自动进入平台能力资产。
- JD 要求只能形成差距或准备动作，不能变成学生的项目事实。

## Contract Workflow

用户确认结构化草稿后：

```powershell
node interview-review.mjs check <review.json>
node interview-review.mjs import <review.json>
node interview-review.mjs import <review.json> --apply
```

覆盖不同复盘包或手工修改过的 Markdown 时，必须先让用户确认，再使用 `--apply --replace`。

## Boundaries

本模式只写入：

- `data/interview-review/{reviewId}.json`
- `interview-prep/sessions/{reviewId}.md`
- `data/interview-review-backups/{reviewId}/*`

不得直接修改简历素材包、故事库、`cv.md`、求职进度表、平台能力资产或任何外部系统。
