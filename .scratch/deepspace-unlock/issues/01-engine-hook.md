# 01 — 挂点接线（settleExpeditions 首笔结算触发 + 叙事文本微调）

**What to build:** 修复「深空碑文」死代码：`storyFlags.deepSpace` 增加唯一赋值路径——通关后首次探索结算确定性触发。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `src/engine/exploration.ts`：`settleExpeditions` 结算循环内第一笔结算后加挂点 `if (!state.storyFlags.deepSpace) playMilestone(state, 'deepSpace')`（import playMilestone from './story'）；`playMilestone` 内部 storyFlags 防重复 → 一次循环多笔结算仅第一笔触发
- [x] `src/engine/story.ts`：`MILESTONE_STORIES.deepSpace` 文本微调——「探索队返航：沿着霜落浮雕上那条被标注了四百年的禁航航线，探测器抵达了星系外围的黑暗区域。那里什么都没有，只有一块漂浮在真空中的人造石板。石板上刻着一句话：「当我们忘记来处，便再无归途。」奥丁说，这是旧联邦的警世铭。」（来源呼应显式化，成就 desc 不动）
- [x] 三路覆盖验证：在线 tick（engine.ts:471）/ 离线回归（offline.ts:72）/ 自动探索离线循环（exploration.ts:387）均调本函数 → 单点接线全覆盖；离线触发叙事、成就由回归后 tick `checkAchievements` 自然解锁（离线路径无 checkAchievements，行为有意如此，见 spec「离线行为」）
- [x] 防御性守卫：挂点条件追加 `isExploreAvailable(state)`（落实「通关后」语义；正常流程 playing 无在途派遣，防作弊注入）
