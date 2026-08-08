Status: ready-for-agent

# Spec: 普通建筑取消升级 + 移除批量与买满（机制二分）

## Problem Statement

普通可多次购买建筑的升级成本公式含 `× count`（已购数量），且买入成本自身随 count 多项式增长形成双重放大——升级那一步的绝对成本随台数爆炸（100 台升级 ≈ 首台 10 万倍）。虽然 ROI 恒定 P=2（`×count` 在成本与收益同时出现抵消，ADR-0021/0022），但绝对成本门槛锁死"先升后买"为唯一最优策略序，玩家被迫先升后买才不卡门槛，自由度低（**P2 痛点**）。同时 +10/+100 批量按钮散布于购买建造物、升级建造物、贸易、技术共享、科技升级五处，buyMax（Shift 买满）走 `bulk.ts` for 循环（上限 100000）——批量致决策疲劳（**M1 痛点**）+ 大后期性能隐患，且后期基础建造物购买需求消失使买满入口冗余。

## Solution

机制二分：7 个普通可多次购买建筑（miner/solar/lab/refinery/deepDrill/barracks/militaryPort）砍掉升级，产出回归 `produces×count`（数量维度）；等级维度仅留 unique 大件（×2/级，maxLv10）与科技（×1.7^level，不含 count）。移除所有 +10/+100 批量与 buyMax 买满，单次操作统一为 1（buyBuilding/upgrade/upgradeTech/factionTrade/factionTechShare）。军力容量 portLevel 项失效（恒 0），军械科技成唯一等级放大轴（×1.5 @Lv5）；COERCION 解锁 5000 与 militaryCap5k 成就不变。不补偿成长（post100 动态下限保跨周目不塌，留全局增益科技为扩展点）。存量档 SCHEMA 14→15 折算返还普通建筑升级投入。

## User Stories

1. 作为玩家，我希望普通建筑只有"买多少"一个决策维度，这样我不必纠结"先升还是先买"的策略序。
2. 作为玩家，我希望升级只出现在唯一大件和科技上，这样"升级"语义一致——升级是唯一对象的等级成长，不是数量放大。
3. 作为玩家，我希望购买/升级/贸易/科技操作只有"单次"一个档位，这样我不再纠结 +10/+100/买满的档位选择。
4. 作为玩家，我希望大后期不必再被 buyMax 入口诱导批量购买基础建造物，因为后期基础建造物购买需求已消失。
5. 作为老存档玩家，我希望之前投入在普通建筑升级上的矿物/能源/科技能被折算返还，这样机制变更不让我白花资源。
6. 作为军力玩法玩家，我希望军力容量仍可达 25 军港解锁胁迫外交（5000），这样砍掉军港升级不破坏前期节奏。
7. 作为开发者，我希望删除 bulk.ts 后自动化外交（autoDiplomacyTick）仍正常工作，因为它直调单次动作不走 bulk。
8. 作为开发者，我希望唯一大件升级链路（星港矿场/聚变阵列/星海智库/星环冶炼场/船坞）完全不受影响，因为其 upgradeCost 分支不含 count。
9. 作为开发者，我希望科技升级完全不受影响，因为它与建筑升级代码完全独立。
10. 作为玩家，我希望跨周目（NG+）普通建筑成本曲线仍不塌缩，因为 post100 动态下限仍作用于买入价。
11. 作为玩家，我希望移除批量后单次购买的反馈日志仍记录"买了什么、花了多少"，这样我能确认操作生效。
12. 作为自动化玩法玩家，我希望自动外交与自动攻占在批量移除后仍自动推进，因为它们直调单次动作不依赖 bulk。

## Implementation Decisions

- **机制二分（ADR-0036）**：`upgradeBuilding` 对 7 个普通建筑 id 封死拒绝；`upgradeCost` 普通分支删除（unique 分支保留）；`ordinaryUpgradeCostValue` 删除。产出回归：production 的 `pipelineNominal` 去 levelMultiplier 普通应用（产出 = `produces×count`）；`levelMultiplier` 函数保留（militaryCap portLevel + unique 仍用，虽 portLevel 恒 0）。
- **军力容量**：`militaryCap` 公式结构不变，portLevel 恒 0 使 `(1+0.5·lv)` 项失效，军港回 200/座线性。军械科技为唯一等级放大轴。不补偿（`MILITARY_PORT_CAP`/`MILITARY_CAP_TECH_PER_LEVEL` 不调）。
- **移除批量（ADR-0037）**：`bulk.ts` 整文件删除（buyMax 全删后无调用方）；4 个 `*Max` action（buyMax/upgradeMax/upgradeTechMax/runDiplomacyMax）+ `diplomacyMax.limit` 字段删除；`openBuyMaxModal` + Shift 买满入口删除；5 处 +10/+100 按钮渲染（build 购买/升级、diplomacy 贸易/技术共享、tech 科技升级）删除；listeners 批量解析段删除。单次操作走各单次 action。`autoDiplomacyTick` 内部 for 循环直调 `factionTrade`/`factionTechShare`，不走 bulk，不受影响。
- **常量清理**：`UPGRADE_PREMIUM`/`ORDINARY_UPGRADE_LEVEL_GROWTH`/`LEVEL_COST_FACTOR` 删除（仅普通升级用）；`buildingCost` 等级因子（`1+0.05×level`）随 upgrades 恒 0 失效，简化。SHARED 保留：`LEVEL_PRODUCTION_BONUS`（techMultiplier 共用根）、`levelMultiplier` 函数、`UNIQUE_UPGRADE_GROWTH`、`upgradeCost`/`upgradeBuilding`/`canAffordUpgrade` 的 unique 分支、`upgrade` action（unique 入口）。
- **存档迁移**：SCHEMA 14→15，新增 `migrateV14ToV15`（参照 `migrateV13ToV14` 链式范式）。遍历 7 普通建筑 `upgrades[id]`，用原 `upgradeCost` 公式倒算每级投入（按 costKey 分矿物/能源/科技），累加返还 `state.resources`；unique upgrades 不动。
- **不补偿成长**：post100 动态下限（ADR-0022）仍作用于普通买入价，保跨周目相对价格不塌。留"全局增益科技"为后续扩展点（若实测某建筑变缓再加 TechDef 条目）。

## Testing Decisions

- **seam**：沿用双层 seam（ADR-0017）——引擎层 Vitest 主 seam + UI jsdom 冒烟次 seam + balance-sim 平衡模拟（ADR-0018）。不新增 seam。
- **引擎层覆盖**：
  - `buildings.test`：7 普通建筑升级封死（`upgradeBuilding` 拒绝）；unique 升级正常；产出回归 `produces×count`（无 levelMultiplier 放大）。
  - `production.test`：`militaryCap` portLevel 恒 0（25 军港=5100）；`pipelineNominal` 去 mul。
  - `military.test`：COERCION 解锁 5000 仍由 25 军港达成；militaryCap5k 成就不变。
  - `save.test`：`migrateV14ToV15` 折算返还（7 建筑 `upgrades>0` 的老档返还资源正确，unique 不动）。
- **平衡模拟**：post100 动态下限跨周目相对价格比值仍 1.00（普通买入价）；删原升级 ROI P=2 不变量测试（失效）；删普通升级单调性测试（0036 推翻 upgrade-cost-monotonic 普通段）。
- **UI 冒烟**（`dom.test` 按域，ADR-0017 次 seam + ADR-0020 data-* 契约）：build panel 无升级按钮、无 +10/+100；diplomacy panel 无 +10/+100；tech panel 无 +10/+100；全站无 buyMax/买满入口；单次购买/升级/贸易按钮仍渲染且 disabled 态正确。
- **删除测试**：`bulk.test` 整删；`military.test` buy-max 段删；`buildings.test` 普通升级组删；`cost-softcap.test` 升级温和增长组删；`post100-cost-curve.test` 升级段删。
- **保留测试**：`fleet.test`（dock unique 升级）、`interstellar.test`（starportMine unique 升级）。
- **好测试标准**：给定输入状态+动作断言输出，不 mock 内部方法；迁移测试用真实老档 fixture；data-* 契约断言禁类名（ADR-0020）。

## Out of Scope

- 全局增益科技补偿（留扩展点，本轮不实现）
- 军力容量数值补偿（`MILITARY_PORT_CAP`/`MILITARY_CAP_TECH_PER_LEVEL` 不调）
- 唯一大件升级改动
- 科技升级改动（含 +10/+100 移除但 `upgradeTech` 单次保留）
- 自动外交/自动攻占逻辑改动（`autoDiplomacyTick`/`autoConquest` 不动）
- 移动端买满替代手势（已无 buyMax）

## Further Notes

- 砍升级根因=`×count` 双重放大锁死策略序（P2），非 ROI 失衡（ROI 恒定 P=2，ADR-0022 已证）。
- `bulk.ts` 整删是 ADR-0036+0037 共同后果（无 buyMax 即无 bulk）。
- 推翻 `buy-max` spec（建立 buyMax）与 `upgrade-cost-monotonic` spec（普通建筑升级成本段），均加推翻标注。
- 设计经 grill-with-docs 五轮访谈定稿（2026-08-08）：Q1 方向 B、Q2 M1、Q3 移除 buyMax、Q4 P2、Q5-Q8 推荐采纳。决策落 ADR-0036/0037。
- 军力容量等级放大 ×6（军港升级 Lv10）→×1.5（军械科技 Lv5），绝对值缩水但约束玩法语义不破（数量轴为主，符合 ADR-0027 设计意图）。
