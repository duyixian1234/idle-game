# 04 — 事件/成就角标：一级 tab 红点数字（纯 UI 层派生）

**What to build:** footer 一级 tab 角标体系（Q11-A/Q18）：
- UI 层 state（main.ts，不进存档）：`seenEventCount`、`seenAchievementCount`
- 事件角标 = `max(0, pendingEvents.length - seenEventCount)`，渲染在 `[data-nav="sector"]` 右上角（红点数字 ≤99，绝对定位）；进入星域页时 `seenEventCount = pendingEvents.length`（读即已读）
- 成就角标 = `max(0, 本周目解锁成就数 - seenAchievementCount)`，渲染在 `[data-nav="archive"]` 右上角；进入档案页时更新
- tick render 纯函数派生，**无动画**（250ms 重建 + transition 坑规避）；显示条件 >0
- 零引擎变更、零存档变更、零 schema 变更

**Blocked by:** 01（02 完成后落点更稳，可与其同批）

**Status:** resolved

## Acceptance Criteria

- [ ] playing 存档下注入事件（seed 固定）：`[data-nav="sector"]` 出现角标，数字 = 未处理事件数
- [ ] 切星域页后角标消失；再触发新事件角标重现（差值语义正确，resolve 事件后数字自然归零）
- [ ] 成就解锁后 `[data-nav="archive"]` 角标出现，进档案页消失
- [ ] 角标不随 250ms 重建闪烁（无 transition/动画）；桌面端同样显示
- [ ] 存档导出/导入/NG+ 后角标状态与 UI 层重置语义一致（seen 计数不落盘，刷新后差值重新计算——验收：刷新后旧事件不再算"新"？确认语义：seenEventCount 初始为 0，刷新后 pendingEvents 存量会显示角标。**若需"刷新不重报"，UI 层初始化时把 seen 快照置为当前值**——见 Answer 备注，实现时二选一并测试钉死）
- [ ] 341 vitest + 22 E2E（含新角标用例）+ typecheck clean 全绿

## Answer

待实现。备注：刷新语义二选一——① 初始化 `seenEventCount = pendingEvents.length`（刷新后存量事件不报角标，仅新触发报）；② 初始 0（存量也报）。推荐 ①（挂机刷新是常态，存量重报是噪音）。测试须钉死选择。
