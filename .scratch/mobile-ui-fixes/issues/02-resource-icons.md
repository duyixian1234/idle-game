# 02 修复：移动端资源条恢复图标显示

## 问题

移动端（≤480px）顶部资源条 4 cell（矿物/能源/科技点/军力）不显示资源图标。
根因：`src/styles/responsive.css:84-86` 显式 `.res-symbol { display: none }`
（历史设计以左侧色边替代 symbol）。desktop 视口实测 `display:block` 正常，
移动端与 desktop 行为不一致。

## 方案

采用 **spec 方案 A（恢复显示）**：

1. `src/styles/responsive.css` `@media (max-width:480px)`：移除
   `.res-symbol { display: none }`（或改为 `display: inline-flex`）。
2. `.res-name` 保持隐藏（窄屏紧凑，symbol + 数值 + 速率竖排 2 行即可）。
3. 保持 4-cell grid 布局；若 symbol 挤压数值，symbol 尺寸缩至 12px
   （`shell.css:131-140` 有 14px 定义，移动端可覆盖）。

## 验收

- [ ] Playwright 移动端 390×844：4 cell 均可见 `.res-symbol`（`display` 非 none）
- [ ] 数值/速率不被挤压截断
- [ ] `pnpm test` + `pnpm typecheck` 通过

## Blocked by

#25（spec: 移动端 UI 修复）
