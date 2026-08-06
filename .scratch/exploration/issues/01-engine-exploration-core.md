# 01 — 引擎探索核心（exploration.ts：派遣/结算/奖池 + scaledClamp）

**What to build:** 新增 `src/engine/exploration.ts`：`startExpedition(state, nowMs, rng?)`（校验通关后 phase、单槽、资源足够 → 扣动态缩放矿物/能源 + 固定兵力 → `rollDomain(state, 'explore')` 出发时 roll 并固化结果 → push `ExpeditionState`）、`settleExpeditions(state, nowMs)`（到期自动入账三分支：faction 创建 / planet 解锁 / resource 补偿含科技点；`stats.explorations += 1`；日志播报）、`isExploreAvailable(state)`（ended/infinite 门控）、`expeditionPool(state)`（剔除制奖池：未发现势力 w2 + 未发现天体 w1 + 资源补偿 w = max(2, 6-已收集)，轮盘同 `pickEventDef` 法）。`balance.ts` 新增 `scaledClamp(rate, min, factor, cap)`（带封顶缩放，不动现有 `scaledBy`）与探索常数（`EXPEDITION_DURATION_MS=3_600_000`、`EXPEDITION_MILITARY_COST=40`、矿物/能源 min/factor/cap 初值）。类型 `ExpeditionState`/`ExpeditionResult` 入 `types.ts`。接入 `engine.ts` tick 与 `offline.ts` settleOffline（离线推进）。

**Blocked by:** None — can start immediately（`explore` 域与 seed 已由 fixed-rng 就绪；势力/天体池在 02 填充前为空数组，奖池逻辑照常可测）

**Status:** resolved

- [ ] `balance.ts`：`scaledClamp` + 探索常数（带「初值，ticket 06 校准」注释）
- [ ] `types.ts`：`ExpeditionState`（id/startedAt/finishAt/cost{mineral,energy,military}/result/resolved）、`ExpeditionResult`（faction|planet|resource 三合一）、`GameState` 增 `expeditions: ExpeditionState[]`、`exploredFactions: string[]`、`exploredPlanets: string[]`、`nextExpeditionId: number`、`stats.explorations: number`
- [ ] `src/engine/exploration.ts`：`startExpedition`（校验：phase ∈ {ended,infinite}、`expeditions` 无进行中、资源足够；扣资源；roll 固化 result；`finishAt = startedAt + EXPEDITION_DURATION_MS`；单槽拒绝）
- [ ] `settleExpeditions`（入账三分支 + 计数 + 日志；`resolved` 后移除；未到期不动；批量结算）
- [ ] `expeditionPool`（剔除制、权重、耗尽后只剩补偿）
- [ ] `isExploreAvailable` + tick/offline 接入
- [ ] `src/engine/exploration.test.ts`：上述全路径（注入 rng 断言 result 固化；`explore` 域计数器消耗断言；单槽/资源/phase 拒绝路径；离线推进）

**Acceptance:** 派遣全生命周期单测通过；`playing` 阶段不可探索；单槽并发拒绝；结果出发时固化（回归后与出发时一致，防 SL 语义）。
