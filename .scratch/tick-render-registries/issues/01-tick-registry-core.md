# Issue 01: tick-registry 核心（类型 + 拓扑排序 + fail-fast）

**阻塞**: 无（独立可提交，作为 02/03 的 import 基线）
**文件**: `src/engine/tick-registry.ts`（新建）、`src/engine/tick-registry.test.ts`（新建）

## 任务

实现注册表核心，不含 engine.ts 重构：

1. **类型**：
   - `type TickGroupId = 'resources' | 'diplomacy' | 'events' | 'settlement' | 'ending'`（5 组）
   - `interface TickGroup { id: TickGroupId; after: TickGroupId[]; run(state: GameState, nowMs: number, rng?: () => number): void }`
2. **拓扑排序**（Kahn 算法）：
   - 输入 `TickGroup[]` → 输出按依赖序的 `TickGroup[]`；同层保持注册序（稳定排序，保证确定性）。
   - 抛错条件（fail-fast，module-load 期调用一次）：
     - **环**：依赖图有环 → `Error('tick-registry: cycle detected: <ids>')`
     - **未知依赖**：`after` 引用未注册组 → `Error('tick-registry: unknown dependency: <id>')`
     - **孤立节点**：存在未注册组被依赖 → 同上（未知依赖已覆盖）
3. **注册辅助**：`createTickRegistry()` 返回 `{ register(group), build(): TickGroup[] }`——`build()` 做拓扑排序 + 校验，结果缓存。

## 验证

- `tick-registry.test.ts`：
  - 拓扑序 = 注册序展开（链式依赖下稳定）
  - 环检测（A after B、B after A → throw）
  - 未知依赖（after 'nope' → throw）
  - 乱序注册（B 先于 A 注册）→ 拓扑排序仍输出 A→B
- typecheck 通过。

## 依赖

无。engine.ts 暂不引用（02 接）。
