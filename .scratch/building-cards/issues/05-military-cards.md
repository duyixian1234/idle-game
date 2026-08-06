# 05 — 军事面板卡片化（兵营/军港复用卡片组件）

**What to build:** 军事 tab 的军事建筑（兵营/军港）与民用建筑视觉统一——renderMilitaryPanel 内的 renderBuildPanel（传入 MILITARY_BUILDINGS）同步升级为卡片渲染，与 build tab 同构（图标/徽标/预览/按钮组/锁定灰化）。攻占列表（投入输入框 + 攻占按钮）与军械科技区保持行式不动。军事 tab 仅 2 个建筑，锁定卡不折叠。`data-conquest`/`data-conquest-input`/`data-upgrade-tech` 等军事 tab 契约零破坏。

**Blocked by:** 02 — 卡片组件 + 响应式网格

**Status: resolved

- [ ] renderBuildPanel 卡片化天然覆盖 MILITARY_BUILDINGS（共用函数），军事 tab 卡片渲染上线
- [ ] 攻占列表/军械科技区行式不动，`data-conquest`/`data-conquest-input` 契约保留
- [ ] dom 冒烟：军事 tab 卡片渲染 + 攻占区不受影响；全量 vitest 回归绿 + typecheck clean
