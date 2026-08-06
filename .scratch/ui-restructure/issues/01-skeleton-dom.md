# 01 — 骨架 DOM：4 一级 tab + header/footer + 页容器（纯结构，行为零变化）

**What to build:** 重构 `buildLayout`（dom.ts:76-131）为 B 架构骨架：
- header `.topbar` 固定两行（`.resource-bar` + `.planet-bar`，契约不动）
- main `.content` 滚动区：mechanic-bar 移入顶部 → 4 个 `[data-nav-page="sector|archive|explore|settings"]` 页容器
- footer `.nav-bar` 固定：4 个一级 tab 按钮 `[data-nav="sector|archive|explore|settings"]`（🪐 星域 / 🏛 档案 / 🚀 探索 / ⚙ 设置，icon+label 横排，高 44px）
- 星域页内含二级 tab（`.tab[data-tab=build|tech|diplomacy|military]` + `[data-panel=…]` **原样保留**）+ `.log-area`（加 `data-log` 契约）
- ending/buy-max/ngplus 三个 overlay + tutorial 保留原样（仅宿主移动）；`.toolbar`/`.status-line` 从骨架移除（其内容由 ticket 02 迁入新页）
- 一级 tab 切换逻辑（main.ts:155-160 泛化）：`[data-nav]` 点击 → 显示对应 `[data-nav-page]`，互斥

**Blocked by:** None

**Status:** resolved

## Acceptance Criteria

- [ ] buildLayout 输出 B 架构骨架，`data-resource`/`data-planet`/`data-tab`/`data-panel`/`data-build`/`data-tech`/`data-event` 等既有契约零变更
- [ ] 一级 tab 切换可用：点击 `[data-nav]` 只显示对应 `[data-nav-page]`，互斥，状态不因 250ms 重建丢失（切换状态存 UI 层）
- [ ] header/footer 固定不参与 tick 重建（buildLayout 一次性构建；tick 只重建面板内容区）
- [ ] 全量 341 vitest + 20 E2E + typecheck clean 全绿（E2E 旧断言在 ticket 03 前允许临时保持通过——若 01 单独提交导致 E2E 红，须与 02/03 同批提交）
- [ ] mobile.spec 三视口（320/360/390）审计通过（footer/header 不遮挡、无溢出）

## Answer

待实现（实现要点见 spec Implementation Decisions 与 Further Notes 风险点 ①②）。
