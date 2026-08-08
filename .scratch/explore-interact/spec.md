Status: ready-for-agent

> **ADR-0038 修订（2026-08-08）**：本文"多路"部分描述的深空导航/星际通信中继两科技（槽位/收获倍率门控）已删除，探索队列成长曲线整体迁入跃迁枢纽 10 级升级线（`JUMPGATE_SLOT_TABLE` 槽位表 + `1 + 0.3×枢纽等级` 收获倍率）。第 30/37-39/59-60/78 行科技口径作废，以 `docs/adr/0038-remove-exploration-techs.md` 为准。

# Spec: 探索交互（采矿/外交）+ 多路探索（explore-interact）

## Problem Statement

探索系统（`exploration`，存档 v6）已交付：单槽派遣、60min 固定、派遣即全提交（防 SL）。玩家反馈两个方向：① 探索发现的势力/天体**与内置的一样可交互**——但现状外交面板 UI 只渲染内置 4 家（`dom.ts:618` 遍历 `FACTIONS`），探索势力引擎层自动纳入联邦判定却 **UI 不可见不可操作 → 联邦统一对探索势力死锁**；采矿侧天体只是 `activePlanet` 全局倍率，**无"矿点"独立产出**。② **多路探索**——单槽引擎硬校验（`exploration.ts:120`）限制并行，且军事点固定 40、矿物/能源 cap 固定 → 后期（军力上万、资源上亿）探索成本占比趋零、产出（固定基础值）占比趋零。

## Solution

- **外交**：外交面板改渲染运行时全部已发现势力（内置 4 家 + 探索发现 ≥4 家），动作完全一致（贸易/结盟/威慑/共享）；展示专属特性徽标（贸易折扣/共享半价/威慑折扣）；补全 4 家探索势力差异化（星环修道会贸易折扣 8%、黑曜协议威慑成本 ×0.75）。
- **采矿**：新增 3 个**产出型**探索天体（碎星矿带/氦闪气云/深空裂谷），`PlanetDef` 扩 `output`（基础产出）+ `outputPct`（比例挂钩）字段；产出并入 `productionReport`——**比例挂钩**保证占比永续恒定（~1-2%），后期不贬值；重复发现 → 天体产出增益 +10%/次（上限 +50%）、势力好感 +5/次。
- **多路**：起始 1 槽，2 项探索科技解锁至 3 槽（深空信道 1/2/3）；军事点随军力上限自适应（占 2%，保底 40，多槽 ×N）；矿物/能源 cap 随 NG+ 周目 ×1.5^周目；时长保持 60min；每槽派遣即全提交、不可取消。
- **平衡保证**：成本与收益同源缩放（返还型）→ 收益比锚点 1.083× 不漂移；产出比例挂钩 → 占比恒定。
- **无需存档迁移**：多槽仍是 `expeditions` 数组；产出增益存 `planets[id].outputBonus`（PlanetState 可选字段，顶层 `planets` 仅校验 `isPlainObject`）；新天体/新科技/`intimidateCostMult` 均静态 def——**schemaVersion 保持 6**。

## User Stories

1. 作为一名通关玩家，我希望探索发现的势力出现在外交面板、可进行全部外交动作（贸易/结盟/威慑/共享），以便"探索到 = 可交互"与内置一致。
2. 作为一名玩家，我希望探索发现的天体提供独立产出（矿点），且产出随我的主基地规模成长（比例挂钩），以便后期探索产出仍然可观。
3. 作为一名玩家，我希望重复探索已发现的势力/天体有收益（好感/产出增益），以便长期派遣不贬值。
4. 作为一名玩家，我希望解锁更多探索槽位（深空信道 2/3）并行派遣，以便多路同时推进。
5. 作为一名玩家，我希望探索成本随我的军力/资源规模自适应，以便后期派遣仍是"值得决策"的投入而非白捡。
6. 作为一名开发者，我希望每槽派遣即全提交、不可取消，以便防 SL 契约在多槽下结构上成立。

## Implementation Decisions

- **槽位机制（Q3/Q7）**：`explorationSlots(state) = 1 + (techLevels['deepSpaceNav'] >= 1 ? 1 : 0) + (techLevels['interstellarRelay'] >= 1 ? 1 : 0)`，上限 3。`startExpedition` 单槽校验（`exploration.ts:120`）改为"进行中数量 < explorationSlots"。
- **成本自适应（Q4/Q14）**：
  - 军事点：`expeditionMilitaryCost(state, slotIndex) = min(1000, max(40, floor(militaryCap(state) × 0.02))) × (slotIndex + 1)`——第 1/2/3 槽 = base×1/2/3（原 40/80/120 语义保持）。`EXPEDITION_MILITARY_COST` 常量退役为函数。
  - 矿物/能源：`scaledClamp(rate, min, factor, cap)` 的 cap 动态化——`cap × 1.5^ngPlusLevel`（0 周目 15万/6万 → 5 周目 114万/45万 → 10 周目 865万/346万），min/factor 不动（balance-sim 锚点保持）。
  - 时长：`EXPEDITION_DURATION_MS = 60min` **不动**（节奏/离线/防 SL 三重锚点；时间自由度由多槽承担）。
  - 收益比保证：返还型收益（资源 ×0.75 + 科技 = 矿投×0.005）与成本同源缩放 → 1.083× 锚点不漂移。
- **探索科技（Q7/G1）**：`TECHS` 新增 2 项（`TechDef.effect` 联合类型扩 `{ kind: 'exploration' }`）：
  - `deepSpaceNav` 深空导航阵列：cost `{ mineral: 50_000, tech: 5_000 }`，maxLevel 5——Lv≥1 解锁 2 槽。
  - `interstellarRelay` 星际通信中继：cost `{ mineral: 200_000, tech: 20_000 }`，maxLevel 5——Lv≥1 解锁 3 槽。
  - 探索收获倍率：`explorationHarvestMult(state) = 1 + 0.1 × (deepSpaceNavLv + interstellarRelayLv)`（满级两项 = ×2.0），只作用于派遣 roll 的 resource 分支补偿值（mineral/energy/tech 入账 × mult），不碰 60min 锚点、不作用于天体产出。
- **产出型天体（Q1/Q8/Q9/Q13）**：`EXPLORE_PLANETS` 新增 3 个，`PlanetDef` 扩 `output?: Partial<Record<ResourceKey, number>>`（基础产出）+ `outputPct?: Partial<Record<ResourceKey, number>>`（主基地产出比例）+ 沿用 `discoverOnly: true`：
  | id | name | output（基础） | outputPct（比例） |
  |---|---|---|---|
  | `rubbleBelt` | 碎星矿带 | +2 ◆/s | 矿物 ×2% |
  | `heliumNebula` | 氦闪气云 | +1.5 ⚡/s | 能源 ×2% |
  | `riftChasm` | 深空裂谷 | +1 ◆/s + 0.4 ◎/s | 矿物 ×1% + 科技 ×1% |
  - 产出计算（`production.ts`，加入点 = `applyPlanetMechanics` 之后、`permMult` 之前）：
    `planetOutput[key] = (def.output[key] × techMult[key] + def.outputPct[key] × nominalAfterMechanics[key]) × (1 + outputBonus)`
    ——基础值吃科技倍率（不吃 activePlanet 机制：产出型不参与切换）；比例部分基于机制后 nominal（天然含 tech/机制/主基地规模），与整体一同 ×permMult → **占比恒 2%/2%/1%（×1+outputBonus）**；重复增益作用于整体；天体产出无 `consumes`，不参与能源折减、不受军力截断。
  - **无递归**：比例基数 = 建筑管线产出（含机制，不含天体产出），天体产出在计算后再并入 nominal。
- **重复发现补偿（Q6/Q10）**：`settleOne` 内：
  - faction 已发现 → `favor = min(100, favor + 5)`（`EXPEDITION_REPEAT_FAVOR_GAIN`），否则创建。
  - planet 已发现 → `outputBonus = min(0.5, (outputBonus ?? 0) + 0.1)`（`EXPEDITION_OUTPUT_BONUS_STEP/CAP`），存 `planets[id].outputBonus`（PlanetState 可选字段，`?? 0` 容错，**零迁移**），否则解锁创建。
  - 奖池：`expeditionPool` 新增 3 天体各 w1（与物流港/拓荒一致）；势力仍 w2；资源补偿 w = max(2, 6-已收集) 不变。
- **外交修复（Q2/Q11）**：
  - `dom.ts renderDiplomacyPanel`：`Object.values(FACTIONS)` → 遍历 `ALL_FACTIONS`，跳过 `EXPLORE_FACTIONS` 中未发现（`!state.factions[id]`）者；`factionsVisible` 门控（轨道工厂站解锁后）不变。**死锁解除**：探索势力可贸易/结盟/威慑/共享，联邦统一对 8 家全部可达成。
  - 特性徽标：`data-faction-perk` 展示 `tradeDiscount`（贸易折扣 -X%）/ `techShareCostMult`（共享半价）/ `intimidateCostMult`（威慑折扣 -X%）。
  - `FactionDef` 扩 `intimidateCostMult?: number`；`data.ts`：`ringOrder` 加 `tradeDiscount: 0.08`、`obsidianPact` 加 `intimidateCostMult: 0.75`（ashCommune 0.05 / nodeIntellect 0.5 已有）；`diplomacy.ts` `intimidateCost` × `(def.intimidateCostMult ?? 1)`。
- **成就（Q12）**：`achievements.ts` 新增 2 个（collect 类、recurring 周目重解锁）：
  - `explorerDual`「双线作战」：`techLevels.deepSpaceNav >= 1`（2 槽解锁），rep 2。
  - `explorerTriple`「多路并进」：`techLevels.interstellarRelay >= 1`（3 槽解锁），rep 3。
  - `explorerComplete`「群星尽览」口径扩展：`exploredFactions` 覆盖 `EXPLORE_FACTIONS`（4）&& `exploredPlanets` 覆盖 `EXPLORE_PLANETS`（5）。
- **NG+（Q12）**：`ngplus.ts` `previewNewGamePlus` 失去清单：`expeditionOngoing` boolean → `activeExpeditions = 未结算数`，条目「X 支探索队（派遣中，将失去）」；`startNewGamePlus` 重置 `expeditions: []`（清空全部在途，语义不变）、`exploredFactions/exploredPlanets: []`；`planets[id].outputBonus` 随 planets 重置（新周目重新发现）。
- **UI（G4/Q3）**：`renderExplorePage` 单槽状态行 → 深空信道 1/2/3 列表：
  - `data-expedition-slot="1|2|3"`：空闲（派遣按钮 `data-explore-dispatch="N"` + 消耗预览）/ 派遣中（倒计时 `data-expedition-timer`）/ 锁定（`data-expedition-locked`，显示解锁需求「深空导航阵列 Lv1」）。
  - 已发现产出天体行：`data-planet-output` 显示当前贡献值（基础 + 比例 + 增益实时值）。
  - `ACTIONS['explore']` payload 带 slotIndex。
- **balance.ts（探索族）**：退役 `EXPEDITION_MILITARY_COST` 常量；新增 `EXPEDITION_MILITARY_PCT = 0.02`、`EXPEDITION_MILITARY_CAP = 1000`、`EXPEDITION_CAP_GROWTH = 1.5`、`EXPEDITION_REPEAT_FAVOR_GAIN = 5`、`EXPEDITION_OUTPUT_BONUS_STEP = 0.1`、`EXPEDITION_OUTPUT_BONUS_CAP = 0.5`、`EXPLORATION_TECH_HARVEST_PCT = 0.1`。
- **存档**：**无版本变更**（schemaVersion 保持 6）。`planets[id].outputBonus` 为 PlanetState 可选字段（顶层 `planets` 仅 `isPlainObject` 校验，内部容错）；`ExpeditionState` 不加字段（槽位 = 数组索引，成本各自记录在 `cost`）；`createInitialState` 零改动。

## Testing Decisions

- **seam**：沿用双层 seam；`src/engine/exploration.test.ts` 为主 seam（多槽/成本/补偿新增覆盖），`production.test.ts` 加产出管线覆盖，`dom.test.ts` 加外交/探索页冒烟，`actions.test.ts` 注册表。
- **引擎层新增覆盖**：
  - 多槽：`explorationSlots`（0/1/2 项科技 → 1/2/3 槽）；同时派遣 N 支（≤ 槽数成功、超槽数拒绝）；每槽独立 roll 固化（注入 rng 断言不同槽不同结果）；多派单一并结算。
  - 成本：军事点自适应（cap 100/5000/20000 → 40/100/400，封顶 1000；×N 槽位）；矿物/能源 cap ×1.5^周目（0/5/10 周目断言）；保底 min 语义。
  - 重复发现：已发现势力再派遣 → favor +5 封顶 100；已发现天体再派遣 → outputBonus +0.1 封顶 0.5。
  - 产出管线：碎星矿带产出 = 2×techMult×（1+bonus）+ 矿物 nominal×2%；比例部分不吃重复倍率计算错位；不参与能源折减；NG+ permMult 下占比不变（不变量：碎星矿带产出 / 建筑矿物产出 ≈ 2%）；无递归（比例基数不含天体产出）。
  - 科技：`deepSpaceNav` Lv1 开 2 槽、`interstellarRelay` Lv1 开 3 槽；`explorationHarvestMult` 作用于 resource 分支补偿（×1.1/×2.0 满级）、不作用于 faction/planet 分支、不作用于天体产出。
  - 外交：面板渲染数据（dom 冒烟：8 家全发现渲染 8 条目、未发现探索势力不渲染）；`intimidateCost` 对黑曜协议 ×0.75；`tradeCost` 对星环修道会再 -8%；联邦统一对探索势力可达成（trade/techshare → favor 100 → unified）。
  - 成就：双线作战/多路并进 condition 在科技升级后达成（recurring）；群星尽览口径 = 4 势力 + 5 天体（新天体发现后达成）。
  - NG+：未结算 2 支 → 失去清单「2 支探索队」；重置后 expeditions 空、outputBonus 随 planets 重置。
  - 回归：现有 421 vitest 全绿（探索旧单槽断言更新为多槽语义）。
- **UI 层覆盖**：深空信道列表（3 槽渲染/锁定态/派遣中倒计时/每槽独立派遣按钮）；外交 8 家 + 特性徽标；产出天体贡献行。
- **E2E**：探索多槽 spec 扩展——注入通关档（3 槽科技解锁）→ 同时派遣 2 槽 → 断言双派遣记录 + 独立倒计时 + 资源扣除合计；外交 8 家渲染 + 探索势力贸易点击生效；产出天体发现后 `data-planet-output` 显示。data-* 断言（AGENTS.md Testing conventions）。
- **balance-sim（一次性，跑完即删）**：验证新成本自适应下收集期节奏（8-12 次收完）、收益比锚点 1.083× 保持（成本收益同源缩放）、天体产出占比 ~1-2% 不随周目漂移、军事点占 cap 恒 2%。

## Out of Scope

- 取消/召回/提前结算——保持"派遣即全提交、不可取消"（Q5 定稿）。
- 探索天体扩建投入（投资型产出）——Q1 否决重方案，产出成长由比例挂钩承担。
- 产出型天体参与 `activePlanet` 切换——产出恒定挂载，与当前星球机制解耦。
- 探索科技效果作用于派遣时长——60min 锚点不动。
- 新资源维度（`ResourceKey` 不动）。
- 存档 schema 升级——保持 v6，零迁移。
- 探索势力 UI 排序策略/分页——按 `ALL_FACTIONS` 定义序渲染。

## Further Notes

- 设计经 `/grill-me` 四轮访谈定稿（2026-08-06），Q1-Q14 + G1-G4 收尾数值全部经用户确认（每轮"全部推荐/全部接受"）。
- 平衡锚点（用户两轮追问落定）：① 天体产出比例挂钩（Q13）——固定基础值 × 乘数占比趋零的根因修复，占比永续恒定；② 成本自适应（Q14）——军事点占军力上限恒 2%、cap 随周目上调，收益比锚点天然不漂移（成本收益同源缩放）。
- 后期定位：科技点溢出后探索纯资源收益 ≈75% 返还（略亏），驱动力 = 收集进度 + 天体产出（价值恒定）。
- 改动面：引擎（exploration.ts/production.ts/diplomacy.ts/data.ts/balance.ts/achievements.ts/ngplus.ts）+ UI（dom.ts/actions.ts/main.ts）+ 测试（exploration.test.ts/production.test.ts/dom.test.ts/actions.test.ts + E2E）；按 6 个 ticket 顺序推进，每步原子提交。
