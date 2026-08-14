# 01 — 引擎：成就永久化 + 声望跨周目累计

**What to build:** 成就系统语义从「周目内可重解锁」改为「跨周目只解锁一次」（Q2-A）：`checkAchievements`（src/engine/achievements.ts）删除 `permanent = category === 'story' || recurring === false` 分支，解锁判定统一为「已解锁即跳过」（`if (cur) continue` 对全部成就生效）——收集/终局类不再重解锁、不再重发奖励；`AchievementDef.recurring` 字段保留但标注 deprecated（不删字段防类型/存档漂移）。`unlockedInRound` 语义自动变为「首次解锁周目」（不再被重解锁覆盖，零迁移——历史被覆盖的旧档显示最近解锁周目，接受）。声望跨周目累计（Q3-A）：`reputation()`（src/engine/reputation.ts）移除 `unlockedInRound === state.ngPlusLevel` 匹配（保留 `achievements?.[id]` 容错），cap 100 不变，NG+ 不归零。行为验证：`ng2`/`ng3`（周目数条件）首次到达该周目解锁、后续周目不重发。

**Blocked by:** None — can start immediately

**Status:** pending

- [ ] `achievements.ts` `checkAchievements`：删除 permanent 分支，`if (cur) continue` 全类别生效（story/collect/finale 一致）
- [ ] `achievements.ts`：`AchievementDef.recurring` 标注 deprecated（字段保留）
- [ ] `reputation.ts` `reputation()`：移除周目匹配，历史解锁即计入（保留容错），cap 100 不变
- [ ] `achievements.test.ts`：`trades50`/`dualMega` 重解锁断言反转（二周目不再重解锁/不发奖/unlockedInRound 不被覆盖）；首次解锁仍发奖 + rep；`ng2`/`ng3` 首次到达解锁、后续周目不重发；story 类行为不变
- [ ] `reputation.test.ts`：跨周目口径（ngPlusLevel 不匹配的已解锁成就仍计声望）；cap 100；单调不减
- [ ] `ngplus.test.ts`：NG+ 后声望**不归零**断言（原「声望归零」断言反转）；`unlockedInRound` 不被覆盖
- [ ] vitest 全绿 + typecheck clean

## Definition of Done
成就重解锁相关测试断言全部反转且全绿；声望跨周目累计生效；无迁移、SCHEMA 不升。
