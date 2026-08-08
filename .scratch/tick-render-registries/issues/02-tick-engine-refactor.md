# Issue 02: engine.ts tick() 重构为 5 组注册 + 调用

**阻塞**: 01（tick-registry 核心）
**文件**: `src/engine/engine.ts`（tick 主循环 106-188 重构）

## 任务

将 tick() 硬编码序列重构为注册表驱动：

1. **组内函数抽取**：把现有 tick() 主体按 5 组拆为顶层函数（模块内私有，不导出）：
   - `resourcesTick(state, nowMs, rng?)`：dt 计算 → productionReport → 资源累加 → totalMineralEarned → applyMaintenance → applyFleetMaintenance → energy 兜底 → military cap 兜底（原 107-127 行）
   - `diplomacyTick(state, nowMs, rng?)`：coercionTick → autoDiplomacyTick → ensureCoercionUnlocked → lastTick/playSeconds → planetStaySeconds（原 128-141 行）
   - `eventsTick(state, nowMs, rng?)`：triggerRandomEvent/scheduleNextEvent → autoResolvePendingEvents → applyStormHarvest → checkPlanetUnlocks → checkFederationPendingStory（原 143-161 行）
   - `settlementTick(state, nowMs, rng?)`：settleConquests → settleExpeditions → autoExploreDispatch → autoConquestTick（原 162-177 行）
   - `endingTick(state, nowMs, rng?)`：checkEnding → playMilestone(endlessII) → checkAchievements → pruneStaleEvents（原 178-186 行）
2. **依赖声明**：`after` 依次为 `[]`（resources）→ `['resources']` → `['diplomacy']` → `['events']` → `['settlement']`（链式偏序，golden-order 校验=原序）。
3. **tick() 重构**：保留 dtMs 守卫（`dtMs <= 0` 早退）；改为 `for (const g of registry.build()) g.run(state, nowMs, rng)`。
4. **集中注册**：engine.ts 模块级 `const TICK_GROUPS = createTickRegistry()` + 5 个 register 调用（hub 可见性，不副作用 import）。

## 验证

- typecheck 通过。
- 现有 tick 行为测试（engine/offline/conquest/exploration/events/diplomacy 等 8+ 处）**全量回归全绿**——行为逐字节一致。
- 无残留：`rg "coercionTick(state" src/engine/engine.ts` 组调用之外无散落。

## 依赖

01。组内函数签名须与原调用完全一致（含 rng 透传，ADR-0007）。
