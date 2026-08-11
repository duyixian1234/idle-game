# 科技线补全：神经网络科技 + 军械科技等级上限 5→10

ADR-0049：科技点产出线此前仅 1 条可升级科技（`computingBoost` 计算加速 ×1.5），纵向深度低于矿物线（planetDrill×1.5 + nanoFab×2）与能源线（solarEfficiency×1.5 + fusionCell×2.5）；军械科技（`militaryTech`）是唯一 `maxLevel=5` 的短升级线产出科技，Lv5 后军力产出/容量/舰队战力三线封顶。本 ADR 两处补全：① 新增科技**神经网络（neuralNetwork）**——`production`/tech ×2.5，成本 `{mineral: 6000, tech: 400}`，前置 `computingBoost`，新增 `neuralNet` 图标；② **军械科技 `maxLevel` 5→10**，数值公式全部不变。

**状态**: Accepted（2026-08-11，grill 2 轮：Q1 纯产出倍率、Q2 对齐 fusionCell、Q3 命名神经网络、Q4 新增图标、Q5 军械公式不变仅放上限、Q6 完整 ADR、Q7 合并 spec）
**证据**: `src/engine/data.ts`（`TECHS.neuralNetwork` 新增；`TECHS.militaryTech.maxLevel = 10`）；`src/ui/icons.ts`（`neuralNet` symbol）；`src/i18n/zh.ts:672` / `en.ts:664`（`tech.neuralNetwork.*` 对称）；`src/engine/fleet.ts:60`（注释满级 Lv10 = 2×）；`src/engine/tech.test.ts`（前置/研发/累乘测试）；`src/engine/military.test.ts`（Lv10 满级断言）；`src/engine/balance-simulation.test.ts`（后期守卫测试军械 Lv10 满配）

## 背景

**科技点线不对称**。产出类科技按资源分组：矿物 `planetDrill`（×1.5，500/10）+ `nanoFab`（×2，12000/1000，requires planetDrill）；能源 `solarEfficiency`（×1.5，900/25）+ `fusionCell`（×2.5，6000/400，requires solarEfficiency）；科技点仅 `computingBoost`（×1.5，1400/60）一条。科技点是全局解锁货币（科技/建筑/外交均消耗），其供给线纵向深度明显低于矿/能，中后期科技点增长缺乏第二条升级轴。

**军械科技短线**。`militaryTech`（20000/2000，`unlockByConquest: 'outpost'`）`maxLevel: 5`，是所有 production 科技中唯一短升级线。`productionMultipliers`/`techMultiplier` 的线性公式（`mult + 0.5×(lv−1)`）下 Lv5 即封顶（产出 ×3、容量 ×1.5、舰队战力 ×1.5），终局军事成长只剩虫洞军力线（ADR-0047）单轴。

## 决策

1. **新增科技 `neuralNetwork`（神经网络）**：`effect: { kind: 'production', resource: 'tech', mult: 2.5 }`，`cost: { mineral: 6000, tech: 400 }`，`requires: ['computingBoost']`，`icon: 'neuralNet'`，`maxLevel` 缺省 = `TECH_MAX_LEVEL`（10）。与能源线第二条 `fusionCell` 完全同构（×2.5、6000/400、requires 第一条）；`maxLevel` 不设短上限——产出类科技统一 10 级，科技点线满级与矿/能一致。
2. **新增 `neuralNet` 图标**：`icons.ts` 新增 symbol（节点网络线性风格，24px/currentColor），满足 `icons.test.ts:46`「科技 icon 必须存在 symbol」约束；`quantumCore` 已被 computingBoost 占用，不复用避免语义重叠。
3. **i18n zh/en 对称新增** `tech.neuralNetwork.name` / `.desc`（「构建分布式神经网络阵列，科技点产出 {mult}。」/ 'Builds distributed neural computing arrays: tech point output {mult}.'），满足 `i18n/index.test.ts:26` key 对称校验。
4. **军械科技 `maxLevel` 5 → 10**：仅改等级上限，数值公式全不动——产出每级 `LEVEL_PRODUCTION_BONUS=0.5`（Lv10 ×5.5）、军力容量每级 `MILITARY_CAP_TECH_PER_LEVEL=0.1`（Lv10 ×2）、舰队战力每级 `FLEET_POWER_TECH_PER_LEVEL=0.1`（Lv10 ×2）。`descArgs` 不变（描述每级效果与上限无关）。`fleet.ts` 注释满级表述同步（Lv5 1.5× → Lv10 2×）。
5. **零 schema 变更**：不新增存档字段；`techLevels` 已有 key 语义不变，老存档无迁移（游戏无真实玩家，先例 ADR-0038）。UI 数据驱动自动渲染（`renderTechPanel` 遍历 `Object.values(TECHS)`、`renderMilitaryTechSection` 的 `Lv.MAX` 徽标读 `def.maxLevel`），无结构改动。

## 为什么

- **对称补齐 vs 过度设计**：科技点线补到「矿/能/科各两条」即止，与既有对称结构完全一致；不引入第三形态（如科技成本折扣、研发加速），避免与既有升级体系（×1.7^level 成本）交错。
- **×2.5 对齐 fusionCell 而非 nanoFab 的 ×2**：科技点是瓶颈货币（产出增速慢于矿物，且天文数字需求存在——如虫洞理论 500 亿科技），第二条科技线给足强度；成本 6000/400 与 fusionCell 同构，`requires computingBoost`（1400/60）保证解锁时序自然递进。
- **军械上限 5→10 公式不变**：军力是容量资源——产出有满员截断（`militaryCap` 截断），容量有攻占投入/探索派遣/迎击消耗口，数值增长不会滚雪球。Lv10 容量 ×2 与虫洞 Lv10 ×2 乘法叠加 = ×4，方向为后期军力强化（对齐 2026-08-09「后期军力不足被虫群啃食」痛点）；`balance-sim` 守卫测试（Lv10 满配）重算后攻占回充 47.3s 仍 ≤ 60s 冷却，节奏不破。
- **数据驱动**：TECHS 为唯一真源，`productionMultipliers`/`techMultiplier` 线性公式自动拾取新科技，UI/测试全数据驱动，改动面最小。

## 后果

- **数值**：科技点产出双线——`computingBoost ×1.5` + `neuralNetwork ×2.5`，Lv10 满级科技点乘子 = (1.5+0.5×9)×(2.5+0.5×9) = 6×7 = ×42（对比矿物 nanoFab×planetDrill Lv10 = 6×6.5 = ×39，量级对齐）。军械 Lv10：产出 ×5.5、容量 ×2、舰队战力 ×2（与 warpDrive Lv20 ×3 叠 = ×6）。
- **测试**：`tech.test.ts` +3（前置不可研/研发扣费/累乘 ×3.75 + Lv2 线性）；`military.test.ts` 满级断言 5→10 + Lv10 容量 ×2；`fleet.test.ts` Lv10 战力 ×2；`balance-simulation.test.ts` 守卫测试升军械 Lv10 满配（guard 22,000、cap 40,200、回充 47.31s）。全量 980 passed + `tsc --noEmit` 零错误。
- **关联**：↔ ADR-0027（军械容量通道，等级轴沿用）；↔ ADR-0047（虫洞军力线，Lv10 ×2 与军械 Lv10 ×2 并列乘法）；↔ ADR-0038（数据新增/删除先例——残留 key 不读即无害）；↔ ADR-0036（科技走等级维度，本次仍遵守不引入数量×等级耦合）。
