# 05 — UI：探索入口 + 探索面板

**What to build:** 通关后探索的 UI 层（决策 A1/A12）：
- 工具栏 `data-explore` 按钮：仅 `ended`/`infinite` 显隐（与 `data-ngplus`「开启新周目」同级），`playing` 隐藏。
- 探索 overlay 面板（复用 `.ending-overlay`/`.ending-card` 样式体系，新增独立类名，如 `.explore-overlay`）：状态行（单槽：可用 / 倒计时 mm:ss）、消耗预览（矿物/能源用 `scaledClamp` 当前值格式化 ◆/⚡、兵力固定 40 ⚔、派遣时长 60 分钟）、「派遣探索」按钮（资源不足或有进行中派遣时禁用，title 给出原因）。
- 点击派遣 → `dispatch(state, 'explore', '', deps)`（`ACTIONS` 注册 `'explore'`，走 `startExpedition`）；结果一律日志播报（自动入账，不打断玩家）。
- 面板随主循环 250ms 重建（与其他面板一致），倒计时显示依赖 `render`；派遣进行中时入口按钮/面板状态与引擎状态同步。

**Blocked by:** 01（startExpedition / isExploreAvailable）、02（发现物叙事可选）、03（字段类型）

**Status:** resolved

- [ ] `dom.ts`：工具栏 `data-explore` 按钮渲染（phase 门控）+ 探索面板渲染（状态/消耗预览/按钮禁用态）
- [ ] `actions.ts`：`ACTIONS` 注册 `'explore'` → `startExpedition`；失败 reason 转 warning 日志
- [ ] `main.ts`：`data-explore` 点击委托；探索面板开关（overlay 显示/隐藏，复用确认弹窗模式）
- [ ] jsdom 冒烟（`dom.test.ts` 或新文件）：playing 隐藏 / ended 显示；面板渲染字段；按钮禁用态（资源不足 / 派遣中）；点击委托 dispatch 正确
- [ ] 样式：`.explore-overlay`（复用 ending 体系变量，移动端适配沿用既有断点）

**Acceptance:** 通关后工具栏出现探索入口；面板显示实时消耗预览与倒计时；派遣/禁用/日志全路径可操作；移动端布局不回归（`e2e/mobile.spec.ts` 仍绿）。
