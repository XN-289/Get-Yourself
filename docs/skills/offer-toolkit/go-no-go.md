# Go / No-Go 规则 v1

来源：本地 offer-toolkit-skill（MIT，Copyright 2026 yanliudesign），已加入 Get Yourself 的显式导入边界。

## 推荐指数

```text
weighted = 0.30 * match quality
         + 0.25 * career trajectory
         + 0.20 * downside safety
         + 0.15 * compensation / terms fit
         + 0.10 * opportunity cost and timing
```

星级映射：

| 综合分 | 星级 |
|---|---|
| >= 85% | 5 |
| 70%-85% | 4 |
| 55%-70% | 3 |
| 40%-55% | 2 |
| < 40% | 1 |

5 星必须罕见。存在红线信号或用户声明的一票否决项时，推荐指数最高 2 星，报告必须显式说明。

## 信息不足

公司主体、薪资范围、地点/远程、签证、加班或政策信息缺失时，只能标“不足”，不得用公司名、行业印象或模型常识补齐。信息不足不自动改写事实，但必须进入下一步核实清单。

## 输出边界

- 分析只保存本地 JSON 与 Markdown。
- 不自动写入投递进度表。
- 不自动生成或修改简历素材、`cv.md`、能力资产或面试记录。
- 用户明确确认后的后续合同才能消费分析结果。
