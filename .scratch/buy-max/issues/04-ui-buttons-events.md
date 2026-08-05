# 04 — UI 买满按钮与事件委托

**What to build:** 四类面板新增「买满」按钮 + Shift+点击双通道，全部沿用现有 `data-*` 属性 + `main.ts` 事件委托 + `ACTIONS` 注册表模式（参考 `convertMax` 先例）。按钮：建造面板 `data-buy-max="${id}"`（`renderBuildPanel`，`dom.ts:333-386`）、升级按钮旁 `data-upgrade-max="${id}"`、科技面板 `data-upgrade-tech-max="${id}"`（`renderTechPanel`，`dom.ts:389-467`，仅 Lv1-9 显示、Lv0/Lv10 不出现）、外交面板 `data-diplomacy-max="${factionId}:trade|techShare"`（`renderDiplomacyPanel`，`dom.ts:482-540`）。disabled 态与主按钮一致（连 1 次都买不起则禁用）。`main.ts` 事件委托（`main.ts:255-284` 三元组映射）新增条目；Shift+点击现有购买/升级/贸易/技术共享按钮（`e.shiftKey`）等效走买满路径。`ACTIONS` 注册表（`ui/actions.ts:93-166`）新增批量 action，复用 dispatch 的失败→日志→音效→渲染→保存管线，成功写反馈日志（「已购买 N 台 X，花费 …，剩余 …」）。

**Blocked by:** 01, 02, 03 — 需要引擎批量动作与 preview 数据

**Status:** pending

- [ ] 建造面板：`data-buy-max` 按钮渲染 + disabled 态（同 canAfford）
- [ ] 建筑升级：`data-upgrade-max` 按钮（仅已建建筑）
- [ ] 科技面板：`data-upgrade-tech-max` 按钮（仅 Lv1-9；Lv0/Lv10 不渲染）
- [ ] 外交面板：`data-diplomacy-max` 按钮（仅 trade / techShare；intimidate / alliance 无）
- [ ] `main.ts`：委托新增 4 类 data-* 映射；Shift+点击主按钮 → 买满路径（`e.shiftKey`）
- [ ] `ACTIONS` 注册批量 action（调 `previewMaxBuy`/`executeMaxBuy`/`diplomacyMax`），成功/失败走现有反馈日志与音效管线
- [ ] UI 冒烟测试（`dom.test.ts` 追加）：按钮渲染/禁用、Shift 点击委托、action 分发
