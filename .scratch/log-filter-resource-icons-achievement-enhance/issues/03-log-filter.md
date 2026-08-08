# 03 — 日志筛选事件类别

**What to build:** 日志区头部新增筛选 chip 组（全部/系统/故事/事件/奖励/警告），单选互斥，切换后只显示匹配类别的日志行。DOM 层 CSS 属性选择器过滤，零 JS 遍历，localStorage 持久化。

**Blocked by:** 01 — SessionUiState 字段扩展（需要 `logFilter` 字段）

**Status:** ready-for-agent

**Spec:** ../spec.md（Q1/Q2/Q3/Q9/Q15/Q16/Q17）

## 目标

玩家在日志区被各类消息淹没，想只看某一类（如只看奖励）时无能为力。新增筛选 chip 组让玩家按 `LogType` 5 种类别筛选日志，事件卡片始终可见不受筛选影响。

## 改动

- `src/ui/log.ts`：
  - `appendLog()` 创建行时加 `data-log-type="${entry.type}"` 属性（与 `data-log-line` 并列）
  - 新增 `LOG_FILTER_KEY = 'idle-game-log-filter'` 常量
  - 新增 `LOG_FILTER_OPTIONS` 数组：`[{id:'all',label:'全部'},{id:'system',label:'系统'},{id:'story',label:'故事'},{id:'event',label:'事件'},{id:'reward',label:'奖励'},{id:'warning',label:'警告'}]`
  - 新增 `renderLogFilter(el, currentFilter)` 函数：渲染 chip 组 HTML（`.log-filter` 容器 + `.filter-chip` 按钮，`data-log-filter` 属性，选中态 `selected` 类）
- `src/ui/layout.ts` — `.log-head` 区域结构调整：
  - 现有 `.log-head` 下方新增 `<div class="log-filter-row" data-log-filter-bar></div>` 容器
  - `.log-head` 保持不变（标题 + 光标 + 方向按钮 + 自动处理按钮）
- `src/ui/session/index.ts` — `render()` 主函数：
  - 渲染筛选 chip 组到 `[data-log-filter-bar]`（或内联到 log head 渲染中）
  - 同步 `logEl` 容器的 `data-log-filter` 属性为 `ui.logFilter` 值
- `src/ui/session/listeners.ts` — 新增筛选 chip 点击监听：
  - 委托 `els.panel` click，匹配 `[data-log-filter-chip]`
  - 更新 `ui.logFilter`，写 `localStorage`，调用 `render()`
- `src/styles/log-panels-pages.css`：
  - `.log-filter-row` 样式（flex wrap、gap、padding）
  - `.filter-chip` 样式（与 `.option-pill` 视觉一致：小圆角按钮、选中态高亮）
  - 筛选隐藏规则：
    ```css
    [data-log-filter="system"] [data-log-line]:not([data-log-type="system"]) { display: none; }
    [data-log-filter="story"] [data-log-line]:not([data-log-type="story"]) { display: none; }
    [data-log-filter="event"] [data-log-line]:not([data-log-type="event"]) { display: none; }
    [data-log-filter="reward"] [data-log-line]:not([data-log-type="reward"]) { display: none; }
    [data-log-filter="warning"] [data-log-line]:not([data-log-type="warning"]) { display: none; }
    /* all 不加规则 */
    ```

## 验收

- [ ] 日志区头部下方显示筛选 chip 组（全部/系统/故事/事件/奖励/警告）
- [ ] 默认选中「全部」，所有日志行可见
- [ ] 切换到「奖励」后只显示 `type=reward` 的日志行，其他行 `display:none`
- [ ] 事件卡片（`.event-stack`）在任何筛选状态下都可见
- [ ] 筛选状态刷新后保持（localStorage 持久化）
- [ ] localStorage 脏值（如 `"hack"`）回退 `'all'`
- [ ] 新增日志行自动带 `data-log-type` 属性
- [ ] `dom-misc.test.ts` 或 `dom-build.test.ts` 全绿
- [ ] `tsc --noEmit` 通过
