# Ticket 03 — 探索槽位 20 + 能源减耗

**Status:** resolved

## What it delivers

虫洞等级驱动探索槽位扩到 20（每级 +1，与枢纽槽位表并列叠加）与探索能源消耗 −50%（每级 −5%，仅基础派遣能源）。探索页槽位上限与锁提示更新。

## Tasks

1. `exploration.ts`：
   - 新增 `WORMHOLE_SLOT_TABLE`（1:1 … 10:10）。
   - `explorationSlots` → `min(20, 5 + 枢纽槽 + 虫洞槽)`；无虫洞时与现状逐字节一致。
   - 新增 `wormholeLevelForSlot(slotNo)`（第 11-20 槽）。
   - 新增 `wormholeEnergyReduction(state)`（0.05 × 等级，Lv10 = 0.5）。
   - `expeditionCost`：energy 分支 × (1 − reduction)，floor+max(1) 保底；军事点/矿物不动。
2. `ui/explore-page.ts`：`SLOT_CAP` 10 → 20；第 6-10 槽锁提示「跃迁枢纽 LvX」、第 11-20 槽「虫洞 LvX」。
3. 测试：`exploration.test.ts` 槽位（无虫洞=现状基线 / Lv1=11 / Lv10=20）、能源减耗（Lv5 −25% / Lv10 −50% / 无虫洞不变）、`wormholeLevelForSlot`、`dom` 探索页锁提示（如有相应测试文件）。

## Done when

- 无虫洞时槽位/成本与现状逐字节一致；虫洞 Lv10 → 20 槽、能源 −50%；自动探索随槽位扩大。

## Note

- 自动探索（autoExploreDispatch / settleOfflineAutoExplore）读 explorationSlots 自动跟随，零改动，但需在 exploration.test 补回归断言（Lv10 自动派满 20 槽）。
