# 03 — 引擎：探索声望加成（槽位 + 护航费折扣）

**What to build:** 声望阶梯表扩展两列探索加成（Q5-A 军事保持现状 + Q6-A/C，ADR-0063）：`ReputationBonuses` 接口与 `REPUTATION_TIERS`（src/engine/reputation.ts）增 `exploreSlotBonus`（80→+1、100→+2）与 `escortFeeDiscount`（80→0.05、100→0.10）两列，档位累积语义与现状一致（取当前声望命中的最高档）。消费侧：`explorationSlots`（src/engine/exploration.ts）公式由 `min(20, 5 + 枢纽 + 虫洞)` 改为 `min(20 + 声望槽, 5 + 枢纽 + 虫洞 + 声望槽)`——**上限同步 +2 → 22**（否则枢纽/虫洞终局皆满后声望项被 min 吞掉）；`escortFee` 折扣与 warpDrive 叠加 `× (1 − WARP_ESCORT_FEE_REDUCTION − escortFeeDiscount)`，clamp 下限 ≥ 0（满配 −10% −10% = −20%）。铁律保持：不触碰每秒产出系数（探索收获倍率 / 天体产出增益上限 / 护航收获倍率不动）。数值为实现期平衡模拟定标，非终值。

**Blocked by:** None — can start immediately

**Status:** pending

- [ ] `reputation.ts`：`ReputationBonuses` 接口 + `REPUTATION_TIERS` 增 exploreSlotBonus / escortFeeDiscount 两列（80/100 档）
- [ ] `exploration.ts` `explorationSlots`：加声望项，上限 20 同步 + 声望槽（80→+1、100→+2，满配 22）
- [ ] `exploration.ts` `escortFee`：折扣通道与 warpDrive 叠加，clamp ≥ 0
- [ ] `reputation.test.ts`：阶梯新列断言（80/100 档数值、累积语义）
- [ ] `exploration.test.ts`：槽位断言（无枢纽/虫洞时声望槽仍生效？——注意：声望槽独立于建筑等级，槽位计数直接 +N）；上限 22；护航费叠加（warpDrive≥20 + 满声望 = −20%）与 clamp（折扣不越界）
- [ ] `balance-simulation.test.ts`：护航吞吐定标断言（ADR-0063 数值验证）
- [ ] vitest 全绿 + typecheck clean

## Definition of Done
探索槽位与护航费正确响应声望阶梯；铁律（不碰每秒产出系数）无违反；数值经平衡模拟验证。
