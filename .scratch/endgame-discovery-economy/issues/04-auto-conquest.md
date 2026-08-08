# 04 — 自动攻占 + 守卫挂钩军力容量（ADR-0033）

**What to build:** 军事目标自动攻占机制（独立开关、每 60s 对可用生成军事目标投满守卫必成发起、军力保底 20%、挂机同步）；程序生成军事目标守卫从 `[500,3000] × 1.5^ng` 改为挂钩军力容量（`militaryCap × 15-40%`，clamp 500 下限）——后期攻占军力成本成真实门槛。

**Blocked by:** None — can start immediately（与 01-03 无硬依赖；守卫挂钩容量补充 ADR-0028「挑战阈值」语义）

**Status:** ready-for-agent

- [ ] balance.ts：`GEN_CONQUEST_GUARD_PCT_MIN = 0.15` / `GEN_CONQUEST_GUARD_PCT_MAX = 0.4` / `AUTO_CONQUEST_COOLDOWN_MS = 60_000` / `AUTO_CONQUEST_MILITARY_RESERVE_PCT = 0.2`；删除 `GEN_STRENGTH_GROWTH`、`GEN_CONQUEST_GUARD_MAX`（`GEN_CONQUEST_GUARD_MIN` 保留为 500 clamp 下限）
- [ ] `generateConquestTarget`：`guard = max(500, ⌊militaryCap × [pct_min, pct_max]⌋)`（取代 1.5^ng 周目缩放；奖励/成本锚产出不动）
- [ ] types.ts：`AutoConquestState`（enabled/lastActionAt/pausedAt）+ GameState.autoConquest（可选字段不升 SCHEMA）
- [ ] `autoConquestTick`（conquest.ts）：enabled + 60s 冷却 + 遍历生成 conquest 目标（status available）→ 军力保底（投满后 ≥ 容量×20%）→ `startConquest(state, id, guard, nowMs)` 投满必成；资源费不足（ADR-0028 costMineral/costEnergy）→ pausedAt
- [ ] engine.ts：createInitialState 加 `autoConquest: { enabled: false }`；tick 在 autoExploreDispatch 后调 `autoConquestTick`（pushLog system）；startNewGamePlus 重置默认关
- [ ] offline.ts：`settleOffline` 按 60s 冷却周期批量调 `autoConquestTick`（日志并入 conquestLogs）
- [ ] UI：军事页攻占 header 加 `data-conquest-auto` 开关；listeners.ts change handler 写 `state.autoConquest.enabled`
- [ ] 测试：`conquest.test.ts` +7（投满/保底/仅生成目标/冷却/关闭/资源费暂停/离线）；`endless-expansion.test.ts` 周目缩放测试改为容量缩放
- [ ] 无 SCHEMA 升级（autoConquest 可选字段，`??` 容错）
