# 01 - DOM 结构改造与 tab 持久化

**Status:** resolved
**Spec:** ../spec.md（Q2/Q4/Q5/Q6）

## 目标

星域页上下布局 → tab 切换：日志并入现有 tab 行（单层 5 tab），默认「日志」+ localStorage 持久化。

## 改动

- `src/ui/layout.ts` `buildLayout` sector 页：
  - tab 行加 `<button data-tab="log">日志`（含 `[data-panel-tab-badge="log"]` 角标 span，初始 hidden，active 初始给日志）；
  - `.log-head` + `.log-area[data-log]` 原样迁入 `<div class="panel-body" data-panel="log">`；
  - `.mechanic-bar` 保持 `.panel` 外（常驻）。
- `src/main.ts`：
  - 新增 `PANEL_TAB_KEY = 'idle-active-panel-tab'` 与 `PANEL_TABS` 白名单常量；
  - `activePanelTab` 初始化改从 localStorage 读取 + 白名单校验，非法回退 `'log'`；
  - tab 切换委托（els.panel click，`.tab[data-tab]`）：写入 localStorage 后再 `updatePanelTabs()`。

## 验收

- [ ] 首次进入默认日志 tab；切到建造后刷新，恢复到建造
- [ ] localStorage 脏值（如 `"hack"`）回退默认日志
- [ ] 机制条仍常驻 tab 行之上
- [ ] 日志头（标题/光标/自动处理按钮）随日志 tab 移动，功能不变
