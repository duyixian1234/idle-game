# spec: 移动端 UI 修复（mobile-ui-fixes）

## 背景

用户报告移动端布局（视口 ≤480px）下三处 UI bug，已用 Playwright（Edge + 存档
idle-save-2026-08-12.json，schema v16 / phase infinite / NG+3）在 game.duyixian.com.cn
实测确认根因：

1. **下拉/折叠面板「点一下闪一下消失」**（资源消耗详情、自动外交修改策略等）：
   `.breakdown-panel` 是文档流元素（`shell.css:195`，位于 `.topbar` 之后、`.content`
   之前），移动端内容被推到视口外。实测 `<summary>` top=940px > 视口 844px，
   元素可见但不可达，点击被浏览器拒绝（stability check 失败）。
2. **顶部资源条无图标**：`responsive.css:84-86` 在 `@media (max-width:480px)` 显式
   `.res-symbol { display: none }`。desktop（1280×800）实测 `display:block` 正常。
3. **外交卡片内容超出宽度**：`.faction-card .favor-row` 5 个 inline 元素横排无
   wrap/min-width 约束，好感度/威胁数字被截断（实测「82.00/100」显示为「82.00/10」），
   按钮组挤压。

## 方案（已与用户对齐，采用推荐项）

- **Bug 1 → 方案 B（modal 弹窗）**：移动端（≤480px）`.breakdown-panel` 改为
  fixed 居中弹窗（overlay 遮罩 + 点击外部关闭已由 `listeners.ts:101` 文档级委托
  天然支持），内容区可滚动（max-height 70vh）。desktop 行为不变（保持就地展开）。
  实现方式：CSS 媒体查询覆盖 + 少量 DOM 结构调整（遮罩可复用 `.auto-config-overlay`
  现成模式）。
- **Bug 2 → 方案 A（恢复显示）**：移除 `responsive.css` 的 `.res-symbol { display:none }`，
  移动端恢复 14px 图标；`.res-name` 仍隐藏（保持窄屏紧凑）；4-cell grid 布局不动
  （symbol 13px 与数值竖排不冲突，实测余量充足）。
- **Bug 3 → wrap + stack**：`.faction-card .favor-row` 加 `flex-wrap: wrap` +
  子元素 `min-width: 0`；`faction-actions` 在 ≤480px 从 2 列 grid 改 1 列 stack；
  `.faction-coercion-row` 按钮组加 wrap。

## 验收标准

- [ ] Playwright 移动端视口（390×844）+ 原存档重测：breakdown 消耗明细 summary 可点、
      展开不闪退
- [ ] 移动端资源条 4 cell 均显示图标
- [ ] 外交卡片好感度/威胁数字完整显示，按钮不挤压
- [ ] `pnpm test`（vitest）全绿，`pnpm typecheck` 通过，`pnpm build` 通过
- [ ] 部署后 game.duyixian.com.cn 线上重测通过

## Blocked by

（spec 无 blocker）
