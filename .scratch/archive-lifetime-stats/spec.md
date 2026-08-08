# 档案周目统计补全（archive-lifetime-stats）

**Status:** ready-for-agent

## Problem Statement

档案页「本周目统计」段（`src/ui/render/archive.ts:136-155`）只展示 5 项，其中唯一来自 `GameStats` 的是「累计采集矿物」（`totalMineralEarned`）：

1. **探索收获无痕**：探索派遣结算 resource 分支（`src/engine/exploration.ts:463-465`）将 `r.mineral/r.energy/r.tech` 直接入资源，**不计入任何 stats**——玩家无法回看「探索到的天体处获得的累计资源」；护航返还（`compensationFor`）同理。
2. **能源累计缺失**：全代码库不存在 `totalEnergyEarned`；能源净产出在舰队维护费停摆时为负（软降级，ADR-0024），累计字段需定义净负处理。
3. **科技累计有字段未展示**：`totalTechEarned?`（`src/engine/types.ts:209`）已由 `resourcesTick` 全产出路径累计（`src/engine/engine.ts:120`），但档案未展示，且不含探索派遣收获。
4. **探索次数零展示**：`explorations`/`escortedExpeditions` 全引擎自增（`exploration.ts:410-411`），UI 无任何使用。

## Solution

统一「探索收获」口径（ADR-0041），补全周目内累计统计并在档案页展示：

- `GameStats` 新增 **4 个可选字段**（平铺）：`totalEnergyEarned?`、`exploreMineralEarned?`、`exploreEnergyEarned?`、`exploreTechEarned?`——遵循既有「可选字段 + `?? 0`」旧档容错范式（`types.ts:209` 先例），**无 SCHEMA 版本变更、无迁移函数**。
- 引擎三处累计：
  - `resourcesTick`（`engine.ts`）：`totalEnergyEarned += max(nominal.energy, 0) × dt`
  - `settleOne` resource 分支（`exploration.ts`）：探索三元组累计 + **并入**全局累计（矿物→`totalMineralEarned`、科技→`totalTechEarned`、能源→`totalEnergyEarned`）
  - 离线结算（`offline.ts`）：同步 `totalEnergyEarned += max(gains.energy, 0)`
- 档案页展示（`archive.ts`）：
  - 新增独立「探索」小节（`military-section`）：探索派遣次数（含护航次数）+ 探索收获三元组（矿/能/科）
  - 「本周目统计」段追加「累计能源」「累计科技」两行；「累计采集矿物」文案升级为「累计获得矿物」
- NG+ 重置沿用 `engine.ts:309` 整对象替换（新字段随周目归零）。

## User Stories

1. 作为玩家，我想在档案页看到「累计获得矿物」，以便它是包含探索收获在内的全口径总产出数字。
2. 作为玩家，我想在档案页看到「累计能源」，以便了解能源的总产出规模。
3. 作为玩家，我想在档案页看到「累计科技」，以便了解科技的总产出规模。
4. 作为玩家，我想在档案页看到探索派遣的总次数，以便了解探索路线的活跃度。
5. 作为玩家，我想看到从探索天体获得的矿物累计，以便评估探索的矿物收益。
6. 作为玩家，我想看到从探索天体获得的能源累计，以便评估探索的能源收益。
7. 作为玩家，我想看到从探索天体获得的科技累计，以便评估探索的科技收益。
8. 作为玩家，我想看到护航远征的返还计入探索收获，以便护航投入的回报可见。
9. 作为玩家，我想在护航派遣存在时看到护航次数统计，以便了解护航投入。
10. 作为玩家，我想在离线挂机期间获得的能源也计入累计，以便离线时间不丢统计。
11. 作为玩家，我想在开启新周目（NG+）后这些统计归零，以便按周目对比产出。
12. 作为开发者，我想新增统计字段不触发存档版本迁移，以便老存档平滑升级、零迁移成本。
13. 作为玩家，我想档案页的探索统计与全局累计保持超集/子集关系（探索收获是累计获得的一部分），以便数字口径无歧义。

## Implementation Decisions

1. **探索收获口径（Q1）**：「探索处获得资源」= 仅探索派遣结算 resource 分支的 `r.mineral / r.energy / r.tech`（含护航返还补偿 `compensationFor`，随该分支并入）。建交礼包（`grantFactionGift`）与产出型天体持续产出（`productionReport`）**不计入探索统计**——前者属「发现派系」语义，后者已计入全局累计、再计会双计。

2. **周目内口径（Q2）**：新字段周目内语义，随 NG+ 重置（`engine.ts:309` 整对象替换）；跨周目累计属 Codex 扩展，出范围。

3. **能源累计净负截断（Q3）**：`totalEnergyEarned` 只累加净正产出 `max(nominal.energy, 0) × dt`——累计口径只记产出侧，负净产出段是消费（舰队维护停摆）非获得。离线结算同步 `max(gains.energy, 0)`。

4. **探索收获并入全局累计（Q4）**：探索派遣收获的矿物/科技/能源同时并入 `totalMineralEarned` / `totalTechEarned` / `totalEnergyEarned`。连带影响已评估：成就阈值（探索是通关后玩法，届时总矿远超 1B 阈值，影响边际）；贸易事件存量基数（`events.ts:301-306` 成本与收益同源放大、净比值恒定，符合同源锚定 ADR-0028）。展示文案「累计采集矿物」→「累计获得矿物」如实反映全口径。

5. **字段结构平铺（Q5）**：四个新字段全平铺于 `GameStats`，可选（`?`）+ 消费侧 `?? 0`；不引入嵌套对象（GameStats 无嵌套先例，保持单一扁平风格）。

6. **档案展示（Q6）**：
   - 新增独立「探索」小节（`military-section`，位于「本周目统计」之前或之后由实现自定但需稳定）：探索派遣次数（`explorations`）+ 护航次数（`escortedExpeditions`，有值才显示）+ 探索收获三元组（矿/能/科，`explore*Earned`）。
   - 「本周目统计」段追加「累计能源」（`totalEnergyEarned`）、「累计科技」（`totalTechEarned`）两行，与「累计获得矿物」构成三资源矩阵；原文案「累计采集矿物」改为「累计获得矿物」。

## Testing Decisions

- **Seam 策略**：沿用 ADR-0017 双层 seam——引擎主 seam + UI 冒烟次 seam。引擎 seam 是最高点：探索收获累计在 `settleOne` 结算层一次断言即可覆盖「探索三元组 + 全局并入」全链路；能源累计在 `resourcesTick`/`offline` 各一断言。
- **引擎 seam 测试**：
  - `src/engine/exploration.test.ts`：构造 resource 分支 `ExpeditionResult` 结算，断言 `stats.exploreMineralEarned/exploreEnergyEarned/exploreTechEarned` 与 `stats.totalMineralEarned/totalTechEarned/totalEnergyEarned` 同步增长；护航派遣（`escorted`）结算的返还计入探索收获。
  - `src/engine/engine.test.ts`：`resourcesTick` 后断言 `totalEnergyEarned` 等于正净产出累计；构造净产出为负的 tick，断言累计不回写。
  - `src/engine/offline.test.ts`：离线结算后断言 `totalEnergyEarned` 计入 `max(gains.energy, 0)`。
  - 只测外部行为（stats 数值），不测实现细节。
- **UI 冒烟 seam 测试**：
  - `src/ui/dom-military.test.ts`（档案面板测试既有落点，与 endless-expansion 的 dom-archive.test.ts 归档测试区分）：渲染档案面板，断言存在「探索」小节（`data-explore-stats` 锚点，含派遣次数与三元组文本）与「本周目统计」段含「累计能源」「累计科技」行；新字段缺省（旧档）时显示 0 不崩溃。
  - 遵循 `data-*` 契约（ADR-0020），新容器挂语义锚点（`data-explore-stats`），不依赖类名断言。
- **Prior art**：现有 `exploration.test.ts`（settleExpeditions 结算断言）、`offline.test.ts`（离线入账断言）、`dom-archive.test.ts`（档案面板冒烟）均为同构先例。

## Out of Scope

- 建交礼包 / 发现后持续产出计入探索统计（Q1 明确排除）。
- 跨周目累计（Codex/图鉴级统计）——属独立 feature。
- 贸易事件存量基数与成就阈值口径的消费方调整——并入是既定语义，消费方不改造。
- 其他面板（overlays 通关统计、探索页）的展示补充。

## Further Notes

- **无 SCHEMA 变更**：4 个新字段全可选 + `?? 0`，老存档读侧容错、写侧惰性补齐，NG+ 重置沿用整对象替换（ADR-0041 / ADR-0005 容错范式）。
- **字段命名**：全局累计 `total*Earned` 三件套与探索口径 `explore*Earned` 三件套对称；探索次数沿用现有 `explorations`/`escortedExpeditions`。
- **展示文案**：「累计获得矿物」取代「累计采集矿物」（语义升级，见 CONTEXT.md「累计获得」术语）。
- 相关 ADR：`docs/adr/0041-archive-lifetime-stats.md`（本决策记录）；关联 0009（周目内口径）、0024（能源净负来源）、0028（同源锚定）、0005（可选字段容错）。
