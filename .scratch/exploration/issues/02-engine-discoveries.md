# 02 — 探索势力池 + 探索天体池（发现物实现）

**What to build:** 实现两个发现物池及其机制接线：
- **势力池（决策 A4/Q10）**：`data.ts` 新增 `EXPLORE_FACTIONS`（4 家具名：`ashCommune` 灰潮共同体 favor10/threat35 `tradeDiscount:0.05`、`ringOrder` 星环修道会 favor15/threat25 纯叙事、`obsidianPact` 黑曜协议 favor5/threat55 纯叙事、`nodeIntellect` 节点智械 favor10/threat40 `techShareCostMult:0.5`）。`FactionDef` 扩可选 `tradeDiscount?: number`、`techShareCostMult?: number`。`diplomacy.ts` 从 `createFactions` 抽 `createFactionState(def)` 供探索入账复用；`tradeCost` 通用折扣后再乘 `(1 - def.tradeDiscount)`；`factionTechShare` 成本乘 `def.techShareCostMult`。
- **天体池（决策 A5/Q11）**：`data.ts` 新增 `EXPLORE_PLANETS`（`logistics` 星际物流港 mechanicId `logisticsHub`、`outpost` 殖民前哨 mechanicId `outpost`），`PlanetDef` 扩 `discoverOnly?: boolean`，`checkPlanetUnlocks`/`planetRequirementsMet` 跳过 `discoverOnly`。`types.ts` 的 `MechanicId` 加 `'logisticsHub' | 'outpost'`；`mechanics.ts` 的 `PLANET_MECHANICS` 注册 2 项（`logisticsHub`：科技点折算能源折减——`production.ts` `settleEnergyRatio` 用 `effectiveEnergy = energy + tech * LOGISTICS_TECH_ENERGY_RATIO`（balance 常数，初值 0.5）；`outpost`：`applyPlanetMechanics` 矿物 ×1.25 且能源折减消费侧 ×1.2）。探索入账走 `state.planets[id] = { unlocked: true, unlockedAt }`。

**Blocked by:** 01（探索入账调用 `createFactionState`/池）

**Status:** resolved

- [ ] `data.ts`：`EXPLORE_FACTIONS` 4 家（含 desc 叙事）+ `EXPLORE_PLANETS` 2 个 + `discoverOnly` 标记 + FactionDef 扩字段
- [ ] `diplomacy.ts`：抽 `createFactionState`；`tradeCost` 应用 `tradeDiscount`；`factionTechShare` 应用 `techShareCostMult`
- [ ] `types.ts`：`MechanicId` 联合类型扩展
- [ ] `mechanics.ts` / `production.ts`：`logisticsHub` 与 `outpost` 机制实现（balance 加 `LOGISTICS_TECH_ENERGY_RATIO` 初值）
- [ ] `engine.ts`：`checkPlanetUnlocks` 跳过 `discoverOnly`
- [ ] 单测：联邦判定（发现新势力后 `isFederationUnified` 变 false、全部纳入后恢复 true）；外交差异（灰潮 -5% / 智械半价 / 其余不变）；`logisticsHub` 能源缺口场景 ratio 提升；`outpost` 矿物 ×1.25 + 能源消耗 ×1.2；`discoverOnly` 不被自动解锁、探索解锁后可 `setActivePlanet`

**Acceptance:** 探索发现势力即出现在外交面板（favor/threat 取 def 初值）；发现天体即进行星栏可切换；联邦判定对新势力自动纳入；机制数值单测锁定。
