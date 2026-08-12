# 04 引擎：generatedTargets 归档条目字段压缩（compactTargetOnArchive）

关联 spec：#29（save-size-opt）

## 任务

终止 `generatedTargets` 归档条目死数据累积（实测 312 条已归档 / 65KB / 33%）。归档只写 archivedRounds 标记、从不精简字段，已归档条目仅剩 UI 折叠区消费 `name`。

## 实现要点

- **导出函数** `compactTargetOnArchive(target: GeneratedTarget): GeneratedTarget`：
  - `kind ∈ {conquest, faction}` → 返回白名单子集 `{kind, id, name, batch}`（丢弃 desc/guard/rewardMineral/rewardTech/bonus/costMineral/costEnergy/initialFavor/initialThreat/tradeDiscount/techShareCostMult/intimidateCostMult/mechanicId）。
  - `kind === 'planet'` → **原样返回**（`planetOutputDef` 读 output/outputPct/mechanicId，防归档产出型天体静默丢产出）。
- **调用点**（写 archivedRounds 标记处，共 3 处）：
  1. `settleOneConquest` 成功分支归档（conquest.ts）
  2. 派系结盟归档（diplomacy.ts）
  3. 机制型天体探索完归档（exploration.ts，planet 由守卫保证原样）
- **存量兜底**：`deserializeSave` 或迁移链末端对既有 generatedTargets 全量幂等压缩一次（已压缩条目再压缩无变化，安全）。
- **引擎安全**：`settleOneConquest` 对已归档条目（startedAt/finishAt 已删）直接 return null，不读 guard/reward；`isConquestAvailable` 对 conquered 直接 false——压缩后无回归路径。

## 验收

- 测试 #02 全绿（红→绿）。
- 全量 vitest + tsc 不回归。
- 真实存档验证（#05）：generatedTargets 已归档条目精简，整体体积 318KB → ~183KB（省 42%）。

