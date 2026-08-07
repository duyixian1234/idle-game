# 终局数值微调：warpDrive 满级质变 + 军力容量科技通道（endgame-balance-tuning）

**Status:** ready-for-agent

## Problem Statement

1. **warpDrive 成本悬崖**：星舰推进（Lv1-20）成本按 `base × 1.7^lv` 指数增长，累计 ≈ 11.6 亿科技点；末 5 级（Lv16→20）吃掉累计投入的 ~88%（≈10.2 亿），而每级奖励仅 +10% 舰队战力——「Lv20 与 Lv16 体验无差」，11.6 亿投入缺乏终点感（纯荣誉升级）。
2. **军力容量无科技通道**：军力容量公式 `⌊(100 + 200×军港×(1+0.5·lv)) × (1+永久+声望)⌋` 只有「军港数量流」一条增长路径；军械科技（militaryTech）只强化战力（×1.5）不强化容量——「能打」与「装得下」在科技侧脱节，容量成为舰队科技投入后的瓶颈。
3. **容量影响面广**：容量同时锚定攻占可投入上限（`p = min(1, invest/guard)`）与探索派遣军力消耗（`mCap×2%` clamp 1000），是军力经济的枢纽变量。

## Solution

- **warpDrive 动收益不动成本**：成本曲线 `1.7^lv` 原样保留（ADR-0025 出口容量锚定），Lv10 / Lv20 各挂一个**摩擦降低型质变**——Lv10 = 探索派遣军力消耗 −10%；Lv20 = 护航远征费 −10%。不改变收益倍率、不增加产出上限，只是让满级舰队「用起来更顺」，与 +10% 战力/级的既有杠杆同向。
- **军力容量开科技通道**：军械科技每级 +10% 容量，整体乘法叠加（`×(1 + 0.1×militaryTechLv)`，Lv5 = +50%），与永久加成/声望加成同构。复用军械科技线（单线双回报：战力 + 容量），不新增独立容量科技线。
- 两个改动域独立、互不阻塞；同一轮 grill 定稿（2026-08-08），各自有独立 ADR（0026/0027）。

## User Stories

1. 作为通关后玩家，我希望星舰推进升到 Lv10 后探索派遣军力消耗降低 10%，以便军事科技投入在派遣场景有额外回报。
2. 作为通关后玩家，我希望星舰推进升到 Lv20 后护航远征费降低 10%，以便满级星舰有区别于 Lv16 的可感知终点。
3. 作为玩家，我希望星舰推进成本曲线保持 1.7^lv 不变，以便科技点出口容量锚定（11.6 亿累计）不受扰动。
4. 作为玩家，我希望两个质变不改变收获倍率/产出上限，以便经济结构零扰动、无印钞路径。
5. 作为玩家，我希望军械科技每级 +10% 军力容量（Lv5 = +50%），以便军事科技同时强化「能打」与「装得下」。
6. 作为玩家，我希望容量加成与永久加成/声望加成同构（整体乘法），以便数值语义统一、无第三套加法口径。
7. 作为玩家，我希望军械科技 0 级时容量公式与现状逐字节一致，以便存量体验零变化。
8. 作为玩家，我希望军力容量仍是约束（+50% 远低于军港数量流），以便军港建设决策不被科技通道架空。
9. 作为玩家，我希望胁迫外交解锁（军力上限 ≥5000）可被军械科技提前到达，以便胁迫线（通关后深度玩法）更早可玩。
10. 作为玩家，我希望探索派遣军力消耗在容量膨胀下仍受 clamp 1000 封顶约束，以便无副作用联动。
11. 作为玩家，我希望 balance-sim 断言两项联动的边界，以便长期不漂移。

## Implementation Decisions

### warpDrive 质变

- 新常量入 balance.ts：`WARP_EXPEDITION_COST_REDUCTION = 0.1`（Lv10 派遣军力）、`WARP_ESCORT_FEE_REDUCTION = 0.1`（Lv20 护航费）。
- `expeditionMilitaryCost`（exploration.ts）：`warpDrive ≥ 10` 时结果 ×(1 − 0.1)，`warpDrive < 10` 与现状逐字节一致。
- `escortFee`（exploration.ts）：`warpDrive ≥ 20` 时结果 ×(1 − 0.1)，`warpDrive < 20` 与现状逐字节一致。
- 判定直接读 `state.techLevels.warpDrive`（与 deepSpaceNav/relay 的 hardcode 模式一致），不新增 effect kind 语义。
- 科技卡 desc/effect label 更新：「Lv10 派遣军力 −10% / Lv20 护航费 −10%」。
- 排除：护航收获倍率与离线封顶已被跃迁枢纽占用（JUMPGATE_HARVEST_MULT / JUMPGATE_OFFLINE_EXTRA_SECONDS），不做二次叠加（ADR-0026）。

### 军力容量科技通道

- 新常量入 balance.ts：`MILITARY_CAP_TECH_PER_LEVEL = 0.1`。
- `militaryCap`（production.ts）：`⌊(100 + 200×军港×levelMult) × (1+永久+声望) × (1 + 0.1×militaryTechLv)⌋`——整体乘法，军械 0 级时 `(1+0)=1` 与现状逐字节一致。
- 复用军械科技线（data.ts `militaryTech` 已是 Lv5 maxLevel 的 production 科技）；容量加成在 `militaryCap` 内直接读 `techLevels.militaryTech`，不新增科技定义。
- 排除：加法口径（`+20×militaryLv`，第三套加法体系）、独立「轨道装甲」新科技线（高复杂度，收益与复用相近）（ADR-0027）。

### 联动确认（已 grill 定稿）

- **胁迫解锁提前**：`COERCION_UNLOCK_MILITARY_CAP = 5000`，无科技需 25 座军港；Lv3 军械（+30%）→ ≈19 座、Lv5（+50%）→ ≈17 座——正面效果（内容前置），不调阈值。
- **派遣军力联动被 clamp 吸收**：`mCap×2%` 基数抬高，但 `clamp 1000` 封顶需 mCap > 50,000（≈166 座军港，post100 后置锁死范围内实际到不了）——派遣军力消耗实际不随军械等级漂移，无副作用。

## Testing Decisions

- **缝（seam）**：引擎派生纯函数层（`militaryCap` / `expeditionMilitaryCost` / `escortFee`）+ balance-sim 断言。全部改动汇聚于派生函数，单一最优缝；无新 seam 引入。
- **好测试标准**：只断言外部行为——军械 Lv0 时容量与现状逐字节一致；Lv5 时容量 ×1.5；warpDrive <10/<20 时两函数与现状一致，≥10/≥20 时 ×0.9；科技卡描述反映质变。
- **测试模块**：production 域（容量公式）、exploration 域（派遣军力/护航费派生）、balance-sim（联动断言）。
- **Prior art**：`production.test.ts`（军力容量）、`exploration.test.ts`（派遣/护航）、`balance-simulation.test.ts`（印钞与不变量断言）、`tech.test.ts`（升级门控）。

### balance-sim 断言（新增）

- `Lv5 军械 + 25 座军港 → 容量 = 7,650 ≥ 5000`（胁迫解锁早于纯军港路径 ~32%）。
- 探索派遣军力在容量膨胀下仍 ≤ 1000（clamp 有效，断言不随军械等级漂移）。
- `Lv10 派遣军力 = 0.9×原值`、`Lv20 护航费 = 0.9×原值`（质变生效且锚定产出不脱钩）。

## Out of Scope

- warpDrive 成本曲线调整（软上限/多项式）——ADR-0025 出口容量锚定，明确不做（ADR-0026 否决项）。
- 护航收获倍率/离线封顶叠加——已被跃迁枢纽占用，不做（ADR-0026 否决项）。
- 新增独立军力容量科技线——复杂度收益不匹配（ADR-0027 否决项）。
- 胁迫外交阈值调整（5000→6500 等）——武断，不做（grill Q6 否决项）。
- post100 / 升级成本曲线调整——已核实 ROI≡P 不变量与台数无关，维持现状（ADR-0022 澄清段）。
- 攻占/骚扰平衡、天体 outputBonus、舰队基础数值——各自独立议题。

## Further Notes

- 关系：本 spec 不依赖也未被依赖其他 feature；与 fleet-power-exploration（星舰科技线）是**增量收益侧补充**（该 spec 建线，本 spec 给终点），与 fleet-dock-10（护航）共享护航费锚定结构。
- Open items（实现期可拍板）：科技卡 desc 文案具体措辞；两个质变的 UI 表现（角标/描述行）；balance-sim 断言容差参数。
