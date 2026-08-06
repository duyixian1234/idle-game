# Spec: 无尽探索扩充（endless-expansion）

**Status:** ready-for-implementation（2026-08-07 grill-me 三轮盘问 + 子代理探查定稿，用户每轮"全推荐"后确认方案）
**存档版本:** v11 → **v12**（新增程序生成目标数组 + 归档周目标记）
**关联:** `.scratch/explore-interact/`（多槽派遣/产出型天体）、`.scratch/infinite-ngplus/`（无尽模式契约）、`src/engine/exploration.ts`（探索奖池）、`src/engine/conquest.ts`（攻占）、`src/engine/ngplus.ts`（NG+ 继承）

## 需求

无尽模式下探索可获得更多军事目标/外交目标/天体；目标数量与强度上限随探索进度增长；已不能再交互的目标（已征服军事目标/已结盟外交对象）移到列表末尾并自动折叠。**仅无尽模式（phase==='infinite'）生效**——普通通关后（ended，未进无限）探索只 roll 现有静态池，零改动。

## 背景事实（子代理探查 + 主代理读码确认）

- **探索奖池与军事目标完全解耦**：`expeditionPool`（exploration.ts:149-160）剔除制，kind 仅 `'faction' | 'planet' | 'resource'`；CONQUESTS（data.ts:474-518）4 个静态区域与探索无任何关联——"探索获得军事目标"是净新设计。
- **奖池剔除制 → 收集有终点**：全发现后只剩资源补偿（`w = max(2, 6 - collected)`），探索退化为纯资源机器——本 feature 补的是这个洞。
- **外交 8 家** = FACTIONS 4 + EXPLORE_FACTIONS 4（data.ts:524-557，探索结算**直接创建** `createFactionState`，非事件）；"不能再交互" = `f.allied` 结盟（全部 can* 返回 false，UI 不渲染按钮只剩徽标，panels.ts:431）。
- **已归档态已存在于列表**：已征服渲染 `✓ 已肃清` 锁定行（panels.ts:547-549，isConquestAvailable=false）；已结盟只剩徽标——天然适合"移列表末尾+自动折叠"扩展。
- **征服机制**：成功率 = `min(1, 投入/守卫 × (1+声望加成))`（conquest.ts:63），足额投入必成；奖励形态 = `rewardMineral` + `rewardTech` + `permanentBonuses`（militaryCap/全产出）+ `unlockTech`；守卫 500→3000 递进（data.ts:474-518）。
- **产出型天体**：`output`（基础速率，矿2/能1.5/矿1+科0.4）+ `outputPct`（随主基地产能百分比，2%/2%/1%+1%，data.ts:577-606）；发现后常驻列表、可重复发现（outputBonus +0.1 封顶 0.5）。
- **上限现状**：仅探索成本 cap 随 ×1.5^ngPlusLevel 缩放（exploration.ts:107）；槽位 5、奖池数量不随周目缩放。
- **NG+ 重置**（engine.ts:599-678）：重置 exploredFactions/exploredPlanets/攻占/派系/planets/expeditions 等；保留 factionCodex/permanentBonuses/achievements/seed/rngCounters；phase→'playing'。
- **折叠先例**：建造面板锁定卡 `data-locked-collapse` + `lockedExpanded` 会话态（main.ts:103/773-780）——"默认折叠、可展开、状态不存档"已验证。
- **探索确定性**：全提交语义（扣资源→roll 固化 result→push），rng 走 `rollDomain(state, 'explore')` 持久计数器防 SL（exploration.ts:227-263）——程序生成必须复用同一 rng 域，不得引入新的随机分支。

## 决策（grill-me 三轮 17 项 + 骨架确认，全部按推荐定稿）

### 范围与来源
1. **作用域 = 仅无尽模式**：普通 ended 阶段只 roll 静态池；扩展池仅 phase==='infinite' 注入
2. **机制 = 混合**：手写保底池（质感内容，有限）+ 程序生成池（续航内容，随探索次数供给）
3. **上限 = 数量 + 强度联动**（只加数量后期全是弱目标，只加强度列表滚动地狱）

### 归档判定与折叠
4. 归档判定：军事=征服即归档（**不可重复打**，续航靠新目标）；外交=结盟即归档；产出型天体=保留列表持续派遣（一次性天体探索完归档）
5. 折叠 = 摘要式（头部计数"已完成军事目标（N）"），默认折叠可展开；折叠布尔走 **UI 层会话态**（复用 data-locked-collapse 模式，新钩子 `data-archived-collapse`），不占存档
6. 归档周目语义 = **本周目**（NG+ 清空重积累，历史感交 factionCodex/成就）
7. 折叠粒度 = **各面板独立折叠**（军事 tab 尾部 / 外交 panel 尾部 / 探索页天体区尾部）
8. 折叠明细行 = 名称 + 归档徽标（✓已肃清 / 已结盟 / 已探索）+ 第 N 周目标记（Q17 方案 B，数据不冗余回看数值）

### 上限与节奏
9. 上限粒度 = **按类型各计**（军事池/外交池/天体池独立），约束**未归档活跃目标数**（未征服/未结盟/未完全探索）；**手写保底不受限**（数量固定叙事内容）
10. 节奏 = 初始每类 2 → 每 10 次探索 +1 → 周目保底 +1（`max(floor(探索次数/10) + 2, ngPlusLevel + 2)` 取高者）→ **不封顶**（系数由 ticket 05 balance-sim 校准）
11. 强度公式 = 军事 `基准(500-3000) × 1.5^ngPlusLevel`（与探索成本同构，exploration.ts:107 同系数）

### 程序生成规则
12. **军事生成**：名字词库组合（前缀×本体，如"掠夺者×巢穴"）；**奖励只给一次性资源（矿物/科技），永不给 permanentBonus**——程序生成目标随探索次数近无限，给永久加成会无限叠加直接摧毁 balance；permanentBonus 仅保留在手写保底池
13. **外交生成**：沿用现有 4 动作/结盟门槛 80/3 类特性（tradeDiscount/techShareCostMult/intimidateCostMult）随机 1-2 个，数值落在现有区间（0.05-0.08 / 0.5 / 0.75）；初始 favor 0-30 / threat 25-55（参照 EXPLORE_FACTIONS data.ts:524-557）；徽标渲染零新代码
14. **天体生成**：单种产出为主（组合型 riftChasm 是稀有模板留给手写池）；`output ∈ [0.5, 2]`、`outputPct ∈ [0.005, 0.02]` **封死不突破现有天花板**（防破坏 balance-sim 校准的 15.3d 曲线）；desc 用模板句（"富含X的Y"句式）
15. **出现方式 = 探索结算直接创建**（roll 到即入列表，沿用 4 家探索势力先例；保持全提交防 SL 确定性，无事件卡交互/选择分支）

### 保底池
16. 规模 = 军事 3 / 外交 3 / 天体 2（1 机制型 + 1 产出型）；解锁分 2 批：进入无尽解锁第一批，第 15 次探索后第二批
17. 保底目标不受数量上限约束；未解锁的保底目标在列表渲染为锁定占位行（解锁条件提示，参照探索页锁定占位 data-expedition-locked 先例）

## 数值设计（初值，ticket 05 sim 校准后回填）

| 项 | 初值 | 说明 |
|---|---|---|
| 军事基准守卫 | 500-3000 均匀采样 | ×1.5^ngPlusLevel |
| 军事奖励 | `基准守卫 × (4~10)` 矿物 或 科技（随机 1-2 种） | 一次性，比例锚定现有 5万/500 守卫 量级 |
| 外交特性 | 3 类池抽 1-2 个，数值区间见决策 13 | 结盟门槛 80 不动 |
| 天体 output | [0.5, 2] | 单种资源 |
| 天体 outputPct | [0.005, 0.02] | 单种资源 |
| 数量上限 | `max(2 + floor(explorations/10), 2 + ngPlusLevel)` | 每类；explorations = stats.explorations |

## 存档变更（schema v12）

- `state.generatedTargets`：程序生成目标定义快照数组（`{ kind: 'conquest'|'faction'|'planet', id, name, desc, guard/初始favor+threat/特性/output+outputPct, batch, seed }`）——定义随档落盘（生成后固定，防 RNG 漂移，与 exp.result 固化同构）
- `state.archivedRounds`：归档周目标记 `{ [targetId]: ngPlusLevel }`（本周目语义 → NG+ 时清空）
- 探索进度计数复用 `stats.explorations`（上限驱动）；**实现确认点**：NG+ 是否重置 stats.explorations（engine.ts:599-678 重置列表未含 stats，需实现时确认——若跨周目保留，上限增长节奏更快，sim 校准需纳入该语义）
- 迁移：`migrateSave` v11→v12 写死目标版本防跳级（项目惯例）；旧档补默认空数组
- 折叠布尔**不进存档**（UI 层会话态，决策 5）

## 关键落点

| 位置 | 改动 |
|---|---|
| `src/engine/types.ts` | GameState 新增 `generatedTargets` / `archivedRounds`（或并入既有结构，实现定）；ExpeditionPoolEntry kind 扩展 `'conquest'` |
| `src/engine/save.ts` | schema v12 迁移（写死目标版本）；NG+ 重置/重注入生成目标与归档标记 |
| `src/engine/data.ts` | 手写保底池：`ENDLESS_CONQUESTS`（3）/ `ENDLESS_FACTIONS`（3）/ `ENDLESS_PLANETS`（2，1 机制+1 产出）+ 生成词库（军事名前缀×本体、外交名、天体名/desc 模板、特性池、产出类型池） |
| `src/engine/generate.ts`（新） | 程序生成器纯函数：`rollDomain(state, 'generate')` 同域派生（确定性/防 SL）、军事强度公式、外交特性组合、天体产出采样、数量上限纯函数 `generatedCap(state, kind)` |
| `src/engine/exploration.ts` | `expeditionPool`（149-160）infinite 分支注入扩展池（保底已解锁批次 + 程序生成未满上限）+ kind 'conquest'；`rollFromPool`（192-215）新 kind 分支；`settleOne`（296-336）结算直接创建（conquest/faction/planet 三路）+ 周目标记 + 保底分批解锁检查（第 15 次探索） |
| `src/engine/conquest.ts` | `settleConquests`（55-100）双遍历：静态 CONQUESTS + 动态 generatedTargets 中 kind='conquest'；成功置归档周目标记；**不参与 conquestAll 里程碑**（仅静态表检查，引擎天然成立） |
| `src/engine/ngplus.ts` | NG+ 清空 generatedTargets/archivedRounds；无尽模式继续时重注入（新一批 seed 派生） |
| `src/ui/panels.ts` | `renderConquestRow`（530-577）尾部归档折叠区；`renderDiplomacyPanel`（387-452）尾部归档折叠区；保底未解锁锁定占位 |
| `src/ui/dom.ts` | `renderExplorePage`（32-153）天体归档折叠区 + 保底锁定占位 |
| `src/ui/main.ts` | `data-archived-collapse` 折叠会话态（参照 data-locked-collapse：103/773-780） |
| balance-sim（临时脚本，跑完删） | 校准：军事强度/奖励曲线、天体产出区间、数量上限节奏、保底收益对 15.3d 曲线漂移 |
| `e2e/` | 新 spec（data-* 断言，用户手动验证，铁律不代跑） |

## 测试计划

- 单测（vitest）：
  - `generate.test.ts`：三生成器确定性（同 seed 同结果）、军事奖励无 permanentBonus 断言（**关键防回归**）、强度/产出/特性区间边界
  - `exploration.test.ts` 扩展：infinite 档奖池含扩展池 / ended 档不含（作用域隔离）、上限未满才生成、保底 2 批解锁、结算直接创建三路、归档周目标记
  - `conquest.test.ts` 扩展：双遍历（动态目标可攻占/失败重试/成功归档）、静态表行为不变
  - `save.test.ts`：v11→v12 迁移（默认空数组、写死目标版本防跳级）、NG+ 清空/重注入
- E2E（用户手动验证）：新 `e2e/endless-expansion.spec.ts`（data-* 断言：data-archived-collapse 计数与展开、归档行徽标/周目、保底锁定占位、ended/infinite 池差异）

## 验收标准

- `pnpm tsc --noEmit` 零错误；`pnpm build` 通过；`pnpm vitest run` 全仓绿（不含已知上游 dom.test 基线失败，若有）
- E2E spec 用户手动验证通过
- 存档 v11 → v12 迁移正确（老档可读、新字段默认值）
- **程序生成军事目标零 permanentBonus**（单测锁定）；普通通关流程（ended）探索奖池与现状完全一致
- sim 校准报告：强度/奖励/上限系数定稿值 + 15.3d 曲线漂移分析

## Further Notes（实现后回填，2026-08-07）

- **实现确认点已解**：`stats.explorations` 为周目内口径（engine.ts `startNewGamePlus` 重置 `{ totalMineralEarned: 0, explorations: 0 }`）→ 数量上限换周目后从 `2 + ngPlusLevel` 起步，无需跨周目语义
- **balance-sim 校准结论**（临时脚本 `src/engine/endless-balance-sim.test.ts` 跑完删）：
  - 军力匹配（军港 Lv10 + permanentBonuses 0.2 档，容量 14,520）：周目 0 守卫区间 [500, 3000] = 容量 3.4%-20.7%；周目 3 [1,687, 10,125] = 11.6%-69.7%（完全覆盖）；周目 6 [5,695, 34,171] = 39.2%-235.3%——**上限超容量非死锁**：玩家可挑低守卫目标，军力容量随军港投入增长（cost-softcap 多项式成本），深周目靠军港扩容解锁高守卫目标。硬约束定稿：区间下限 ≤ 军力容量（总有可打）+ 上限 ≥ 容量 10%（非秒杀）
  - 奖励量级（周目 3 档，净产 6525 矿/s）：最大矿物奖励 10,765,960 = **60 分钟产出的 45.8%**（征服倒计时窗口内额外收益 < 50%，健康不印钞；锚点从「10 分钟产出」修正为「60 分钟产出」，征服倒计时 60 分钟）
  - 天体产出区间封死不破现有天花板（output ≤ 2 / outputPct ≤ 2%）；动态天体已接入产出管线（explorePlanetOutputs/applyExplorePlanetOutput 走 planetOutputDef 统一查询）
  - 上限节奏：每 10 次探索 +1（单槽 60min → 约每 10 小时 +1），周目保底取高者
- **设计红线实现确认**：程序生成军事目标零 permanentBonus（单测锁定）；归档折叠区对所有 phase 生效（用户需求「不可交互目标移末尾折叠」为全模式语义），但扩展目标池（保底锁定占位）仅 infinite
