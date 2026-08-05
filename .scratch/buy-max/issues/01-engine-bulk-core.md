# 01 — 引擎批量核心（建筑/升级/科技买满）

**What to build:** 新增 `src/engine/bulk.ts`，提供三个批量执行动作：`buyBuildingMax(state, id)`（循环 `buyBuilding` 直到任一资源不足，每迭代重算 `buildingCost`）、`upgradeBuildingMax(state, id)`（循环 `upgradeBuilding`，每迭代重算 `upgradeCost`）、`upgradeTechMax(state, id)`（循环 `upgradeTech`，Lv10 封顶，每迭代重算 `techCost`）。返回 `ActionResult & BulkBuyResult`（`ok/reason` + `count/spent/remaining/stoppedReason/targetLevel`）。复用现有 `canAfford*` 校验与 cost 函数，不引入闭式公式。单次购买/升级行为与现有 action 完全等价（批量 = 逐次调用的聚合）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] `src/engine/bulk.ts`：`BulkBuyResult` 类型（count / spent / remaining / stoppedReason: 'resource'|'maxLevel'|'notUnlocked' / targetLevel?）
- [ ] `buyBuildingMax`：正常买满、单资源不足停、多资源（lab/refinery/deepDrill 含 ⚡）以瓶颈资源停、`notUnlocked` 拒绝（count=0, ok=false）
- [ ] `upgradeBuildingMax`：升到买不动；目标未建时拒绝
- [ ] `upgradeTechMax`：Lv10 停（stoppedReason='maxLevel'）；资源不足停；Lv0 拒绝（需先研发，ok=false）
- [ ] 循环不变量：`spent[res] = ∑各步成本`，`remaining[res] = 初始 − spent[res] ≥ 0`；返回的 state 与逐次手动调用结果一致
- [ ] 引擎单测覆盖上述全部路径（`src/engine/bulk.test.ts`），现有测试不破
