# 舰队锁定攻占：手动攻占投入舰队战力 + 可用战力派生

手动攻占支持**舰队压制**（面板勾选默认开）：舰队战力折算计入攻占（`min(可用战力, 守卫 × FLEET_CONQUEST_CAP_PCT)`），发起时锁定 `cs.fleetLocked`、结算（成功/失败）释放、不消耗舰船；新增**可用战力**派生 `fleetAvailablePower = fleetPower − Σ进行中攻占锁定`——骚扰击退与护航等效舰数改读可用战力（锁定舰不防空、不护航）。自动攻占保持纯军力。

**状态**: Accepted（2026-08-09 grill Q1-Q10，conquest-fleet）
**证据**: `src/engine/conquest.ts`（startConquest useFleet / settleOneConquest chance 并入 fleetLocked / autoConquestTick useFleet=false）；`src/engine/fleet.ts`（fleetAvailablePower）；`src/engine/events.ts`（击退 repelCost/判定改读可用战力）；`src/engine/exploration.ts`（等效舰数改读可用战力）；`src/engine/balance.ts`（FLEET_CONQUEST_CAP_PCT）；`src/ui/render/military.ts`（舰队压制开关 + 贡献预览）

## 背景

1. **舰队战力闲置**：舰队是通关后系统（船坞 Lv1-10，3-24 艘），战力 = `舰数×1200×(1+0.1×军械)×(1+0.1×星舰)`，满配 ≈ 12.96 万；只用于骚扰击退与护航（探索收益），不参与攻占——而生成军事目标（通关后内容）守卫仅 1-2.4 万量级，舰队是明显冗余战力。
2. **后期兵力速度/上限无法满足攻占需求**（用户观察）：军力产出 ×3 封顶（军械 Lv5）vs 守卫线性膨胀，自动攻占 20% 容量保底把回充拉长到 70s+，落后于 60s 冷却。
3. **守卫挂钩容量剪刀差**：ADR-0033 守卫 = 容量×15-40%，堆军港/军械 → 容量涨 → 守卫同涨 → 容量科技对攻占无解。该问题由 [ADR-0033 修订](./0033-auto-conquest-military-cost.md)（守卫锚军力名义产能）根治；本 ADR 解决「舰队闲置」与「军力单货币」的机制缺位。

## 决策

1. **舰队压制（手动攻占）**：
   - `startConquest(state, id, invest, nowMs, rng?, useFleet = true)`——新增可选参数 `useFleet`。
   - 发起时（useFleet 且舰队 powered）：`fleetContrib = ⌊min(fleetAvailablePower(state), guard × FLEET_CONQUEST_CAP_PCT)⌋`，>0 则写 `cs.fleetLocked`。`FLEET_CONQUEST_CAP_PCT = 0.5`——舰队最多承担守卫一半，防满配 12.96 万战力碾压守卫；军力/舰队各半、两套军事系统都有存在感。
   - 结算（`settleOneConquest`）：`chance = min(1, (invest + fleetLocked)/guard × (1+声望))`；成功/失败两分支均释放（删除 `fleetLocked`）——不消耗舰船、无战损。
   - **UI**：军事页 header「舰队压制」勾选（默认开，`SessionUiState.conquestFleetEnabled`，不落盘）；可发起卡片显示「舰队压制：−N 军力」预览（与引擎折算同式）。
2. **自动攻占纯军力**：`autoConquestTick` 调 `startConquest(..., useFleet = false)`——舰队锁定 = 防御真空取舍，自动系统不替玩家做（与「胁迫一律手动」ADR-0011 哲学一致）。
3. **可用战力派生**：`fleetAvailablePower = max(0, fleetPower − Σ(state.conquest 中 startedAt 存在且 fleetLocked 存在项的锁定量))`——`fleetPower` 保持总战力口径（UI/档案显示不变）；骚扰击退（repelCost/自动迎击判定）与护航等效舰数（`equivalentFleet`）改读可用战力——锁定舰不防空、不护航、不参与新攻占，锁定语义全引擎一致。
4. **无额外门控**：船坞 Lv1 + powered 即生效——船坞是通关后大件、生成目标也是通关后内容，时序天然匹配；静态 4 区域主线期无舰队自动不可达。
5. **排除的候选**：舰队免费叠加不锁定（持续资产可反复免费用于攻占 → 军力投入贬值、13 万战力永久碾压守卫，否决）；独立太空战通道（目标分陆战/太空两型，复杂度高，出范围）；兵力产出科技（守卫锚产出后产出科技对单目标攻占节奏零帮助，被 ADR-0033 修订吸收，砍掉）。

## 为什么

- **锁定是持续资产参与攻占的正确成本形态**：不永久损耗（舰船不销毁）、不印钞（锁定期间防空/护航能力下降是真实代价）、与臣服锁定 25% 军力（ADR-0011）同构。
- **封顶 0.5 防碾压**：满配舰队 12.96 万 vs 守卫 1-2.4 万，若不封顶舰队一次攻占消耗军力归零——封顶让舰队成为「攻占加速器」（军力消耗减半上限）而非「攻占终结者」。
- **可用战力口径统一**：锁定语义只有全引擎一致才无漏洞——若仅攻占内部生效而迎击仍读总战力，玩家可「舰队打攻占同时自动迎击」白嫖防空，锁定的防御取舍被绕过。
- **autoConquest 纯军力**：自动系统保守（不把防空战力锁出去），舰队参与是玩家主动战术。

## 后果

- **存档**：`ConquestState` 加可选字段 `fleetLocked?: number`（消费侧 `?? 0` 容错）——无 SCHEMA 版本变更、无迁移函数（可选字段范式，`autoConquest.enabled` 先例）。
- **数值变化**：手动攻占军力需求减半上限（3 艘 Lv1 舰队 3,600 战力 → 守卫 2,000 的攻占贡献 1,000）；舰队满编后攻占几乎不消耗军力但锁定期间防御真空。
- **锁定期间联动**：骚扰击退 repelCost 上升（可用战力下降）、护航等效舰数下降（倍率/费用同降）——攻占与防御/探索的资源竞争显式化。
- **测试**：`conquest.test.ts` +7（舰队压制组：锁定/封顶/释放/useFleet=false/成功率并入）；`fleet.test.ts` +1（fleetAvailablePower 派生）；`fleet-defense.test.ts` +1（锁定后迎击用可用战力）；`fleet-dock-10.test.ts` +1（护航等效舰数用可用战力）；`dom-build.test.ts` +1（开关渲染/预览/关闭）；`balance-simulation.test.ts`（回充节奏断言）。
- 与 ADR-0033 修订协同：守卫锚产能解决「速度跟不上」，舰队压制解决「军力单货币 + 舰队闲置」，两 ADR 独立演进。
