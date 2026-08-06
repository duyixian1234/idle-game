# 04 — 日志区终端化（ASCII 头部/块状光标/类型亮度分层/typewriter）

**What to build:** 日志区是终端感的核心阵地（←01,03）：

1. **ASCII 头部**：日志容器顶部加 `[ 航行日志 ]` 框式头部（buildLayout 一次性输出，纯装饰不进 data-* 契约），下方分隔线 `────`
2. **类型着色亮度分层**（spec 亮度分层定案）：
   - story → `--phosphor`（高亮磷光绿，替换现 `#7ee787`）
   - event → `--energy`
   - info/普通 → `--text`（淡绿白）
   - reward/warning → `--warn`
   - bad → `--bad`
3. **块状光标**：日志容器内一次性追加 `<span class="log-cursor" data-log-cursor>`，`animation: cursor-blink 500ms step-end infinite`（step-end 瞬时明灭，终端手感）；挂在非重建元素 → 动画不被 250ms 重建打断；`prefers-reduced-motion` 下 `animation: none`（ticket 01 已留基础规则）
4. **typewriter（一次性叙事）**：`typewriter(el, text, speed)` 工具函数——逐字揭示、fake-timer 可测；仅用于：事件卡**首次挂载**（pendingEvents 重建后直接全量渲染，首挂动画一次）、终局/剧情 overlay、boot 文本；`prefers-reduced-motion` 或 SSR/jsdom 下直接渲染完整文本；**tick 循环内日志行绝不动画**
5. 增量渲染机制（dom.ts L416-421 renderLogInto）与自动滚动**原样保留**
6. `[data-log]`/`[data-log-line]` 契约不动；新增 `data-log-cursor`

**Blocked by:** 01, 03

**Status: open

**Acceptance:**
- [ ] typewriter 单测：fake timers 逐字 + reduced-motion 直渲分支
- [ ] 全量 vitest 回归绿 + typecheck clean
- [ ] 日志增量渲染与自动滚动行为不变（dom 冒烟验证）
