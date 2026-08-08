# 终局内容经济：生成目标收益/成本锚产能 + 外交自动化分级（endgame-discovery-economy）

**Status:** ready-for-agent

## Problem Statement

1. **后期一次性收益坍缩**：无限模式中生成军事目标一次性奖励固定（守卫×800–1200 矿 / ×40–60 科技 ≈ 均 175万矿 = 当期产出 3.5 秒），外交目标发现零收益；而探索产出型天体固定加成（`outputPct` 0.5–2% 挂主基地）随经济永续缩放——「外交/军事一次性收益严重低于天体固定加成」。
2. **奖池权重倒挂**：infinite 深池派系 ≈50%、天体 ≈25%、军事 ≈25%——最高概率撞上最低价值的发现。
3. **联邦进度倒退负反馈**：通关后新派系以 favor 0–30 进场 → 统一度 4/4 回退 4/5。
4. **外交自动化后期空转**：`autoDiplomacyTick` 只处理 favor ∈ [40, 100) 的贸易/技术共享；后期老派系 favor=100、新派系 favor<40 → 无动作可做。
5. **胁迫态不折叠**：臣服/条约中派系停留主列表；且折叠区无交互，赎罪路径需保留。

## Solution

- **生成目标经济同源锚定（ADR-0028）**：军事目标一次性奖励 = 当期矿物净产出 × N 秒（矿+科技双发）；攻占启动成本 = 当期净产出 × M 秒（成本与奖励同源，净比值恒定防印钞）；外交目标发现礼包 = 产能挂钩资源（矿+科技）+ 好感 +10。奖励与成本在发现时固化（出发时固化同族）。守卫保留「挑战阈值」语义。手写保底（`endless:*`）维持固定数值；程序生成目标零永久加成红线不动。
- **联邦进度 infinite 语义（ADR-0029）**：infinite 阶段 `federationProgress` 只统计「已解决」派系（total = satisfied），新派系不计入 → 进度不回退。
- **外交自动化纯全局方向（ADR-0030/0032）**：全局选 友好（自动贸易→结盟，仅 ended/infinite）/ 胁迫（生成派系自动勒索→条约）二选一；自动贸易好感阈值 0（发现礼包后新派系自动启动前置）；raid 安全边界（静态/探索派系在胁迫方向下自动跳过）；挂机（离线）同步推进。
- **胁迫态派生折叠（ADR-0031）**：`subjugated || 条约中` → 折叠区，状态变化自动折/展；折叠区保留赎罪/续签入口。
- **奖池权重**：天体 30% / 军事 25% / 外交 25%（目标分布，整数权重近似）。
- **自动攻占 + 守卫挂钩容量（ADR-0033，issue 04）**：军事目标自动攻占（独立开关、每 60s 对可用生成目标投满守卫必成、军力保底 20%、挂机同步）；gen 守卫 = `max(500, ⌊militaryCap × 15-40%⌋)`（取代 1.5^ng 周目缩放）——后期攻占军力成本成真实门槛。
- 同一轮 grill 定稿（2026-08-08，六轮 21 决策 + 迭代）；五个改动域可拆分四个 ticket。

## User Stories

1. 作为通关后玩家，我希望生成军事目标的一次性奖励随当期产出缩放（矿+科技双发），以便后期攻占收益不坍缩成「几秒产能」。
2. 作为通关后玩家，我希望攻占启动成本与奖励同源缩放，以便奖励/成本比值恒定、经济规模不漂移（无印钞路径）。
3. 作为通关后玩家，我希望发现新外交对象时立即到账产能挂钩资源礼包并好感 +10，以便发现瞬间有「到账感」。
4. 作为通关后玩家，我希望手写保底目标（掠夺者舰队/冰封要塞/吞噬者母巢等）维持固定叙事奖励，以便保留内容独特性。
5. 作为通关后玩家，我希望奖池权重向天体倾斜，以便「头奖」（永久加成）保持稀有感。
6. 作为通关后玩家，我希望无限模式中发现新派系不使联邦统一度回退，以便已达成的事不被新内容动摇。
7. 作为玩家，我希望外交自动化全局选友好/胁迫方向，以便不进入外交面板也能自动完成（挂机同步）。
8. 作为玩家，我希望自动结盟只在通关后生效，以便 playing 阶段不因自动化自动通关。
9. 作为通关后玩家，我希望全局胁迫方向只作用于生成派系（raid 安全），静态/探索派系自动跳过，以便挂机时不因自动化招来骚扰循环。
10. 作为通关后玩家，我希望生成军事目标可自动攻占（投满必成、军力保底、挂机同步），以便不进入军事面板也能自动清理生成目标。
11. 作为通关后玩家，我希望 gen 目标守卫挂钩军力容量（15-40%），以便后期攻占军力成本成真实门槛、不能无限并行刷。
10. 作为玩家，我希望臣服/条约中的派系自动折叠进折叠区，且折叠区保留赎罪/续签入口，以便 UI 整洁且赎罪路径可达。
11. 作为开发者，我希望 balance-sim 断言生成目标价值密度不超探索/护航，以便防印钞在结构上被钉死。

## Implementation Decisions

### 生成目标经济（ticket 01，ADR-0028）

- 新常量入 balance.ts：`GEN_CONQUEST_REWARD_MINERAL_SECONDS`（N_min）、`GEN_CONQUEST_REWARD_TECH_SECONDS`（N_tech）、`GEN_CONQUEST_COST_MINERAL_SECONDS`（M_min）、`GEN_CONQUEST_COST_ENERGY_SECONDS`（M_ene）、`GEN_FACTION_GIFT_MINERAL_SECONDS`（G_min）、`GEN_FACTION_GIFT_TECH_SECONDS`（G_tech）、`GEN_FACTION_GIFT_FAVOR = 10`。
- `generateConquestTarget`（generate.ts）：奖励改为 `⌊mineralProd × N_min⌋` 矿 + `⌊mineralProd × N_tech⌋` 科技（双发，不再二选一）；成本快照 `⌊mineralProd × M_min⌋` 矿 + `⌊energyProd × M_ene⌋` 能源一并写入 target；守卫生成逻辑不动（挑战阈值语义）。
- `startConquest`（conquest.ts）：追加扣除固化的产能挂钩资源费（从 target 快照读取，与守卫军力投入并行）。
- 外交礼包在发现结算处发放（exploration.ts `settleEndlessFaction` / gen faction 分支）：`mineral += ⌊mineralProd × G_min⌋`、`tech += ⌊mineralProd × G_tech⌋`、`favor = min(FAVOR_CAP, favor + 10)`（初始 0–29 → 最高 39 < 40 自动外交阈值，零钳制逻辑）。
- 固化时点：奖励与成本在目标创建（结算）时按当期 `netProduction` 计算并快照——与 ADR-0008「出发时固化」同族，防 SL。
- 排除：程序生成目标永久加成（ADR-0012 红线，不动）；手写保底数值（ADR-0028 决策 6）；勒索/条约贡税流（Q15 后续议题）。

### 奖池权重 + 联邦语义（ticket 02，ADR-0029）

- `expeditionPool`（exploration.ts）：权重调整为天体 30% / 军事 25% / 外交 25% 的目标分布——实现用整数权重近似：planet 条目权重升、faction/conquest 条目权重降（具体值见 open items，需 balance-sim 验证分布）。
- `federationProgress` / `isFederationUnified`（diplomacy.ts）：`phase === 'infinite'` 时只统计「已解决」派系——`total = satisfied = 已结盟或 favor ≥ 100 的派系数`；playing/ended 语义不变。
- 排除：`checkEnding` 重触发（`endingTriggered` 守卫已保证，不改）。

### 外交自动化 + 派生折叠（ticket 03，ADR-0030/0031）

- `diplomacyAuto` 配置：纯全局方向 `mode: 'ally' | 'coerce'`（缺省 'ally'；ADR-0032 迭代，`perFaction` 废弃保留不读）；「关」由全局 `enabled` 表达；自动贸易好感阈值降至 0（`DIPLO_AUTO_FAVOR_THRESHOLD = 0`，发现礼包后新派系 favor 10–39 自动启动前置）。
- `autoDiplomacyTick`（diplomacy.ts）：
  - 友好线（ally）：所有 favor < 100 派系自动贸易/技术共享（预算比 10% 自稳）→ 新增 `favor ≥ 80` 且 `phase !== 'playing'` 且结盟预算内 → 自动 `factionAlliance`。
  - 胁迫线（coerce）：仅 `isEndlessTargetId(id) || id.startsWith('gen:')` 且 `coercionUnlocked` → 首轮勒索（`factionExtort`），此后 **treaty 优先**（`canFactionTreaty` → `factionTreaty`，避免反复勒索涨 threat/条约期等待）；条约到期自动续签（成本 ×1.5^treatyCount 递增自稳）；静态/探索派系（raid 候选）自动跳过。
  - 阶段门控：playing 阶段不触发自动结盟（友好线只到贸易/技术共享）。
  - 挂机同步：`settleOffline` 按冷却周期批量推进（虚拟时钟）。
  - 阶段门控：playing 阶段不触发自动结盟（友好线只到贸易/技术共享）。
- `panels.ts` 折叠判定：`archivedRounds[id] != null || f.allied || f.subjugated || (f.treatyUntil !== undefined && nowMs < f.treatyUntil)` → 折叠区；折叠条目按状态渲染徽章（已臣服/条约中）且对胁迫态保留「赎罪」「续签」按钮。
- 排除：臣服/赎罪自动化（ADR-0030 决策 4）；静态/探索派系自动胁迫（raid 安全边界）。

## Testing Decisions

- **缝（seam）**：引擎派生纯函数层（`generateConquestTarget` 奖励/成本、`factionExtort`/`factionTreaty` 可达性、`federationProgress`、`autoDiplomacyTick`）+ UI 渲染判定（`panels.ts` 折叠）+ balance-sim 断言。全部改动汇聚于派生函数/纯判定，无新 seam 引入。
- **好测试标准**：只断言外部行为——产能挂钩后奖励随产出缩放、奖励/成本净比值恒定；infinite 新派系不回退联邦进度；自动结盟 playing 不触发；自动胁迫不选静态派系；条约中折叠、到期自动展开、赎罪按钮可达。（注：旧口径「守卫 0 级经济时与现状逐字节一致」在奖励改产能锚定后不再适用——0 产出 = 0 奖励，无法与守卫×因子口径逐字节一致，spec 表述已作废。）
- **测试模块**：generate 域（军事奖励/成本）、exploration 域（礼包结算/权重）、conquest 域（启动成本）、diplomacy 域（联邦语义/自动外交）、ui 域（折叠判定）、balance-sim（价值密度）。
- **Prior art**：`generate.test.ts`（生成目标）、`exploration.test.ts`（结算/奖池）、`conquest.test.ts`（攻占）、`diplomacy-auto.test.ts`（自动化）、`fold-archived.test.ts`（折叠）、`balance-simulation.test.ts`（印钞与不变量断言）。

### balance-sim 断言（ticket 01 新增）

- 军事单目标净收益 ≤ 探索机会成本折算上限（`GENERATED_CAP_EXPLORATIONS_DIVISOR` 次探索 × 单次矿成本；落在探索成本未封顶区间——深后期机会成本封顶而军事奖励未封顶，印钞由供给 cap 兜底，见 ADR-0028 后果段）。
- 成本与奖励同源：任意净产出水平下净比值 `(N−M)/M` 恒定（采样多档产出断言）。
- 外交礼包 + 好感 ≤ 39（低于自动外交阈值 40）。

## Out of Scope

- 贡税流（条约 5.56/s、臣服 11.1/s）锚产能——手动胁迫的持续收益，独立后续议题（grill Q15）。
- 静态探索目标（首次通关 4 派系 + 5 天体）——首次通关内容，牵连通关节奏（grill Q7）。
- 程序生成目标永久加成——ADR-0012 红线，不碰（grill Q3）。
- 勒索/赎罪收益经济化——coercion 经济议题，后续。
- 攻占守卫区间/舰队平衡——独立议题。

## Further Notes

- 关系：本 spec 与 fleet-power-exploration（战力杠杆）、endgame-balance-tuning（容量/质变）无硬依赖；产出锚定复用 balance.ts 根因子与 balance-sim 框架（ADR-0018）。
- Open items（实现期可拍板）：N/M/G 常量初值（ticket 01 建议带 N ∈ [30, 180]、M/N 同量级，sim 校准定稿）；奖池权重具体整数（ticket 02，sim 验证目标分布）；自动结盟预算口径（复用 DIPLO_AUTO_BUDGET_RATIO ≤10% 或独立阈值）；折叠区赎罪/续签按钮布局与 data-* 契约（ticket 03）；`diplomacyAuto.mode` 为可选字段不升 SCHEMA（`perFaction` v14 遗留废弃，ADR-0032 已落地）；**军事奖励/成本是否加 cap（与探索 `scaledClamp` 同构，消除深后期「探索成本封顶而军事不封顶」的脱钩——ADR-0028 后果段已知限制，2026-08-08 code-review 提出）**。
- 建议实施顺序：ticket 01 → 02 → 03（01 为核心经济改动，02/03 与之无硬阻塞但联调更顺）。
