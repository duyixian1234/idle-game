Status: ready-for-agent

# Spec: 通关后探索机制（exploration）

## Problem Statement

通关后（`ended`/`infinite`）玩家除「开启新周目」外没有新的长期目标：统一联邦即终点，剩余只有刷产出与重复事件。玩家诉求：通关后消耗矿物、能源与兵力派遣探索——有概率结交更多势力（扩展联邦目标）、有概率发现更佳的发展天体（扩展产出上限），且探索全程受固定随机种子约束（防 SL + 跨设备一致，`fixed-rng` 已就绪，`explore` 域预留）。

## Solution

通关后解锁「派遣探索」：单派遣槽（同时最多 1 支）、固定 60 分钟（复用攻占倒计时语义）、离线照常推进、兵力扣除锁定、不可取消。出发时按当前每秒产出动态缩放扣矿物/能源 + 固定兵力，并用 `explore` 域固定种子**出发时 roll 并固化结果**（决策 Q16-A：派遣 = 全提交，回归自动入账）。奖池 = 未发现的探索势力（4 家预设具名）+ 未发现的探索天体（2 个机制天体）+ 资源补偿兜底，剔除制重归一化；收集期正期望（~1.5×）+ 单次封顶，耗尽后微正期望（~1.1×）变资源搬运器（补科技点溢出出口）。新势力**发现时运行时创建**（不污染联邦判定、旧档零迁移）、参与联邦判定（通关后新目标：统一更多家）；新天体带机制（科技点折算能源折减 / 矿物产出+25%·能源消耗+20%）、防重复（剔除奖池）、立即可用可切 `activePlanet`。3 个探索成就（collect 类、周目重解锁、小 rep）。NG+ 重置发现进度、结盟 codex 继承、派遣中任务静默丢弃并写进「失去清单」。

## User Stories

1. 作为一名通关玩家，我希望在 `ended`/`infinite` 状态下发起探索派遣，以便通关后有新的长期目标。
2. 作为一名玩家，我希望探索消耗矿物、能源与固定兵力（随产出动态缩放），以便投入始终有意义。
3. 作为一名玩家，我希望派遣固定 60 分钟、离线照常推进、回归自动入账（日志播报），以便符合挂机节奏。
4. 作为一名玩家，我希望探索有概率发现新的具名势力（参与联邦统一目标），以便「统一联邦」在通关后延续为「统一更多家」。
5. 作为一名玩家，我希望探索有概率发现更佳的发展天体（机制差异，可切为 activePlanet），以便产出上限不被母星封死。
6. 作为一名玩家，我希望已发现的势力/天体不再重复出现（剔除奖池），以便收集有明确终点。
7. 作为一名玩家，我希望探索结果由固定种子决定（刷新/换设备不重抽），以便与 fixed-rng 的目标一致。
8. 作为一名开发者，我希望探索结果在出发时固化、回归只入账，以便防 SL 在结构上成立。

## Implementation Decisions

- **入口与门控（决策 A1）**：`phase === 'ended' || phase === 'infinite'` 解锁（引擎侧 `isExploreAvailable` 校验），UI 与「开启新周目」按钮同级（工具栏 `data-explore`）。`playing` 阶段不可用。
- **派遣数据模型（决策 A2/A4/A5/Q16/Q17）**：新增 `src/engine/exploration.ts`，存档新字段：
  - `expeditions: ExpeditionState[]`——单槽（引擎侧校验进行中数量 ≤ 1）。`ExpeditionState = { id, startedAt, finishAt /* startedAt + EXPEDITION_DURATION_MS */, cost: { mineral, energy, military }, result: ExpeditionResult, resolved: boolean }`。`result` 出发时固化：`{ kind: 'faction', factionId } | { kind: 'planet', planetId } | { kind: 'resource', mineral, tech, energy }`。回归入账后 `resolved`、从数组移除（统计已由 `stats.explorations` 记录）。
  - `nextExpeditionId: number`——派遣 id 递增。
  - `exploredFactions: string[]` / `exploredPlanets: string[]`——发现进度（奖池剔除依据，周目重置）。
  - `stats.explorations: number`——累计完成派遣次数（周目口径，成就用）。
- **消耗（决策 A3 + balance-sim 校准）**：`balance.ts` 新增纯函数 `scaledClamp(rate, min, factor, cap) = Math.min(cap, Math.max(min, Math.floor(rate * factor)))`（现有 `scaledBy` 无上限，探索需要封顶）。新常数：`EXPEDITION_DURATION_MS = 3_600_000`、`EXPEDITION_MILITARY_COST = 40`（固定，兵力硬上限天然冷却）、`EXPEDITION_MINERAL = { min: 3000, factor: 300, cap: 150_000 }`、`EXPEDITION_ENERGY = { min: 1000, factor: 150, cap: 60_000 }`。初值方向见上，**精确值由 ticket 06 balance-sim 校准后定稿**（calibrated 标记替换）。
- **奖池与概率（决策 A6/Q9/Q20）**：`expeditionPool(state)` 返回候选 = 未发现的 `EXPLORE_FACTIONS`（各权重 2）+ 未发现的 `EXPLORE_PLANETS`（各权重 1）+ 资源补偿（权重 `max(2, 6 - 已收集数)`，剔除重归一化后收集期补偿占比约 25-40%，保证「多数派遣有收集进展感」）。roll：`(rng ?? rollDomain(state, 'explore'))() * totalWeight` 轮盘（与 `pickEventDef` 同法）。收集期目标 8-12 次派遣收集完 6 个发现物。
- **结果入账（决策 A4/Q16/A12）**：`settleExpeditions(state, nowMs)`（tick + `settleOffline` 调用，离线倒计时照常推进）：
  - faction：`state.factions[factionId] = createFactionState(def)`（从 `diplomacy.createFactions` 抽出的单势力构造 helper，favor/threat 取 def 初值）→ 日志「探索队返航：在偏远星区发现「XX」的聚居舰队……」。
  - planet：`state.planets[planetId] = { unlocked: true, unlockedAt: nowMs }` → 日志 + 可选 `PLANET_STORIES`。
  - resource：按固化值入账（含科技点——资源补偿含 `tech`，为科技点溢出提供直接出口）。
  - `stats.explorations += 1`；成就由 tick 内 `checkAchievements` 自动覆盖（condition 读新字段）。
- **探索势力池（决策 A4/Q10，data.ts）**：`EXPLORE_FACTIONS`（新增导出，与 `FACTIONS` 初始 4 家分离）——4 家具名：
  | id | name | initialFavor | initialThreat | 机制差异 |
  |---|---|---|---|---|
  | `ashCommune` | 灰潮共同体 | 10 | 35 | `tradeDiscount: 0.05`（贸易成本再 -5%，与声望折扣乘法叠加） |
  | `ringOrder` | 星环修道会 | 15 | 25 | 无（纯叙事） |
  | `obsidianPact` | 黑曜协议 | 5 | 55 | 无（高威胁，天然 raid 源，叙事张力） |
  | `nodeIntellect` | 节点智械 | 10 | 40 | `techShareCostMult: 0.5`（技术共享科技点半价） |
  - `FactionDef` 扩 2 个可选字段：`tradeDiscount?: number`、`techShareCostMult?: number`。`diplomacy.ts` 的 `tradeCost` 在通用折扣后再乘 `(1 - def.tradeDiscount)`；`factionTechShare` 成本乘 `def.techShareCostMult`。
  - 首次接触确定性结交：探索发现即创建（无额外概率判定，随机性只在「发现谁」）。
  - **联邦判定零改动**：`isFederationUnified` 遍历 `state.factions`，发现后自动纳入——通关后新目标 = 把新势力也纳入联邦（favor 100 / 结盟）。
- **探索天体池（决策 A5/Q11，data.ts + mechanics.ts + production.ts）**：`EXPLORE_PLANETS` 2 个，`PlanetDef` 扩 `discoverOnly?: boolean`（`checkPlanetUnlocks` / `planetRequirementsMet` 跳过，只由探索解锁）：
  - `logistics` 星际物流港，`mechanicId: 'logisticsHub'`——科技点折算能源折减：`production.ts` 的 `settleEnergyRatio` 计算时 `effectiveEnergy = energy + tech * LOGISTICS_TECH_ENERGY_RATIO`（初值 0.5，即 2 科技点顶 1 能源；精炼厂能源不足打折幅度降低，科技盈余变能源）。
  - `outpost` 殖民前哨，`mechanicId: 'outpost'`——`applyPlanetMechanics` 内矿物产出 ×1.25；能源折减消费侧 ×1.2（有取舍：矿多但更吃能源）。
  - 发现即解锁、可切 `activePlanet`（`renderPlanetBar`/`setActivePlanet` 遍历 `PLANETS` 自动纳入）；`MechanicId` 联合类型 + `PLANET_MECHANICS` 注册 2 项。
- **成就（决策 Q12）**：`achievements.ts` 新增 3 个（`category: 'collect'`、`recurring` 周目重解锁）：
  - `explorerFirst`「启程」：`stats.explorations >= 1`，rep 2。
  - `explorerContact`「初识」：`exploredFactions.length >= 1`，rep 2。
  - `explorerComplete`「群星尽览」：探索池全收集（`exploredFactions` 覆盖 `EXPLORE_FACTIONS` 全部 && `exploredPlanets` 覆盖 `EXPLORE_PLANETS` 全部），rep 3（声望 cap 溢出接受——图鉴价值为主）。
  - 均带小额 `rewardMineral`（沿 collect 惯例）。
- **NG+ 交互（决策 Q18）**：`startNewGamePlus` 重置 `expeditions: []`、`exploredFactions: []`、`exploredPlanets: []`、`nextExpeditionId: 1`、`stats.explorations: 0`；**保留** `seed`/`rngCounters`（fixed-rng 已处理）与 `factionCodex`（新势力结盟历史继承）。`ngplus.ts` 的 `previewNewGamePlus` 在存在未结算派遣时加入「失去清单」条目「1 支探索队（派遣中，将失去）」。派遣中任务随 NG+ **静默丢弃不退款**。
- **存档 v6（迁移链陷阱沿用）**：`SCHEMA_VERSION` 5 → 6；`SAVE_SCHEMA` 加 `{ key: 'expeditions', since: 6, check: isArray }`、`{ key: 'exploredFactions', since: 6, check: isArray }`、`{ key: 'exploredPlanets', since: 6, check: isArray }`、`{ key: 'nextExpeditionId', since: 6, check: isNumber }`；`migrateV5ToV6` 补上述默认（空数组/1）+ `stats.explorations = 0`，`schemaVersion` **写死 6**（防 SCHEMA_VERSION 再变时的跳级陷阱，同 fixed-rng 教训）。`createInitialState` 带新字段。
- **UI（决策 A1/A12）**：工具栏 `data-explore` 按钮（ended/infinite 显隐，与 `data-ngplus` 同级）；探索 overlay 面板（复用 `.ending-overlay` 样式体系）：状态行（单槽：可用 / 倒计时 mm:ss）、消耗预览（`scaledClamp` 当前值 + 兵力 40）、「派遣探索」按钮（资源不足或派遣中禁用）。`ACTIONS` 注册 `'explore'`。结果一律日志播报（自动入账，不打断玩家）。

## Testing Decisions

- **seam**：沿用双层 seam；新增 `src/engine/exploration.test.ts`（主 seam）。探索域随机沿用 fixed-rng 注入约定（显式传 rng = 注入，不传 = 走 `explore` 域持久计数器）。
- **好测试的标准**：出发（扣资源/固化结果/单槽）/回归（入账/日志/计数/成就）均为可重入纯函数路径，断言状态与不变量。
- **引擎层新增覆盖**：
  - `startExpedition`：`playing` 拒绝；有进行中派遣拒绝；资源不足拒绝；正常出发 = 扣 `cost`（含兵力锁定不返还）、`finishAt = now + 60min`、`result` 固化（注入 rng 断言 kind/factionId）；单槽并发拒绝；`explore` 域计数器消耗。
  - `settleExpeditions`：到期入账三分支（faction 创建 / planet 解锁 / resource 入账含科技点）；未到期不动；`stats.explorations +1`；多派单一并结算；离线路径（`settleOffline` 调 `settleExpeditions`）推进。
  - 奖池：剔除制（已发现不出现在候选）、重归一化、补偿权重随收集数变化、耗尽后无收集品只剩补偿。
  - 联邦判定：发现新势力后 `isFederationUnified` 变 false（若之前已统一）；全部结盟后恢复 true。
  - 天体机制：`logisticsHub` 科技点折算能源折减（能源缺口场景 ratio 提升）；`outpost` 矿物 ×1.25 + 能源消耗 ×1.2；`discoverOnly` 不被 `checkPlanetUnlocks` 自动解锁、探索解锁后 `setActivePlanet` 可用。
  - 外交差异：`tradeCost` 对灰潮共同体再 -5%；`factionTechShare` 对节点智械半价；其余势力不受影响。
  - 成就：3 个成就的 condition 在各触发点达成（派生判定）、`recurring` 周目重解锁语义正确。
  - 迁移：v5 档 → v6 字段补齐、schemaVersion=6、旧档可正常探索；v4→v6 全链不跳级（回归 fixed-rng 陷阱修正）。
  - NG+：派遣中任务丢弃（不退款）、发现进度重置、codex 保留（新势力结盟历史在）、`previewNewGamePlus` 失去清单含探索队条目。
  - 回归：fixed-rng 全量 + 现有 341 vitest 全绿。
- **UI 层覆盖**：`data-explore` 按钮显隐（playing 隐藏 / ended/infinite 显示）；探索面板渲染（倒计时/消耗预览/禁用态）；派遣点击 dispatch；结果日志播报。
- **E2E**：注入通关档（`phase: 'ended'`、足量资源、`expeditions: []`）→ 点击派遣 → 断言派遣记录生成/资源扣除/倒计时显示；注入进行中派遣档（`finishAt` 近过去）→ tick 后断言结果日志入账。1-2 例。

## Out of Scope

- 多派遣槽、取消/召回、提前结算——决策 A5/Q17 单槽不可取消定稿。
- 交互式回归结算（A12 自动入账定稿）。
- 探索天体纯数值膨胀（×N 产出）——决策 A5 否决。
- 新资源维度（`ResourceKey` 不动）。
- 探索发现天体自动切换 `activePlanet`——玩家手动切。
- 探索与 fixed-rng 之外的随机源（时间型 `Date.now` 边界沿用 fixed-rng spec）。
- 玩家自改存档防作弊（沿用 fixed-rng spec 立场：单机自由）。

## Further Notes

- 设计经 `/grill-me` 三轮访谈定稿（2026-08-06），21 项决策全部经用户确认（本 spec 对应 A1-A12 + 交叉 Q16-Q21）。
- 依赖 fixed-rng：`explore` 域（`rollDomain`）已就绪（commit 44b4480..1a8dcdd，`SCHEMA_VERSION=5`），本 spec 消费之。
- 平衡锚点：收集期 8-12 次（约 8-12 小时节奏）、整体期望 ~1.5×、耗尽后 ~1.1×、单次封顶（`scaledClamp` cap）、兵力 40 固定（上限 100+200×军港 → 前期派一次要攒、后期军港多也受单槽约束）。精确数值由 ticket 06 balance-sim 校准定稿。
- 实现要点：`createFactionState` 从 `createFactions` 抽取复用；`scaledClamp` 新增（不动 `scaledBy` 避免回归面）；迁移链写死 6 防跳级。
- 改动面：引擎（exploration.ts 新增 + data.ts/diplomacy.ts/production.ts/mechanics.ts/achievements.ts/ngplus.ts/engine.ts/offline.ts/save.ts/types.ts 小改）+ UI（dom.ts/actions.ts/main.ts）+ 测试（exploration.test.ts + 迁移/成就/E2E）；按 6 个 ticket 顺序推进，每步原子提交。
