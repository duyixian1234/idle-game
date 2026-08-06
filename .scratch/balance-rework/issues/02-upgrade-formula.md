# 02 — 建筑升级公式重构（产出等价折算，P=2）

**What to build:** 修改 `engine.ts` 的 `upgradeCost(state, id)`：从 `buyCost × (upgradeCostMult ?? 4) × 1.6^level` 改为 `buyCost × UPGRADE_PREMIUM × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)`（floor，至少 1）。删除 `BuildingDef.upgradeCostMult` 字段（data.ts 7 处）。`levelMultiplier` 复用 production.ts 既有实现，`UPGRADE_PREMIUM` 从 balance.ts 导入。

**Blocked by:** 01

**Status:** pending

## Acceptance Criteria

- [ ] `upgradeCost(state, id)` 新公式：`Math.max(1, floor(buyCost[k] × P × 0.5 × count / levelMultiplier(level)))`，count = `state.buildings[id]`，level = `state.upgrades[id]`
- [ ] `BuildingDef.upgradeCostMult` 字段从 interface 与 7 处建筑定义删除，无残留引用
- [ ] 公式性质验证（脚本或测试）：截图态 5 建筑新成本 = 采矿机 1.8亿 / 太阳能 1.2亿 / 实验室 1.3亿+2,220万⚡ / 精炼厂 1.6亿+2,590万⚡ / 深层钻机 1.7亿+817万⚡
- [ ] ROI 恒等式实证：任意 (count, level) 下 `upCost/(0.5×count×base) ÷ buyCost/((1+0.5L)×base) ≈ P`（浮点容差）
- [ ] 现有依赖 upgradeCost 的引擎测试断言按新公式更新（engine.test.ts 的「升级成本随等级增长」用例删除 ×1.6 断言，改为新公式断言）

## Answer

待实现。
