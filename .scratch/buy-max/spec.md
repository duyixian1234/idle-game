Status: ready-for-agent

# Spec: 一键买满（批量购买/升级）机制

## Problem Statement

挂机后期资源持续增长，玩家需要反复点击「购买/升级」按钮消耗资源（建筑数量无上限、建筑升级无上限、科技 Lv1→Lv10），成本指数递增下玩家无法心算「还能买几台」「总共要花多少」。现有唯一的批量先例是科技点兑换的「一键最大」（`convertMax`），购买/升级缺乏同类机制。玩家诉求：对某一项目一次性花完所有可用资源（买/升到买不动为止），且执行前能清晰预演。

## Solution

为所有可重复购买/可升级项提供「买满」能力：引擎层新增纯函数批量动作（循环调用现有成本/校验函数，逐次重算成本），UI 层每个目标旁增加「买满」按钮 + Shift+点击购买/升级按钮双通道触发，执行前弹出自建 overlay 确认框（展示目标、次数、各资源总花费、执行后剩余、目标等级/数量与两类警示），确认后才执行，结果写入反馈日志。范围覆盖建筑购买、建筑升级、产出科技升级、外交贸易/技术共享；一次性项（深层钻探研发、结盟、星球解锁、事件选项）与副作用项（威慑）自动排除。不新增存档字段，存档无迁移。

## User Stories

1. 作为一名玩家，我希望对任一建筑一键买到买不动为止（矿物/能源任一不足即停），以便挂机后快速消化资源。
2. 作为一名玩家，我希望对已建建筑一键升级到买不动为止，以便建筑升级同样免手点。
3. 作为一名玩家，我希望对已研发的产出科技一键升级到 Lv10 或资源不足为止，以便科技点堆积时有明确的清空出口。
4. 作为一名玩家，我希望外交「贸易」与「技术共享」支持一键重复至好感 100 封顶，以便好感有批量投入手段。
5. 作为一名玩家，我希望执行前看到确认弹窗：目标、将购买/升级 N 次、各资源总花费、执行后剩余、目标等级/数量，以便知道一键的代价。
6. 作为一名玩家，我希望当一键会清空某资源时确认框给出红字警示，以便避免误伤需要留存的资源。
7. 作为一名玩家，我希望购买持续耗能建筑（精炼厂）时确认框给出能源平衡警示（当前产出/可驱动台数/本次购买台数），以便避免买到「饿着」的工厂。
8. 作为一名玩家，我希望用 Shift+点击购买/升级按钮即可快捷触发买满，以便桌面端零新增 UI 即可使用。
9. 作为一名玩家，我希望一次性项（研发、结盟、威慑）不出现买满入口，以便语义清晰。
10. 作为一名玩家，我希望执行结果（买了多少、花了多少、剩多少）写入反馈日志，以便确认操作生效。

## Implementation Decisions

- **范围（决策 Q1-A + Q6-B）**：买满覆盖 4 类目标——建筑购买（miner/solar/lab/refinery/deepDrill）、建筑升级、产出科技升级（5 项 production 类，Lv1→Lv10）、外交 trade/techShare。排除：深层钻探研发（一次性）、结盟（一次性）、威慑（副作用：好感 −8，排除）、星球解锁（tick 自动）、事件选项（实例化成本）、矿物→科技点兑换（已有 convertMax）。
- **语义（决策 Q2-A + Q7-A）**：循环执行直到「任一所需资源不足」为止；科技停在 Lv10；外交停在好感 100（clampFavor 上限）；**不做跨资源自动兑换**（不自动用矿物补科技点）。科技一键按双资源口径买满（◆+◎ 一起花），矿物的消耗由确认框明细交代。
- **API 设计**：新增 `src/engine/bulk.ts`（引擎层新模块，engine.ts 不膨胀），对外两段式纯函数：
  - `previewMaxBuy(state, kind, id)`：纯计算、**不修改状态**，返回 `BulkPreview`（见下）。
  - `executeMaxBuy(state, kind, id)`：校验 → 循环执行 → 返回 `ActionResult & BulkBuyResult`（ok/reason + count/spent/remaining/stoppedReason/targetLevel）。
  - `kind` ∈ `'building' | 'buildingUpgrade' | 'techUpgrade' | 'diplomacy'`；外交经 `previewDiplomacyMax(state, factionId, action)`，`action` ∈ `'trade' | 'techShare'`。
  - 循环内部复用现有 `buildingCost`/`upgradeCost`/`techCost`/`canAfford*`/`buyBuilding`/`upgradeBuilding`/`upgradeTech`/`factionTrade`/`factionTechShare`，**每迭代一次重算成本**（count/level 变化后成本增长），不假设闭式公式。
  - `BulkBuyResult`：`count`（实际购买/升级次数）、`spent: Partial<Record<ResourceKey, number>>`（各资源总花费）、`remaining: Partial<...>`（执行后余额）、`stoppedReason: 'resource' | 'maxLevel' | 'favorCap' | 'notUnlocked'`、`targetLevel?`（对升级/科技，最终等级）。
- **预演与警示（决策 Q4-A + Q5-B + Q9-A）**：`BulkPreview` 除 count/spent/remaining/stoppedReason 外含两类警示：
  - 清零警示 `emptyWarnings: ResourceKey[]`：`remaining[res] < 1` 的资源（红字「将清空」）。
  - 能源平衡警示 `energyWarning?: { production, consumption, maxDriven, bought }`：仅对持续耗能建筑（当前仅精炼厂 refinery，0.5⚡/s/台，`production.ts` 按比例折减口径）——`maxDriven` = 当前能源冗余可驱动的台数；`bought > maxDriven` 时提示超出部分无产出。只警示不干预（决策 Q9-A）。
- **交互（决策 Q3-C）**：双通道——① 每个目标旁新增「买满」小按钮（建造面板 `data-buy-max`、升级按钮旁 `data-upgrade-max`、科技面板 `data-upgrade-tech-max`、外交面板 `data-diplomacy-max`）；② Shift+点击现有购买/升级/贸易/技术共享按钮等效买满（`main.ts` 事件委托检测 `e.shiftKey`）。按钮 disabled 态与主按钮一致（连 1 次都买不起则禁用）。均沿用 `data-*` 属性 + `main.ts` 委托 + `ACTIONS` 注册表模式。
- **确认弹窗（决策 Q8-A）**：自建 overlay 确认框（复用 `.ending-overlay`/`.ending-card` 样式，新增独立类名），表格展示：目标名、将购买/升级 N 次、各资源总花费（`formatCost` 口径 ◆/⚡/◎）、执行后剩余、目标等级/数量、警示行（红字清零 + 能源平衡）；确认 → dispatch 执行，取消 → 关闭。数据来自 `previewMaxBuy`（弹窗打开时计算一次；面板 250ms 重建期间确认弹窗独立于面板 DOM，不受重建影响）。
- **反馈**：执行成功后写反馈日志（现有 feedback 通道），格式如「已购买 47 台采矿机，花费 12,345◆，剩余 67◆」；失败写 warning 日志（复用现有 reason）。
- **数据修正（顺手）**：`data.ts:119` 注释「满级需求 ≈ 131.7 万」为过时笔误，修正为「≈ 42.8 万科技点」（与 spec/ticket 05 权威口径一致）。
- **存档**：无新字段、无 schema 变更（批量是瞬时动作，读时无状态、写时已结算为最终 state）。

## Testing Decisions

- **seam**：沿用既有双层 seam——引擎层（纯 TS 零 DOM）Vitest 单测为主 seam，UI 层 jsdom 冒烟为次 seam；不新增 seam。
- **好测试的标准**：给定输入状态 + 动作，断言输出状态/渲染结果，不 mock 内部方法；批量循环用可重入纯函数，断言「总花费 = ∑每步成本」「remaining ≥ 0」等不变量。
- **引擎层新增覆盖**：
  - `buyBuildingMax`：正常买满（逐次成本重算正确、总花费 = 各步之和）；单资源不足停止；多资源（lab/refinery/deepDrill 含 ⚡）以瓶颈资源停止；`notUnlocked` 拒绝（count=0）。
  - `upgradeBuildingMax`：升级到买不动；无建筑时拒绝。
  - `upgradeTechMax`：升到 Lv10 停（stoppedReason='maxLevel'）；资源不足停；Lv0 拒绝（需先研发）。
  - `diplomacyMax`：trade 到好感 100 停；techShare 到好感 100 停；余额不足停；intimidate 无入口（引擎层不提供）。
  - `previewMaxBuy` 纯函数性：调用后 state 深比较不变；preview 与 execute 的 count/spent 一致；清零警示（remaining<1）正确；能源警示（refinery：maxDriven/bought/超出提示）正确。
  - 回归：现有 222+ vitest 全绿，单次购买行为与批量首步等价。
- **UI 层覆盖**：四类面板买满按钮渲染与禁用态；Shift+点击委托；确认弹窗内容字段与确认/取消路径；确认后 dispatch 调用正确 action；结果日志格式。
- **先例**：`src/engine/*.test.ts`（引擎）与 `src/ui/dom.test.ts`（冒烟）为既有范式；`convertMax` 为批量先例。

## Out of Scope

- 威慑（intimidate）批量——副作用（好感 −8）排除。
- 跨资源自动兑换买满（决策 Q2-B 否决）——若后续需要，作为独立「兑换并买满」按钮另行设计。
- 预算制（保留 X% 应急）与保底（决策 Q2-C / Q5-C 否决）。
- 科技研发（Lv0→1）的批量——一次性，无批量语义。
- 批量星球解锁、批量事件结算。
- 存档字段/迁移、NG+ 策略变更。
- 移动端替代手势（Shift 不可用）——买满按钮已覆盖，无需额外手势。

## Further Notes

- 设计经 batch-grill-me 两轮访谈定稿（2026-08-06），9 项决策全部经用户确认（均采纳推荐）：Q1-A 全范围统一支持、Q2-A 买到买不动为止、Q3-C 按钮+Shift 双通道、Q4-A 确认弹窗、Q5-B 清零红字警示、Q6-B 外交仅 trade/techShare、Q7-A 双资源买满、Q8-A 自建 overlay、Q9-A 能源平衡只警示不干预。
- 设计哲学：允许梭哈（挂机游戏玩家自由），但确认框把「将清空某资源」「工厂没能源驱动」两类代价摆上台面；不追加任何自动限购/保底干预。
- 实现要点：成本函数均为确定性纯函数但随 count/level 增长，买满必须逐次循环重算（与 `convertMax` 的静态公式不同）；能源永不 <0（`production.ts` 按比例折减），无需担心扣负。
- 改动面：引擎（bulk.ts 新增 + 测试）+ UI（四面板按钮/委托/确认弹窗/日志）+ data.ts 注释修正；按 6 个 ticket 顺序推进，每步原子提交。
