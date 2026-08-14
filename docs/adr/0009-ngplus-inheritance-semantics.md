# NG+ 继承语义：图鉴跨周目 / 统计周目内双口径，unlockedInRound 单字段承载

NG+（周目继承）明确「什么继承、什么清零」：继承科技点（`NG_PLUS_TECH_BASE × 周目`）、派系图鉴（`factionCodex`）、永久加成（`permanentMult` + `permanentBonuses` 表）；清零资源、建筑、科技、舰队、探索、攻占状态。**统计双口径**由 `AchievementState.unlockedInRound` 单字段承载——成就图鉴跨周目永久保留（`unlockedAt` 存在即解锁），周目可重解锁成就（collect/finale/recurring 缺省）在 `unlockedInRound !== 当前周目` 且条件再满足时**重解锁 + 重发奖励**（NG+「重打但更强」）。**2026-08-14 修订（见文末）**：成就重解锁恢复（遗产机制）、声望跨周目累计（不归零）、NG+ 设置全量重置。

**状态**: Accepted
**日期**: 2026-08-05（NG+ 初版）~ 2026-08-06（成就/声望双语义）
**证据**: `src/engine/ngplus.ts` 全文件；`src/engine/types.ts:204-211,283-289`；commit `2ae6ada`（周目内统计重置）、`9d8cd93` 附近（成就引擎）

## 背景

NG+ 需要两套统计语义并存：成就图鉴是**永久收藏**（二周目不应丢失历史解锁），声望与本周目成就是**周目内进度**（二周目重新积累）。若为「永久」与「周目内」各存一套字段，同步会漂移（回溯迁移 bug 曾因条件经 reputation 读未初始化 achievements 而失败）。

## 决策

1. **继承清单**：`computeNgPlusInheritance` 是共享继承计算（无副作用），`startNewGamePlus` 与 `previewNewGamePlus` 同源引用——预览「将继承/将失去」双清单与实际执行永远一致，杜绝双实现漂移。
2. **unlockedInRound 单字段**：`AchievementState = { unlockedAt, unlockedInRound }`——`unlockedAt` 存在 = 图鉴永久解锁（跨周目）；`unlockedInRound === ngPlusLevel` = 本周目语义（声望/周目成就判定同源）。
3. **引擎不设 phase 守卫**：`startNewGamePlus` 在 playing/ended/infinite 均可调用，入口合法性由 UI 门控（ended → 结局面板；infinite → 工具栏）——引擎保持纯机制，UI 管流程。
4. **究极建筑 NG+ 遗产**：等级 ×1.5%/级折算全产出永久加成进 `permanentBonuses`（ADR-0023），重开后可选另一条路线。

## 为什么

- 单字段双语义避免了「图鉴集合 + 周目集合」双份数据的同步问题——这是回溯迁移 bug 的根因教训。
- 预览与执行共享同一函数，消除了「弹窗显示继承 X 但实际继承 Y」的 UI 欺骗风险。
- 引擎无 phase 守卫是「引擎纯机制、UI 管流程」原则的延续（与结局判定、无限模式入口同理）。

## 后果

- 新加「周目内统计」字段（如 `stats.explorations`、`escortedExpeditions`）必须同步处理 NG+ 重置逻辑，且是 `NgPlusLost` 预览清单的组成部分。
- 成就/声望条件全部以周目内口径撰写——二周目重新积累是设计意图，不是 bug。
- 迁移 v3→v4 回溯解锁时 `unlockedInRound = 当前周目`，老档直接获得「追溯声望」，但不补资源奖励（ADR-0005 决策 4）。

## 2026-08-14 修订：成就重解锁恢复 / 声望跨周目 / 设置重置扩展（ngplus-experience + 修订）

「新周目表现优化」访谈（Q1-Q7 全按推荐采纳）最初推行「成就永久化」（跨周目只解锁一次），实测（2026-08-14 当日）发现该决策**破坏 NG+ 遗产机制**：NG+ 后开局资源全 0、无任何成就奖励兜底（ng2/ng3 等周目成就不再重发矿物/科技），新周目无法开局。**当日修订回退成就永久化**：

1. **成就重解锁恢复（遗产机制）**：`checkAchievements` 恢复 `recurring` 重解锁分支——story/`recurring:false` 永久类解锁过即跳过；collect/finale/周目类在 `unlockedInRound !== 当前周目` 且条件再满足时**重解锁 + 重发奖励**。NG+ 开局由 ng2/ng3 等周目成就立即重发矿物/科技，遗产机制生效（与 81c0471 行为一致）。`unlockedInRound` 语义回到「最近解锁周目」。
2. **声望跨周目累计（保留）**：`reputation()` 按「已解锁（unlockedAt 存在）」跨周目累计——按 id 只计一次，成就重解锁不重复计分；NG+ 不归零。开局即满声望使阶梯加成（含 ADR-0063 新增的探索两列）直接生效。
3. **设置重置扩展（保留）**：`startNewGamePlus` 重置清单扩展为全设置——`automationPolicies` / `diplomacyAuto` / `eventsFullAuto` / `endless.autoBoss` 恢复默认、`hiddenPlanets` / `hiddenBuildings` 清空；localStorage 偏好（语言/静音/日志方向/日志筛选/二级 tab）**不参与**（用户级偏好，非周目设置）。「隐藏，自动」= 无确认弹窗、无感知执行。
4. **继承摘要弹窗**（UI 机制，保留，见 spec）：每次 NG+ 后展示上周目继承汇总（周目数/永久产出加成/继承科技点/派系图鉴/成就数/永久加成表），数据全部来自现有存档与 `NgPlusInheritance` 预览值，零新增字段、零存档变更。

后果：`achievements.test.ts` / `ngplus.test.ts` / `fleet-dock-10.test.ts` 的重解锁断言恢复（周目类成就 NG+ 后重新达成 → 重解锁重发奖励）；`reputation.test.ts` 保持跨周目口径；`ng2`/`ng3` 每次到达新周目时重解锁重发奖励（遗产机制）。
