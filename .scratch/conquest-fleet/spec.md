# 攻占需求匹配：守卫锚产出 + 舰队锁定攻占（conquest-fleet）

**Status:** ready-for-agent

## Problem Statement

后期（通关后无限模式）兵力上限与兵力速度无法满足军事攻占需求，三个结构性根因：

1. **守卫挂钩容量（ADR-0033，15-40%）→ 剪刀差恒存**：守卫 = `max(500, 容量×15-40%)`。堆军港/军械 → 容量涨 → 守卫同比例涨 → **任何容量科技（含 ADR-0027 军械 +10%/级）对攻占毫无帮助，只抬高门槛**。
2. **军力产出 ×3 封顶 vs 守卫线性膨胀**：军力产出 = `0.5/s × 兵营 × 军械科技`（Lv5 = ×3 封顶，`data.ts:509` militaryTech）。量化例（100 军港 + 200 兵营 + 军械 Lv5）：容量 ≈ 4.5 万、守卫 6,784-18,090、产出 300/s；叠加自动攻占 20% 容量保底（≈9,000）后实际回充需 ≈91s，远落后于 `AUTO_CONQUEST_COOLDOWN_MS = 60s`。
3. **舰队战力闲置**：满配舰队 = 24 艘 × 1200 × 军械 1.5 × 星舰 3 ≈ 12.96 万（`fleet.ts:63`），远超后期守卫，却只用于骚扰击退/护航，不参与攻占（`startConquest` 仅扣军力，`conquest.ts:75-91`）。

## Solution

「守卫锚产出 + 舰队锁定攻占」两件套（grill 2026-08-09，Q1-Q10 全锁定）：

- **守卫锚产出**（ADR-0033 修订）：生成目标守卫 = `max(500, ⌊军力净产出 × 40s⌋)`——守卫锚回充速度而非存量上限，攻占需求与产能同源（ADR-0028 哲学同构），剪刀差根治；静态 4 区域手写守卫不动。
- **自动攻占保底降比**：`AUTO_CONQUEST_MILITARY_RESERVE_PCT 0.2 → 0.1`——后期（容量 4.5 万、产出 300/s）需求 = 12,000 + 4,500 = 16,500，回充 ≈55s ≤ 冷却 60s，瓶颈解除。
- **舰队锁定攻占**（手动，面板「舰队压制」勾选默认开）：`fleetContrib = min(可用战力, 守卫 × 0.5)`，发起时锁定、结算（成功/失败）释放；成功率并入 `fleetLocked`；不消耗舰船。
- **可用战力派生**：`fleetAvailablePower = fleetPower − Σ进行中攻占锁定`；骚扰击退（events.ts）与护航等效舰数（exploration.ts）改读可用战力——锁定舰不防空、不护航。

## User Stories

1. 作为通关后玩家，我希望生成军事目标的守卫随军力产出而非容量缩放，以便堆容量不再抬高攻占门槛。
2. 作为通关后玩家，我希望守卫 = 产出×40s，以便回充一个守卫恒 40s、攻占节奏可预期。
3. 作为通关后玩家，我希望自动攻占保底降到容量×10%，以便挂机攻占节奏（回充 ≈55s）跟上 60s 冷却。
4. 作为玩家，我希望手动攻占可勾选「舰队压制」，以便舰队战力参与攻占、军力消耗减半（上限）。
5. 作为玩家，我希望舰队参与攻占时战力被锁定（期间不可迎击/护航），以便攻占有防御取舍而非免费 buff。
6. 作为玩家，我希望攻占结算（成功或失败）后锁定自动释放，以便舰船无永久损耗。
7. 作为玩家，我希望自动攻占保持纯军力，以便自动系统不会把我用于防空的舰队锁出去。
8. 作为玩家，我希望「舰队压制」默认开启，以便新玩家直接受益、无需手动配置。
9. 作为玩家，我希望攻占卡片显示舰队贡献预览，以便发起前看清军力需求减免。
10. 作为开发者，我希望舰队锁定不升 SCHEMA（可选字段），以便老存档零迁移。
11. 作为玩家，我希望骚扰击退与护航在舰队被锁定时用剩余战力，以便锁定语义一致、无逻辑漏洞。
12. 作为玩家，我希望静态 4 区域主线攻占不受影响，以便通关节奏不变。

## Implementation Decisions

### 1. 守卫锚产出（Q2/Q4/Q10）

- `balance.ts`：删除 `GEN_CONQUEST_GUARD_PCT_MIN/MAX`（0.15/0.4）；新增 `GEN_CONQUEST_GUARD_SECONDS = 40`；`AUTO_CONQUEST_MILITARY_RESERVE_PCT = 0.2 → 0.1`。
- `production.ts`：新增导出 `nominalMilitaryProduction(state)` = 军力名义产能（兵营产出 × 科技系数 × 永久/NG+ 加成，**不被容量截断**）——守卫若锚被截断的净产出，军力满员（room≤0）时净产出归零 → 守卫塌缩到 clamp 下限、攻占反而变便宜（设计悖论，实现期发现）。
- `generate.ts:111-132`（`generateConquestTarget`）：`guard = max(GEN_CONQUEST_GUARD_MIN, ⌊nominalMilitaryProduction(state) × GEN_CONQUEST_GUARD_SECONDS⌋)`。
- 静态 `CONQUESTS` 守卫（500-3000 手写）不动；`GEN_CONQUEST_GUARD_MIN = 500` 保留为 clamp 下限。

### 2. 舰队锁定攻占（Q3/Q7/Q8/Q9）

- `types.ts`：`ConquestState` 加可选字段 `fleetLocked?: number`（消费侧 `?? 0` 容错；无 SCHEMA 版本变更、无迁移函数——可选字段范式，`autoConquest.enabled` 先例）。
- `balance.ts`：新增 `FLEET_CONQUEST_CAP_PCT = 0.5`。
- `conquest.ts`：
  - `startConquest(state, id, invest, nowMs, rng?, useFleet = true)`——新增可选参数 `useFleet`（默认 true）。
  - 发起时（`useFleet` 为 true 且舰队 powered）：`fleetContrib = min(fleetAvailablePower(state), ⌊def.guard × FLEET_CONQUEST_CAP_PCT⌋)`，若 `fleetContrib > 0` 则写 `cs.fleetLocked = fleetContrib`。
  - `settleOneConquest`：`chance = min(1, (invest + (cs.fleetLocked ?? 0)) / guard × (1+声望))`；结算（成功/失败两分支）删除 `cs.fleetLocked`（释放）。
  - `autoConquestTick`：`startConquest(..., useFleet = false)`——自动攻占纯军力（Q6）。
- 解锁门控：无（Q9）——船坞 Lv1 + powered 即生效；静态 4 区域主线期无舰队（dock requires starportMine，通关后大件），天然不可达。

### 3. 可用战力派生（Q3 锁定口径）

- `fleet.ts`：新增 `fleetAvailablePower(state): number = fleetPower(state) − Σ(state.conquest 中 status 非 conquered 且 fleetLocked 存在 的锁定量)`——零域保持（仅遍历 GameState，不 import 其他模块）；`fleetPower` 保持总战力口径（UI/档案显示不变）。
- `events.ts`：骚扰击退 `repelCost = max(50, strength − fleetPower(state))`（:482）与强度判定（:870/:927/:941）改读 `fleetAvailablePower`；`:452` 处 `fleetPowerValue` 若用于判定同样改读（实现时按上下文逐一核对）。
- `exploration.ts:213`：等效舰数 `E = fleetPower(state)/SHIP_POWER_BASE → fleetAvailablePower(state)/SHIP_POWER_BASE`——护航倍率与远征费用可用战力（锁定舰不护航）。

### 4. UI「舰队压制」开关（Q8）

- `src/ui/render/military.ts`：攻占面板 header（与 `data-conquest-auto` 同行的 label）加「舰队压制」勾选：`<input type="checkbox" data-conquest-fleet>`，默认 checked；状态存 `SessionUiState`（`src/ui/session/`，如 `conquestFleetEnabled: boolean` 默认 true，不落盘）。
- 攻占卡片（`renderConquestRow`）：可发起分支显示舰队贡献预览行——`可用战力>0` 时显示「舰队压制：−N 军力」（`min(可用, guard×0.5)`）。
- `src/ui/actions.ts:196`：conquest action 从 `SessionUiState` 读勾选，`startConquest(state, id, invest, Date.now(), undefined, conquestFleetEnabled)`。
- 面板级开关对后续手动攻占生效；autoConquest 不受影响（引擎层 useFleet=false 硬约束）。

## Testing Decisions

- **缝（seam）**：引擎派生纯函数层（`generateConquestTarget` / `startConquest` / `settleOneConquest` / `fleetAvailablePower` / `fleetPower` 消费方）+ 结算层 + balance-sim + UI dom 测试。全部机制改动汇聚于派生函数与攻占结算，无新 seam 引入。
- **好测试标准**：只断言外部行为——守卫 = 产出×40s（含 clamp 500）；保底 10% 生效；useFleet=true 锁定 fleetContrib、结算释放、chance 并入；useFleet=false（autoConquest）零锁定；锁定后 `fleetAvailablePower` 下降且迎击/护航改读；面板勾选渲染与 action 传参。
- **测试模块**：
  - `conquest.test.ts` — 守卫公式（产出锚定/clamp）、舰队锁定/释放/封顶/useFleet=false、保底 10%
  - `endless-expansion.test.ts` — 守卫公式周目语义改产出锚定
  - `fleet-defense.test.ts` — 锁定后 repelCost/判定用可用战力
  - `exploration.test.ts` — 护航等效舰数用可用战力
  - `fleet.test.ts` — `fleetAvailablePower` 派生（无锁定 = fleetPower）
  - `dom-military.test.ts`（或既有 military dom 测试）— 「舰队压制」勾选渲染 + 舰队贡献预览
  - `balance-simulation.test.ts` — 守卫/保底锚定后攻占节奏断言（回充 ≤ 冷却）
- **Prior art**：`conquest.test.ts`（攻占/自动攻占）、`fleet-defense.test.ts`（迎击）、`exploration.test.ts`（护航）、`balance-simulation.test.ts`（印钞断言）。

## Out of Scope

- 兵力提升科技（grill Q5 砍掉）：守卫锚产出后产出科技对单目标攻占节奏零帮助，是无效设计。
- 容量科技新线（军械 ADR-0027 已 +10% 容量/级）：守卫不再挂钩容量后，容量对攻占无意义。
- 独立太空战通道（目标分陆战/太空两型）。
- 静态 4 区域守卫/自动攻占范围调整。
- 舰队逐舰损耗/战损（锁定不消耗、无战损）。
- post100-avgprod 价格机制（已放弃，勿重复实现）。
