# 04 — 自动探索尽览常驻横幅

**What to build:** 自动探索面板（自动探索开关/护航区域）在「自动探索已开启 且 收集尽览」时常驻显示横幅提示「自动探索中：目标已尽览，仅回收资源」（`data-auto-explore-exhausted`）——挂机玩家回来第一眼即知自动探索只剩资源回收、无可解锁目标。未尽览或自动探索关闭时不显示。判断复用 `exploreProgress(state).exhausted`。

**Blocked by:** 01 — engine explore-progress

**Status:** resolved

- [x] auto.enabled && exhausted 时自动探索面板渲染 `data-auto-explore-exhausted` 横幅
- [x] 未尽览（exhausted=false）或自动探索未开启时不渲染
- [x] 横幅文案「自动探索中：目标已尽览，仅回收资源」
- [x] dom 冒烟（dom.test.ts）：开/关 × 尽览/未尽览 四态条件断言

## Comments

- 2026-08-07：实现于 dom.ts autoPanel（`[data-auto-explore-exhausted]` 属性选择器样式，overlays.css；escort-warn 为无样式语义 class 未复用）。测试 +1（四态补齐：未开启+未尽览）。
