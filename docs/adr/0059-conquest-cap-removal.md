# 移除军事目标一次性奖励/成本封顶（conquest-cap-removal）

移除 `f0c6c3b`（2026-08-11，ADR-0028 未决项落地）为程序生成军事目标引入的固定一次性奖励/成本封顶（`GEN_CONQUEST_*_CAP × 1.5^ng`），恢复"奖励/成本随当期净产出同源缩放、无一次性封顶"；对存量撞 cap 目标在加载时惰性重滚。

**状态**: Accepted（2026-08-12 grill：军事目标 ROI 崩塌根因）
**证据**: `src/engine/balance.ts:312-326`（删除 GEN_CONQUEST_*_CAP，秒数常量保留）；`src/engine/generate.ts:127-192`（generateConquestTarget 无 cap + matchesStaleConquestCap + refreshCappedConquestTargets）；`src/engine/save.ts:613-620`（migrateSave 加载时重滚）；`src/engine/balance-simulation.test.ts:268-287`（高产出档无 cap 断言）；`src/engine/endless-expansion.test.ts:132-166`（重滚契约）；`src/engine/save.test.ts:519-540`（加载重滚集成）

## 背景

1. **实测回归**（存档 idle-save-2026-08-12，NG+3/infinite/layer5，产出 e11/s 量级）：cap 引入后生成的新目标（gen:conquest:314+）4 项数值全部精确等于 cap 公式值（rewardMineral = `⌊150000×1.5³⌋` = 506,250 / rewardTech = 33,750 / costMineral = `⌊75000×1.5³⌋×0.5` = 126,562 / costEnergy = 50,625）——**全部撞 cap**；而探索返航补偿 623 兆矿（e14）、Boss 156 兆矿（无 cap）正常。
2. **失衡机制**：守卫锚军力容量/3（无 cap，随玩家军力涨到 12.6 万），奖励/成本锚当期产出但被固定 cap 压死 → 守卫越打越强、奖励恒 ≈50 万矿 → 投入 12.6 万兵力 + 10-30 分钟回报 ≈ 玩家 0.2ms 产出（ROI 崩塌，比探索返航低约 70 万倍）。
3. **测试盲区**：balance-sim 高产出档只测到 prod = 1e6/s（`prodState(1_000_000)`），落后玩家实际产出 5 个数量级，未覆盖撞 cap 区间。

## 决策

1. **移除 cap**（与 Boss `endlessBossReward`、旧目标、探索返航同构）：`rewardMineral = ⌊prod.mineral×120⌋`、`rewardTech = ⌊prod.mineral×8⌋`、`costMineral = ⌊prod.mineral×60×conquestCostMult⌋`、`costEnergy = ⌊prod.energy×60×conquestCostMult⌋`（生成时固化折扣语义保持，ADR-0051 Q10）。
2. **防印钞由三层兜底**（替代 cap）：奖励是消耗型一次性收入（非永久加成，不滚雪球）；供给数量上限 generatedCap（探索驱动，征服归档释放名额）；ROI 比例恒定（reward ≤ 4×cost）。
3. **存量惰性重滚**：`migrateSave` 加载路径（IndexedDB + 导入双入口共用）对 `batch=0` 的 `gen:conquest` 且 `rewardMineral` 精确匹配旧 cap 公式值（`⌊150000×1.5^k⌋`，k∈[0,30]）的目标重算 reward/cost，guard 不动；`endless:` 手写保底（设计固定快照）与 `boss:L*`（无 cap 问题）排除。幂等：重滚后 reward >> cap 不再命中。
4. **无 schema 变更**：GeneratedTarget 字段全可选，重滚为运行时数值修复（同 ADR-0058 save-size-opt 语义），不动 schemaVersion。

## 为什么

- **cap 基数按早期产出设计**（150k 对应 prod ≈ 1.25k/s），1.5^ng 增长远慢于产出增长（建筑数量无上限 + NG+ 倍率 + 层数加成），endgame 必然全部撞 cap——固定 cap 与"随当期产出缩放"的锚点自相矛盾。
- **原始设计意图即"不封顶"**：ADR-0028 测试注释明确"深后期机会成本封顶、军事奖励不封顶 → 印钞由供给 cap 兜底（spec open items）"——f0c6c3b 落地成固定 cap 偏离此初衷。
- **守卫/奖励双锚点必然背离**：守卫锚军力（容量/3、40s 回充），奖励锚矿物产出——只要其中一侧被外部常数（cap）钉死，另一侧随玩家成长，比值必然漂移。移除 cap 后两侧同随产出缩放，比值恒定。

## 后果

- **UI**：无新交互；已撞 cap 目标加载后自动恢复 e13 级奖励，玩家无需手动处理。
- **schema**：零变更，无迁移函数。
- **测试**：`balance-simulation.test.ts` 高产出档断言由"封顶生效"改为"无上限缩放 + ROI 比例保持"；`endless-expansion.test.ts` 新增 matchesStaleConquestCap 与重滚契约（排除项/幂等/guard 不动）；`save.test.ts` 新增加载重滚集成。
- **平衡**：新目标奖励回到"产出×120s"锚点（玩家产出 e11/s → 目标 e13 级），与 Boss/探索返航同量级；autoConquest 继续自动处理，不再有低收益目标积压。
