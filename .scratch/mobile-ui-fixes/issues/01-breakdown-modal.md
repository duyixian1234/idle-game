# 01 修复：breakdown 面板移动端改为 modal 弹窗

## 问题

移动端（≤480px）`.breakdown-panel` 为文档流元素（`src/styles/shell.css:195`，
位于 `.topbar` 之后、`.content` 之前），内容被推到视口外——实测资源分解面板
「消耗明细」`<summary>` top=940px > 视口 844px，点击无响应（用户体感
「点了一下内容闪一下就消失」）。影响所有依赖 breakdown 面板的折叠项
（`breakdown-consumption` 等）。

## 方案

采用 **spec 方案 B（modal 弹窗）**：

1. `src/styles/responsive.css` `@media (max-width:480px)` 新增：
   - `.breakdown-panel`：`position: fixed; inset: auto 12px; top: 84px;
     max-height: 70vh; z-index: 40;`（固定悬浮于内容区上方，不占文档流）
   - 加遮罩：`.breakdown-panel` 打开时给 body 加 backdrop（或复用 overlay 模式），
     点击外部关闭由 `listeners.ts:101` 文档级委托天然支持
2. desktop（>480px）行为不变：保持就地展开。
3. 若 modal 需要遮罩层，参考 `.auto-config-overlay` 现成模式
   （`transient-overlays.css` / `responsive.css:28-39`）。

## 验收

- [ ] Playwright 移动端 390×844 + 原存档：点击矿物「?」→ 面板可见且 summary
      `getBoundingClientRect().top < 844`
- [ ] 「消耗明细」点击可展开、250ms render tick 后不重置
- [ ] 点击面板外区域关闭（既有文档级委托）
- [ ] desktop（1280×800）行为不回归（就地展开、点击外部关闭）
- [ ] `pnpm test` + `pnpm typecheck` 通过

## Blocked by

#25（spec: 移动端 UI 修复）
