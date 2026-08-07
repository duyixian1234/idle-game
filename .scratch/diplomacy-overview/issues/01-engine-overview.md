# 01 — 引擎 diplomacyOverview 纯函数

**What to build:** 外交面板总览卡的数据源。在引擎外交模块新增纯派生查询 `diplomacyOverview(state)`，返回 `{ total, satisfied, allied, threatCount }`：
- `total` = 已登场派系数（联邦进度 total 同源）
- `satisfied` = 联邦统一条件满足数（复用现有 federationProgress）
- `allied` = 已结盟派系数
- `threatCount` = 未结盟且威胁 ≥ 当前骚扰阈值的派系数（与 raidableFaction 同一阈值口径，结盟派系不计入）

纯函数：不写入 state、不触碰任何外交动作/成本/骚扰判定逻辑、零 schema 变更。附引擎单测覆盖各态。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] `diplomacyOverview` 导出，空态（无派系）返回 `{total:0, satisfied:0, allied:0, threatCount:0}`（或等价安全值）
- [ ] 部分结盟态：total/satisfied/allied 正确；threatCount 只计未结盟且威胁达标的派系
- [ ] 全结盟态：threatCount === 0（与 raidableFaction 返回 null 口径一致）
- [ ] 调用前后 state 不变（纯函数）
- [ ] 引擎单测全绿，不破坏现有 diplomacy/federationProgress 断言
