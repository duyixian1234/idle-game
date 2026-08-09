# 虫洞探索线：结盟门槛解锁 + 探索槽位 20 + 能源减耗 + 发现权重 + 星际帝国成就

终局探索线仅有跃迁枢纽单一门控（ADR-0038），探索槽位封顶 10；infinite 阶段结盟数无机制出口，程序生成目标上限为固定公式，探索效率无法通过建筑放大。本 ADR 新增第三座终局工程「虫洞」，以「结盟 ≥10」为解锁门槛，将探索槽位扩至 20 并叠加能源减耗/发现权重/生成上限三档成长，配以「星际帝国」成就收尾。

**状态**: Accepted（2026-08-09，grill 两轮 11 决策 Q1-Q11）
**证据**: `src/engine/data.ts:191-206`（wormhole 建筑）、`470-480`（wormholeTheory 科技）；`src/engine/exploration.ts`（WORMHOLE_SLOT_TABLE / wormholeEnergyReduction / wormholeDiscoveryMult / expeditionPool）；`src/engine/generate.ts:69-77`（generatedCap）；`src/engine/achievements.ts`（stellarEmpire）；`src/engine/diplomacy.ts:alliedCount`

## 背景

- **探索槽位封顶**：`explorationSlots` 硬上限 10（基础 5 + 枢纽 Lv10 +5，ADR-0038 单一门控）。infinite 阶段探索是唯一增长引擎，槽位封顶后成长停滞。
- **结盟数无机制出口**：infinite 程序生成派系（`gen:faction`）可持续结盟（10/20 可达），但结盟仅是计数，无解锁回报。
- **探索效率无放大手段**：奖池权重（`POOL_WEIGHT_*`）与 `generatedCap`（`max(2+⌊探索/10⌋, 2+周目)`）均为固定公式，无法通过建筑/科技放大「发现新目标」效率。

## 决策

1. **解锁链（Q1）**：新增科技 `wormholeTheory`（`unlockBuilding` 效果、纯门控无升级线、Lv1 研发即解锁建筑）解锁建筑 `wormhole`（unique 大件，maxLevel 10）。结盟门槛挂在**科技**上——`TechDef` 新增可选字段 `requiresAllies?: number`，`techRequirementsMet`/`canResearchTech`/`researchTech` 统一检查；建筑仅 `requiresTech` 前置，不重复。结盟计数用 `core.ts` 公共 helper `alliedCount`（置于零依赖核心层，diplomacy/achievements/tech 均从 core 引用——避免 achievements→diplomacy→reputation→achievements 环依赖，与成就 `allies3`/`stellarEmpire` 同源防漂移）。
2. **槽位 20（Q2）**：新增 `WORMHOLE_SLOT_TABLE`（每级 +1，Lv10 +10），`explorationSlots = min(20, 5 + 枢纽槽 + 虫洞槽)`——双门控并列叠加，无虫洞时与 ADR-0038 现状逐字节一致。UI 探索页 `SLOT_CAP` 10→20，第 6-10 槽提示「跃迁枢纽 LvX」、第 11-20 槽「虫洞 LvX」（`wormholeLevelForSlot` 为提示型近似，假设枢纽先满；真实解锁由 `explorationSlots` 组合求和）。
3. **能源减耗（Q3）**：`wormholeEnergyReduction = 0.05 × 虫洞等级`（Lv10 −50%），`expeditionCost.energy` 分支 ×(1−reduction)，floor+max(1) 保底；**只作用基础派遣能源**——护航费（`escortFee`）不受影响（星舰推进 Lv20 −10% 已覆盖，避免双打折）。
4. **发现权重（Q4-A）**：`wormholeDiscoveryMult = 1 + 0.1 × 虫洞等级`（Lv10 ×2），`expeditionPool` 的 faction/planet/conquest（含 endless/gen 分支）weight 乘 mult；**resource 补偿分支不放大**（补偿不随虫洞膨胀，否则违背「提升发现新目标」意图）。
5. **生成上限（Q4-B）**：`generatedCap = max(2+⌊探索/10⌋, 2+周目) + 虫洞等级`（叠加式）；`generate.ts` 直接读 `state.upgrades.wormhole`（不引 exploration 防环依赖）。
6. **成本（Q11，用户按结盟 10 时点产出估算）**：科技研发 1 兆矿 + 50 亿科技；建筑 baseCost 5 兆矿 + 100 亿科技；unique 升级成本 = baseCost × 2^level（Lv9→10 需 2560 兆矿 + 51.2 万亿科技，累计建+升满 ≈ 5.1 京矿 + 102.3 万亿科技）。
7. **终局工程三轨（Q6）**：`MEGASTRUCTURE_IDS` 扩展为 `['ringSmelter', 'jumpgate', 'wormhole']`——NG+ 遗产折算（`megastructureLegacyBonus`）自动 ×1.5%/级；`dualMega` 成就保持双轨判定不扩展（避免改旧成就语义）。
8. **星际帝国成就（Q5）**：`stellarEmpire`——虫洞 Lv10 且结盟 ≥20，`collect` 类周目可重解锁、rep 8、矿物 500 万 + 科技 50 万（对齐 warpMaster/endlessII 量级）。
9. **周目语义（Q7）**：全部周目内口径——建筑/科技随 NG+ 清空重爬、结盟数周目内重置 → 星际帝国随周目重打（recurring）。零迁移、不升 SCHEMA。

## 为什么

- **科技持门槛、建筑持效果**：结盟门槛放科技（`requiresAllies`）让解锁链单点可测、UI 锁提示单一（「需结盟 10 个派系」）；建筑 `requiresTech` 复用现有链式解锁判定，零新解锁逻辑。`alliedCount` 提升为公共 helper 消除成就/门控双实现漂移。
- **槽位/能源/权重/上限四效果全部随建筑等级**：单一杠杆（建筑等级）驱动全部探索成长，无科技+建筑双杠杆导致的数值失控风险；成就「虫洞 Lv10」语义清晰指向建筑。
- **槽位 20 = 5 基础 + 枢纽 ≤5 + 虫洞 ≤10**：三条来源可独立升级、相加明确；`WORMHOLE_SLOT_TABLE` 显式表防非等差档位漂移（与 JUMPGATE_SLOT_TABLE 同构）。
- **资源补偿不随虫洞放大**：补偿是「保底」，放大它会稀释「发现新目标」概率——与用户意图（提升发现效果）相反。
- **虫洞纳入 MEGASTRUCTURE_IDS 但 dualMega 不动**：遗产折算统一 ×1.5%/级（三轨一致），成就不扩展避免改旧语义；虫洞用新成就收尾。
- **成本按用户估算**：科技/建筑成本由用户按结盟 10 时点产出速度核算（1 兆/50 亿 与 5 兆/100 亿），作为内容数据显式声明（data.ts，非公式派生）。

## 后果

- **存档**：无 schema 变更——`techLevels`/`buildings`/`upgrades` 均为 `Record<string, number>`，新 key 零迁移；NG+ 整对象重置覆盖。
- **引擎**：`explorationSlots` 双门控、`expeditionCost` 能源减耗、`expeditionPool` 权重放大、`generatedCap` +虫洞等级；自动探索（`autoExploreDispatch`/`settleOfflineAutoExplore`）读 `explorationSlots` 自动随 20 槽扩大。
- **UI**：探索页 20 槽 + 双来源锁提示；星际工程/终局工程区块含虫洞卡（锁定/建造/升级/效果预览）；科技面板「需结盟 10 个派系」锁提示；icons 新增 `wormhole` symbol。
- **成就**：38 个（+stellarEmpire）；进度条显示虫洞等级 / 10。
- **平衡**：虫洞是 infinite 深水区内容（结盟 10 实际仅 infinite 可达——ended 静态派系封顶 8）；能源减耗缓解 20 槽并行派遣能源压力；发现权重放大加快新目标收集节奏。balance-sim 未加虫洞专项断言（可选 open item）。
- **关联**：↔ ADR-0038（探索队列单一门控 → 本 ADR 扩展为双门控）；↔ ADR-0039（建筑解锁前置须落数量维度——虫洞走科技 requiresAllies，不引入 requiresMaxLevel）；↔ ADR-0036（unique 建筑升级 ×2/级沿用）；↔ ADR-0028（发现礼包同源锚定不因权重放大漂移）。
