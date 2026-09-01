# 模式: outcome —— 记录结果

记录求职结果（offer/拒信/放弃）并归档相关文件。

## 触发

用户说"我拿到 offer 了"/"被拒了"/"放弃这家"等。

## 执行

### 1. 确认结果

- 类型：offer / rejected / discarded / hired（入职）/ signed（签三方）
- 公司 + 岗位（对应用户层 tracker 行）

### 2. 更新 tracker

```bash
node set-status.mjs <报告#|公司> <状态> [--note "备注"] [--force]
```

状态映射：
- 收到 offer → `offer`
- 签三方 → `signed`
- 入职 → `hired`（恭喜！🎉）
- 被拒 → `rejected`（备注可写原因：简历挂/笔试挂/面试挂/无反馈）
- 放弃/岗位关闭 → `discarded`

### 3. 沉淀（每次结果都是数据）

- **被拒：** 记到 `data/outcomes.md` 或 tracker 备注（哪轮挂的、有无反馈），供 `patterns` 模式分析
- **offer：** 更新 `data/offers.md` 对比表（如果用户继续比 offer）
- **面试复盘：** 提示用户是否要记录到 `interview-prep/sessions/`

### 4. 情绪支持（重要）

- 被拒 → 正常化：校招被拒是常态，不是个人失败。问是否要看系统里"评估时预估的匹配度"对照，判断是运气还是方向问题
- 拿 offer → 先恭喜再问下一步（要不要 compare / 签不签）

## 规则

- 记录是用户决定的，不自动写入任何东西
- 被拒原因如果公司没明说，标注"未提供反馈"，不猜
- `hired` 是终态，确认后建议把系统收尾（清理 pipeline、归档）
