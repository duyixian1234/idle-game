# 事件自动处理配置迁移（event-auto-config）

**Status:** ready-for-implementation

## Problem Statement

档案页的「事件可解释性」模块（`data-event-explainability`，含 5 类自动化策略配置 + 审计历史 + 迁移摘要三块）位置错配：事件配置的直觉入口是事件发生的地方（日志页），而不是档案页。玩家在日志页看到事件、处理事件，却要切到档案页去配置自动处理，认知割裂。

同时该模块**实为半成品**：引擎的自动处理规则（`rules`）从未被任何代码填充（迁移与默认值均为空数组），fallback 路径又只对**低风险**事件生效——导致灾害（medium）/安保（high）类别的「自动处理」开了也永不触发，仅有贸易（low）能走 fallback。玩家在档案页做的配置，大部分情况下没有实际效果，且自动结算全程静默（日志无标注、无审计可查），「我的矿为什么少了」无从解释。

**设计定稿来源：** grill-me 两轮盘问，10 项决策全部按推荐定稿（2026-08-07）；实施前撤销（用户要求），本 spec 收录实施中发现的两个缺口修订。

## Solution

移除档案页「事件可解释性」模块（三块全删），把每类事件的自动处理配置搬到**日志页**：

- 日志头新增「自动处理」按钮 → 覆盖面板（5 类 theme 策略折叠列表：开关 + 状态摘要，展开调规则明细），改动即时生效（无保存按钮）。
- 事件卡新增「以后此类自动处理」快捷开关（只切 enabled，未配置过用默认表初始化）。
- 引擎补全 fallback 路径：去掉低风险限制，改为受**策略门**（选项可用性 / 风险上限 / 资源预算与余额 / 类别冷却）约束——类别级字段真正生效。
- 所有系统自动结算（策略自动处理、舰队自动迎击、离线自动结算）在日志中显式标注「已自动处理」（`data-auto-handled`），日志流即审计流，取代档案页审计列表。
- 存档结构不动（schema v9 保持）；`automationHistory` **只停渲染、保留写入**（引擎冷却判定依赖，属内部账本）。

## User Stories

1. 作为玩家，我希望档案页不再堆事件配置/审计/迁移信息，以便档案页回归成就/声望/统计的定位。
2. 作为玩家，我希望在日志页（事件发生的地方）直接配置自动处理，以便配置与事件就近、心智连贯。
3. 作为玩家，我希望日志头有「自动处理」按钮打开配置面板，以便随时调整策略而无需换页。
4. 作为玩家，我希望面板默认只显示 5 类的开关与状态摘要（如「已启用 · 风险≤高 · 处理方式：无视」），以便默认视图一眼掌握全貌。
5. 作为玩家，我希望展开某类可调风险上限/冷却/预算/处理方式，以便对每类事件精细控制。
6. 作为玩家，我希望改动即时生效（改一项立刻落盘），以便没有「保存」这个多余步骤。
7. 作为玩家，我希望事件卡上有「以后此类自动处理」开关，以便在事件发生时一键开启，不用进面板。
8. 作为玩家，我希望首次开启某类时用合理默认（贸易→自动成交、灾害→自动采集、安保→自动无视），以便开箱即用。
9. 作为玩家，我希望默认风险上限挡住 critical 阻断事件（虚空虫群/首领战保持人工），以便关键抉择不被静默吞掉。
10. 作为玩家，我希望自动处理的事件在日志中带「已自动处理」标注与结算明细，以便知道资源去向（取代审计列表的疑问）。
11. 作为玩家，我希望舰队自动迎击同样带「已自动处理」标注，以便统一理解「没弹窗就结算了」。
12. 作为玩家，我希望离线期间的自动结算同样带标注，以便回归时账目清楚。
13. 作为玩家，我希望存档迁移后日志首屏能看到迁移说明，以便知道存档被升级（现状迁移日志已写入日志流，无需重复实现）。
14. 作为玩家，我希望移动端（≤480px）面板全屏可用，以便小屏也能完整配置。
15. 作为玩家，我希望配置被策略门拦截时（选项不可用/冷却中/超预算/风险超上限）看到暂停通知，以便不静默丢事件、知道去调整配置。
16. 作为玩家，我希望已有配置刷新/重开后保留（即时保存落盘），以便不重复配置。
17. 作为玩家，我希望无需日志筛选功能也能在本期之外平滑扩展（标注已留语义钩子），以便未来加筛选不加成本。

## Implementation Decisions

### 数据模型与存档

- **无存档结构变更**：schema v9 保持，不升 v10（与 bug-defense 的 v10 是独立事项，不构成冲突）。`automationHistory` 字段残留无害（停写会导致冷却失效，见下）。`LogEntry.autoHandled` 为可选字段，随日志持久化，无需迁移。
- **automationHistory 修订**（原决策「停写」被事实推翻）：`ruleEligible` 与 fallback 的冷却判定依赖「该规则/类别最近一次 resolved 审计」——停写即冷却机制失效。正解：**保留引擎写入**（内部账本，冷却判定与暂停通知依据），仅从 UI 移除渲染。字段可接受无界增长（每次结算一条，与日志同量级）。

### 引擎（events.ts）

- 新增默认表（quick-toggle 首次开启时写入）：
  - `DEFAULT_AUTOMATION_FALLBACK`：trade=`accept`（自动成交，受余额/预算门）、disaster=`collect`（自动采集）、security=`ignore`（自动无视；bug 与 raid 实例均提供该选项）、exploration/investment=undefined（暂无事件定义）。
  - `DEFAULT_AUTOMATION_MAX_RISK`：trade=`medium`（覆盖 trade-frontier）、disaster=`high`（覆盖 storm-surge）、security=`high`（覆盖 raid/bug；critical 虚空虫群/首领战保持人工——blocking 设计）。
- **fallback 策略门**（修订原「仅低风险」限制）：`fallbackGate(state, instance, optionId, policy, nowMs)` 纯逻辑，任一拦截返回具体原因：
  1. 选项可用性：`instance.options` 不含该 optionId → 拦截（如 security 设为 `repel` 但事件是 bug 卡）。
  2. 风险上限：`RISK_RANK[risk] > RISK_RANK[policy.maxRiskLevel]` → 拦截。
  3. 资源余额与预算：`optionCost` 各项超出当前余额或 `policy.resourceBudget` → 拦截。
  4. 类别冷却：`policy.cooldownMs` 内该类别已有 resolved 审计（source=automation）→ 拦截。
- `autoResolvePendingEvents` 重构：规则（`rules`）优先（引擎 `ruleEligible` 机制保留，兼容旧档已有规则）；无规则时走 fallback，受策略门约束；暂停原因具体化（「处理方式 X 对当前事件不可用 / 风险 X 超过类别上限 Y / 花费超过类别预算 / 类别冷却中」）。规则冲突路径行为不变。
- 规则级（per-option）配置本期不做——面板只暴露类别级字段；`rules` 机制保留为兼容旧档的内部能力。

### 引擎日志（core.ts / engine.ts / offline.ts）

- `pushLog` 增加 `meta.autoHandled` 选项；`LogEntry.autoHandled?: boolean`。
- 标注范围（统一「系统已自动结算」语义）：
  - tick 中策略自动处理的结算日志（`autoResolvePendingEvents` 返回值逐条写日志并标注）。
  - 舰队自动迎击 outcome（`triggerRandomEvent` 返回的拦截结算）标注。
  - 离线结算中策略自动处理的结算日志（`settleOffline` 内同口径标注）。
- 暂停通知（warning）**不**标注（它是「需要人工处理」的提醒，不是自动结算）。
- 与 bug-defense 交互：虫群自动迎击落地后同样带 `data-auto-handled` 标注（归本特性标注语义范围，bug-defense spec 已注明）。

### UI（dom.ts / main.ts / actions.ts）

- **档案页**：删除 `renderEventExplainability`（配置/审计/迁移摘要三块）及其 main 接线；迁移摘要不新增 UI——迁移日志已由存档迁移写入日志流（现状已有 `【存档迁移】` 条目，首屏可见）。
- **日志头**：`buildLayout` 新增「自动处理」按钮（`data-auto-config-trigger`）。注意：日志头现整体 `aria-hidden="true"`，交互按钮不能放进 aria-hidden 容器——把 aria-hidden 收敛到装饰性 span（标题/光标），按钮本体可聚焦可达。
- **配置面板**：新增遮罩容器（复用既有 overlay 体系：fixed 遮罩 + 卡片，z-index 50；`hidden` 切换）。`renderAutoConfigPanel(el, state, expandedCategory)` 每 tick 随 render() 重建：
  - 5 类折叠列表（玩家语言命名：贸易/灾害/安保/探索/投资），行内：名称 + 状态摘要 + enabled 复选框（`data-auto-enabled`）；点击行展开/收起明细（`data-auto-cat-row` → 展开态）。
  - 展开明细：风险上限下拉（不限/低/中/高/极高 → `maxRiskLevel`）、冷却分钟输入（0 = 不限 → `cooldownMs`）、矿物/科技预算输入（空 = 无限制 → `resourceBudget`）、处理方式下拉（类别候选集：贸易 accept/refuse；灾害 collect/shield；安保 repel/buyoff/dispatch/jam/ignore）＋提示「仅当事件提供该选项时生效，否则暂停等待人工处理」。
  - 开合/展开为 **UI 会话状态**（不进存档，与 `activePanelTab` 同构）：模块级 `autoConfigOpen` / `autoExpandedCategory`。
  - 关闭：× 按钮 / 遮罩点击 / Esc。
  - 移动端 ≤480px：面板全屏抽屉（卡片铺满视口）。
- **即时保存**：所有改动（enabled/risk/cooldown/budget/fallback）直接 dispatch `setAutomationPolicy`；其 feedback 改为**静默**（不再写「已保存 X 类…」系统日志，避免每改一项污染日志流）。
- **事件卡快捷开关**：事件卡底部新增「以后此类自动处理」复选框（`data-auto-quick-toggle`，值 = 类别 theme）；只切 enabled；该类别从未配置过 → 用默认表初始化（`{ enabled, rules: [], fallbackOptionId: DEFAULT_AUTOMATION_FALLBACK[theme], maxRiskLevel: DEFAULT_AUTOMATION_MAX_RISK[theme] }`）；已配置 → 仅翻转 enabled、其余字段不动。
- **日志行标注**：`appendLog` 遇 `entry.autoHandled` 输出 `data-auto-handled` 属性 + 可视化「已自动处理」标记（与结算文本同行的轻量 tag）。
- 不加日志筛选（决策 9）：标注属性为将来筛选留语义钩子。

### 层级边界（与 bug-defense 交叉引用）

层级不变：舰队自动迎击在事件卡**生成前**（`triggerRandomEvent` 内）拦截；策略自动处理在事件卡**生成后**（tick `autoResolvePendingEvents`）。`automationPolicies` 的 security 规则可自然选择 bug-defense 新增的 `repel` 选项（`optionCost` 已覆盖 `family==='security'`），无需特殊处理。

## Testing Decisions

- **主 seam（引擎纯 TS，Vitest）**，参照 `events.test.ts` 自动处理 describe 先例：
  - fallback 策略门：风险上限拦截/放行（trade medium、disaster high 语义）、预算与余额拦截、选项不可用拦截（security fallback=repel 遇 bug 卡 → 暂停）、类别冷却拦截与冷却过期放行。
  - 默认表：quick-toggle 初始化语义（引擎侧提供 DEFAULT 表常量，测试引用值防漂移）。
  - 既有测试语义更新：fallback 原因文案（「低风险安全 fallback」→「类别默认处理」）、冷却测试（原「规则冷却 → fallback 兜底」改为「类别冷却 → 暂停」）。
  - 日志标注：`pushLog` meta 透传；tick 后策略结算日志带 `autoHandled`；`triggerRandomEvent` 舰队迎击 outcome 日志带 `autoHandled`；`settleOffline` 内自动结算日志带 `autoHandled`（参照 `offline.test.ts` 先例）。
  - 暂停通知**不**带标注。
- **次 seam（UI jsdom）**，参照 `dom.test.ts` 先例：
  - 档案页三块不再渲染（旧测试删除）；`renderAutoConfigPanel`：5 类渲染、enabled 选中态、展开明细控件值回填、关闭按钮。
  - 事件卡快捷开关渲染（checkbox 状态 = 对应 theme enabled）。
  - `appendLog` 带 autoHandled → 行含 `data-auto-handled`；不带则无。
  - `actions.test.ts`：`setAutomationPolicy` 成功不产生日志、触发渲染+保存。
- **E2E（用户手动执行，agent 不跑）**：`e2e/auto-config.spec.ts`（全 `data-*` 断言，禁类名断言）：
  - 日志头按钮开/关面板（遮罩/Esc）；5 类 `data-auto-cat` 渲染；展开 `data-auto-cat-row` 出明细。
  - 开关即时保存：切 enabled → 重开面板选中态保留（落盘验证）。
  - 事件卡快捷开关：启用某 theme → 该类别策略 enabled。
  - 自动结算标注：配置 fallback 后事件被自动处理 → 日志行 `data-auto-handled`；舰队自动迎击 → 事件卡不出现 + 日志 `data-auto-handled` + 威胁 −15（复用 fleet E2E 的 seed 42 + rngCounters.event 确定性技巧）。
  - 暂停通知：选项不可用/冷却中 → warning 日志 + 事件卡仍在。
  - 复用 `seedSave` + `lockSaveStore` 注入技巧与「playing 档派系未统一」铁律。
- 好测试标准：只断言外部行为（面板出现与否、选中态、日志文本与 `data-*` 属性、资源变化），不断言内部实现细节。

## Out of Scope

- 日志筛选功能（决策 9 明确不做；`data-auto-handled` 留钩子）。
- 规则级（per-option）配置 UI——面板只暴露类别级字段；引擎 `rules` 机制保留兼容旧档。
- 存档 schema v10——本特性零存档变更；bug-defense 的 v10（bugEscalation）是其独立事项。
- bug-defense 的虫群军事化实现本身（其 spec 已覆盖）；本特性仅约定其迎击日志共享 `data-auto-handled` 标注语义。
- 预设方案/一键模板（如「全部自动」按钮）——本期不加，先让类别级字段真正生效。
- 离线虫群结算（bug-defense 边界，与本特性无关）。

## Further Notes

- **现状缺口（实施前发现，已修订进决策）**：
  1. `automationHistory` 不能停写——冷却判定依赖（`ruleEligible` 按 ruleId、fallback 按类别查最近 resolved 审计）；「停写」修订为「只停渲染、保留写入」。
  2. fallback 原仅低风险生效 → 灾害/安保类别开了也不自动处理（模块半成品）；修订为受策略门约束、不限低风险，类别级字段（风险上限/冷却/预算/处理方式）全部真实生效。
- **默认值理由**：trade 默认 accept（余额/预算门兜底，正收益）；disaster 默认 collect（正收益）；security 默认 ignore（bug 与 raid 卡均提供该选项，通用安全）；默认风险上限均停在 critical 之下——blocking 事件（虚空虫群/首领战）保持人工，与现有 `handlingMode` 设计一致。
- **交互**：与 bug-defense（`.scratch/bug-defense/spec.md`）层级边界一致（迎击在卡前、策略在卡后）；虫群迎击的 `data-auto-handled` 标注归本特性实施范围。
- **即时保存与日志**：`setAutomationPolicy` 静默化后，配置改动无系统日志——面板选中态即反馈，避免每次勾选刷一条日志。
- 命名：面板/开关/标注统一 `data-auto-*` 前缀；标注属性 `data-auto-handled`。
