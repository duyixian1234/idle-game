# 01 — 守卫公式双上限截断（≤ 容量×1/3、≤ 3 分钟产能）

**What to build:** 生成军事目标（gen:*）守卫由 `max(500, ⌊名义军力产能 × 40s⌋)` 改为双上限截断——`guard = min(max(500, ⌊名义产能×40s⌋), ⌊军力上限×1/3⌋, ⌊名义产能×180s⌋)`（上限优先：早期容量/3 < 500 时守卫 = 容量/3）。用户硬约束：攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间（grill Q1-Q5）。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `balance.ts`（L281 附近）：新增 `GEN_CONQUEST_GUARD_CAP_PCT = 1/3`、`GEN_CONQUEST_GUARD_MAX_SECONDS = 180`；更新 `GEN_CONQUEST_GUARD_SECONDS`（40）注释为双上限截断语义
- [x] `generate.ts`（`generateConquestTarget` L116）：守卫公式改为 `Math.min(Math.max(GEN_CONQUEST_GUARD_MIN, byProd), prodCap, capCap)`——`byProd = ⌊名义产能×40⌋`、`prodCap = max(500, ⌊名义产能×180⌋)`（产出 0 时保底 500，防守卫压到 0）、`capCap = ⌊militaryCap×1/3⌋`；新增 `import { militaryCap } from './production'`
- [x] 静态 `CONQUESTS` 守卫（500-3,000 手写，`data.ts`）**不动**（Q3 豁免）
- [x] 自动攻占（`autoConquestTick`）逻辑不变（守卫变小后更易满足 `guard + 保底`，属预期节奏加快）
- [x] 注释记录语义张力：容量 < 120×名义产能时守卫由容量/3 主导（随容量涨，与 conquest-fleet"堆容量不抬高门槛"原则冲突——"≤1/3"硬约束的必然）；容量 ≥ 120×名义产能时恢复产出锚定（回充 40s 语义）
