# 02 - post100 单元测试（12 项）

**Status:** resolved
**Type:** task
**Blocked by:** 01

## 任务

新增 `src/engine/post100-cost-curve.test.ts`，覆盖 spec 测试计划：

1. **≤100 台不变**：count=100 高产出态买入价 = 静态价（动态下限不介入）；count=50 与旧公式一致。
2. **>100 台动态下限**：count=101 高产出态 ≥ 3×netProd×1.05；count=150 精确匹配 postFactor=1.05^50；
   count=200 远大于静态曲线。
3. **低产出态回退静态**：solar（成本 mineral、产出 energy）→ netProd.mineral=0 → 回退静态 ×1.05。
4. **升级继承**：count=101 高产出态升级价 = 买入价 × count × (1+0.15×level)；count=200 升级价远大于 count=101。
5. **unique 回归**：6 个大件不受影响。
6. **单调性**：count 0→200 买入价单调不降；100→101 高产出态显著跳跃。

## 验收

- `pnpm vitest run src/engine/post100-cost-curve.test.ts` 12/12 绿。
- 全仓 vitest 无回归。

## Answer

12/12 绿。测试修正 1 处：原「低产出回退静态」用 101 台 miner 假设 netProd 很小，实测 101 台矿工产出
101 矿/s → dynamicFloor=303 > 静态 83，动态下限反而生效（行为正确）；改用 solar（产 energy 不产 mineral）
验证 mineral 动态下限=0 回退静态。全仓 727 项绿。
