# 04 - 单元测试：新曲线性质锁定

**Status:** pending
**Type:** task
**Blocked by:** 01, 03

## 任务

- 更新现有断言（`engine.test.ts` 等锁定旧几何公式的期望值 → 新多项式/温和升级公式期望；预期改动集中在 buildingCost/upgradeCost 用例）
- 新增性质测试（放 `src/engine/cost-softcap.test.ts`）：
  - 买入：count=0 → baseCost；cost 随 count 单调递增；`Math.max(1, Math.floor)` 保留（base 小于 1 不归零）
  - 多项式性质：增长率随 count 递减（软上限本质）；100 台成本相对旧公式下降 ≥9 个数量级（用 deepDrill k=0.38 档验证量级）
  - 升级：无 growth^level 残留（level 100 时成本不爆炸）；×count 因子保留（count 翻倍升级成本近似翻倍）；ceil 保留
  - unique 分支回归：5 大件 + dock 成本公式不受影响（baseCost×2^level 原样）
  - format：相对时间瓶颈口径（多资源取 max；净产 0 跳过；s/分/时单位切换）
- 全仓 vitest 绿（不含已知上游 dom.test 基线失败，若有则记录清单）

## 验收

- `pnpm vitest run` 新增用例全绿；旧断言更新无遗漏（grep 旧公式期望值确认清空）
- 覆盖 Q5 多项式 + Q9 温和升级 + Q10 瓶颈口径三个核心数学决策

## Answer

已完成：更新旧几何公式断言（engine/bulk/actions/dom/interstellar.test.ts 11 处按终值 k 重算期望）+ 新增 `src/engine/cost-softcap.test.ts`（14 用例：买入多项式性质/增长率递减/100 台死区消失/升级温和增长/×count/unique 回归/timeToSave 瓶颈口径/格式切换）。全仓 vitest 671 全绿 + tsc 零错误。
