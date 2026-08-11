# 无限科技 sink（产出线 + 吞吐线）

新增两条可无限升级科技线作为后期资源 sink：产出线"深空冶金"（每级 +2% 全产出，矿/能/科，军力不吃）与吞吐线"深空导航"（每级 +2% 护航吞吐，基于 ADR-0054 修复后的护航模型）。成本 base 1e9 矿物 + 2e8 科技 ×1.7^n，maxLevel 名义 100。不修改既有 11 条科技线。

**状态**: Accepted（2026-08-11 spec：无限科技 sink，issue #4 ticket 06）
**证据**: `src/engine/data.ts:590-620`（deepMetallurgy / deepNavigation 定义）；`src/engine/data.ts:300-330`（TechEffectProductionAll / TechEffectEscortThroughput）；`src/engine/tech.ts:26-35`（canTechUpgrade 新 effect kind）；`src/engine/production.ts:277-290`（productionMultipliers productionAll）；`src/engine/exploration.ts:237-241`（escortThroughputMult）；`src/engine/balance.ts:370-385`（INFINITE_TECH_* 常量）

## 背景

1. **后期存量资源无出口**：科技点/矿物在通关后无限积累，购买/升级失去决策意义。
2. **护航 ROI 修复降低后期单趟收益绝对量**（ADR-0054）：探索流玩家需要对应的成长出口补偿。

## 决策

1. **两条无限线**：产出线 `deepMetallurgy`（+2%/级全产出，军力不吃，对齐 smelterMult 口径）+ 吞吐线 `deepNavigation`（+2%/级护航吞吐，放大费用侧吞吐，ROI 恒常数）。
2. **成本曲线**：base `{ mineral: 1e9, tech: 2e8 }` × 1.7^Lv（复用 TECH_UPGRADE_GROWTH）；Lv40 成本 ≈ 9.7e17 矿（数百年产出 → 永远点不满，始终有目标）。
3. **maxLevel 名义 100**：1.7^n 曲线下实际点不满，名义封顶防 UI 溢出。
4. **不触碰既有科技线**：仅新增 2 条；现有 11 条科技、成就、解锁链零改动。
5. **通关后解锁**（afterEnding）：infinite 内容，playing 渲染锁定卡。

## 为什么

- 1.7^n 成本曲线让科技永远点不满，为存量资源提供永续出口；两条线的权衡（产出 vs 吞吐）保留决策。
- 吞吐线挂 ADR-0054 修复后的护航模型（费用侧杠杆），不引入新的 ROI 膨胀。

## 后果

- **UI**：科技面板渲染两条新线（effect 文案：全产出 × / 护航吞吐 ×）。
- **测试**：tech.test 新增成本曲线/maxLevel/效果断言；balance-sim 三档基准断言 Lv40 成本 vs 存量增速。
- **平衡**：+2%/级在 Lv100 = ×3，但成本随 1.7^n 爆炸——正常玩法只能点到个位数等级，收益有界。
