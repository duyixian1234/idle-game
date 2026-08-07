# NG+ 继承语义：图鉴跨周目 / 统计周目内双口径，unlockedInRound 单字段承载

NG+（周目继承）明确「什么继承、什么清零」：继承科技点（`NG_PLUS_TECH_BASE × 周目`）、派系图鉴（`factionCodex`）、永久加成（`permanentMult` + `permanentBonuses` 表）；清零资源、建筑、科技、舰队、探索、攻占状态。**统计双口径**由 `AchievementState.unlockedInRound` 单字段承载——成就图鉴跨周目永久保留（`unlockedAt` 存在即解锁），声望/本周目成就只计 `unlockedInRound === 当前周目` 的条目。

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
