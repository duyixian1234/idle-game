# 01 - 引擎数学改造：多项式买入 + 升级温和化

**Status:** resolved
**Type:** task
**Blocked by:** —

## 任务

- `src/engine/data.ts`：7 个普通建筑（miner/solar/lab/refinery/deepDrill/barracks/militaryPort）`costGrowth` 字段 → `costExponent k`（初值按现有 growth 映射 k=log₂(growth) 占位：miner 0.2 / solar 0.24 / lab 0.26 / refinery 0.32 / deepDrill 0.38 / barracks 0.32 / militaryPort 0.38；**最终值由 ticket 03 sim 反推回填**）
- `src/engine/engine.ts` `buildingCost`（101-121）：普通分支 `factor = Math.pow(count+1, k)` 替换 `Math.pow(def.costGrowth, count)`；unique 分支不动；保留 `Math.max(1, Math.floor(...))`
- `src/engine/engine.ts` `ordinaryUpgradeCostValue`（123-132）+ `upgradeCost`（135-155）：删除 early/late 分档连乘（`ordinaryUpgradeCostGrowth` 调用与循环），升级成本 = `buyCost × mult × (1 + c×level)`，c 初值 0.15 占位（**最终值由 ticket 03 sim 校准回填**）；`mult = UPGRADE_PREMIUM × LEVEL_PRODUCTION_BONUS × count` 结构保留；保留 `Math.max(1, Math.ceil(...))`
- `src/engine/balance.ts`：删除 `ORDINARY_UPGRADE_COST_GROWTH`（44-53）与 `ordinaryUpgradeCostGrowth`（71-75）；新增 `ORDINARY_UPGRADE_LEVEL_GROWTH` 常量（升级温和系数，初值 0.15）；**修正第 23 行注释**——升级成本实际公式（buyCost × P × 0.5 × count × (1+c×level)，无 ÷levelMultiplier），消除文档漂移
- 检查 `data.ts` BuildingDef 类型定义（costGrowth 字段重命名波及）

## 验收

- `buildingCost`：count=0 时 = baseCost；100 台量级成本相对旧公式下降 ≥9 个数量级（深钻：旧 ≈1.17e15 → 新 ≈10⁶ 量级）
- `upgradeCost`：无 growth^level 连乘残留；level 增大成本温和增长（×count 保留）
- balance.ts 注释与实现一致；全仓 tsc 零错误；引擎相关单测通过（旧断言期望值待 ticket 04 更新，本 ticket 允许已知失败清单化）

## Answer

已实现：data.ts 7 建筑 costGrowth → costExponent（**终值 k 由 ticket 03 sim 反推回填**：miner 0.460 / solar 0.555 / lab 0.615 / refinery 0.690 / deepDrill 0.810 / barracks 0.690 / militaryPort 0.810；unique 大件保留 costExponent=2 占位不读）；engine.ts buildingCost = floor(base × (count+1)^k)（unique 分支不动）；upgradeCost 去 growth^level 连乘改 = buyCost × count × (1 + 0.15×level)；balance.ts 删 ORDINARY_UPGRADE_COST_GROWTH/ordinaryUpgradeCostGrowth、新增 ORDINARY_UPGRADE_LEVEL_GROWTH=0.15、修正第 23 行注释契约漂移。全仓 vitest 657 全绿。
