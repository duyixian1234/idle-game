# 01 — 成就引擎（定义表 + 触发层 + 解锁模型）

**What to build:** 新增 `src/engine/achievements.ts`：`AchievementDef` 定义表（26 个：叙事 14 映射 storyFlags、收集 12 全部 state 派生、终局并入按 rep 区分）+ `checkAchievements(state)`（遍历定义，条件满足且「未解锁 或 unlockedInRound ≠ 当前周目」→ 解锁 + 发一次性资源奖励 + pushLog `【成就】`）。解锁状态存 `state.achievements[id] = { unlockedAt, unlockedInRound }`（types.ts 加字段）。条件谓词一律用现有 state 字段派生，不新增 stats 累计字段。

**Blocked by:** None — can start immediately

**Status:** resolved（7425cba）

- [ ] `src/engine/types.ts`：GameState 加 `achievements: Record<string, AchievementState>`；定义 AchievementState
- [ ] `src/engine/achievements.ts`：AchievementDef（id/name/desc/category/condition(state)/rewardMineral/rewardTech/rep）+ ACHIEVEMENTS 表（26 个，文案中文）
- [ ] `checkAchievements`：解锁判定 + 奖励发放 + 日志；返回值（本次解锁列表，供测试断言）
- [ ] `src/engine/achievements.test.ts`：叙事映射/收集派生/终局/重复解锁不重发/二周目重解锁发奖励/封顶逻辑
- [ ] 现有测试不破
