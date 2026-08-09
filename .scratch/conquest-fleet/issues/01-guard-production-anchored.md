# 01 — 守卫锚产出 + 自动攻占保底降比

**What to build:** 生成军事目标（gen:*）守卫由「容量 ×15-40%」（ADR-0033）改为「军力名义产能 × 40s」（clamp 500 下限），自动攻占保底由容量 ×20% 降为 ×10%——守卫锚回充速度，攻占节奏（回充 ≈55s）跟上 60s 冷却，剪刀差根治。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `balance.ts`：删除 `GEN_CONQUEST_GUARD_PCT_MIN/MAX`（0.15/0.4）；新增 `GEN_CONQUEST_GUARD_SECONDS = 40`；`AUTO_CONQUEST_MILITARY_RESERVE_PCT` 0.2 → 0.1
- [x] `production.ts`：新增导出 `nominalMilitaryProduction`（军力名义产能，不被容量截断——满员截断不压低守卫，防「军力越满守卫越小」悖论）
- [x] `generate.ts`（`generateConquestTarget`）：`guard = max(GEN_CONQUEST_GUARD_MIN, ⌊nominalMilitaryProduction(state) × GEN_CONQUEST_GUARD_SECONDS⌋)`
- [x] 静态 `CONQUESTS` 守卫不动（500-3000 手写）
- [x] `conquest.test.ts`：守卫公式（产出锚定/clamp）、保底 10% 生效（边界 1300 跳过 / 1310 恰好发起）
- [x] `endless-expansion.test.ts`：守卫公式周目语义测试改产出锚定（含军港不影响守卫断言）
- [x] `balance-simulation.test.ts`：攻占节奏断言（守卫+保底回充 ≤ 60s 冷却）
