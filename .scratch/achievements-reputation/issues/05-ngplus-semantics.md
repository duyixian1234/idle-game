# 05 — NG+ 语义（成就保留 / 周目内统计重置）

**What to build:** `engine.ts startNewGamePlus()`：**保留** `achievements`（图鉴跨周目，unlockedInRound 不匹配 → 声望自动归零）；**重置** `stats = { totalMineralEarned: 0 }` 与 `playSeconds = 0`（周目内口径，结局统计显示本局；成就条件全部周目内语义，二周目自然重新积累）。`storyFlags` 保留（叙事类二周目不重解锁——期望）。tick 里挂 `checkAchievements`（引擎主循环检查点）。

**Blocked by:** 03, 04

**Status:** resolved

- [ ] `startNewGamePlus` 重置 stats/playSeconds、保留 achievements
- [ ] `tick()` 末尾调 `checkAchievements`（解锁日志走 reward 类型）
- [ ] 测试：NG+ 后声望归零、收集类成就随周目内状态重新解锁发奖励、叙事类不重解锁、联邦统计显示本局
