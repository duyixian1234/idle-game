# 03 - CSS：日志 panel-body / tab 角标 / 移动端

**Status:** pending
**Spec:** ../spec.md（Q7/Q8 + CSS 节）

## 目标

日志 tab 全高滚动、角标视觉与 footer 一致、移动端 5 tab 单行 + 横滚兜底、清理旧 min-height。

## 改动

- `src/styles/log-panels-pages.css`：
  - `.panel-body[data-panel="log"]`：`padding: 0; display: flex; flex-direction: column;`
  - `.panel-body[data-panel="log"] .log-area`：`flex: 1; min-height: 0; max-height: none;`（覆盖 25vh/120px/18vh）
  - `.tab` 加 `position: relative;`；新增 `.tab-badge`（absolute top 4px right 2px、`var(--bad)` 底白字、min-width 16、圆角 8、10px/16px，与 `.nav-badge` 同视觉）+ `.tab-badge.hidden`
- `src/styles/responsive.css`：
  - 移除 `max-height:480` 与 `≤480` 两处 `.log-area { min-height: 18vh }`；
  - `≤480` 加 `.panel-tabs { overflow-x: auto; scrollbar-width: none; }` + `::-webkit-scrollbar { display: none; }` + `.tab { flex: none; }`（横滚兜底）。

## 验收

- [ ] 日志 tab 滚动区 = panel-body 高度（45vh 约束内），log-head 固定
- [ ] 角标红点数字与 footer 角标视觉一致
- [ ] ≤480px：5 tab 默认单行；320px 大字体下溢出可横滚
- [ ] 桌面端 25vh → 约 45vh 日志滚动区（空间收益达成）
