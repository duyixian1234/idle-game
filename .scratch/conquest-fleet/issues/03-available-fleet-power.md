# 03 — 可用战力派生 + 迎击/护航改读

**What to build:** `fleetAvailablePower = fleetPower − Σ进行中攻占锁定`；骚扰击退（repelCost/强度判定）与护航等效舰数改读可用战力——锁定舰不防空、不护航，锁定语义全引擎一致。

**Blocked by:** 02（依赖 `ConquestState.fleetLocked` 字段）

**Status:** ready-for-agent

- [x] `fleet.ts`：新增 `fleetAvailablePower(state) = fleetPower(state) − Σ(state.conquest 中 `fleetLocked` 存在项的锁定量)`；零域保持（仅遍历 GameState）；`fleetPower` 保持总战力口径
- [x] `events.ts`：骚扰击退 `repelCost = max(50, strength − fleetPower(state))`（:482）与强度判定（:870/:927/:941）改读 `fleetAvailablePower`；bugTerms repelCost 用可用战力（strength 设计锚定保留总战力）
- [x] `exploration.ts:213`：等效舰数 `E = fleetPower(state)/SHIP_POWER_BASE → fleetAvailablePower(state)/SHIP_POWER_BASE`（护航倍率与远征费用可用战力）
- [x] `fleet.test.ts`：`fleetAvailablePower` 派生（无锁定 = fleetPower；有锁定 = 差额；多攻占叠加；已结算不计入；停摆归零）
- [x] `fleet-defense.test.ts`：锁定后 repelCost/判定用可用战力（示例：锁定后原本可自动迎击的骚扰转为需军力）
- [x] `fleet-dock-10.test.ts`：护航等效舰数用可用战力（锁定期间护航倍率/费用下降，结算后恢复）
