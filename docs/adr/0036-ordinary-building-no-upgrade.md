# 普通建筑取消升级能力：机制二分为「数量×固定」与「唯一×等级」两态

7 个可多次购买建筑（miner/solar/lab/refinery/deepDrill/barracks/militaryPort）砍掉升级，产出回归 `produces×count`（去 levelMultiplier 普通应用）；等级维度仅留 unique 建筑（×2/级，maxLv10）与科技（×1.7^level）。根因=升级成本公式 `buyCost×count×(1+0.15·lv)` 的 `×count` 与收益 `0.5×produces×count` 抵消致 ROI 恒定（ADR-0021/0022），但绝对成本随台数爆炸锁死"先升后买"为唯一最优策略序（P2 痛点）——砍升级消除强制策略序，机制二分形态纯净。

**状态**: Accepted（2026-08-08，grill 三轮 Q1/Q4/Q5-Q8）
**证据**: `src/engine/buildings.ts:76-79,82-102`（ordinaryUpgradeCostValue / upgradeCost 普通）；`src/engine/production.ts:18-20,30-37,82-86`（levelMultiplier / militaryCap / 普通产出应用）；`src/engine/balance.ts:20,30,33,38`（LEVEL_PRODUCTION_BONUS / UPGRADE_PREMIUM / ORDINARY_UPGRADE_LEVEL_GROWTH / LEVEL_COST_FACTOR）；`src/engine/data.ts:55-199`（7 普通建筑）

## 背景

普通建筑升级成本 = `buyCost(count,level) × count × (1+0.15·lv)`（`buildings.ts:94-101`）。`×count` 使升级价正比于已购数量，且 `buyCost` 自身随 `count` 多项式增长（`base×(count+1)^costExponent`）→ **双重放大**，绝对成本随台数爆炸（100 台升级 ≈ 首台 10 万倍）。

升级收益 = `0.5×produces×count`（全台受益，`production.ts:82-86`），`count` 在成本与收益同时出现 → **ROI 恒定 P=2**（ADR-0021/0022 澄清），与台数无关。"先买后升"与"先升后买"达到同状态的总 ROI 等价，差异只在**绝对成本门槛**——"先升后买"那一步升级绝对价极低，"先买后升"则卡在百万倍门槛买不起。结果：策略序被锁死，玩家被迫先升后买才不卡门槛，自由度低（**P2 痛点**）。

科技升级（`×1.7^level`，`tech.ts:34`）与 unique 建筑升级（`×2^level`，`buildings.ts:85-93`）**均不含 count**，不受此害——仅 7 个普通可多次购买建筑的升级是异类，破坏"数量维度 vs 等级维度"的二分一致性。

## 决策

1. **砍 7 普通建筑升级**：`upgradeBuilding`（`buildings.ts:174-189`）对 7 id 封死拒绝；`upgradeCost` 普通分支删（`buildings.ts:94-101`，unique 分支 `:85-93` 保留）；`ordinaryUpgradeCostValue` 删（`:76-79`）。
2. **产出回归 `produces×count`**：`production.ts` `pipelineNominal` 去 levelMultiplier 普通应用（`:82-86,131,471`）。`levelMultiplier` 函数保留（militaryCap portLevel + unique 仍用）。
3. **军力容量**：militaryPort 升级废，`portLevel` 恒 0 → `levelMultiplier(0)=1`，军港回 200/座线性；`militaryCap` 公式结构不变但 portLevel 项失效（见 ADR-0027 修订标注）。`COERCION_UNLOCK_MILITARY_CAP=5000` 仍由 25 军港达成（不变），militaryCap5k 成就（`achievements.ts:268`）不变。
4. **不补偿成长**：post100 动态下限（ADR-0022）保跨周目绝对成本随产出膨胀不塌；等级维度由科技（1.7^level）+ unique（2^level）+ 探索收获承载。留"全局增益科技"为后续扩展点（若实测某建筑变缓再加 TechDef 条目，成本低）。
5. **存档 v15 折算返还**：新增 `migrateV14ToV15`（参照 `save.ts:326 migrateV13ToV14` 范式，链式挂载于 `:492` 后），遍历 7 建筑 `upgrades[id]`，用原 `upgradeCost` 公式倒算每级投入（按 costKey 分矿物/能源/科技），累加返还 `state.resources`；unique `upgrades` 不动。SCHEMA 14→15。

## 为什么

- 砍升级消除强制策略序（P2），机制二分形态纯净（数量维度 vs 等级维度），呼应 ADR-0037 简化心智主诉求。
- 复用现有 unique/科技等级曲线，无需新平衡参数；军力容量 ADR-0027 科技通道已就位不塌。
- 方向 A（去 count 改全局加成）需同时改升级价与收益两公式并重平衡每个建筑双参数，复杂度高且易引入新失衡；B 砍升级是结构最简，且 post100 动态下限已保数量轴不塌，砍升级不破坏跨周目平衡。
- 等级维度成长由 unique（×2/级）与探索收获承载，不必每个普通建筑都背。

## 后果

- **删除**：常量 `UPGRADE_PREMIUM`/`ORDINARY_UPGRADE_LEVEL_GROWTH`/`LEVEL_COST_FACTOR`（`balance.ts:30,33,38`）；`ordinaryUpgradeCostValue`（`buildings.ts:76-79`）；`upgradeCost` 普通分支（`:94-101`）；`buildingCost` 等级因子简化（`:53,67-72`）；`build.ts` 升级按钮 + 预览/title 的 militaryPort 分支；测试 `buildings.test.ts:77-115,138,165-179,184,191` + `cost-softcap.test.ts:69-103` + `post100-cost-curve.test.ts:118-129` + `military.test.ts:56-67,121-147`。
- **SHARED 必须保留**：`LEVEL_PRODUCTION_BONUS`（`balance.ts:20`，techMultiplier 共用根）；`levelMultiplier` 函数（militaryCap portLevel + unique）；`UNIQUE_UPGRADE_GROWTH`（`balance.ts:306`）；`upgradeCost`/`upgradeBuilding`/`canAffordUpgrade` 的 unique 分支；`upgrade` action（`actions.ts:176-183`，unique 入口）。
- **推翻 ADR-0022** 决策3（升级继承）与澄清段关于普通建筑升级的部分——见 0022 修订标注。
- **影响 ADR-0027**：`militaryCap` 公式 `levelMultiplier(portLevel)` 项 portLevel 恒 0——见 0027 修订标注。
- 军力容量等级放大 ×6（军港升级 Lv10）→ ×1.5（军械科技 Lv5），绝对值缩水但约束性玩法语义不破（数量轴为主，符合 ADR-0027"军港数量流为主引擎"设计意图）。
- **关联**：→ ADR-0037（升级 +10/+100 随本 ADR 自动消失）；↔ ADR-0021/0022（升级 ROI 不变量随普通升级取消而失效）；↔ ADR-0027（军力容量 portLevel 项）；↔ ADR-0005（v15 存档迁移）。
