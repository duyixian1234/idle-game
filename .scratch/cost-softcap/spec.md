# Spec: 建筑成本软上限（cost-softcap）

**Status:** ready-for-implementation（2026-08-07 grill-me 四轮盘问定稿，用户每轮"全推荐"后确认方案）
**存档版本:** 无变更（成本为纯函数计算字段，改公式老存档自动套新价，零迁移）
**关联:** `.scratch/balance-rework/`（P=2 ROI 契约来源）、`src/engine/balance.ts`（数值单一真源）

## 需求

连续购买大量同类普通建筑后，下次买入/升级费用指数爆炸成天文数字（深钻第 101 台 ≈1.17e15、精炼厂第 200 台 ≈5.2e21），后期出现「攒一整天仍差多个数量级」的死区，观感与节奏均差。要求：**早期曲线无感知，后期死区消失、仍可持续购买**，并在 UI 增加「≈N 秒产出」相对价格显示缓解大数焦虑。

## 背景事实（子代理探索 + 主代理读码确认）

- **买入成本**（`engine.ts:101-121` `buildingCost`）：`baseCost × costGrowth^count`，纯几何无封顶；growth 为各建筑单一固定值（data.ts：miner 1.15 / solar 1.18 / lab 1.2 / refinery 1.25 / deepDrill 1.3 / barracks 1.25 / militaryPort 1.3），唯一制动是资源余额。
- **升级成本**（`engine.ts:123-154`）：普通建筑 = `buyCost × count × growth^level`——`mult = UPGRADE_PREMIUM×LEVEL_PRODUCTION_BONUS×count = count`（balance.ts:27 P=2 × :20 0.5），再乘 early/late 分档连乘（`ordinaryUpgradeCostValue`：Lv≤3 用 early^level，Lv≥4 先 early^3 再逐级乘 late；balance.ts:44-53，deepDrill 1.3/1.4 至 miner 1.15/1.25）。**买入指数 × count 线性 × 升级指数三重叠加**。
- **⚠️ 注释契约漂移（事实 A）**：`balance.ts:23` 注释声称升级成本 = `buyCost × P × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)`（除以等级加成、随级温和），**实际实现无 levelMultiplier 分母、反向乘 growth^level**（`engine.ts:123-132,149`）→ P=2 契约早已漂移，本次一并修正注释使文档与实现一致。
- **产出侧**：`levelMultiplier(level) = 1 + 0.5×level`（production.ts:16，线性），本次不动。
- **显示**：数字用中文四位单位（万/亿/兆/京…载，format.ts:40-55），永不科学计数法；建造面板价格在 .build-btn 按钮内（panels.ts:212 `formatCost(buyCost)`、224 `formatCost(upCost)`），长文本换行不溢出、无截断。显示层问题 < 数值层问题。
- **爆炸半径**：无任何测试/balance-sim 锚定普通建筑成本曲线（`scripts/` 目录为空；`balance-simulation.test.ts` 实为随机事件种子重放，不测建筑成本）；成本是计算的非存档字段 → 改动零迁移。
- **范围边界**：舰队 ×1.5^(n-1)、科技 ×1.7^level、星系间大件 ×2^level（maxLevel 封顶）均为有意设计，**不在本次范围**。

## 决策（grill-me 四轮 11 项，全部按推荐定稿）

1. 问题定性 = 数值为主（过早死区）+ 显示次之
2. 形态 = **软上限**（成本增长随数量放缓，后期仍可持续购买；非硬上限）
3. 范围 = **仅普通重复建筑**（miner/solar/lab/refinery/deepDrill/barracks/militaryPort 的买入+升级）
4. 观感 = 相对价格显示（「≈N 秒产出」）为主要方案
5. **数学（买入）**：`baseCost × (count+1)^k` 替换 `baseCost × growth^count`；k 为每建筑内容数据（data.ts 新增字段）
6. **同步（升级）**：买入+升级统一软上限（保 ROI≡P 契约不漂移）；升级的 `×count` 因子（整体改造规模效应）保留
7. **显示**：按钮保留绝对数字；建筑卡片/列表行新增相对时间行「≈N 秒产出」
8. **调参**：k 由数值模拟反推（约束：0~50 台曲线与现状累计误差最小 + 100 台量级死区消失），模拟脚本跑完删（项目惯例）
9. **升级方向**：去掉 growth^level 连乘 → `buyCost × count × (1 + c×level)` 量级（c 由 sim 校准，推荐 0.1~0.2 初值）；买/升交替决策保持
10. **N 秒口径**：瓶颈资源 `N = max(成本ᵢ / 当前净产出ᵢ)`（只算有成本项的资源），UI 空间紧张时只显瓶颈；时间格式借用 format.ts（s/分/时）
11. 验收 = 单元测试锁公式 + 临时 sim 校准（跑完删）+ E2E spec（data-\* 断言，用户手动验证，铁律不代跑）

## 关键落点

| 位置 | 改动 |
|---|---|
| `src/engine/balance.ts` | 删 `ORDINARY_UPGRADE_COST_GROWTH`（44-53）与 `ordinaryUpgradeCostGrowth`（71-75）；新增升级温和系数常量（如 `ORDINARY_UPGRADE_LEVEL_GROWTH`，值由 sim 定）；**修正第 23 行注释契约**为与实现一致（文档漂移修复） |
| `src/engine/data.ts` | 7 建筑 `costGrowth` → `costExponent k`（内容数据，sim 反推回填） |
| `src/engine/engine.ts` | `buildingCost`（101-121）换多项式 `Math.pow(count+1, k)`（保留 unique 分支与 floor/至少 1）；`upgradeCost`（135-155）+ `ordinaryUpgradeCostValue`（123-132）去 growth^level 连乘、改温和增长（保留 ceil 与 mult=count 结构） |
| `src/engine/format.ts` | 新增/复用相对时间格式化（≈N 秒产出，s/分/时缩写，与现有单位体系一致） |
| `src/ui/panels.ts` | 建造面板建筑卡片（202-239）加相对时间行（data-cost-time，瓶颈资源口径，科技净产 0 时跳过该项） |
| 临时脚本 | `src/` 下 sim 脚本反推 k 与 c（跑完删，项目惯例），平衡复核 15.3d 节奏漂移 |

## 测试计划

- 单测（vitest）：
  - 新曲线性质：多项式买入（早期贴近、100 台量级死区消失、floor/至少 1 保留）；升级温和增长（无 growth^level、×count 保留、ceil 保留）
  - 现有 `engine.test.ts` 相关断言更新（锁定旧几何公式的断言改新公式期望）
  - format 相对时间用例（瓶颈口径、多资源、除零 guard）
- E2E（用户手动验证，铁律不代跑）：新 `e2e/cost-softcap.spec.ts`（data-\* 断言：建筑卡片相对时间行可见、内容随资源产出变化；回归建造面板既有断言）

## 验收标准

- `pnpm tsc --noEmit` 零错误；`pnpm build` 通过；`pnpm vitest run` 全仓绿（不含已知上游 dom.test 基线失败，若有）
- E2E spec 用户手动验证通过
- 存档 schema 零变更；舰队/科技/大件成本曲线零改动
- sim 校准报告：k 与 c 定稿值 + 0~50 台累计误差 + 100/200 台成本量级对比（天文数字 → 可负担量级）
