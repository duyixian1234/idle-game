# 02 — E2E 回归：360 视口加入 + 全量验证

**What to build:** 移动端可游玩性验证固化为长期回归。

1. `e2e/mobile.spec.ts` 的 `VIEWPORTS` 数组新增 `iphoneSE2-360x740`（Android 主流窄机），保持既有审计断言（页面/容器水平溢出、按钮越界、同组重叠、遮挡、可点击探测）不变。
2. 修复后运行：`pnpm build && pnpm test:e2e e2e/mobile.spec.ts` → 三视口（320/360/390）全绿。
3. 全量回归确认无损：`pnpm test`（251 vitest）+ `pnpm test:e2e`（既有 12 E2E + 新增 mobile）。
4. 截图产物 `test-results/mobile-*.png` 验证视觉效果（堆叠后按钮全部可见、无横向裁切）。

**Blocked by:** 01

**Status:** resolved

- [x] VIEWPORTS 增补 360×740
- [x] mobile.spec 三视口全绿（含点击探测）
- [x] 全量 vitest + E2E 回归无损
- [x] 截图产物更新（修复后）

## Answer

`e2e/mobile.spec.ts` VIEWPORTS 增补 `android-360x740`。修复后：mobile.spec 3 passed（320/360/390 三视口，无溢出/越界/重叠/遮挡，`[data-upgrade-max]` 点击成功）；全量 251 vitest + 15 E2E 全绿。
