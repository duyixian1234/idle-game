# 02 — 奖池权重目标分布 + 联邦进度 infinite 语义

**What to build:** 探索奖池权重调整为天体 30% / 军事 25% / 外交 25%（目标分布，整数权重近似）；`federationProgress` / `isFederationUnified` 在 infinite 阶段只统计「已解决」派系（total = satisfied），新派系进场不再使统一度回退。

**Blocked by:** None — can start immediately（与 01 无硬依赖；01 的礼包好感影响发现节奏但不阻塞本票）

**Status:** ready-for-agent

- [ ] `expeditionPool` 权重调整：planet 条目权重升、faction/conquest 条目权重降，近似达到天体 30% / 军事 25% / 外交 25% 目标分布（具体整数权重见 spec open items）
- [ ] `federationProgress`：`phase === 'infinite'` 时 `total = satisfied = 已结盟或 favor ≥ 100 的派系数`（已解决口径，恒 100%）
- [ ] `isFederationUnified`：infinite 阶段恒真（统一是历史状态）；playing/ended 语义不变
- [ ] `checkEnding` 不重触发（`endingTriggered` 现有守卫，确认不回归）
- [ ] 测试：exploration 域奖池权重分布断言；diplomacy 域 infinite 新派系进场进度不回退断言（`diplomacy.test.ts` / `exploration.test.ts`）
- [ ] 无 SCHEMA 升级（纯派生 + 权重常量，零迁移）
