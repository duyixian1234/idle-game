# 设计总结：攻占需求匹配（守卫锚产出 + 舰队锁定攻占）

> grill-with-docs 会话产出（2026-08-09），10 个决策全锁定，方案收敛为「守卫锚产出 + 舰队锁定攻占」两件套。
> ADR-0033 修订（守卫挂钩 + 保底降比）+ 新增 ADR-0046（舰队参与攻占 + 可用战力派生）。

## 问题

后期（通关后无限模式）兵力上限与兵力速度无法满足军事攻占需求：

1. **守卫挂钩容量（15-40%，ADR-0033）→ 剪刀差恒存**：堆军港/军械 → 容量涨 → 守卫同比例涨 → 容量科技对攻占无帮助、只抬门槛。
2. **军力产出 ×3 封顶 vs 守卫线性膨胀**：军械科技 Lv5 产出 ×3（`techMultiplier`），兵营数量流放缓后，回充满守卫 + 自动攻占 20% 容量保底需 70s+，远落后于 60s 冷却。
3. **舰队战力闲置**：满配舰队 ≈ 12.96 万（24 艘 × 1200 × 军械 1.5 × 星舰 3），远超后期守卫 1-2.4 万，却只用于迎击/护航，不参与攻占。

## 决策表

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 方案选型 | C 组合（舰队参与 + 兵力提升），经 Q5 收敛 |
| Q2 | 守卫挂钩机制（ADR-0033） | 改产出锚定（守卫 = 军力净产出 × N 秒） |
| Q3 | 舰队参与方式 | 锁定 + 折算（攻占期间锁定战力，结算释放；不消耗舰船） |
| Q4 | 守卫/保底锚定组合 | 守卫 = 产出×40s，保底降为容量×10% |
| Q5 | 兵力科技定位 | 砍掉（守卫锚产出后产出科技是无效设计，被 Q2 吸收） |
| Q6 | autoConquest 是否用舰队 | 否，保持纯军力（自动系统不替玩家做防御取舍） |
| Q7 | 舰队折算封顶 | `FLEET_CONQUEST_CAP_PCT = 0.5`（舰队最多承担守卫 50%） |
| Q8 | 手动攻占舰队参与形态 | 面板勾选「舰队压制」默认开（取舍显式化） |
| Q9 | 解锁门控 | 无额外门控（船坞 Lv1 + powered 自动生效；时序天然匹配） |
| Q10 | 守卫锚产出参数 | 40s + 保底 10% 原样（回充 ≈55s ≤ 冷却 60s） |

## 核心机制

1. **守卫锚产出**（生成目标）：`guard = max(500, ⌊军力净产出 × 40s⌋)`——守卫锚回充速度而非存量上限，攻占需求与产能同源（与 ADR-0028 奖励锚定产出哲学同构）；静态 4 区域手写守卫 500-3000 不动。
2. **自动攻占保底**：`AUTO_CONQUEST_MILITARY_RESERVE_PCT 0.2 → 0.1`——后期容量 4.5 万例：需求 = 12,000 + 4,500 = 16,500，回充 ≈55s ≤ 冷却 60s，瓶颈解除。
3. **舰队锁定攻占**（手动）：`fleetContrib = min(可用舰队战力, 守卫 × 0.5)`，发起时锁定、结算释放；`chance = min(1, (invest + fleetLocked)/guard × (1+声望))`；军力消耗减半上限，舰队成「攻占加速器」非「终结者」。
4. **可用战力派生**：`fleetAvailablePower = fleetPower − Σ进行中攻占锁定`；骚扰击退（events.ts repelCost/判定）与护航等效舰数（exploration.ts E）改读可用战力——锁定舰不防空、不护航。

## 排除的候选

- **兵力科技（产出）**：守卫锚产出后，产出科技 → 守卫同涨 → 单目标攻占节奏不变（恒 N 秒），对"速度"零感知帮助，仅剩并行吞吐弱价值 → 砍掉，避免无效设计。
- **容量科技**：守卫不再挂钩容量后，容量科技对攻占无意义（军港保留次级意义=保底 10%）。
- **舰队免费叠加不锁定**：持续资产可反复免费用于攻占 → 军力投入贬值、13 万战力永久碾压守卫 → 否决。
- **独立太空战通道**（目标分陆战/太空两型）：复杂度高 → 出范围。

## 涉及文件

- `src/engine/balance.ts` — `GEN_CONQUEST_GUARD_SECONDS`（40）、`FLEET_CONQUEST_CAP_PCT`（0.5）、`AUTO_CONQUEST_MILITARY_RESERVE_PCT`（0.1）、删除 `GEN_CONQUEST_GUARD_PCT_*`
- `src/engine/generate.ts` — `generateConquestTarget` guard 公式
- `src/engine/conquest.ts` — `startConquest` useFleet 参数 + fleetContrib 锁定、`settleOneConquest` chance 并入 fleetLocked + 释放、`autoConquestTick` 传 useFleet=false
- `src/engine/types.ts` — `ConquestState.fleetLocked?`（可选字段，无 SCHEMA 变更）
- `src/engine/fleet.ts` — `fleetAvailablePower` 派生
- `src/engine/events.ts` / `src/engine/exploration.ts` — 迎击/护航改读可用战力
- `src/ui/render/military.ts` — 面板「舰队压制」勾选（默认开）+ 舰队贡献预览
- `src/ui/actions.ts` — conquest action 传 useFleet
