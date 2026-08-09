# 虫洞探索线 + 星际帝国成就（wormhole-empire）

**Status:** ready-for-agent

> **ADR 前置**：本 spec 实现完成后新增 ADR-0042（虫洞解锁链 / 探索槽位 20 上限 / 三座终局工程）。
> 域决策参考 ADR-0038（探索队列单一门控被本 spec 扩展为「枢纽 + 虫洞双门控」）。

## Problem Statement

1. **探索队列容量封顶**：探索槽位硬上限 10（基础 5 + 跃迁枢纽 Lv10 +5，ADR-0038 单一门控）。infinite 阶段探索为唯一增长引擎，槽位封顶后成长停滞，深层玩家缺乏长线建筑目标。
2. **结盟数缺少机制出口**：infinite 阶段程序生成派系可持续结盟（10/20 个可达），但结盟数只是计数，无解锁回报——外交推进动力不足。
3. **探索「发现新目标」无放大手段**：奖池权重与生成目标上限（`generatedCap`）均为固定公式，探索效率无法通过建筑/科技进一步放大。

## Solution

- **虫洞（wormhole）**：第三座终局工程（探索线延伸，unique 大件，Lv1-10）。当**结盟派系 ≥ 10** 时解锁科技「虫洞理论」（研发后可建造虫洞）。效果随虫洞等级提升：
  1. **探索槽位 +10**（每级 +1，Lv1 解锁第 11 槽、Lv10 满 20 槽）——与跃迁枢纽槽位表并列叠加，总上限 20。
  2. **探索能源消耗 −50%**（每级 −5%，只作用基础派遣能源，不含护航费）。
  3. **发现新目标权重 ×2**（每级 +10%，作用于 faction/planet/conquest 非 resource 分支）。
  4. **程序生成目标上限 +10**（`generatedCap` 原公式 + 虫洞等级）。
- **星际帝国成就**：虫洞 Lv10 且结盟 ≥ 20 → 解锁（collect 类，周目可重解锁，rep 8）。
- 全部周目内口径（建筑/科技/结盟数随 NG+ 重置，成就随周目重打）。

## User Stories

1. 作为通关后玩家，我希望结盟派系达到 10 个时看到「虫洞理论」科技解锁，以便外交推进有明确的长线回报。
2. 作为玩家，我希望研发「虫洞理论」后能建造虫洞（unique 大件，Lv1-10），以便把它作为第三座终局工程投资。
3. 作为玩家，我希望虫洞每升 1 级 +1 探索槽位，以便探索队列能从 10 槽一路扩到 20 槽。
4. 作为玩家，我希望虫洞每级 −5% 探索能源消耗（Lv10 封顶 −50%），以便高槽位并行派遣时能源压力可控。
5. 作为玩家，我希望虫洞提升探索「发现新目标」权重（Lv10 非 resource 分支 ×2），以便探索更容易带回新势力/新天体/新军事目标。
6. 作为玩家，我希望虫洞提升程序生成目标数量上限（原公式 + 虫洞等级），以便 infinite 阶段新目标供给随虫洞成长。
7. 作为玩家，我希望探索页槽位上限从 10 改为 20，并显示每档解锁来源（跃迁枢纽 / 虫洞），以便清楚规划两条升级线。
8. 作为玩家，我希望星际工程分组与终局工程区块正确展示虫洞（锁定原因 / 建造 / 升级 / 效果预览），以便在建造面板中管理它。
9. 作为玩家，我希望虫洞纳入 NG+ 遗产折算（每级 +1.5% 全产出），以便三条终局线周目收益一致。
10. 作为玩家，我希望虫洞 Lv10 且结盟 20 时达成「星际帝国」成就（周目内重解锁，rep 8），以便外交与建筑双线都有终点目标。
11. 作为玩家，我希望现有 10 槽体验与测试不回归（无虫洞时槽位/成本/权重/上限与现状逐字节一致），以便存量进度零破坏。

## Implementation Decisions

### 1. 虫洞理论科技（TECHS 新增 `wormholeTheory`）

- `id: 'wormholeTheory'`，`name: '虫洞理论'`，`effect: { kind: 'unlockBuilding', buildingId: 'wormhole' }`（纯门控，Lv1 即解锁建筑，无升级线）。
- `cost: { mineral: 1_000_000_000_000, tech: 50_000_000_000 }`（1 兆矿 + 50 亿科技，用户按结盟 10 时点产出速度估算）。
- 解锁条件：**结盟派系 ≥ 10**——`TechDef` 新增可选字段 `requiresAllies?: number`；`techRequirementsMet` / `canResearchTech` / `researchTech` 增加检查（factionDef 存在且 `f.allied` 计数，与成就 `alliedCount` 同口径，复用同一 helper）。
- `afterEnding: true`（通关后可见——结盟 10 实际仅 infinite 可达，但门控按现有 afterEnding 先例声明）。
- 存档：`techLevels` 是 `Record<string, number>`，新 key 零迁移、不升 SCHEMA。
- **tech.ts 渲染**：未研发时锁定卡显示「需先研发：…」或「需结盟 ≥10 个派系」（新锁原因优先显示结盟数）。

### 2. 虫洞建筑（BUILDINGS 新增 `wormhole`）

- `id: 'wormhole'`，`name: '虫洞'`，`category: 'interstellar'`，`unique: true`，`maxLevel: 10`。
- `baseCost: { mineral: 5_000_000_000_000, tech: 100_000_000_000 }`（5 兆矿 + 100 亿科技）。
- `requiresEnded: true`、`requiresTech: ['wormholeTheory']`（结盟门槛在科技上，建筑不重复）。
- `produces: {}`（纯机制流，不产出资源）、无 maintenance、无 consumes。
- 升级：unique 建筑通用 `upgradeCost`（baseCost × 2^level）与 `upgradeBuilding` 已覆盖，零新代码；效果读 `state.upgrades.wormhole`（unique 建筑等级惯例，`buildings` 字段恒 0/1）。
- **解锁判定**：`isBuildingUnlocked` / `buildingLockReason` 无需改动（requiresTech 已纳入现有链）。

### 3. 探索槽位 20（exploration.ts）

- `WORMHOLE_SLOT_TABLE`：`Record<number, number>`，`{ 1:1, 2:2, …, 10:10 }`（每级 +1，与 `JUMPGATE_SLOT_TABLE` 显式表同风格）。
- `explorationSlots(state)`：`Math.min(20, 5 + (JUMPGATE_SLOT_TABLE[枢纽等级] ?? 0) + (WORMHOLE_SLOT_TABLE[虫洞等级] ?? 0))`——基础 5 + 枢纽(≤5) + 虫洞(≤10)，**上限 20**；无虫洞时与现状逐字节一致（虫洞 0 级 → +0）。
- 新增 `wormholeLevelForSlot(slotNo)`：第 11-20 槽所需虫洞等级（slotNo-10），与 `jumpgateLevelForSlot` 同源防漂移。
- **UI（explore-page.ts）**：`SLOT_CAP` 10 → 20；第 6-10 槽锁提示「跃迁枢纽 LvX」，第 11-20 槽锁提示「虫洞 LvX」。
- **自动探索**：`autoExploreDispatch` / `settleOfflineAutoExplore` 读 `explorationSlots`，自动随 20 槽扩大，零改动。

### 4. 探索能源减耗（exploration.ts）

- 新增 `wormholeEnergyReduction(state)`：`Math.min(1, 0.05 × wormhole等级)`（Lv10 = 0.5）。
- `expeditionCost`：`energy` 分支乘以 `(1 − wormholeEnergyReduction)`，`Math.max(1, floor(...))` 保底；**只作用基础派遣能源**，护航费（`escortFee`）不动、军事点不动。
- 无虫洞时 `reduction = 0` → 与现状逐字节一致。

### 5. 发现新目标权重提升（exploration.ts）

- 新增 `wormholeDiscoveryMult(state)`：`1 + 0.1 × wormhole等级`（Lv10 = ×2）。
- `expeditionPool`：faction/planet/conquest（含 endless/gen 分支）的 `weight` 乘 `wormholeDiscoveryMult`；**resource 补偿分支权重不乘**（补偿不随虫洞膨胀）。
- 无虫洞时 mult = 1 → 与现状逐字节一致。
- `rollFromPool` 权重消费逻辑不动（调用方已传入放大后的 weight）。

### 6. generatedCap 提升（generate.ts）

- `generatedCap(state, kind)`：`max(2 + floor(探索次数/10), 2 + 周目数) + wormhole等级`（原公式 + 虫洞等级，叠加式）。
- 依赖：generate.ts 需读 `state.upgrades.wormhole`（可从 exploration 或直接 state 读，避免环依赖——直接读 state 字段，不引 exploration 模块）。

### 7. 星际帝国成就（achievements.ts）

- `ACHIEVEMENTS` 新增 `stellarEmpire`：
  - `id: 'stellarEmpire'`，`icon: 'wormhole'`（icons.ts 新增 symbol），`name: '星际帝国'`，`desc: '虫洞 Lv.10 且结盟 20 个派系——文明触角伸向整个星海。'`
  - `category: 'collect'`（周目可重解锁），`recurring` 缺省 true。
  - `condition: (s) => (s.upgrades.wormhole ?? 0) >= 10 && Object.values(s.factions).filter(f => f.allied).length >= 20`
  - `progress: [wormhole 等级, 10]`（结盟数提示放 hint 文案或 desc）。
  - `rep: 8`、`rewardMineral: 5_000_000`、`rewardTech: 500_000`（对齐 warpMaster/endlessII 量级）。
- **结盟数 helper**：`alliedCount` 已存在于 achievements.ts（第 50 行），新增成就在同文件复用；虫洞科技解锁判定需同一 helper——把 `alliedCount` 提升为 `export` 或在 diplomacy.ts 新增公共 helper（二选一，避免两份实现漂移）。

### 8. 终局工程三轨（data.ts / ngplus.ts / ui）

- `MEGASTRUCTURE_IDS`：`['ringSmelter', 'jumpgate', 'wormhole']`（三座皆可建）。`MEGASTRUCTURE_BUILDINGS` 自动纳入虫洞。
- **NG+ 遗产**：`megastructureLegacyBonus` 遍历 `MEGASTRUCTURE_IDS`，虫洞等级自动 ×1.5%/级，零改动。
- **dualMega 成就**：条件保持 `ringSmelter ≥1 && jumpgate ≥1` 不变（不扩展为三轨，避免改旧成就语义）。
- **UI（render/interstellar.ts）**：
  - 终局工程区块 `renderMegastructureSection` 效果文本：虫洞分支新增 `WORMHOLE_EFFECT_TEXT`（槽位/能源/权重/上限合成文案，仿 `JUMPGATE_EFFECT_TEXT`）。
  - 区块内虫洞卡片：锁定（未研发科技 / 未通关）时显示锁定原因（复用 `buildingLockReason`），已建显示效果状态。
- **build.ts**：`upgradePreviewText` / `buyPreviewText` 为虫洞增加分支（机制建筑效果文案，仿 jumpgate 先例）——「Lv.N：派遣槽 5+枢纽+虫洞 → 下一级 +1 槽 · 能源 −5% · 权重 +10% · 上限 +1」。

### 9. 图标（icons.ts）

- 新增 `wormhole` symbol（虫洞视觉，仿 jumpgate/riftChasm 风格）。

## Testing Decisions

- **缝（seam）**：引擎派生纯函数层（`explorationSlots` / `wormholeLevelForSlot` / `expeditionCost` / `expeditionPool` / `generatedCap` / `alliedCount` / 成就 condition）+ 解锁判定层（`techRequirementsMet` / `isBuildingUnlocked`）。全部机制改动汇聚于派生函数，单一最优缝；无新 seam 引入。
- **好测试标准**：只断言外部行为——无虫洞时各函数与现状逐字节一致（基线断言）；虫洞 LvN 后槽位/能源/权重/上限 = 期望数值；结盟 10 前科技不可研、研发后建筑可建；成就条件边界（Lv9+19 结盟不达、Lv10+20 达）；NG+ 重置后重爬。
- **测试模块**：`exploration.test.ts`（槽位/成本/奖池）、`tech.test.ts`（requiresAllies 门控）、`buildings.test.ts`（虫洞建筑解锁/升级）、`achievements.test.ts`（星际帝国）、`generate.test.ts`（generatedCap）、`interstellar.test.ts` 或 `dom-interstellar.test.ts`（终局工程区块）、`ngplus.test.ts`（遗产折算）。
- **Prior art**：`exploration.test.ts`（槽位/成本基线）、`tech.test.ts`（afterEnding 门控）、`buildings.test.ts`（unique 建筑）、`achievements.test.ts`（allies3 / dockLord）、`generate.test.ts`（generatedCap）、`dom-interstellar.test.ts`（终局工程区块）。

## Out of Scope

- 虫洞的建筑产出/维护费（纯机制流，不产出资源）。
- 护航费减耗（`escortFee` 不动，星舰推进 Lv20 −10% 已覆盖）。
- 成就「双轨终章」扩展到三轨（保持双轨判定）。
- 虫洞科技升级线（纯门控，Lv1 即解锁）。
- post100-avgprod（已放弃机制，勿实现）。
- 探索新维度（距离/成功率/难度）。

## Further Notes

- **Open items**（实现期可拍板）：虫洞 icon 视觉；`WORMHOLE_EFFECT_TEXT` 文案精确措辞；`wormholeTheory` 锁提示文案（「需结盟 10 个派系」）；`stellarEmpire` 的 hint 文案；balance-sim 是否加「虫洞满级经济规模」断言（可选）。
- 关系：本 spec 不依赖其他 feature；与 jumpgate（ADR-0038）是**增量扩展**（探索队列双门控），与 fleet-power-exploration（星舰科技）同生命周期（通关后/infinite）。
- 周目语义：虫洞建筑/科技随 NG+ 清空重爬（`state.buildings`/`upgrades`/`techLevels` 重置），结盟数周目内口径（`factions` 重置）→ 星际帝国成就随周目重打（recurring）。零迁移、不升 SCHEMA。
