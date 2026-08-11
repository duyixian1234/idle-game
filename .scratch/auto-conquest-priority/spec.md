# 自动攻占优先处理低资源消耗目标（auto-conquest-priority）

**Status:** done

## Problem Statement

1. **自动攻占按发现顺序机械扫第一个可用目标**：`autoConquestTick`（`src/engine/conquest.ts:216-239`）遍历 `state.generatedTargets` 数组，对第一个 `kind='conquest'`、`status='available'`、未进行中且守卫 > 0 的目标投满守卫发起——**不比较目标间的资源消耗**。
2. **发现顺序 ≠ 消耗顺序**：生成军事目标守卫 = `min(max(500, ⌊名义产能×40s⌋), ⌊军力上限/3⌋, ⌊名义产能×180s⌋)`（ADR-0033 + conquest-guard-cap），随当期产能/容量动态变化；目标还带 ADR-0028 快照资源费 `costMineral`/`costEnergy`。先发现的目标可能恰好高消耗，自动攻占照打，军力/矿/能白白多耗。玩家期望自动系统「先易后难」——优先处理消耗资源更少的目标。

## Solution

`autoConquestTick` 发起前先对**可立即发起**的候选目标排序，**资源消耗更少者优先**：

- 排序键主序 = **守卫（军力投入，恒全额消耗）升序**；次级 = **快照资源费 `costMineral + costEnergy` 升序**（同守卫时的确定性平局打破，覆盖矿/能消耗）。
- 排序仅作用于「当前可发起」候选（`generatedTargets` 中 `kind='conquest'` 且 `status==='available'` 未进行中、守卫 > 0）——进行中/已攻占目标不参与排序，不改变其位置。
- 军力保底、资源费不足暂停（pausedAt）、纯军力（useFleet=false）、冷却、范围（仅生成目标）等既有语义**全部不变**，只改目标选择顺序。
- 离线路径（`settleOffline` → `autoConquestTick`）复用同一函数，自动继承优先顺序。
- JS `Array.prototype.sort` 稳定（ES2019+），等键目标保持数组顺序（先发现者优先）。

## User Stories

1. 作为通关后开启自动攻占的玩家，我希望自动攻占优先选择守卫（军力消耗）更低的目标，以便军力投入先小后大、资源利用率更高。
2. 作为通关后开启自动攻占的玩家，我希望守卫相同时优先选择资源费（矿/能）更低的目标，以便把高费目标留到经济更充裕时处理。
3. 作为通关后开启自动攻占的玩家，我希望正在攻占/已攻占的目标不参与优先级排序，以便不干扰进行中的攻占结算。
4. 作为挂机玩家，我希望离线批量推进时同样按资源消耗优先处理，以便离线表现与在线一致。
5. 作为玩家，我希望军力保底（容量×10%）与资源费不足暂停语义不变，以便自动攻占不会因排序而耗尽军力或绕过暂停。

## Implementation Decisions

### 1. 目标选择排序（`src/engine/conquest.ts` `autoConquestTick`）

- 把现有 for 循环改为两段：先 `filter` 出可发起候选（`kind==='conquest'`、`cs?.status==='available'`、`cs.startedAt==null`、`guard>0`），按 `(guard, costMineral+costEnergy)` 升序 `sort`，再对排序后候选执行原守卫/保底/`startConquest`/`pausedAt` 逻辑。
- 排序键表达式（文档化注释）：
  ```ts
  const consume = (gt: GeneratedTarget) => gt.guard ?? 0
  const fee = (gt: GeneratedTarget) => (gt.costMineral ?? 0) + (gt.costEnergy ?? 0)
  // sort by consume asc, then fee asc (stable → 等键保持发现顺序)
  ```
- 无新导出、无新 UI、无新 i18n key、无 schema 变更；`balance.ts` 常量不动。
- 现有 `autoConquestTick` 注释更新：加入「按消耗排序优先」一句。

### 2. 文档

- 新增 `docs/adr/0052-auto-conquest-priority.md`：记录排序键决策（守卫主序 + 资源费次级）与「数组序 → 消耗序」动机；`0033-auto-conquest-military-cost.md` 无需改动（本次不改守卫公式）。
- `CONTEXT.md:118-120` 自动攻占条目追加一句：自动攻占按目标资源消耗升序优先处理。

## Testing Decisions

- **缝（seam）**：引擎 `autoConquestTick`（既有 seam，无新缝）。测试直接构造 `generatedTargets` 多目标态调 `autoConquestTick`。
- **好测试标准**：只断言外部行为——「哪个目标被发起攻占」+「投入值」+「lastActionAt」；不测排序实现细节。
- **测试模块**：`src/engine/conquest.test.ts`「自动攻占」describe 新增一组（~5 例）：
  1. 多目标守卫不同（800/1200/2000）→ 首 tick 选守卫 800；`conquest['gen:conquest:0'].invested === 800`。
  2. 下一冷却 tick（`lastActionAt` 推进）→ 选次低守卫目标。
  3. 最低守卫目标进行中（`startedAt != null`）→ 跳过，选次低守卫可发起目标。
  4. 守卫相同、资源费不同 → 选 `costMineral+costEnergy` 更低者。
  5. 离线批量（`settleOffline`，复用 `autoState` 多目标）→ 按消耗升序逐个发起。
- **Prior art**：`conquest.test.ts` 既有自动攻占用例（`autoState` helper L124-133）；`exploration.ts` autoExplore 多候选选择测试（同构 seam）。

## Out of Scope

- 守卫公式/数值调整（ADR-0033/0051 定稿，本次不改）。
- 资源费（costMineral/costEnergy）生成公式调整（ADR-0028）。
- 手动攻占目标列表排序（`render/military.ts`）——本次只改自动选择顺序，UI 列表仍按发现顺序展示。
- 自动攻占冷却时长 / 保底比例调整。
- 展示「下一个自动攻占目标」的 UI 指示。

## Further Notes

- 排序键选择守卫为主序：自动攻占恒投满守卫（军力是每次攻占必耗、且是保底/门槛的资源），矿/能费为条件性消耗且不同量纲，故作次级平局打破而非主序。
- 与外交自动化（autoDiplomacyTick，ADR-0032）对称：外交按 favor 阈值处理，攻占本次引入消耗优先，自动化策略各自独立演进。
