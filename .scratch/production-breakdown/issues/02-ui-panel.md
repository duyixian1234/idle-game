# 02 — UI 问号图标 + 展开面板 + 交互 + 样式（含移动端）

**What to build:** 顶部资源条的可视化落地：资源条目内问号按钮、资源条下方固定展开容器、事件委托互斥展开/外部/Esc 关闭、会话态 tick 重建保持、`data-*` 语义化、样式与移动端适配、jsdom 冒烟测试。

**Blocked by:** 01（面板内容 = productionBreakdown 输出）

**Status:** resolved

- [x] `buildLayout`（layout.ts）新增固定容器 `<div class="breakdown-panel hidden" data-breakdown-panel></div>`，不参与 250ms tick 重建；AppElements 增补引用
- [x] `renderResources`（dom.ts:222）资源条目内新增问号按钮（**挂条目而非速率**，≤360 速率隐藏时保留）：`<button class="res-breakdown" data-breakdown-trigger data-breakdown-resource="${key}" aria-label="${name}来源分解">?</button>`
- [x] 交互（main.ts）：`els.resourceBar` click 事件委托 `closest('[data-breakdown-trigger]')`；会话变量 `openBreakdown: ResourceKey | null`（同 autoConfigOpen 模式）互斥展开；`render()` 中非空时调 `productionBreakdown(state)` 填充面板（250ms 全量重建天然实时刷新）
- [x] 关闭：document click（目标不在资源条/面板内）+ Esc（复用 overlay 关闭模式 main.ts:543-567）
- [x] 面板结构 data-*：组 `data-breakdown-group` / 行 `data-breakdown-row`（含 `data-breakdown-kind`）/ 名 `data-breakdown-name` / 值 `data-breakdown-value`（`×倍率（+N/s）`）/ 占比 `data-breakdown-pct` / 总计 `data-breakdown-total`；消耗组 `<details data-breakdown-consumption>` 默认收起
- [x] 样式：面板 --bg-panel 底、资源色左描边、乘数 --accent、消耗负值 --bad、占比 --dim；问号 14px 圆环 hover 高亮；移动端面板全宽（responsive.css ≤480）
- [x] jsdom 冒烟（dom.test.ts 同文件或新增）：4 资源问号渲染、点击展开、互斥切换、点外部关闭、render 重绘后 openBreakdown 保持、消耗 details 默认收起
- [x] 全量 vitest 回归绿 + typecheck clean；E2E 不新增（用户手动验证）
