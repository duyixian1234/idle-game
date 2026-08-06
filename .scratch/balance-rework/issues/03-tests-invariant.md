# 03 — 测试重写 + ROI≡P 不变量锁定

**What to build:** 重写受新升级公式影响的测试断言（engine/bulk/dom），新增 ROI≡P 不变量专项测试与批量升满路径回归。buy-max 的「升满」循环复用新公式，需同步重算批量循环的预期结果。

**Blocked by:** 02

**Status:** resolved

- [x] engine.test.ts「升级成本随等级增长」用例重写：删除 `c1 === floor(c0×1.6)`，改为断言新公式精确值 + ROI 恒等式
- [x] 「ROI≡P 不变量」describe：count 100/500 × Lv 0/11/20/50 矩阵，`upPerRate/buyPerRate ≈ 2`（toBeCloseTo 4 位小数 ≈ ±1e-4）
- [x] bulk.test.ts「升满」路径：升级循环在新公式下的 count/spent/targetLevel 断言更新
- [x] dom.test.ts 渲染断言已按新公式同步（升级按钮显示值随公式变化）
- [x] 全量 447 vitest + E2E + typecheck + build 全绿

## Answer

已实现（2026-08-06 定稿交付，随 explore-interact 之后回写状态）。
