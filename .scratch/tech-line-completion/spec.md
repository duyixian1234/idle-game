# 科技线补全：神经网络科技 + 军械科技等级上限（tech-line-completion）

**Status:** delivered

## Problem Statement

科技点产出线与矿物/能源线纵向深度不对称：

1. **科技点产出科技唯一**。矿物线有 `planetDrill`（×1.5）+ `nanoFab`（×2）两条，能源线有 `solarEfficiency`（×1.5）+ `fusionCell`（×2.5）两条，科技点线只有 `computingBoost`（计算加速，×1.5）一条（`TECHS`，data.ts:454-543）。玩家中后期科技点增长缺乏第二条可升级科技，科技点作为全局解锁货币（科技/建筑/外交均消耗）其供给线纵向深度低于矿/能。

2. **军械科技等级上限偏低**。`militaryTech`（军械科技，data.ts:510-519）`maxLevel: 5`，是唯一短升级线的产出类科技（其余生产科技均为默认 `TECH_MAX_LEVEL=10`）。Lv5 后军力产出、军力容量、舰队战力三线全部封顶，终局军事成长只能依赖虫洞军力线（ADR-0047），军事纵向轴比资源线短一半。

代码事实（已由探索确认）：

- `productionMultipliers`（production.ts:278-286）汇总所有 production 类科技乘子，按 `techMultiplier = mult + 0.5×(lv−1)`（production.ts:292-294）线性累乘；新增科技零成本接入。
- 科技面板 `renderTechPanel`（ui/render/tech.ts:25）数据驱动遍历 `Object.values(TECHS)`，无科技硬编码；军械科技由 `renderMilitaryTechSection`（ui/render/military.ts:118）专用渲染，`Lv.MAX` 徽标读 `def.maxLevel`（military.ts:142），改上限自动生效。
- `militaryCap`（production.ts:33-42）军械每级 `MILITARY_CAP_TECH_PER_LEVEL=0.1`；`fleetPower`（fleet.ts:60-70）军械每级 `FLEET_POWER_TECH_PER_LEVEL=0.1`，注释写明「满级 Lv5 = 1.5×」。
- 图标：`quantumCore` 已被 computingBoost 占用；`icons.test.ts:46` 强制科技 `icon` 必须存在对应 symbol。i18n `index.test.ts:26` 强制 zh/en key 对称。
- 测试基准：`military.test.ts:156-160` 有「Lv5 已满级」断言；`balance-simulation.test.ts` 多处把 `militaryTech=5` 当满配模拟基准；`production.test.ts:30,53`、`fleet.test.ts:154,166` 用 Lv5 档位。

## Solution

对科技线做两处补全，均为数据驱动新增/调整，零 schema 变更、无 UI 结构改动：

1. **新增科技「神经网络」（neuralNetwork）**：第二个提升科技点产出的可升级科技，`production` 类，`tech` ×2.5，成本 `{mineral: 6000, tech: 400}`，前置 `requires: ['computingBoost']`，新增 `neuralNet` 图标，i18n zh/en 对称新增。
2. **军械科技等级上限 5 → 10**：`militaryTech.maxLevel` 5 → 10，所有数值公式不变（产出每级 +0.5、容量每级 +10%、舰队战力每级 +10%）。

## 决策记录（grill）

- **Q1 机制形态 = (a) 纯产出倍率**：与 computingBoost 同类 production kind，累乘；与矿物线（planetDrill→nanoFab）、能源线（solarEfficiency→fusionCell）完全对称；数据驱动改动最小。
- **Q2 数值定位 = (b) 对齐 fusionCell**：×2.5，成本 `{mineral: 6000, tech: 400}` 与 fusionCell 同构；科技线第二条强度与能源线对齐（高于矿物线 nanoFab 的 ×2）。requires computingBoost 天然解锁时序。
- **Q3 命名 = 神经网络（Neural Network）**：与「计算加速」同主题不同技术栈，区分 quantumCore 意象。
- **Q4 图标 = 新增 `neuralNet`**：quantumCore 已被占用；新图标与现有 SVG 风格一致，满足 `icons.test.ts:46` symbol 约束。
- **Q5 军械数值 = (a) 公式不变仅放上限**：maxLevel 5→10，产出/容量/舰队战力系数全不动。军力是容量资源，产出有满员截断、容量有攻占/派遣消耗口；军械 Lv10 容量 ×2 与虫洞 Lv10 容量 ×2 乘法叠加 = ×4，接受（后期军力强化方向正确，与记忆「后期军力不足被虫群啃食」痛点一致）。
- **Q6 文档 = 完整 ADR + CONTEXT 更新**：两个需求各自独立 ADR 决定（神经网络新增 / 军械上限调整），或一个 ADR 合并记录，按 domain-modeling 三条件判断。
- **Q7 spec 组织 = 合并一个 spec**：科技线补全主题，issues 拆两条独立 ticket 链。

## User Stories

1. 作为中期玩家，我希望科技点产出有第二条可升级科技（神经网络），以便科技点供给线与矿物/能源同样有纵向纵深。
2. 作为已研发计算加速的玩家，我希望神经网络在计算加速后解锁，以便科技解锁时序自然递进、前置线对称（nanoFab/fusionCell 先例）。
3. 作为军械科技玩家，我希望军械科技等级上限从 5 提升到 10，以便军力产出、军力容量、舰队战力三线继续成长。
4. 作为终局玩家，我希望军械 Lv10 容量加成与虫洞 Lv10 容量加成叠加可预期（×2×2=×4），以便规划军力配置。
5. 作为开发者，我希望新增科技/调整上限不破坏现有 UI 渲染与 i18n 对称性，以便维护成本可控。

## Implementation Decisions

1. **神经网络 TechDef**（`TECHS` 新增，data.ts）：
   - `id: 'neuralNetwork'`，`nameKey`/`descKey` 指向新增 i18n key，`descArgs: { mult: ×2.5 }`。
   - `cost: { mineral: 6000, tech: 400 }`，`effect: { kind: 'production', resource: 'tech', mult: 2.5 }`，`requires: ['computingBoost']`，`icon: 'neuralNet'`。
   - `maxLevel` 缺省 = `TECH_MAX_LEVEL`（10），升级机制/成本曲线（`×1.7^level`）全复用。
2. **neuralNet 图标**（icons.ts）：新增一个 symbol，风格对齐现有科技图标（节点/网络/芯片意象），被 `icons.test.ts:46` 自动校验。
3. **i18n zh/en 对称新增**（zh.ts + en.ts）：`tech.neuralNetwork.name` / `tech.neuralNetwork.desc`，文案风格对齐 computingBoost（「…科技点产出 {mult}」）。
4. **军械科技 maxLevel 5 → 10**（data.ts `militaryTech`）：仅改 `maxLevel`；`descArgs` 不变（描述每级效果，与上限无关）。
5. **fleetPower 注释同步**（fleet.ts:65）：「满级 Lv5 = 1.5×」→「满级 Lv10 = 2×」；`FLEET_POWER_TECH_PER_LEVEL` 数值不变。
6. **不新增存档字段**：`techLevels` 已有 key 语义不变，老存档无需迁移（游戏无真实玩家，残留 key 不读即无害，先例 ADR-0038）。

## Testing Decisions

- **好测试的标准**：断言外部行为（乘子数值、研发/升级动作、满级边界、渲染 DOM），不断言实现细节。
- **主接缝 `productionMultipliers`**（production.test.ts，先例：tech.test.ts:30-36「多个产出科技累乘」）：
  - computingBoost Lv1 + neuralNetwork Lv1 → tech 乘子 = ×1.5×2.5 = ×3.75；Lv2 → (1.5+0.5)×(2.5+0.5)。
  - 军械 Lv10 → military 乘子 = 1+0.5×9 = ×5.5。
- **辅接缝 `techRequirementsMet` / `researchTech` / `upgradeTech`**（tech.test.ts）：
  - 无 computingBoost 时神经网络不可研发（前置失败原因）；有则研发成功扣除 `{mineral: 6000, tech: 400}`。
  - 升级路径 Lv1→Lv10，满级返回「已满级」。
  - 军械 Lv10 升级返回「已满级」（military.test.ts:156 满级断言 5 → 10）。
- **容量/战力边界**（military.test.ts / fleet.test.ts）：
  - `militaryCap`：militaryTech Lv10 → 容量 ×(1+0.1×10)=×2 断言。
  - `fleetPower`：militaryTech Lv10 → 战力 ×(1+0.1×10)=×2 断言。
- **自动强制接缝**（无新增代码）：`icons.test.ts:46`（neuralNet symbol 存在）、`i18n/index.test.ts:26`（zh/en key 对称）。
- **balance-sim 复核**：`balance-simulation.test.ts` 中 `militaryTech=5` 满配基准按语义复核（若模拟「终局满配」则更新到 Lv10；若为「中期配置」则保留）。
- **回归**：全仓 `vitest run` 全绿 + `tsc --noEmit` 零错误。

## Out of Scope

- 不新增存档字段、不迁移存档（`techLevels` 残留 key 无害）。
- 不调整 `MILITARY_CAP_TECH_PER_LEVEL` / `FLEET_POWER_TECH_PER_LEVEL` / `LEVEL_PRODUCTION_BONUS` / `TECH_UPGRADE_GROWTH` 任何数值。
- 不触碰军械科技解锁条件（`unlockByConquest: 'outpost'` 不变）与研发成本（20000/2000 不变）。
- 不改其他科技（planetDrill/nanoFab/solarEfficiency/fusionCell/computingBoost）数值。
- 不新增 UI 面板/新接缝（科技面板数据驱动自动渲染）。

## Further Notes

- 平衡影响：军械 Lv10 军力容量 ×2 与虫洞 Lv10 ×2 叠乘 = ×4（对比现状 Lv5 ×1.5 × 虫洞 Lv10 ×2 = ×3）；军力是容量资源，满员截断产出、容量有攻占/派遣消耗口，方向为后期军力强化（对齐 2026-08-09 后期军力不足痛点）。
- 关联 ADR：ADR-0027（军械科技容量线）、ADR-0047（虫洞军力线）、ADR-0038（删除探索科技——数据新增先例）。
