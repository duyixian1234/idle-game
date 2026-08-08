# tick 注册表 + render 注册表（tick-render-registries）

**Status:** ready-for-agent

## Problem Statement

`tick()` 硬编码 ~20 步线性序列（顺序约束靠注释）、`render()` 集中调度 17 个渲染调用（session 知道全部面板）——两处都是架构评审（2026-08-08 v1/v2）确认的「序列硬编码」热点：

1. **tick 顺序耦合**：新增域 = 在 tick 序列里插入 1 行，回归测试必然抖动；三组真依赖（coercion→autoDiplo cooldown / settleExpeditions→autoExploreDispatch / checkEnding→checkAchievements）以注释约束，无结构保护。
2. **render 集中调度**：候选 ③（panels 拆分）已落地实现模块化，但 render() 调用链未变——session 仍 413 行 / 30 import / 知道全部面板。
3. **评审结论**：② 原判 Speculative / ④ 原判低优先——用户决定直接实施（纯架构优化 + 面向未来扩展），依赖审计后收敛为「组 DAG + 组内序列」（tick）与「阶段保序 + 宽 ctx」（render）。

## Solution

两个注册表，两个独立 commit（先 tick 后 render，可独立回滚），共享 **Golden Order 保序机制**：

### Commit 1 — tick 注册表（ADR-0034）

- `src/engine/tick-registry.ts`（新建，~80 行）：`TickGroup = { id, after: GroupId[], run(state, nowMs, rng?) }`；拓扑排序（Kahn）+ fail-fast（环/未知依赖/孤立节点抛错）。
- 5 组（组内保持原线性调用）：`A 资源链`（dt/productionReport/累加/统计/维护×2/兜底）→ `B 外交链`（coercion/autoDiplo/unlock/时间推进）→ `C 事件链`（trigger/autoResolve/stormHarvest/planetUnlocks/federationStory）→ `D 结算链`（settleConquests/settleExpeditions/autoExploreDispatch/autoConquestTick）→ `E 结局链`（checkEnding/playMilestone/checkAchievements/pruneStaleEvents）。
- `engine.ts` 的 tick() 重构：dt 守卫 + 注册表 for-loop；集中注册保持 hub 可见性。
- 测试：`tick-registry.test.ts`（拓扑序 / 环检测 / 未知依赖 / **golden-order 快照** = 旧序列展开）；现有 tick 行为测试 8+ 处全量回归全绿。

### Commit 2 — render 注册表（ADR-0035）

- `src/ui/render/registry.ts`（新建，~60 行）：`RenderNode = { id, phase: 'content'|'overlay'|'badge', render(ctx) }`；执行 = phase 分组序（content → overlay → badge）。
- `session/index.ts` render() 重构：共享计算惰性 memo（netProduction 1 次）+ 状态副作用（logdir/tab/展开态/滚动）留主函数 + registry for-loop。
- 节点 ~18 个：content 12（resources/planetBar/planetMechanic/build/interstellar/tech/diplomacy/military/archive/explore/settings/pendingEvents）+ overlay 4（ending/tutorial/autoConfig/breakdown）+ badge 2（badges/tabs）；`renderLogInto` 留主函数（增量游标 + 滚动副作用）。
- 测试：`render/registry.test.ts`（phase 排序 + **golden-order 快照** = 旧 render() 调用序）；现有 dom 测试 112 处全量回归全绿。

### 验收契约（两 commit 共用）

1. `tsc --noEmit` 0 错误。
2. 全量 vitest 全绿（当前 52 files / 889 tests），行为逐字节一致由测试证明。
3. golden-order 测试：注册拓扑序展开 == 固化旧序列快照。
4. 工作区无 panels/旧调用残留（`rg` 检查）。
5. 两个 commit 独立、可单独回滚；ADR-0034/0035 已落 `docs/adr/`，README 35 篇，CONTEXT 术语 +3（结算阶段组/黄金序/渲染阶段）。

## 非目标

- 不做 20 节点全 DAG（真实偏序仅 5 组，组内保持线性）。
- 不做 render 细 N 段 phase 或窄 ctx 接口（z-order 是唯一真约束，宽 ctx 复用 SessionCtx 系）。
- 不引入模块自注册副作用 import（保持 hub 集中可见，ADR-0002/0003 风格）。
- 不改任何引擎/渲染行为与数值（纯结构重构；ctx 惰性 memo 是唯一微优化，无行为差异）。
