# 03 — 测试重写 + ROI≡P 不变量锁定

**What to build:** 重写受新升级公式影响的测试断言（engine/bulk/dom），新增 ROI≡P 不变量专项测试与批量升满路径回归。buy-max 的「升满」循环复用新公式，需同步重算批量循环的预期结果。

**Blocked by:** 02

**Status:** pending

## Acceptance Criteria

- [ ] engine.test.ts「升级成本随等级增长」用例重写：删除 `c1 === floor(c0×1.6)`，改为断言新公式精确值
- [ ] 新增「ROI≡P 不变量」describe：多组 (count, level)（Lv.0/1/11/20 × count 1/10/100 矩阵）断言 `upCost/(0.5×count×base) ÷ buyCost/((1+0.5L)×base) ≈ P=2`（±1e-9 容差）
- [ ] bulk.test.ts「升满」路径：升级循环在新公式下的 count/spent/targetLevel 断言更新（成本下降后循环次数变多的用例存在性检查）
- [ ] dom.test.ts 若有 upgradeCost 渲染断言则更新
- [ ] 全量 251 vitest + 16 E2E + typecheck clean 全绿

## Answer

待实现。
