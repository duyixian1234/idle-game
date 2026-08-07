# 外交面板联盟总览卡（diplomacy-overview）

**Status:** delivered

## Problem Statement

外交面板内容过少，尤其所有外交对象结盟后自动折叠，面板只剩两行内容（联邦进度头 + 「已完成外交对象（N）」折叠摘要行），形成视觉死区；且外交玩法本身内容贫瘠，玩家基本不打开该面板。初始提案是"是否合并外交面板进其他面板"。

代码事实（已由探索确认）：

1. 现状面板（renderDiplomacyPanel）自上而下：空态文案（`factionsVisible=false` 时"星域中尚未探测到其他文明信号…解锁轨道工厂站·奥伯斯"）→ 联邦进度头（`星系统一联邦：X/Y 达成统一条件`）→ 每个未结盟派系条目（名称 + 特性徽标 + 好感/威胁横条 + 贸易/共享/结盟/威慑四按钮）→ 已结盟归档折叠区（`archivedRounds[id] != null || f.allied`，摘要行恒显、明细默认收起）→ 无限模式锁定占位。
2. **全结盟后可见内容 = 联邦进度头 + 折叠摘要行（+ 锁定占位）**——"内容过少"事实成立。
3. 外交相关数据已散布他处：声望卡/8 个外交成就/本周目贸易威慑统计在档案面板（重复呈现 = 另一种死区）；自动迎击派系骚扰/攻占列表在军事面板；军械科技区已迁科技面板（7a1d0fa，同构迁移先例）。
4. **事实修正（spec 阶段核查，推翻设计定稿 Q7 收益区口径）**：拟展示的"盟约收益合计（贸易折扣/共享半价/威慑折扣）"经代码核查——`canFactionTrade` / `canFactionIntimidate` / `canFactionTechShare` 均对 `f.allied` 短路（diplomacy.ts:136/154/164），**结盟后派系 perk 折扣全部不再生效**，终态下"生效折扣合计"恒为空，展示无意义。真正的结盟收益 = ① 计入联邦统一进度；② **消除骚扰源**（`raidableFaction` events.ts:236 `if (!f || f.allied) continue`，结盟派系不参与骚扰；离线骚扰结算 events.ts:922 同样排除）。声望贸易折扣（0..0.15）是全局加成、作用于结盟前贸易，且已在档案面板声望卡展示，不重复引入。

## Solution

把外交面板头部从"联邦进度计数行"升级为**常驻联盟总览卡**（无论结盟进度均显示，非仅终态），三行信息：

- **联邦统一**：`星系统一联邦：X/Y 达成统一条件`（保留现有文案与语义，同 federationProgress 口径）
- **威胁安宁**：`星域安宁，无派系骚扰`（无威胁源）或 `N 家派系构成骚扰威胁`（有威胁源）——结盟 = 消除骚扰源，全结盟终态自然显示安宁，死区被有意义的信息填充
- **盟约图鉴**：`已结盟 N / 已登场 M`——M 为已登场派系数（联邦进度 total 同源），N 为已结盟数（本周目现状，非跨周目 codex 口径）

空态（未发现派系）保留现有文案，总览卡不出现。已结盟折叠区、无限模式锁定占位、各派系条目零改动。**不合并外交面板**（grilling 决策：保留独立 tab）。

无存档 schema 变更（全派生状态，不落盘）。

## User Stories

1. 作为全结盟的外交玩家，我希望打开外交面板看到有意义的联盟总览（联邦进度、威胁安宁、盟约计数），以便面板不再是两行死区。
2. 作为部分结盟的玩家，我希望外交面板头部就显示当前威胁状态（哪些派系还可能骚扰），以便判断是否要继续外交或备战。
3. 作为部分结盟的玩家，我希望看到盟约进度（已结盟 N / 已登场 M），以便了解还有多少外交工作可做。
4. 作为尚未探测到派系的玩家，我希望面板保持现有空态引导文案，以便知道如何解锁外交（不受总览卡影响）。
5. 作为玩家，我希望总览卡不改变任何外交数值/结盟条件/骚扰判定，以便这只是信息呈现层改动。
6. 作为玩家，我希望外交面板不被合并进其他面板，以便外交操作路径（贸易/共享/结盟/威慑）保持现有可达性。
7. 作为无限模式玩家，我希望锁定占位与总览卡共存（总览在上、锁定提示在下），以便新目标解锁状态仍可见。
8. 作为玩家，我希望总览卡展示的信息都有真实游戏语义（不展示结盟后已失效的 per-faction 折扣），以便不被误导。

## Implementation Decisions

1. **引擎新增纯函数 `diplomacyOverview(state)`**（diplomacy.ts，命名/风格同 `federationProgress`/`exploreProgress`），返回：
   ```
   { total: number; satisfied: number; allied: number; threatCount: number }
   ```
   - `total` = `Object.keys(state.factions).length`（已登场派系数，与 federationProgress 同源）
   - `satisfied` = 联邦统一条件满足数（复用 `federationProgress(state).satisfied`，不重复实现）
   - `allied` = `state.factions` 中 `allied === true` 计数
   - `threatCount` = 未结盟且 `threat >= raidThreshold(state)` 的派系数（复用 `raidThreshold`，与 `raidableFaction` 同一阈值口径——events.ts 用 `f.threat < threshold continue`，此处以 `>=` 计数与之一致）
   - 纯派生、零写入、零 schema 变更；引擎逻辑不改（不触碰 can*/tradeCost/factionAlliance 等）。
2. **UI 头部改造**（renderDiplomacyPanel 联邦进度头区块）：进度头升级为总览卡，容器 `data-diplo-overview`，内部三行（各带 data 属性）：
   - `data-diplo-federation`：`星系统一联邦：X/Y 达成统一条件`
   - `data-diplo-threat`：`threatCount === 0` → `星域安宁，无派系骚扰`；否则 `N 家派系构成骚扰威胁`
   - `data-diplo-alliance`：`已结盟 N / 已登场 M`
   - `factionsVisible === false` 时整卡不渲染（保留空态文案）；各派系条目、折叠区、锁定占位零改动。
3. **不新增 main.ts 事件委托**（纯展示，无交互）。
4. **不搬**档案面板声望卡/本周目统计（grilling Q7 决策：重复呈现是另一种死区）。
5. 样式：总览卡复用现有 `.diplo-header` 视觉基座，必要时轻微扩展（三行小字），不新增独立样式体系。

## Testing Decisions

- **好测试的标准**：只断言外部行为（导出函数返回值、渲染出的 DOM 文本/data 属性），不断言实现细节。
- **引擎单测**（diplomacy.test.ts，prior art：`federationProgress` 断言、endless-expansion.test.ts 动态派系断言）：
  - `diplomacyOverview` 空态（无派系）/ 部分结盟（含未登场好感阈值态）/ 全结盟 的 `{total, satisfied, allied}`。
  - `threatCount`：威胁≥阈值的未结盟派系计数；结盟后不计入；全部结盟 → 0（与 `raidableFaction` 返回 null 的口径一致性）。
  - 纯函数不改 state（浅比较断言或调用前后快照）。
- **dom 冒烟**（dom.test.ts，prior art：外交面板渲染断言、fold-archived.test.ts 三态）：
  - `data-diplo-overview` 三态渲染：未解锁空态（不渲染）→ 部分结盟（三行文本）→ 全结盟（`星域安宁` 文案）。
  - 文本正确性：`已结盟 N / 已登场 M`、`N 家派系构成骚扰威胁`。
- **E2E**：本特性**不写 E2E**（体系已终止，7180e53 后 e2e/ 为空；playwright 基建保留待后续单独恢复）。

## Out of Scope

- **不合并外交面板**、不改 tab 结构/导航（grilling Q2/Q4 决策：玩家排除"tab 数减少"目标）。
- 不扩充外交玩法（功能贫瘠的完整治理另立议程——grilling Q5(c) 本次仅呈现层 + 最小增量）。
- 不搬档案面板内容（声望卡/统计/成就）。
- 无存档字段、无 schema 变更、不触碰引擎外交逻辑（can*/cost/动作/骚扰判定）。
- 不展示结盟后已失效的 per-faction 折扣合计（事实修正：无真实语义）。
- 不恢复 E2E 基建。

## Further Notes

- **grilling 记录**：Q1 痛点定标 = bc（本质功能贫瘠、次之视觉死区）；Q2 方案 = b 重做折叠态（否决合并）；Q3 玩家旅程 = d 基本不看；Q4 验收 = bc（步数不上升 + 无死区，排除 tab 数减少）；Q5 诊断处方错位 = c 呈现层先行 + 总览带最小增量；Q6 定位 = c 低成本高信息密度；Q7 内容 = a 联邦进度 + b 盟约收益 + c 图鉴进度（三合一）；Q8 形态 = b 常驻头部；Q9 验收 = c 三态走查。最终确认：不合并、头部升级总览卡。
- **事实修正（相对 Q7 定稿）**：Q7 的"盟约收益汇总（折扣合计）"在 spec 阶段核查发现结盟后 per-faction 折扣不再生效（can* 对 allied 短路），收益区改为「威胁安宁 + 盟约图鉴」口径——同属"有真实游戏语义的信息"，满足 Q6 低成本高信息密度与 Q7 三合一的意图（信息项数不变，内容换血）。
- **验收**：三态走查（tab 未解锁 / 部分结盟 / 全结盟）均无空区；导航结构未动，步数不上升自动满足（Q4 验收项）。
- **后续候选**：外交玩法内容扩充（新机制/新对象类型），另立 feature agenda。
