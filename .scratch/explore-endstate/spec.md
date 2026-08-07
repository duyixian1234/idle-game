# 探索收集终点透明化（explore-endstate）

**Status:** ready-for-implementation

## Problem Statement

自动探索（fleet-dock-10）完成很多次后，玩家不再获得新的解锁天体、军事目标、外交目标，且**没有任何系统说明为什么会这样**——玩家会把"探索没新东西"误读为 bug，或继续盲目挂机期待不存在的内容。

代码事实（已由探索确认，非缺陷）：

1. **自动探索与手动探索结算路径完全一致**——`settleExpeditions`（exploration.ts:326）是唯一结算入口（在线 tick / 离线回归 / 自动探索离线循环三路调用），深空碑文叙事挂点也覆盖自动路径。"自动探索不能解锁"不成立。
2. **ended 阶段（普通通关、未进无限）军事目标本就不存在**——conquest / 无尽天体 / 程序生成势力**仅在 `phase === 'infinite'` 注入探索奖池**（exploration.ts:180-204，endless-expansion spec 显式作用域）。ended 玩家探索不到不在池里的东西。
3. **外交/天体收集有终点**——ended 奖池静态只有 4 势力 + 5 天体（explore-interact「群星尽览」口径）。收集满后剔除制奖池只剩资源补偿分支（`resource` 权重 = max(2, 6-已收集)），"没新解锁"是正常终态。

根因是**信息缺口**：收集终点未可视化、终态未宣告、下一步未引导。附带两个已确认的现状缺口：

- ended → infinite 的入口只有**通关结局面板**（overlays.ts:82 `data-ending="infinite"`），点"继续查看"后面板关闭即无常驻入口；探索页 NG+ 卡（data-ngplus）仅在 infinite 渲染。
- E2E specs 已全部移除（`7180e53 tests:remove broken e2e tests`，e2e/ 为空），playwright 基建保留。

## Solution

把探索系统的"终点"画出来并指路，四项协同：

- **① 收集进度增强**：探索页进度行（dom.ts:177 已有 `已发现：X / 9`）补充 `data-explore-progress` 属性；收集满（尽览）时显示「群星尽览」徽章（`data-explore-exhausted`）+ 引导文案。
- **② 结算日志宣告终态**：尽览后资源补偿分支日志由"未发现新文明，回收 X"改为「已尽览所有已知目标，无新发现，回收 X」——自动探索每笔结算都明确宣告"没有新东西，不是 bug"。
- **③ 自动探索常驻横幅**：自动探索开启且尽览时，探索页自动探索面板常驻提示「自动探索中：目标已尽览，仅回收资源」（`data-auto-explore-exhausted`）——挂机玩家回来第一眼即知状态。
- **④ 引导闭环 + 无限入口**：尽览时显示「进入无限模式可发现军事目标与程序生成天体」，并提供可点击的「进入无限模式」按钮（`data-explore-infinite`，仅 ended 且尽览时渲染）——行为与结局面板一致（`enterInfiniteMode`，无确认弹窗）。顺带修复"错过结局面板即无无限入口"的路径缺口。

无存档 schema 变更（全派生状态，不落盘）。

## User Stories

1. 作为 ended 阶段玩家，我希望看到外交/天体收集进度（如 3/4、5/5），以便知道探索系统还有没有新内容可挖。
2. 作为收集满 4 势力 + 5 天体的 ended 玩家，我希望界面宣告「群星尽览」终态，以便不再盲目挂机期待不存在的新解锁。
3. 作为收集满的 ended 玩家，我希望结算日志明确"已尽览所有已知目标，仅回收资源"，以便确认"没新解锁"是正常终态而非 bug。
4. 作为开启自动探索的尽览玩家，我希望自动探索面板常驻提示"仅回收资源"，以便挂机回来第一眼就了解状态。
5. 作为 ended 玩家，我希望尽览后知道"进入无限模式可发现军事目标与程序生成天体"，以便有明确的下一步目标。
6. 作为错过结局面板的 ended 玩家，我希望探索页就有「进入无限模式」入口，以便无需重打结局即可进入无限模式。
7. 作为 infinite 玩家，我希望探索页不出现"群星尽览"误导（扩展池仍有目标时），以便进度展示与实际奖池一致。
8. 作为玩家，我希望本特性不改变任何探索数值/奖池/结算逻辑，以便这只是信息透明化而非平衡改动。

## Implementation Decisions

1. **引擎新增 `exploreProgress(state)` 导出**（exploration.ts，命名风格同 `expeditionPool`/`explorationSlots`）：
   - 返回 `{ factions: { found, total }, planets: { found, total }, exhausted: boolean }`
   - `found` = `state.exploredFactions.length` / `state.exploredPlanets.length`；`total` = 静态表 `EXPLORE_FACTIONS` / `EXPLORE_PLANETS` 条目数（4 / 5，与 dom.ts:58 现有 `totalPool` 口径一致）。
   - `exhausted` = `expeditionPool(state)` 中无非 `resource` 条目（ended 静态池集齐 → true；infinite 扩展池仍有 conquest/faction/planet/程序生成占位 → false）。**复用现有奖池计算，不引入第二套口径**——`expeditionPool` 已含全部剔除/作用域逻辑（endless-expansion 的 batch 门控与 generatedCap 天然正确）。
   - 派生纯函数，不写存档、无 schema 变更。
2. **结算日志终态文案**（settleOne 资源分支，exploration.ts:386-394）：入账前实时调 `expeditionPool(state)` 判断 exhausted——资源分支本身不改集合，检查即当前态；同一 `settleExpeditions` 循环内多笔结算自动反映最新集合（先结算的 faction/planet 已 push 进 explored*）。exhausted 时文案变体：
   - 无护航：`探索队返航：已尽览所有已知目标，无新发现，回收了 X 矿物、Y 能源与 Z 科技点。`
   - 护航：`护航编队返航：已尽览所有已知目标，无新发现，回收了 X 矿物、Y 能源与 Z 科技点。`
   - 未 exhausted 保持现状文案。此变体同时承担"尽览态自动探索结算的一次性宣告"（③的日志部分），不重复加日志、不刷屏。
3. **探索页进度行增强**（renderExplorePage，dom.ts:173-183）：
   - progress 行加 `data-explore-progress` 属性（现状 `已发现：X / 9（势力 a/b · 天体 c/d）` 文案保留）。
   - exhausted 时：同一行追加 `群星尽览` 徽章（`data-explore-exhausted`）+ 引导文案「已尽览所有已知目标。继续探索仅回收资源；进入无限模式可发现军事目标与程序生成天体。」
   - ended 且 exhausted 时：渲染「进入无限模式」按钮 `data-explore-infinite`（样式复用 ending-btn primary；点击行为 = `enterInfiniteMode` + render + saveGame，与结局面板 data-ending="infinite" 序列一致，无确认弹窗）。infinite 阶段不渲染（已有 NG+ 卡，且换周目语义不同）。
4. **自动探索常驻横幅**（autoPanel，dom.ts:126-133）：`auto.enabled && exhausted` 时显示 `data-auto-explore-exhausted` 横幅「自动探索中：目标已尽览，仅回收资源」。
5. **main.ts 事件绑定**：`data-explore-infinite` 点击 → `enterInfiniteMode(state)` + `render()` + `saveGame(state)`（与 main.ts:485-489 结局面板 infinite 分支同构；无 endingDismissed 语义牵涉——探索页不存在结局面板状态）。
6. **不触碰**：深空信道 2/3 占位（dom.ts:66-77 已标注"深空导航阵列 Lv1（科技）"解锁需求，无误导）；`data-explore-locked="planet"` 占位（dom.ts:163-168 仅 infinite 渲染，文案"完成 15 次探索解锁新天体"与 `endlessBatchUnlocked` 一致）；`explorationSlots`/`expeditionCost`/`startExpedition` 全部不动。

## Testing Decisions

- **好测试的标准**：只断言外部行为（导出函数返回值、渲染出的 DOM 文本/data 属性、结算日志文案），不断言实现细节。
- **引擎单测**（exploration.test.ts，prior art：现有池口径断言 `:411-416`、结算解锁断言 `:287-304`）：
  - `exploreProgress` 三态：空态（0/4、0/5、exhausted=false）→ 部分收集 → 集齐（4/4、5/5、exhausted=true）。
  - ended 集齐后 resource 结算日志含「已尽览所有已知目标」；未集齐保持「未发现新文明」。
  - infinite 扩展池有目标（构造 `phase==='infinite'` + 空 generatedTargets）→ exhausted=false，结算日志不含「已尽览」。
- **dom 冒烟**（dom.test.ts，prior art：`:1029` 发现进度测试、`:892` NG+ 卡渲染测试）：
  - progress 行 `data-explore-progress` 存在且文本含 "3/4" 类拆分。
  - 集齐态（seed exploredFactions=4 全 + exploredPlanets=5 全）→ `data-explore-exhausted` + `data-explore-infinite` 渲染；ended 未集齐 → 无按钮；playing → 无探索页（现有断言覆盖）。
  - `data-auto-explore-exhausted`：auto.enabled + exhausted 渲染；未尽览或未开启不渲染。
- **E2E**：本特性**不写 E2E**（用户决策——e2e/ 已空、broken specs 已移除，避免重蹈覆辙；playwright 基建保留待后续单独恢复）。不新增任何断言依赖 E2E。

## Out of Scope

- ended 探索池不加软内容（重复发现补偿事件/资源彩蛋/对话变体）——接受"收集完毕 = 空终态"，infinite 独占军事/程序目标的设计不动（grilling Q6 决策）。
- 不推翻 endless-expansion 作用域（军事目标仅 infinite 生效）。
- 不新增存档字段、无 schema 变更。
- 不恢复 E2E 基建（另行评估）。
- 不动结局面板、设置页、NG+ 卡、探索派遣/护航/自动续派逻辑。

## Further Notes

- **误导源复核**：grilling 早期假设"锁定占位误导玩家"经代码复核不成立——探索页未解锁槽位均已标注建筑/科技解锁需求；唯一会暗示"探索次数解锁"的 `data-explore-locked="planet"` 仅 infinite 渲染且与真实解锁条件（batch 2 = 15 次探索）一致。真正的信息缺口是**终态不可见 + 无指路**，本 spec 的 Solution 正是补这两点。
- **ended → infinite 入口现状**：仅结局面板 `data-ending="infinite"`（overlays.ts:82），`endingDismissed=true` 后面板关闭；本特性新增探索页常驻入口，顺带修复该路径缺口。
- **grilling 记录**：Q1 阶段=ended（玩家报告场景）；Q2 期望来源=终态不可见的认知偏差；Q3 方向=B 信息透明化；Q4 ①②③④ 全做；Q5 引导闭环；Q6 接受空终态；Q7 spec+tickets 工作流；Q8 文字徽章形态；Q9 横幅+日志；Q10 引擎单测+dom 冒烟+（E2E 后改为不写）；Q11 slug=explore-endstate。
