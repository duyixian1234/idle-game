# 移除 +10/+100 批量与 buyMax 买满：单次操作统一为 1

购买建造物、贸易、科技升级的 +10/+100 批量按钮与 Shift 买满（buyMax）全删，单次操作统一为 1。动机 M1 简化心智负担（批量按钮致"+10/+100/买满"决策疲劳）+ 后期基础建造物购买需求消失。升级建造物的 +10/+100 随 ADR-0036 自动消失。`bulk.ts` 整文件删除（buyMax 全删后无调用方）。

**状态**: Accepted（2026-08-08，grill Q2/Q3/Q8）
**证据**: `src/ui/render/build.ts:127-130,138-139`；`src/ui/render/diplomacy.ts:194-200`；`src/ui/render/tech.ts:119-120`；`src/ui/session/listeners.ts:521-545`；`src/engine/bulk.ts`（整文件）；`src/ui/actions.ts:205-237,110-113`（buyMax/upgradeMax/upgradeTechMax/runDiplomacyMax）；`src/ui/session/index.ts:310,317,324,331`（openBuyMaxModal）

## 背景

+10/+100 批量按钮散布于购买建造物、升级建造物、贸易、技术共享、科技升级五处，玩家频繁纠结"+10/+100/买满"档位选择，决策疲劳（**M1 痛点**）。buyMax（Shift+点击主按钮→确认弹窗）买满路径走 `bulk.ts` for 循环（`MAX_ITERATIONS=100000`），大后期产出千亿级时有性能隐患。后期基础建造物购买需求消失（资源产出已由 unique/探索承载），买满入口冗余。

后端无封闭公式——`bulk.ts` 逐次循环重算成本（`runLoop`/`runLimitedLoop` 调 `buyBuilding` 内部 `buildingCost` 重算，count/level 变化后成本增长），买 10/100 与买满均逐次累加，无套利。

## 决策

1. **删 +10/+100 全部**：`build.ts` bulkBuyBtns（`:127-130`）+ 升级 `data-upgrade-limit`（`:138-139`，随 ADR-0036）；`diplomacy.ts:194-200`（贸易/技术共享）；`tech.ts:119-120`（科技升级）。
2. **删 buyMax 买满全路径**：`buyMax`/`upgradeMax`/`upgradeTechMax`/`runDiplomacyMax` action（`actions.ts:205-237,110-113`）；`ActionPayloads.diplomacyMax.limit` 字段（`:56`）；`ui/session openBuyMaxModal`（`:310,317,324,331`）+ Shift 买满入口；`listeners.ts:521-545` 整段（4 个 `data-*-limit` 解析）。
3. **`bulk.ts` 整文件删除**：buyMax 全删后 `previewMaxBuy`/`previewDiplomacyMax`/`executeMaxBuy`/`executeDiplomacyMax`/`executeLimitedBuy`/`executeLimitedDiplomacy`/`canBulkBuy`/`runLoop`/`runLimitedLoop`/`loopTargetFor`/`diplomacyLoopTarget`/`isUniqueBlocked` 全无调用方。`autoDiplomacyTick`（`diplomacy.ts:542-599`）内部 for 循环直调 `factionTrade`/`factionTechShare`（不走 bulk，不受影响）。
4. **单次操作统一为 1**：购买→`buyBuilding`；升级（unique）→`upgrade`；科技升级→`upgradeTech`；贸易→`factionTrade`；技术共享→`factionTechShare`。
5. **测试**：`bulk.test.ts` 整文件删；`military.test.ts:121-147`（buy-max 军力段）删。

## 为什么

- M1 简化心智：单次=1 消除档位纠结；后期基础建造物购买需求消失使单次操作不累（玩家不必反复点 +1）。
- buyMax 性能隐患消除（for 循环 100000 上限在千亿产出期有卡顿风险）。
- 与 ADR-0036 协同：升级 +10/+100 随普通升级取消自动消失，无需单独处理；bulk.ts 整删是 0036 砍升级的天然延伸（无 buyMax 即无 bulk）。

## 后果

- **删除**：`bulk.ts` 整文件；4 个 `*Max` action + `diplomacyMax.limit` 字段；`openBuyMaxModal` + Shift 入口；5 处 +10/+100 按钮渲染；`listeners` 批量解析段；`bulk.test.ts` + `military.test.ts:121-147`。
- **保留**：单次购买/升级/贸易/科技升级各单次 action；`autoDiplomacyTick` 自动化（直调单次动作，不走 bulk）。
- **关联**：↔ ADR-0036（升级批量随普通升级取消自动消失）；↔ ADR-0013/0015（UI 信息架构与卡片化，主按钮保留单次入口）。
