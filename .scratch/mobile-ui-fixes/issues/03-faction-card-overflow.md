# 03 修复：外交卡片内容超出宽度

## 问题

移动端（≤480px）外交卡片（`.faction-card`）内容超出卡片宽度：

- `.favor-row` 5 个 inline 元素横排（favor-label + ascii bar + favor-num +
  threat-label + threat-num），无 wrap/min-width 约束——实测「好感度」单字竖排、
  「82.00/100」被截成「82.00/10」
- 卡片底部 `faction-actions` 4 按钮（贸易/技术共享/结盟/威慑）+ 胁迫按钮行挤压

## 方案

采用 **spec 方案（wrap + stack）**：

1. `src/styles/responsive.css` `@media (max-width:480px)` 新增：
   - `.faction-card .favor-row { flex-wrap: wrap; gap: 4px 8px; }`
   - `.favor-row > * { min-width: 0; }`（防文字截断）
   - `.faction-card .faction-actions { grid-template-columns: 1fr; }`
     （2 列 → 1 列 stack）
   - `.faction-coercion-row { flex-wrap: wrap; }`（胁迫按钮组换行）
2. 若 `build-info.faction-info` 无 min-width 约束，补 `min-width: 0`。

## 验收

- [ ] Playwright 移动端 390×844 + 原存档：外交卡片好感度/威胁数字完整
      （scrollWidth ≤ clientWidth 或自然换行不截断）
- [ ] 按钮不挤压、不溢出视口
- [ ] desktop 外交卡片不回归
- [ ] `pnpm test` + `pnpm typecheck` 通过

## Blocked by

#25（spec: 移动端 UI 修复）
