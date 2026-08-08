# tick 注册表：结算阶段组 DAG + 组内序列（Golden Order 保序）

`tick()` 硬编码 ~20 步线性序列改为**结算阶段组注册表**：5 个组节点（资源/外交/事件/结算/结局）声明显式依赖边构成 DAG，拓扑排序确定执行序；组内保持原线性调用；**黄金序（Golden Order）断言**把旧序列固化为可回归资产，行为逐字节一致。

**状态**: Accepted（2026-08-08 grill-with-docs，纯架构优化 + 面向未来扩展）
**证据**: `src/engine/engine.ts:106-188`（tick 主循环 ~20 步）；依赖审计：真实偏序仅 5 组 ~4 条跨组边

## 背景

1. **tick 序列硬编码**：`tick()` 内 ~20 步固定顺序（资源结算 → 维护 → 事件 → 星球机制 → 攻占 → 探索 → 自动派遣 → 结局 → 成就），新增域 = 在序列里插入 1 行，回归测试必然抖动。
2. **顺序约束靠注释**：coercionTick 必须在 autoDiplomacyTick 前（cooldown 共享）、settleExpeditions 必须在 autoExploreDispatch 前（结算后补位）、checkEnding 必须在 checkAchievements 前（federation 成就依赖 endingTriggered）——全部以注释约束，无类型/结构保护。
3. **架构评审结论**（2026-08-08 v1/v2）：候选 ② 原判 Speculative（触发条件 = 新增 ≥3 个 tick 域），用户决定直接实施（纯架构优化 + 面向未来）；依赖审计显示真实偏序仅 5 组，**全 DAG（20 节点）会把非依赖写成依赖**——取「组 DAG + 组内序列」折中。

## 决策

1. **TickGroup 注册表**（`src/engine/tick-registry.ts`，新建）：
   - 节点 = 5 个结算阶段组，组内保持原线性调用（普通函数调用，不逐步注册）：
     - `A 资源链`：dt 计算 → productionReport → 资源累加 → 统计 → applyMaintenance → applyFleetMaintenance → 兜底
     - `B 外交链`：coercionTick → autoDiplomacyTick → ensureCoercionUnlocked → 时间推进（lastTick/playSeconds/planetStaySeconds）
     - `C 事件链`：triggerRandomEvent/scheduleNextEvent → autoResolvePendingEvents → applyStormHarvest → checkPlanetUnlocks → checkFederationPendingStory
     - `D 结算链`：settleConquests → settleExpeditions → autoExploreDispatch → autoConquestTick
     - `E 结局链`：checkEnding → playMilestone(endlessII) → checkAchievements → pruneStaleEvents
   - 每组签名 `(state, nowMs, rng?) => void`，与现状 tick 调用一致。
2. **组间依赖边显式声明**：每组 `after: GroupId[]`（现状 = 链式偏序 A→B→C→D→E）；拓扑排序（Kahn 算法）输出执行序；新 tick 域 = 新组声明 after 边，拓扑自动定位，无需手插序列。
3. **fail-fast**：模块加载期跑拓扑排序——环（循环依赖）、未知依赖、孤立节点（无前置未注册）即抛错；启动即暴露而非运行时。
4. **hub 集中注册**：engine.ts 显式列出 5 组注册（保持 hub 可见性，ADR-0002 风格），不做模块自注册副作用 import。
5. **Golden Order 保序**：单测固化「旧线性序列 = 组拓扑序 + 组内序列展开」快照；拓扑排序输出与快照 diff，不一致即红——顺序漂移在测试期暴露。
6. **签名透传**：`rng?`（ADR-0007）与 `nowMs`（注入）经组函数原样透传，不做二次抽象。

## 为什么

- **组 DAG 而非全 DAG**：真实偏序只有 5 组（资源→一切；结算→结局），20 节点全 DAG 会把 16 条「线性习惯」强制写成依赖边，图噪声淹没真约束；组是未来扩展的最小单位，粒度对齐「结算阶段」语义。
- **偏序声明而非 priority 数字**：`after: ['D']` 是显式依赖（可读、可环检测），priority 数字是魔法序（易撞号、不可校验）；DAG 拓扑排序自动满足偏序，新组零心智负担。
- **组内保序**：5 组内的 16 步是顺序习惯 + 日志渲染次序，逐节点化收益为零；组内线性调用保留现状可读性。
- **Golden Order**：注册表化最易破坏的维度就是顺序——把旧序列变成可执行资产，重构后行为一致由测试证明而非声明。
- **fail-fast + 集中注册**：与现有「hub 收窄但可见」架构风格一致；加载期环检测让 DAG 声明可信。

## 后果

- `engine.ts` 的 tick() 减至 ~10 行（dt 守卫 + 拓扑序 for-loop + 组调用）；新增 `tick-registry.ts`（~80 行：类型 + 拓扑排序 + 环检测）。
- **测试**：新增 `tick-registry.test.ts`（拓扑/环/未知依赖/golden-order 快照）；现有 tick 行为测试（8+ 处）全量回归须保持全绿——行为不变的证明。
- **未来扩展**：新 tick 域 = 新组 + after 声明 + golden-order 快照显式更新（diff 可见变更）；不再有「插入序列中间」操作。
- **心智成本**：tick 实际执行顺序从「读 tick() 函数体」变为「读注册表 + 拓扑序」——由 golden-order 快照 + 组语义命名（A-E 对应结算阶段）补偿。
- 上一轮探索结论「触发条件 = 第 3 个新 tick 域」废止（用户决定直接实施，ADR-0034 为本次方向调整记录）。
