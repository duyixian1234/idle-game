# 舰队战力 → 探索收益链路 + 星舰科技线（fleet-power-exploration）

**Status:** ready-for-agent

## Problem Statement

1. **后期科技点溢出无用**：军械科技（militaryTech）Lv5 封顶、探索科技（deepSpaceNav/interstellarRelay）Lv5 封顶；通关后探索返还科技点（锚定远征费 ×0.02×收获倍率）持续产出，却无持续出口——科技点后期沦为废料。
2. **战力与探索收益脱钩**：护航倍率只看舰数（+1%/艘），升级战舰（militaryTech 战力倍率）对探索收益**零贡献**——"提升战力 → 提升探索"的成长感缺失，买船/升军事科技后期无探索回报。
3. **建筑提升不如天体提升（用户观察）**：天体产出增益 +10% 封顶 +50% 且可多天体叠加，后期压过建筑线——成长路径单一化。

## Solution

- **新增星舰科技线**（通关后解锁，id 待定，暂名「星舰推进」）：Lv1-20，每级舰队战力倍率 +10%，与军械科技**乘积**（满配 1.5×3.0 = 4.5×）；成本 base = 100k 矿物 + 20k 科技点，1.7^n 递增，累计 ≈ 58 亿矿物 + 11.6 亿科技点（= 枢纽 5000 万 ×23）——科技点从"溢出废料"变"星舰线稀缺品"。
- **护航改挂等效舰数**：`E = fleetPower / SHIP_POWER_BASE`（= 舰数 × 双科技倍率）；护航收获倍率 = 1 + 1%×E、护航远征费 = 每舰费×E——战力成为探索收益乘数，且**费与倍率同杠杆**（任何战力来源涨倍率必涨费），结构上无印钞路径。
- 无科技时 `E = 舰数`，护航行为与现状**逐字节一致**——存量体验与测试不破坏。

## User Stories

1. 作为通关后玩家，我希望新增星舰科技线在通关后（ended/infinite）解锁，以便后期有新的科技点出口。
2. 作为通关后玩家，我希望星舰科技线用矿物+科技点升级，以便两种资源后期都有持续去处。
3. 作为玩家，我希望每级星舰科技提升舰队战力 +10%（与军械科技乘积），以便升级回报直观。
4. 作为玩家，我希望星舰科技 Lv20 封顶，以便目标可预期、进度条可展示、sim 可锚定。
5. 作为玩家，我希望星舰科技成本按 1.7^n 递增（base = 100k 矿物 + 20k 科技点），以便升级曲线全程吸收科技点、出口容量两个数量级。
6. 作为玩家，我希望护航收获倍率 = 1 + 1%×等效舰数（E = 战力/1200），以便升级战舰直接提升探索收益。
7. 作为玩家，我希望护航远征费 = 每舰费 × 等效舰数，以便投入与产出同杠杆、比例恒定不印钞。
8. 作为玩家，我希望买船、军械科技、星舰科技任何战力来源都同杠杆影响护航，以便成长路径统一、无偏门。
9. 作为玩家，我希望无星舰科技时（E = 舰数）护航行为与现状完全一致，以便存量体验零变化。
10. 作为玩家，我希望探索页护航显示改为等效舰数口径（含战力倍率），以便出发前清楚看到战力对探索的贡献。
11. 作为玩家，我希望新科技线挂 exploration 效果类别，以便复用现有科技升级判定与卡片 UI。
12. 作为玩家，我希望 NG+ 后星舰科技随科技树清空重爬（与现有科技一致），以便周目节奏一致、无需特殊迁移。
13. 作为玩家，我希望 balance-sim 校验护航收益比例不漂移，以便长期不印钞。
14. 作为玩家，我希望主线（playing）阶段战力曲线不动，以便攻占/胁迫难度不受影响、sim 回归范围收窄。

## Implementation Decisions

### 星舰科技线

- `TECHS` 新增条目（id 待定，建议 `warpDrive`）：`effect: { kind: 'exploration' }`、`maxLevel: 20`、`cost: { mineral: 100_000, tech: 20_000 }`；解锁门控 = 通关后（与 `isExploreAvailable` 同源判定，phase `ended`/`infinite`）。
- effect kind 用 `exploration` 仅为通过 `canTechUpgrade` 判定；探索槽位/收获倍率函数 hardcode 读 `deepSpaceNav`/`interstellarRelay` key，新线**不会**意外触发槽位或现有倍率。
- 战力挂点：`fleetPower` 乘 `(1 + FLEET_POWER_TECH_PER_LEVEL × 星舰等级)`，与 militaryTech 倍率**乘积**：`count × SHIP_POWER_BASE × (1+0.1×militaryLv) × (1+0.1×warpLv)`。
- NG+：techLevels 清空重爬（`lost.techs` 现有行为），零特殊处理。
- 存档：`techLevels` 是 `Record<string, number>`，新 key 零迁移、不升 SCHEMA。

### 护航等效舰数（核心公式，经 grill 确认）

- `E = fleetPower(state) / SHIP_POWER_BASE`（等效舰数，含舰数 × 双科技倍率）。
- `escortHarvestMult = 1 + FLEET_HARVEST_PCT_PER_SHIP × E`（原式 `fleet.count` → `E`）。
- `escortFee = floor(escortFeePerShip × E)`（原式 `fleet.count` → `E`）。
- 无科技时 `E = count`，两函数与原行为逐字节一致——存量护航测试不破。
- 防印钞：倍率与费同杠杆（E 传导），任何战力来源涨倍率必涨费；`compensationFor` 锚定"基础成本+远征费"结构不动。
- UI：探索页护航倍率/费显示改等效舰数口径；科技卡片经现有 TECHS 渲染自动出现。

## Testing Decisions

- **缝（seam）**：引擎派生纯函数层（`fleetPower` / `escortHarvestMult` / `escortFee` / `canTechUpgrade` / `techCost`）+ 结算层（`settleExpeditions` 资源入账）+ balance-sim。全部机制改动汇聚于派生函数，单一最优缝；无新 seam 引入。
- **好测试标准**：只断言外部行为——升 N 级星舰科技 → 战力/倍率/费 = 期望数值；无科技时 E = count 与现状一致；通关前不可研、Lv20 后不可升；结算返还反映新倍率。
- **测试模块**：fleet 域（战力/护航派生）、tech 域（升级门控/成本）、exploration 域（结算入账）、balance-sim（比例不漂移断言）。
- **Prior art**：`fleet-dock-10.test.ts`（护航公式）、`fleet.test.ts`（战力）、`tech.test.ts`（升级成本/封顶）、`exploration.test.ts`（结算）、`balance-simulation.test.ts`（印钞断言）、`fleet-dom.test.ts`（护航 UI 显示）。

## Out of Scope

- 逐舰升级（per-ship level）——战力是乘法结构，全局科技线数学等价，逐舰纯增操作负担。
- 攻占/胁迫平衡调整——playing 阶段战力曲线不动。
- 建筑 softcap / 天体 outputBonus 数值平衡（用户观察"建筑不如天体"的另一症状，单独议题）。
- post100-avgprod 价格机制（已放弃，勿重复实现）。
- 新探索维度（探索距离/成功率/难度）——本 spec 只做"战力 → 收益倍率"链路。

## Further Notes

- **Open items**（实现期可拍板）：新线名称/icon/desc（建议「星舰推进」语义，icon 复用或新画）；成就里程碑（Lv10/Lv20，默认加）；balance-sim 断言具体参数（护航比例容差、科技点出口吸收率阈值）。
- 关系：本 spec 不依赖也未被依赖其他 feature；与 fleet-dock-10（护航）是**增量演进**（护航公式推广），与 deepspace-unlock/exploration 同生命周期（通关后）。
