Status: ready-for-agent

# Spec: 数值策略集中化 + 建筑升级曲线重平衡（balance-rework）

## Problem Statement

设备数量较多时，建造与升级的「资源成本 / 数值提升」明显不对等。截图实测（采矿机 ×100 Lv.11 / 太阳能板 ×81 Lv.20 / 实验室 ×70 Lv.20 / 精炼厂 ×53 Lv.12 / 深层钻机 ×35 Lv.8）：

| 建筑 | 升级成本（现） | 升级总收益 | 买入价 | 买入收益 | 升级/买入 ROI 比 |
|---|---|---|---|---|---|
| 采矿机 | 82.6亿 | +5,850/s | 1,174万 | +760/s | **91×** |
| 太阳能板 | 8,032亿 | +5,103/s | 1,661万 | +1,386/s | **1,310×** |
| 实验室 | 1.01兆+1,687亿⚡ | +315/s | 2,093万+349万⚡ | +99/s | **15,166×** |
| 精炼厂 | 231亿+38.5亿⚡ | +9,301/s | 2,053万+342万⚡ | +2,457/s | **295×** |
| 深层钻机 | 41.8亿+2.01亿⚡ | +16,400/s | 2,432万+117万⚡ | +4,680/s | **49×** |

根因（engine.ts:87-97）：`upgradeCost = buildingCost × 4 × 1.6^level`——cost 卷 count（经 buildingCost）× level 双指数；而收益 `levelMultiplier(L) = 1 + 0.5L` 线性。退化公式 `ratio = 8×1.6^L×(1+0.5L)/count`，Lv.10+ 继续升级永远比买新单位亏（等量货币下升级产出仅为买入的 1/91~1/15000）。

次要问题：32 个命名数值常数散落 8 个文件（data/diplomacy/events/offline/ngplus/production/mechanics/reputation）+ engine.ts:91 魔法数 `1.6` + 星球解锁/攻占 guard 内联值，无单一真源，调参需跨文件。

## Solution

**双目标改造**：

1. **升级公式重构（产出等价折算）**：`upgradeCost = buyCost × P × 0.5×count / levelMultiplier(level)`，其中 `P = UPGRADE_PREMIUM = 2`，`levelMultiplier(L) = 1 + 0.5L`。数学性质：**升级每 +1/s 成本 ÷ 买入每 +1/s 成本恒等于 P**，任意 count/L 不漂移。P=2 时截图态升级成本收敛到 1-2 亿量级（采矿机 1.8亿 / 太阳能 1.2亿 / 实验室 1.3亿+2,220万⚡ / 精炼厂 1.6亿+2,590万⚡ / 深层钻机 1.7亿+817万⚡）。
2. **数值策略集中化**：新建 `src/engine/balance.ts` 收纳全部命名常数（原值不动，仅搬迁+注释）；经济核心根因子集中声明（LEVEL_PRODUCTION_BONUS 与 TECH_PER_LEVEL_BONUS 合并为单一常量——两处同为 0.5 同语义；新增 UPGRADE_PREMIUM；TECH_UPGRADE_GROWTH / TECH_EXCHANGE_RATE 迁入）。内容数据（baseCost/produces/costGrowth/星球阈值/守卫）保留在 data.ts 显式声明，**不做硬公式化派生**（costGrowth 阶梯 1.15/1.18/1.2/1.25/1.3 为不等距手工调校，强行派生会改变 4 座建筑购买节奏）。

## User Stories

1. 作为一名玩家，我希望高设备数下升级成本与收益匹配（升级成本 ≈ 买入等价产出的 P 倍），以便升级按钮不再是「只能看不能点」的摆设。
2. 作为一名玩家，我希望升级仍有意义但边际递减——前期升级划算、后期买单位更划算，以便两种资源出口都有决策张力。
3. 作为一名开发者，我希望所有数值常数集中在一个文件（balance.ts）单一真源，以便调参不用跨 8 个文件搜索。
4. 作为一名开发者，我希望成长曲线（等级加成/升级溢价/科技增长）由少数根因子控制，以便平衡调整只动根因子即可传导全系统。
5. 作为一名开发者，我希望「升级 ROI 恒等于 P」有测试钉死，以便未来改动不会悄悄让升级重新失衡。

## Implementation Decisions

- **升级公式（决策 Q3-方案2 + Q6b-P=2）**：`upgradeCost(state, id)` 改为 `buyCost × UPGRADE_PREMIUM × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)`，floor 且至少 1（与原语义一致）。复用 `levelMultiplier`（production.ts 已有），不新增魔法数。count = `state.buildings[id]`，level = `state.upgrades[id]`。
  - 公式性质推导（验收标准）：设买入 1 台产出 `(1+0.5L)×base×techMult`，升级 1 级全部 count 台产出 `0.5×count×base×techMult`。成本比 = `(upCost / 0.5×count×base) / (buyCost / (1+0.5L)×base) = P`。**恒等，任意 count/L**。
  - P=2 定值依据：取 Q2(a) 目标带（ROI ∈ [2,5]）下界，升级「值得但略亏」，保持买/升交替决策；对当前「升不动」挫败感修复最彻底。
- **升级溢价作为唯一新增根因子（决策 Q5-A + Q8）**：删除 `BuildingDef.upgradeCostMult` 字段（7 处全部为 4，无 per-building 差异需求，删除避免第二个魔法数源）；`UPGRADE_PREMIUM = 2` 进 balance.ts。若未来需个别建筑差异化溢价，再给 BuildingDef 加可选覆盖字段，**本轮不预埋**。
- **balance.ts 集中（决策 Q5-A + Q6a-方案2）**：新建 `src/engine/balance.ts`，迁移以下常数（原值不动，按域分组+注释）：
  - 经济核心：`LEVEL_PRODUCTION_BONUS = 0.5`（data.ts:40）、`TECH_PER_LEVEL_BONUS`（data.ts:159，**合并进 LEVEL_PRODUCTION_BONUS**，两处同 0.5 同语义）、`TECH_UPGRADE_GROWTH = 1.7`（data.ts:167）、`TECH_EXCHANGE_RATE = 100`（data.ts:169）、新增 `UPGRADE_PREMIUM = 2`
  - 科技：`TECH_MAX_LEVEL = 10`（data.ts:157）
  - 外交（diplomacy.ts）：ALLIANCE_FAVOR_THRESHOLD=80 / FAVOR_CAP=100 / FEDERATION_FAVOR_THRESHOLD=100 / TRADE_FAVOR_GAIN=6 / TRADE_BASE_COST=5_000 / TRADE_COST_GROWTH=1.5 / INTIMIDATE_FAVOR_LOSS=8 / INTIMIDATE_THREAT_LOSS=25 / INTIMIDATE_BASE_COST / INTIMIDATE_COST_GROWTH=1.8 / ALLIANCE_COST / TECH_SHARE_FAVOR_GAIN=15 / TECH_SHARE_COST
  - 事件（events.ts）：RAID_THREAT_THRESHOLD=55 / RAID_STRENGTH_MULT=50 / RAID_THREAT_LOSS=15 / RAID_BUYOFF_FAVOR_GAIN=5 / RAID_IGNORE_LOSS_PCT=0.05 / RAID_GAP_SECONDS=3600 / RAID_OFFLINE_LOSS_CAP=0.3 / RAID_EVENT_WEIGHT=2 / MEAN_EVENT_GAP_SECONDS=90 / FIRST_EVENT_DELAY_SECONDS=45
  - 离线（offline.ts）：OFFLINE_CAP_SECONDS=8×3600
  - NG+（ngplus.ts）：NG_PLUS_TECH_BASE=2_000 / NG_PLUS_PERMANENT_BONUS=0.15 / CODEX_FAVOR_BONUS=25
  - 生产/军力（production.ts）：MILITARY_BASE_CAP=100 / MILITARY_PORT_CAP=200
  - 星球机制（mechanics.ts）：ORBITAL_FORGE_CONVERT_RATIO=0.15 / STORM_HARVEST_INTERVAL_MS=5×60_000
  - 声望（reputation.ts）：REPUTATION_CAP=100 / RAID_THRESHOLD_BONUS_CAP=10
  - 攻占（data.ts:348）：CONQUEST_DURATION_MS=60×60_000
  - 存档（types.ts:42）：SCHEMA_VERSION=4 不动（存档版本与数值策略无关，保持原位）
  - balance.ts 不得依赖任何域模块（纯常数 + 纯函数，零 import 或仅类型），保持依赖图无环（被 data/production/diplomacy/events/offline/ngplus/reputation/mechanics/engine 反向引用）。
- **costGrowth 显式保留（决策 Q6a-方案2）**：`BuildingDef.costGrowth` 留在 data.ts 作内容数据，不派生。balance.ts 中不出现 BUILDING_ECONOMY 派生表。
- **行为零变化范围**：除升级公式外，其余数值原样搬家——外交/事件/离线/NG+/军力/机制/声望的行为完全不变。balance.ts 迁移以「全量测试绿」为验收门槛（搬家即回归验证）。
- **存档**：无新字段、无 schema 变更（成本实时计算不落盘）。

## Testing Decisions

- **seam**：沿用既有双层 seam——引擎层（纯 TS 零 DOM）Vitest 单测为主 seam，UI 层 jsdom 冒烟为次 seam；不新增 seam。
- **新公式锁定**（engine.test.ts）：重写「升级成本随等级增长」用例：
  - 成本公式断言：给定 count/level，断言 `upgradeCost = floor(buyCost × P × 0.5×count / levelMultiplier(level))`。
  - **ROI≡P 不变量**：对多组 (count, level)（含 Lv.0/1/11/20、count 1/10/100），断言 `upCost / (0.5×count×base) ÷ buyCost / ((1+0.5L)×base) ≈ P`（浮点容差）。
  - 删除 `c1 === floor(c0 × 1.6)` 旧断言（公式已改）。
- **现有断言更新**：engine/bulk/dom 测试中引用 `upgradeCost` 具体数值或 `×1.6` 增长语义的断言全部按新公式更新（buy-max 的「升满」路径复用新公式，bulk.test 的升级循环断言需同步重算）。
- **平衡模拟（决策 Q7，一次性脚本不入库）**：参照 defense ticket 08 先例写 `scripts/balance-sim.ts`（跑完即删）：
  ① 通关节奏：模拟新旧公式下到达各星球解锁阈值的时间差（阈值 5万/20万/100万/1000万矿物），确认新曲线不劣化通关时长（±30% 内可接受）；
  ② 决策均衡点：P=2 时「买 vs 升」的交替使用收益曲线，确认两者都有存在价值；
  ③ 无限模式：Lv.50/count 500 量级下 ROI 仍 ≈ 2（不变量理论保证，脚本实证）。
- **全量回归**：251 vitest + 16 E2E 全绿 + typecheck clean 为验收门槛。

## Out of Scope

- 科技升级线（base×1.7^L，不卷 count，已平衡）——维持现状（决策 Q4）。
- costGrowth 派生（决策 Q6a 否决）——保留显式内容数据。
- 建筑 baseCost/produces 重平衡——非本次问题，仅升级公式调整。
- 升级封顶（决策 Q3 否决方案 3）——新公式天然收敛，无需封顶。
- per-building 升级溢价覆盖字段（决策 Q8 否决预埋）。
- 存档迁移 / schema 变更。
- UI 布局/交互改动（升级按钮文案、bulk 升满按钮均不动，仅显示数值随公式变化）。

## Further Notes

- 设计经 grill-me 四轮访谈定稿（2026-08-06），18 项决策全部经用户确认（均采纳推荐）：Q1 实现巧合（非设计意图）、Q2 目标 (a) 升级有意义但边际递减（ROI ∈ [2,5] 带）、Q3 方案 2 产出等价折算、Q4 只动建筑升级线、Q5-A 物理集中+经济核心根因子化、Q6a 方案 2 costGrowth 显式保留、Q6b P=2、Q7 平衡模拟+不变量测试、Q8 删除 upgradeCostMult。
- 公式的优雅性质：`upgradeCost = buyCost × P × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)` 复用既有 LEVEL_PRODUCTION_BONUS 与 levelMultiplier，**仅新增 UPGRADE_PREMIUM 一个根因子**；「少常数」落在共享数学族（等级加成/升级溢价/科技增长），而非内容数据。
- P=2 截图态换算：采矿机 82.6亿→1.8亿 / 太阳能 8032亿→1.2亿 / 实验室 1.01兆→1.3亿+2,220万⚡ / 精炼厂 231亿→1.6亿+2,590万⚡ / 深层钻机 41.8亿→1.7亿+817万⚡（脚本精算，2026-08-06）。
- 改动面：新增 balance.ts + 8 文件 import 迁移 + engine.ts 公式改 + data.ts 删字段 + 测试重写（engine/bulk/dom）+ 一次性模拟脚本。按 4 个 ticket 顺序推进（01→02→03→04），每步原子提交。
