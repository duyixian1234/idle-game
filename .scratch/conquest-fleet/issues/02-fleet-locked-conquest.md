# 02 — 舰队锁定攻占（引擎层）

**What to build:** 手动攻占支持舰队战力参与：`fleetContrib = min(可用战力, 守卫 × FLEET_CONQUEST_CAP_PCT)`，发起时锁定（`cs.fleetLocked`）、结算释放；成功率并入 `fleetLocked`；autoConquest 传 `useFleet=false` 保持纯军力。

**Blocked by:** 01（守卫公式先定，`守卫 × 0.5` 的封顶基准可测）

**Status:** ready-for-agent

- [x] `types.ts`：`ConquestState` 加可选字段 `fleetLocked?: number`（无 SCHEMA 变更、无迁移函数）
- [x] `balance.ts`：新增 `FLEET_CONQUEST_CAP_PCT = 0.5`
- [x] `conquest.ts`（`startConquest`）：新增可选参数 `useFleet = true`；发起时（useFleet && 舰队 powered）计算 `fleetContrib = min(fleetAvailablePower(state), ⌊guard × 0.5⌋)`，>0 则写 `cs.fleetLocked`
- [x] `conquest.ts`（`settleOneConquest`）：`chance = min(1, (invest + (cs.fleetLocked ?? 0)) / guard × (1+声望))`；成功/失败两分支均删除 `cs.fleetLocked`（释放）
- [x] `conquest.ts`（`autoConquestTick`）：`startConquest(..., useFleet = false)`——自动攻占纯军力
- [x] `conquest.test.ts`：useFleet=true 锁定 fleetContrib（封顶 0.5×守卫、封顶可用战力）；结算成功/失败均释放；chance 并入 fleetLocked；useFleet=false（autoConquest）零锁定；无舰队/停摆零锁定
