# 移动端布局修复（mobile-layout）

**Status:** ready-for-agent
**Date:** 2026-08-06
**Scope:** 修复手机端 UI 溢出导致无法游玩的问题（spec 决策 21：手机打开正常游玩）

## 背景与证据

手机访问时建造面板「UI 元素叠在一起、无法正常游玩」。已通过 E2E 验证（`e2e/mobile.spec.ts`，注入中期存档，390×844 与 320×568 视口）：

- **建造面板 `.build-actions`（核心）**：flex 行 + 无 `flex-wrap`，子项 `.build-btn` 在 `@media (max-width: 480px)` 下被设 `width: 100%` 且 `flex-shrink: 0` → 4 个按钮（建造/买满/升级/升满）总宽 ~1080px，越出 320px 视口 750px+。实际效果：**每项只能看到「建造」按钮**，其余被 `.panel-body` 横向裁掉，`[data-upgrade-max="miner"]` 真实点击超时失败。
- **科技面板兑换行 `.exchange-row`**：同样 flex 无 wrap + `width: 100%` 按钮 → 320px 下「兑换/最大」按钮越界 ~314px（`scrollWidth=622 / clientWidth=296`）。
- 通过审计：外交（`.faction-actions` 有 wrap）、科技升级按钮（`.build-item` 为 flex 列，天然堆叠）、资源条、星球条、机制条、工具栏、标签页。

根因唯一：**窄屏断点对 `.build-btn` 设 `width: 100%`，但按钮所在容器有的不换行**（`.build-actions` / `.exchange-row`）。

## 决策（grill 确认，2026-08-06，全部接受推荐）

1. **范围**：只修两条溢出（`.build-actions` + `.exchange-row`）；其他收紧项（`.mechanic-bar` 拥挤、tap target 44px 等）留待后续。
2. **布局策略**：`.build-actions` 改纵向堆叠（`flex-direction: column` + `align-items: stretch`），与外交/科技一致；**移除 `.build-btn { width: 100% }` 全局规则**，改由各容器显式声明。
3. **断点**：在 480px 基础上增补 360px（收紧资源条字号/间距）；E2E 回归覆盖 320 / 360 / 390 三视口。
4. **兑换行**：本轮一并修（同根因），`flex-wrap: wrap` + 输入框独占一行。

## 验收标准

- `pnpm build` + typecheck 通过
- `pnpm test:e2e e2e/mobile.spec.ts` 三个视口（320/360/390）全绿：无页面/容器水平溢出、无按钮越界、无同组重叠、无遮挡、`[data-upgrade-max]` 可点击
- 既有 12 E2E + 251 vitest 全绿（回归无损）
- 提交：原子提交 + 中英文规范 message
