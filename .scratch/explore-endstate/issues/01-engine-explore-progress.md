# 01 — 引擎导出 exploreProgress（探索收集进度派生）

**What to build:** 引擎层新增纯函数 `exploreProgress(state)`，返回探索收集进度的单一事实源：`{ factions: { found, total }, planets: { found, total }, exhausted }`。`found` = 已发现势力/天体数（exploredFactions/exploredPlanets 长度），`total` = 静态表 4 势力 + 5 天体；`exhausted` = 探索奖池中无非 resource 条目（ended 静态池集齐 → true；infinite 扩展池仍有军事/外交/天体目标或程序生成占位 → false）——复用 `expeditionPool` 现有计算，不引入第二套口径。派生状态，不写存档、无 schema 变更。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `exploreProgress(state)` 导出，返回结构含 factions/planets 的 found+total 与 exhausted
- [x] exhausted 与 `expeditionPool(state)` 非 resource 条目存在性一致（ended 集齐/infinite 有目标两向都正确）
- [x] total 静态口径 = EXPLORE_FACTIONS + EXPLORE_PLANETS 条目数（4/5），与探索页现有 totalPool 一致
- [x] 引擎单测（exploration.test.ts）：空态 / 部分收集 / 集齐三态 + infinite 扩展池态

## Comments

- 2026-08-07：实现于 exploration.ts `exploreProgress`；found clamp 到 total（code-review 发现：infinite 程序生成天体使 exploredPlanets 超 5，显示口径不溢出）。测试 +4（三态 + infinite + clamp）。
