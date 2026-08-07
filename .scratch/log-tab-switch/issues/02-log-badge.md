# 02 - 日志 tab 角标

**Status:** pending
**Spec:** ../spec.md（Q3/Q9）

## 目标

日志 tab 显示「上次查看后新增行数」角标，读即清零，与一级页 seen 机制独立。

## 改动

- `src/main.ts`：
  - 新增 `let seenLogCount = 0`（已读行数快照，UI 会话态）；
  - `resetSeenSnapshot()` 增加 `seenLogCount = state.log.length`（刷新语义①：存量不重报）；
  - `updatePanelTabs()` 中 `activePanelTab === 'log'` 时 `seenLogCount = state.log.length`（读即清零）；
  - `renderBadges()` 派生日志角标：`Math.max(0, state.log.length - seenLogCount)`，>0 且非日志 tab 激活时渲染到 `[data-panel-tab-badge="log"]`，封顶 99+。

## 语义边界

- 日志 tab 激活时角标恒隐（已读）；
- NG+ / reset / import 均经 `resetSeenSnapshot()` → 同步重置；
- 与 footer 事件/成就 seen 完全独立。

## 验收

- [ ] 在建造 tab 时日志新增 → 角标数字 = 新增行数，99+ 封顶
- [ ] 切到日志 tab → 角标清零隐藏；切回建造后从 0 重新累积
- [ ] 刷新后存量不重报（seenLogCount = 当前行数）
- [ ] 日志 tab 激活时角标不出现
