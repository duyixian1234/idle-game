Status: ready-for-agent

# Spec: 新周目体验优化（成就永久化 / 设置重置 / 继承摘要 / 探索声望加成）

## Problem Statement

新周目（NG+）体验存在三处摩擦：① 开启新周目后，多数自动化设置（外交自动化 / 一键全自动 / 事件策略 / 自动 boss / 隐藏偏好）跨周目保留——玩家带着上个周目的操作习惯进入新周目，与「重置资源、重新规划」的新周目语义不符；② 收集类成就（缺省 `recurring: true`，如 `trades50`、`dualMega`）在新周目条件再满足时**重解锁、重发奖励、覆盖 `unlockedInRound`**——玩家看到「上周目已解锁的成就又打一次勾」，重复感强，且新周目开局 `ng2`/`ng3` 等周目成就反复 flash；③ 开启新周目后无任何「继承了什么」的汇总反馈，仅一条日志（engine.ts pushLog），玩家只能凭记忆对照确认弹窗的预览值。

另外，声望系统（0-100，五档阶梯加成）在军事模块已有两处加成（军力上限 +0.2 / 攻占成功率 +0.15），探索模块完全未接入——声望作为成就系统的回报，价值落点不足。

## Solution

四项联动改造（引擎 3 + UI 1），零存档变更：

1. **设置全量重置**：`startNewGamePlus` 重置清单由 2 项（autoExplore/autoConquest）扩展为全量自动化设置（automationPolicies / diplomacyAuto / eventsFullAuto / endless.autoBoss 恢复默认，hiddenPlanets / hiddenBuildings 清空），**自动执行、无确认弹窗、无感知**（「隐藏，自动」）；localStorage 偏好（语言/静音/日志方向/日志筛选/二级 tab）为用户级偏好，**不参与重置**。
2. **成就永久化**：所有成就（含收集/终局类）跨周目只解锁一次——`checkAchievements` 移除 `recurring` 重解锁分支（已解锁即跳过，无论类别）；`unlockedInRound` 语义自动变为「首次解锁周目」（不再被覆盖，零迁移）；成就面板显示历史解锁（含解锁周目）。
3. **声望跨周目累计**：`reputation()` 移除 `unlockedInRound === ngPlusLevel` 匹配——声望 = 历史解锁成就 rep 之和（cap 100 不变），NG+ 不归零、单调不减。
4. **探索声望加成**：声望阶梯表扩展两列——探索槽位（80→+1、100→+2，上限同步 20→22）与护航费折扣（80→−5%、100→−10%，与 warpDrive 同通道叠加）；军事模块保持现状。
5. **继承摘要弹窗**：每次 NG+ 执行后立即展示上周目继承汇总（周目数 / 永久产出加成 / 继承科技点 / 派系图鉴 / 成就数 / 永久加成表），点遮罩 / Escape / 按钮关闭，数据全部来自现有存档与继承计算，零新增字段。

## User Stories

1. 作为开启新周目的玩家，我希望所有自动化设置自动恢复默认（外交自动化 / 一键全自动 / 事件策略 / 自动 boss 关闭，隐藏偏好清空），以便新周目从干净配置开始、不被上个周目的操作习惯带偏。
2. 作为玩家，我希望设置恢复默认是自动的、无确认弹窗、无感知，以便不被冗余交互打扰。
3. 作为玩家，我希望语言 / 静音 / 日志方向等个人偏好不被重置，以便不重复设置用户级偏好。
4. 作为已解锁收集类成就的玩家，我希望新周目不再重复解锁、不再重复发奖，以便消除「又完成一遍」的重复感。
5. 作为玩家，我希望成就面板显示历史解锁状态（含解锁周目「第 N 周目」），以便看到收藏的完整轨迹。
6. 作为玩家，我希望新周目不再因周目成就（ng2/ng3）反复触发 flash/NEW 动效，以便新周目开场清爽。
7. 作为玩家，我希望声望在新周目保留（跨周目累计、只升不降），以便成就的长期回报不因换周目清零。
8. 作为满声望玩家，我希望探索槽位额外 +2（并行探索更多目标），以便探索吞吐随声望提升。
9. 作为满声望玩家，我希望护航费有 −10% 折扣（与 warpDrive Lv20 叠加共 −20%），以便探索效率提升。
10. 作为军事玩法玩家，我希望声望的军力上限 / 攻占成功率加成保持现状，以便不引入新的平衡扰动。
11. 作为开启新周目的玩家，我希望进入后立即看到一个继承汇总弹窗（周目 / 永久加成 / 科技点 / 图鉴 / 成就数），以便确认这一周目实际继承了什么。
12. 作为玩家，我希望摘要弹窗可点遮罩 / Escape / 按钮关闭、不阻塞游戏，以便看完即走。
13. 作为已有存档的玩家，我希望这些改动不要求任何迁移，以便旧档无缝继续。

## Implementation Decisions

- **设置重置清单（Q1-A/B + 「隐藏，自动」）**：`startNewGamePlus` 重置段扩展——`automationPolicies = createDefaultAutomationPolicies()`、`diplomacyAuto = undefined`、`eventsFullAuto = false`、`endless.autoBoss = false`、`hiddenPlanets = []`、`hiddenBuildings = []`（并入现有 autoExplore/autoConquest 重置）；默认值以 `createInitialState` 为准（单点事实源）。**Q1-C 否决**：localStorage 偏好（语言/静音/日志方向/筛选/二级 tab）不重置——用户级偏好与周目无关，重置语言会造成「我选的英文被改回中文」的糟糕体验。恢复默认**无确认弹窗、无感知执行**（与 `reset` 全档重置的确认流区分开）。
- **成就永久化（Q2-A）**：`checkAchievements` 解锁判定改为「已解锁即跳过」——删除 `permanent = category === 'story' || recurring === false` 分支，`if (cur) continue` 对全部成就生效；`AchievementDef.recurring` 字段**保留但废弃**（不删字段防存档/类型漂移，注释标注 deprecated）；`unlockedInRound` 语义变为「首次解锁周目」（不再被重解锁覆盖，零迁移——历史被覆盖的旧档显示最近解锁周目，接受）。奖励（矿/科技）与 `rep` 只在首次解锁发放。`ng2`/`ng3`（周目数条件）在首次到达该周目时自然解锁，新周目不再重发。**Q2-B/C 否决**（仅显示层/列表过滤——逻辑噪音仍在）。
- **声望跨周目（Q3-A）**：`reputation()` 去掉 `unlockedInRound === state.ngPlusLevel` 匹配（保留 `achievements?.[id]` 容错），`Math.min(REPUTATION_CAP, sum)` 不变；阶梯表/派生函数不动。新周目开局声望 = 历史解锁总额（可能直接 100）——与成就永久化自洽（声望是成就系统的永久回报）。**Q3-B/C 否决**（周目内口径会让声望系统名存实亡）。
- **探索声望加成（Q5-A + Q6-A/C）**：`ReputationBonuses` 接口 + `REPUTATION_TIERS` 增 `exploreSlotBonus`（80→+1、100→+2）与 `escortFeeDiscount`（80→0.05、100→0.10）两列，档位累积语义与现状一致；`explorationSlots` 公式改 `min(20 + 声望槽, 5 + 枢纽 + 虫洞 + 声望槽)`（**上限同步 +2 → 22**，否则枢纽/虫洞终局皆满后声望项被 min 吞掉）；`escortFee` 折扣与 warpDrive 叠加 `× (1 − WARP_REDUCTION − 折扣)`，clamp ≥ 0。军事模块不新增战力直乘（Q5-B 否决——战力是能力而非上限，会推高守卫）。数值为实现期平衡模拟定标（ADR-0063），非终值。
- **继承摘要弹窗（Q4-A + Q7-A）**：独立 overlay 容器（复用 ngplus/megastructure overlay 三件套模式：layout 静态容器 + `hidden` class 切换 + `data-*` 事件委托 + Escape 统一关闭，overlay 不参与 250ms 重建）；`startNewGamePlusSequence` 执行后立即打开（每次 NG+ 后展示一次）。数据源：新 state 当前值（`ngPlusLevel` / `permanentMult` / `resources.tech` / `factionCodex.length` / 成就数 / `permanentBonuses`）+ 执行前捕获的旧 state 图鉴集（计算「图鉴新增 +X」）；**Q4-B 否决**：不新增 lifetime 字段（历史累计矿物等），零存档变更、不升 SCHEMA、不触碰 ADR-0041 范围。
- **弹窗关闭（Q7-A）**：遮罩点击 / Escape / 关闭按钮三种关闭通道，无「不再显示」持久化选项（Q7-B/C 否决）——摘要内容精炼（五项），关闭成本低。
- **存档**：零字段新增、SCHEMA_VERSION 不升、无迁移函数。

## Testing Decisions

沿用既有双缝（ADR-0017），零新增 seam——主 seam 全部在引擎纯函数层（最高缝），UI 次 seam 仅冒烟。

- **引擎纯函数（主 seam，4 组）**：
  1. `achievements.test.ts`：收集类重解锁断言**反转**（`trades50` 二周目不再重解锁/不发奖/unlockedInRound 不被覆盖）；已解锁即跳过对所有类别生效；首次解锁仍发奖 + rep。
  2. `reputation.test.ts`：跨周目口径（`ngPlusLevel` 不匹配的已解锁成就仍计声望）；cap 100 不变；阶梯新列（80/100 档 exploreSlotBonus / escortFeeDiscount）。
  3. `ngplus.test.ts`：NG+ 后声望不归零（原断言反转）；设置重置清单全量断言（automationPolicies/diplomacyAuto/eventsFullAuto/endless.autoBoss/hiddenPlanets/hiddenBuildings 恢复默认）；`unlockedInRound` 不再被覆盖。
  4. `exploration.test.ts` + `balance-simulation.test.ts`：`explorationSlots` 声望槽（80→+1、100→+2、上限 22）；`escortFee` 折扣叠加与 clamp；平衡模拟护航吞吐断言（ADR-0063 定标）。
- **UI jsdom（次 seam）**：摘要弹窗渲染冒烟（五项字段文案、关闭按钮、遮罩/Escape 关闭路径）；NG+ 序列后弹窗自动打开。
- **回归**：vitest 全绿 + typecheck clean；`render-consistency.test.ts`（250ms 重建交互态）不破。

## Out of Scope

- localStorage 偏好重置（Q1-C 否决）——语言/静音等用户级偏好与周目无关。
- 军事模块战力直乘加成（Q5-B 否决）——军事已有两处声望加成，保持现状。
- 探索时长缩短 / 探索产出倍率加成（Q6-B/D 否决）——时长触碰出发时固化契约（ADR-0008），产出倍率违反「永不触碰每秒产出系数」铁律。
- lifetime 跨周目累计字段（Q4-B 否决）——ADR-0041 范围保持，摘要用现有数据。
- 摘要弹窗「不再显示」持久化选项（Q7-B/C 否决）。
- 探索页槽位锁定提示（`jumpgateLevelForSlot`/`wormholeLevelForSlot` 数据驱动）对声望槽的 UI 适配——ADR-0063 后果，探索页信息架构后续处理。
- 存档字段 / 迁移 / SCHEMA 升版。

## Further Notes

- 设计经 grill-with-docs 三轮访谈定稿（2026-08-14）：Q1 设置全量重置（localStorage 保留）、Q2 成就永久化、Q3 声望跨周目累计、Q4 摘要仅现有数据（零 schema）、Q5 军事保持现状、Q6 探索槽位+护航费折扣、Q7 每次 NG+ 后弹一次。ADR-0009 已修订（成就永久化/声望跨周目/设置重置扩展），ADR-0063 新增（探索声望加成）。
- 零迁移红利：成就永久化后 `unlockedInRound` 不再被覆盖 → 自动成为「首次解锁周目」，面板可直接显示「第 N 周目解锁」。
- 改动面：引擎（achievements.ts / reputation.ts / engine.ts / exploration.ts / balance.ts 常量）+ UI（layout.ts overlay 容器 / overlays.ts 渲染 / session + listeners 开关与序列）+ 测试 5 组；按 4 ticket 推进（01/02/03 并行，04 依赖 01），每步原子提交。
