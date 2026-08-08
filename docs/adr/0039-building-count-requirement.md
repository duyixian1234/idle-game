# 星港矿场解锁改「深层钻机数量 ≥6」：普通升级取消后的死锁修复

ADR-0036（砍普通建筑升级）后 `upgrades.deepDrill` 恒为 0，但星港矿场解锁前置仍为 `requiresMaxLevel: ['deepDrill']`（要求升级满级 Lv10）——解锁条件不可达，导致星港矿场及其整条星际工程链（船坞/恒星阵列/智库/终局工程/舰队/探索增强）永久锁死。本 ADR 将前置改为**建筑数量门槛** `requiresCount: { deepDrill: 6 }`（6 台 = 48 矿/s，等效原 Lv10 产出天花板）。

**状态**: Accepted（2026-08-08，用户确认数量前置 ≥6 台方案）
**证据**: `src/engine/buildings.ts:88-95,103-117`（requiresMaxLevel/requiresCount 判定）；`src/engine/data.ts:46-52,126-134`（BuildingDef 字段 + starportMine 前置）；`src/engine/save.ts:397-433`（migrateV14ToV15 折算返还清零 upgrades）

## 背景

ADR-0036 将 7 个可多次购买建筑（含 deepDrill）的升级彻底取消：`upgradeBuilding` 对非 unique 建筑返回「该建筑没有可升级效果」（`buildings.ts:158`），存档迁移 `migrateV14ToV15` 把已升级普通建筑的 `upgrades[id]` 折算返还并清零（`save.ts:427`）。

但 `starportMine` 的解锁条件 `requiresMaxLevel: ['deepDrill']` 判定 `state.upgrades.deepDrill >= TECH_MAX_LEVEL(10)`（`buildings.ts:92`）——该字段从此恒为 0，**解锁条件结构性不可达**，是 ADR-0036 改动的遗留缺口（ADR-0036 后果清单未审计到 `requiresMaxLevel` 使用者）。

**连锁卡死**：星港矿场 → 船坞（舰队/护航全废）→ 恒星阵列 → 智库 → 星环冶炼场/跃迁枢纽（终局工程双线全废）→ 探索增强（枢纽 6-10 槽/×4 收获/离线 12h 不可达）。主线通关不受影响（联邦统一只依赖派系好感/结盟）。

## 决策

1. **新增 `requiresCount?: Record<string, number>`**（建筑数量门槛）：`isBuildingUnlocked` 判定 `state.buildings[id] >= need`（`buildings.ts:93`），锁定原因文案「需拥有：深层钻机 ×6」（`buildings.ts:110-114`）。
2. **`starportMine` 前置改为 `requiresCount: { deepDrill: 6 }`**：6 台深层钻机 = `8 矿/s × 6 = 48 矿/s`，与原「deepDrill Lv10」产出天花板（`8 × (1+0.5×10) = 48`）**完全等价**——保持「深钻产能成型」门槛语义，玩家为解锁星港付出的产能积累量不变。
3. **`requiresMaxLevel` 保留但废弃**：字段与判定逻辑保留（防历史类型破坏），标注无使用者，新门槛一律用 `requiresCount`。

## 为什么

- **符合 ADR-0036 机制二分**：普通建筑只有数量维度，星港前置必须落在数量维度；用 `requiresCount` 而非恢复升级（方向 D）是结构一致性要求。
- **数值等价**：6 台 vs 原 Lv10 的产能门槛一致（48/s），平衡曲线零扰动；星港 5000 万矿成本仍是真实瓶颈（6 台深钻 ≈ 1.5 万矿成本量级，不构成额外摩擦）。
- **可选方案对比**：① `requires ≥1 台`（复用现有字段）使门槛骤降、星港过早解锁；② `requiresTech: deepDrill`（研发科技即可）门槛更低且语义偏移；③ 恢复 deepDrill 升级则推翻机制二分、需新迁移，成本最高。数量门槛精确表达「深钻产能成型」语义。

## 后果

- **解锁链**：母星解锁 + 深层钻机 6 台 → 星港矿场 → 后续整链恢复可达（船坞/恒星/智库/冶炼场/枢纽）。
- **测试**：6 个测试文件的解锁构造从 `upgrades.deepDrill = TECH_MAX_LEVEL` 改为 `buildings.deepDrill = 6`；interstellar.test.ts 的 6 处资源断言计入深钻 48 矿/s 真实副作用。
- **关联**：↔ ADR-0036（本 ADR 是其遗留缺口的收口）；↔ ADR-0023（解锁链描述已同步）；↔ ADR-0010（终局工程双轨恢复可达）。
