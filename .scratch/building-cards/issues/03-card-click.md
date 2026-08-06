# 03 — 卡片主体点击（升级×1 / 建造×1 + 终局抉择分流）

**What to build:** 卡片主体变为可点击——在 els.panel 既有事件委托内新增 `data-build-card="<id>"` 分支：点击落在任何 `button` 上则交给按钮分支（冒泡天然优先命中），否则命中卡片主体时判定——count>0 且未达上限 → `dispatch('upgrade')`；否则 → `dispatch('buy')`；megastructureValue 建筑（星环冶炼场/跃迁枢纽）→ 走终局抉择确认弹窗（复用 openMegastructureModal）。不可操作态（未解锁/满级/资源不足）点击无副作用。Shift+点击卡片主体不触发买满弹窗（买满仍只走按钮），避免误触大额消费。

**Blocked by:** 02 — 卡片组件 + 响应式网格

**Status: resolved

- [ ] 卡片主体挂 `data-build-card="<id>"`；els.panel 委托新增判定分支（button 优先、主体兜底）
- [ ] 判定逻辑：升级×1 / 建造×1 / megastructure 弹窗 / 不可操作无副作用；反馈走既有 ACTIONS buy/upgrade（日志/音效/保存链路不动）
- [ ] dom 冒烟：卡片主体点击路径断言（可模拟 click 事件验证委托分发到对应 action）；全量 vitest 回归绿 + typecheck clean
