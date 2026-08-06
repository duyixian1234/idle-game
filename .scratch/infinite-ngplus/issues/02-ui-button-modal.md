# 02 — UI：工具栏按钮 + 确认 overlay + action 注册

**What to build:** `src/ui/dom.ts` 工具栏（mute/logdir/export/import/reset 区）新增「开启新周目」按钮（`data-ngplus` 属性，**仅 `state.phase === 'infinite'` 渲染**，文案「开启新周目」，`title` 详述继承预览）；自建 `.ngplus-overlay` 确认弹窗（复用 ending/buy-max overlay 体系，双清单：将失去（资源/建筑/科技/好感/攻占/声望）+ 将继承（`previewNewGamePlus` 预览值）+ 红字不可逆警示，取消/确认按钮）；`src/main.ts`：ACTIONS 注册 `newGamePlus` action id + 事件委托（`data-ngplus` 点击 → 打开 overlay → 确认 dispatch → `startNewGamePlus`；取消 → 关闭，无状态变化）。单确认通道，无 Shift 直通。

**Blocked by:** 01

**Status:** resolved

- [ ] `dom.ts`：工具栏按钮渲染（`phase === 'infinite'` 条件）；`playing`/`ended` 不渲染（回归断言）
- [ ] `dom.ts`：`.ngplus-overlay` 结构（双清单容器 + 红字警示 + 取消/确认按钮），类名独立，复用 ending overlay CSS 变量
- [ ] `main.ts`：ACTIONS 注册 `newGamePlus`；事件委托 `data-ngplus` → overlay 打开（数据来自 `previewNewGamePlus`）；确认 → dispatch → `startNewGamePlus`；取消 → 关闭，状态零变化
- [ ] overlay DOM 独立于 250ms 面板重建（buy-max 先例：弹窗不随面板 `innerHTML=''` 重建）
- [ ] `src/ui/dom.test.ts` 冒烟：按钮可见性条件、overlay 渲染字段（继承清单关键文案）
- [ ] 342 vitest 全绿 + typecheck clean
