# Issue 03: tick golden-order 断言 + 全量回归

**阻塞**: 02（tick 重构完成）
**文件**: `src/engine/tick-registry.test.ts`（扩展）

## 任务

把「旧线性序列」固化为可回归资产：

1. **golden-order 快照**：在 `tick-registry.test.ts` 新增断言——
   - 定义旧序列（重构前 tick() 的顶层调用顺序，按 5 组归属）：
     ```
     resources: [productionReport, accumulate, mineralStats, applyMaintenance, applyFleetMaintenance, energyFloor, militaryCapFloor]
     diplomacy: [coercionTick, autoDiplomacyTick, ensureCoercionUnlocked, lastTick, playSeconds, planetStaySeconds]
     events:    [triggerRandomEvent, scheduleNextEvent, autoResolvePendingEvents, applyStormHarvest, checkPlanetUnlocks, checkFederationPendingStory]
     settlement:[settleConquests, settleExpeditions, autoExploreDispatch, autoConquestTick]
     ending:    [checkEnding, playMilestone, checkAchievements, pruneStaleEvents]
     ```
   - 断言 `registry.build()` 的组序 == `['resources','diplomacy','events','settlement','ending']`（快照 diff，不一致即红）。
2. **注册序稳定性**：乱序注册（settlement 先于 resources）后 `build()` 仍输出 golden 序——证明拓扑排序而非注册顺序决定执行序。
3. **全量回归**：整个引擎测试套件跑一遍（`pnpm test` 全部），确认 889 全绿——行为一致由测试证明。

## 验证

- `tick-registry.test.ts` 全绿（含 golden-order 快照断言）。
- 全量 vitest 52 files / 889 tests 全绿。
- tsc --noEmit 0 错误。

## 依赖

02。golden-order 快照的「旧序列真值」来自 02 重构前的代码顺序（git diff 可核）。
