# 移除深空导航/星际通信中继两探索科技：成长曲线并入跃迁枢纽 10 级

删除 `deepSpaceNav`（深空导航阵列）与 `interstellarRelay`（星际通信中继）两个探索科技及 `explorerDual`/`explorerTriple` 两个成就，探索队列（槽位）与收获倍率的成长曲线整体迁入跃迁枢纽（`jumpgate`，改为 Lv1-10 升级线）。动机 M1 设计简化：探索队列不再由科技门控，与 ADR-0036/0037（删多余成长路径）同一路线。

**状态**: Accepted（2026-08-08，grill Q1=B/Q2=A/Q3=B + Q4a/Q9/Q10/Q11）
**证据**: `src/engine/data.ts:441-458`（两科技 TechDef）；`src/engine/exploration.ts:103-137`（槽位/倍率公式）；`src/engine/achievements.ts`（`explorerDual`/`explorerTriple`）；`src/engine/balance.ts:222-224,298-300`（原常量）；`src/ui/explore-page.ts:58-78`（锁定提示）；`src/ui/render/shared.ts:90`（效果文案）；`src/ui/render/build.ts:26`（升级预览）

## 背景

探索队列原设计：基础 5 槽 + 深空导航 Lv1 解锁第 6 槽 + 星际通信中继 Lv1 解锁第 7 槽 + 跃迁枢纽 +3 槽（上限 10）；收获倍率 = 1 + 0.1×(nav+relay)，两项满级 = ×2.0，枢纽再 ×2 = ×4.0。两个科技承担"每级 +10%、Lv5 封顶"的成长曲线与两档槽位。

问题：科技槽位与跃迁枢纽（建筑）的槽位在体验上重复——队列并行度已有建筑承载，科技是第二套门控；两个科技成为中段必须研究的纵向成长路径，与 ADR-0036（砍 7 普通建筑升级）、ADR-0037（砍批量按钮）确立的"删除无意义成长路径"方向不符。

## 决策

1. **删除两个科技 def**：`data.ts` 移除 `deepSpaceNav`/`interstellarRelay`；`TechEffectExploration` 注释更新（探索类科技仅剩带 label 的星舰线，纯 UI 文案）。
2. **删除两个成就**：`explorerDual`（六路信标）/`explorerTriple`（七路星桥），成就总数 39→37（语义绑定第 6/7 信道，信道门控消失后无可承载触发）。
3. **跃迁枢纽改为 10 级升级线**：`jumpgate` def 加 `maxLevel: 10`（复用 `costExponent: 2` 成本模式，Lv10 单次 ≈512B 矿物/51.2B 科技，与 stellarArray/thinkTank 同量级）；同步解除升级入口阻断（`buildings.ts` `id === 'jumpgate'` 拒绝、`build.ts`/`shared.ts` 升级按钮与卡片动作排除——ADR-0036/0037 遗留，当时枢纽为单级无升级效果）。
4. **等级存 `state.upgrades.jumpgate`**：unique 建筑等级惯例（`buildings` 字段恒 0/1，见 `upgradeBuilding` L166）。
4. **槽位随级**：显式表 `JUMPGATE_SLOT_TABLE` = {1:1,2:1,3:1,4:2,5:2,6:3,7:3,8:4,9:4,10:5}；`explorationSlots` = `min(10, 5 + 表)`（Lv1 解锁第 6 槽、Lv10 满 10 槽）。
5. **收获倍率随级**：`explorationHarvestMult` = `1 + 0.3×枢纽等级`（Lv1 ×1.3、Lv10 ×4.0），常量 `JUMPGATE_HARVEST_PCT_PER_LEVEL = 0.3`；删 `EXPLORATION_TECH_HARVEST_PCT`/`JUMPGATE_SLOT_BONUS`/`JUMPGATE_HARVEST_MULT`。
6. **无存档迁移**：游戏无真实玩家，`techLevels` 残留 key 不读即无害。
7. **UI 同步**：探索页锁定提示改「跃迁枢纽 LvX」（`jumpgateLevelForSlot` 数据驱动）；枢纽效果文案/升级预览改等级措辞；删 `navArray`/`relay` 孤儿图标与 `tech.ts` 信道文案死分支。

## 为什么

- 简化心智：探索队列由单一建筑门控（跃迁枢纽），不再有"科技+建筑"双轴并行。
- 成长曲线完整保留：原终态（10 槽 / ×4.0）在枢纽 Lv10 触达，无净收益损失；槽位表非等差，用显式表防档位漂移（仿 `DOCK_SHIP_CAP` 惯例）。
- 与枢纽 desc 已有"天体收获倍率上限 ×4"文案自洽（原 ×4 需科技满级才可达，现 Lv10 字面成立）。

## 后果

- **删除**：两科技 def、两成就（39→37）、`EXPLORATION_TECH_HARVEST_PCT`/`JUMPGATE_SLOT_BONUS`/`JUMPGATE_HARVEST_MULT` 常量、`navArray`/`relay` 图标、`tech.ts` 死分支、测试中所有 `techLevels.deepSpaceNav/interstellarRelay` 断言。
- **新增**：`JUMPGATE_SLOT_TABLE`、`jumpgateLevelForSlot`、`JUMPGATE_HARVEST_PCT_PER_LEVEL`；jumpgate `maxLevel: 10` 与升级入口放行。
- **平衡副作用（已接受）**：枢纽前探索补偿恒 ×1.0、恒 5 槽（中段探索变瘦）；枢纽 Lv1 起槽位/倍率爬升，Lv10 复原终态；护航返还随枢纽倍率自然放大。
- **离线封顶 12h** 不随级（QoL 机制，非收益）。
- **关联**：↔ ADR-0036/0037（删除成长路径系列）；↔ `.scratch/explore-interact/spec.md`、`fleet-power-exploration/spec.md`（多槽/倍率口径更新为枢纽等级驱动）。
