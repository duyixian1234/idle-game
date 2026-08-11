# 01 — 自动攻占目标按资源消耗优先排序（engine + tests）

**What to build:** `autoConquestTick`（`src/engine/conquest.ts:216-239`）发起前先对「可立即发起」的生成军事目标候选排序——守卫（军力投入）升序为主序、快照资源费 `costMineral + costEnergy` 升序为平局打破——再执行原守卫/军力保底/`startConquest`/`pausedAt` 逻辑。离线路径（`settleOffline`）复用同一函数自动继承。既有语义（保底 10%、资源费不足暂停、仅生成目标、纯军力、60s 冷却）全部不变，只改选择顺序。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `autoConquestTick`：循环前 filter 出可发起候选（`kind==='conquest'`、`status==='available'`、`startedAt==null`、`guard>0`），按 `(guard, costMineral+costEnergy)` 升序稳定排序，再迭代发起
- [x] 更新 `autoConquestTick` 注释：加入「按消耗升序优先」语义
- [x] `conquest.test.ts`「自动攻占」describe 新增 5 例：守卫不同首 tick 选最低；下一冷却 tick 选次低；最低守卫进行中则跳过选次低；守卫相同选资源费更低；离线批量按消耗升序逐个发起
- [x] 全量测试通过（1004 tests，56 files）

## Acceptance criteria

- [x] 多目标可用时，自动攻占首个发起的目标 = 守卫最低者（投入 = 其守卫）
- [x] 守卫相同 → 资源费（mineral+energy）更低者优先
- [x] 进行中目标被跳过，不参与排序与发起
- [x] 离线批量推进与在线选择顺序一致
- [x] 既有自动攻占用例（保底/暂停/范围/冷却）全部通过
