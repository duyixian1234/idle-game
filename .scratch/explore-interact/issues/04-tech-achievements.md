# 04 — 科技与成就（2 项探索科技 + 探索收获倍率 + 2 新成就 + 群星尽览口径）

**What to build:**
- `data.ts` `TECHS` 新增 2 项（`TechDef.effect` 联合类型扩 `{ kind: 'exploration' }`）：
  - `deepSpaceNav` 深空导航阵列：cost `{ mineral: 50_000, tech: 5_000 }`，maxLevel 5——Lv≥1 解锁 2 槽（01 的 `explorationSlots` 消费）。
  - `interstellarRelay` 星际通信中继：cost `{ mineral: 200_000, tech: 20_000 }`，maxLevel 5——Lv≥1 解锁 3 槽。
- `exploration.ts`：`explorationHarvestMult(state) = 1 + 0.1 × (deepSpaceNavLv + interstellarRelayLv)`（新增 `EXPLORATION_TECH_HARVEST_PCT = 0.1`；满级两项 = ×2.0）——只作用于 resource 分支补偿入账（mineral/energy/tech × mult），不作用于 faction/planet 分支、不作用于天体产出、不碰 60min 锚点。
- `achievements.ts` 新增 2 个（collect 类、recurring 周目重解锁、小额 rewardMineral）：
  - `explorerDual`「双线作战」：`(techLevels.deepSpaceNav ?? 0) >= 1`，rep 2。
  - `explorerTriple`「多路并进」：`(techLevels.interstellarRelay ?? 0) >= 1`，rep 3。
  - `explorerComplete`「群星尽览」condition 口径扩展：`exploredFactions` 覆盖 `EXPLORE_FACTIONS`（4）&& `exploredPlanets` 覆盖 `EXPLORE_PLANETS`（5）。

**Blocked by:** 01（槽位判定消费 explorationSlots）、02（群星尽览口径含 5 天体）

**Status:** resolved

- [x] `data.ts`：2 项探索科技 def + effect 类型扩展
- [x] `exploration.ts`：`explorationHarvestMult` 接入 resource 分支
- [x] `achievements.ts`：2 新成就 + 群星尽览口径
- [x] `balance.ts`：`EXPLORATION_TECH_HARVEST_PCT`
- [x] 测试：科技 Lv1 解锁槽位（与 01 联动断言）、收获倍率（resource ×1.1/满级 ×2.0、faction/planet 分支不受影响）、成就 condition（科技升级达成、recurring）、群星尽览在 5 天体全发现后达成

**Acceptance:** 2 项探索科技可研发（成本/等级/效果正确）；resource 分支收获随科技等级 ×1.0~×2.0；2 新成就解锁；群星尽览口径 = 4 势力 + 5 天体。
