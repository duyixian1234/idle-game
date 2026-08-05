# 01 — CSS：建造行纵向堆叠 + 兑换行换行 + 360 断点

**What to build:** 修复窄屏断点按钮溢出。`src/style.css` `@media (max-width: 480px)` 段：

1. **移除 `.build-btn { width: 100% }`**（根因：全宽按钮塞进不换行的 flex 行必然溢出）。
2. **`.build-actions`**：`flex-direction: column; align-items: stretch; gap: 6px` → 建造/买满/升级/升满垂直堆叠、按钮撑满列宽，与外交/科技面板风格一致。`.upgrade-btn` / `.max-btn` 的 `margin-left: 8px` 在 column 下无视觉作用但保留无害。
3. **`.exchange-row`**：`flex-wrap: wrap`；`.exchange-input { flex-basis: 100% }`（输入框独占一行，按钮一行）。
4. **`.faction-actions`**：显式 `flex-direction: column; align-items: stretch`，不再依赖移除掉的 `width: 100%` 规则保持全宽堆叠视觉。
5. **新增 `@media (max-width: 360px)`**：收紧资源条（`.resource` 字号 11px、padding 收窄、`.res-rate` 隐藏）与 `.resource-bar` gap。

**Blocked by:** —

**Status:** resolved

- [x] 移除 `.build-btn { width: 100% }`
- [x] `.build-actions` column + stretch + gap
- [x] `.exchange-row` wrap + input flex-basis 100%
- [x] `.faction-actions` 显式 column
- [x] 新增 360px 断点（资源条收紧）

## Answer

`src/style.css` 响应式段重写：移除全宽按钮规则，`.build-actions`/`.faction-actions` 显式 `flex-direction: column; align-items: stretch; gap: 6px`，`.exchange-row` wrap + input 独占一行，新增 `@media (max-width: 360px)`（资源条字号 11px、隐藏 res-rate、panel-body padding 8px）。验证：mobile E2E 三视口全绿。
