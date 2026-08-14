# 04 — UI：NG+ 继承摘要弹窗

**What to build:** NG+ 执行后立即展示的继承汇总弹窗（Q4-A 仅现有数据 + Q7-A 每次 NG+ 后一次）：新增独立 overlay 容器（复用 ngplus/megastructure overlay 三件套模式——layout 静态容器 + `hidden` class 切换 + `data-*` 事件委托 + Escape 统一关闭，overlay 不参与 250ms 重建）。`startNewGamePlusSequence`（src/ui/session/actions-heavy.ts）执行前捕获旧 state 图鉴集（factionCodex），执行后打开摘要弹窗，渲染新 state 当前值：周目数（ngPlusLevel）/ 永久产出加成（permanentMult）/ 继承科技点（resources.tech）/ 派系图鉴（总数 + 新增 X）/ 成就数（Object.keys(achievements).length）/ 永久加成表（permanentBonuses）。关闭三通道：遮罩点击 / Escape / 关闭按钮；**无「不再显示」持久化**。零存档变更、SCHEMA 不升。i18n 文案键新增（zh/en）。

**Blocked by:** 01（摘要成就数/周目口径与成就永久化一致）

**Status:** pending

- [ ] `layout.ts`：新增摘要 overlay 静态容器（`data-overlay` 类名独立，不参与 250ms 重建）
- [ ] `overlays.ts`：`renderNgPlusSummaryModal(el, state, prevCodex)`——五项字段 + 永久加成表 + 关闭按钮
- [ ] `actions-heavy.ts` `startNewGamePlusSequence`：执行前捕获旧 factionCodex 快照；执行后打开摘要弹窗（渲染新 state 值 + 「图鉴新增 +X」）
- [ ] `session/index.ts` + `listeners.ts`：open/close 三通道（遮罩/Escape/按钮）；Escape 并入现有统一处理
- [ ] i18n 文案键（zh/en）
- [ ] UI 冒烟测试（jsdom）：渲染字段（周目/加成/科技点/图鉴/成就数）、关闭按钮、遮罩/Escape 关闭路径；NG+ 序列后弹窗自动打开（session.test.ts）
- [ ] vitest 全绿 + typecheck clean；`render-consistency.test.ts` 不破（overlay 不参与重建）

## Definition of Done
NG+ 后自动弹出继承摘要；五项数据正确（来自新 state 与旧图鉴快照）；三通道可关闭；无持久化标记。
