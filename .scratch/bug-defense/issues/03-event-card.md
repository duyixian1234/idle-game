# 03 — 事件卡改造：弹窗四选一（军力击退前置）

**What to build:** `createEventInstance` bug 分支（events.ts L496-518）叠加军事处理选项，数值固化进 payload 保证 hint 与结算一致：

- payload 增加 `strength` / `repelCost`（来自 `bugTerms`，固化——与 raid `createRaidInstance` L544 同模式）。
- options 结构：`repel`（军力击退，`-X 军力`）置于 dispatch 之前（军事优先语义），其后 dispatch / jam / ignore 保持现状（label/hint 不动）。
- 选项 id 沿用 `repel`（与 raid 一致）：`optionCost`（L653）与自动化规则（automationPolicies security 族）无需新增逻辑分支即可识别成本。
- void-swarm 分支共享同一构建路径（def 传入 `bugTerms` 决定 curve 缩放）。
- UI 事件卡渲染（dom.ts）无需新面板——选项列表动态渲染即自动多出「军力击退」；如展示虫群当前强度（如 hint 附「虫群强度 ×1.3」），用 `data-*` 语义化属性。

**Blocked by:** 02（bugTerms）

**Status:** pending

- [ ] bug 分支 payload 加 strength/repelCost + repel 选项（含 hint，`formatNumber`）
- [ ] void-swarm 共享路径
- [ ] `optionCost`/自动化规则对 repel 选项零改动兼容（回归验证）
- [ ] 单测：事件卡选项顺序与 hint 固化值 = bugTerms 值；dom 冒烟渲染 repel 选项
