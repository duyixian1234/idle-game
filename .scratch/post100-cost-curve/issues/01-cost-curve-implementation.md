# 01 - 非唯一建筑 100 台后置成本曲线实现（balance.ts + engine.ts）

**Status:** resolved
**Type:** task

## 任务

实现 spec 定稿的后置成本曲线：

1. `src/engine/balance.ts` 新增 3 常量：`POST100_THRESHOLD=100` / `POST100_GROWTH=1.05` / `POST100_BUY_TARGET_SECONDS=3`（经济核心区）。
2. `src/engine/engine.ts` `buildingCost` 非唯一分支：`excess = max(0, count - 100)`；`excess>0` 时
   `buyCost = max(staticCost, dynamicFloor) × POST100_GROWTH^excess`，其中
   `dynamicFloor = floor(3 × netProduction(state)[key])`，产出 ≤0 的资源跳过（回退静态）。
3. `upgradeCost` 零改动——内部调用 `buildingCost` 自动继承（spec 决策 4 保结构）。
4. ≤100 台完全不变（postFactor=1、dynamicFloor 不介入）。

## 验收

- `pnpm tsc --noEmit` 零错误；`pnpm build` 通过。
- cost-softcap 现有 14 项断言全绿（≤100 台曲线未破坏）。
- 零存档迁移；unique 大件/舰队/科技曲线零改动。

## Answer

已实现（见 post100-cost-curve 提交）。校验口径实测：100 台买入 = 静态价（83 矿）；101 台跳变到 ≥3s 产出；
150 台 34.4s；200 台 394.5s。upgradeCost 通过 buyCost 自动继承。
