# 02 — 发现物池与产出管线（3 产出型天体 + 重复发现补偿 + 奖池权重）

**What to build:** 产出型探索天体与产出管线接入：
- `data.ts`：`EXPLORE_PLANETS` 新增 3 个（`PlanetDef` 扩 `output?: Partial<Record<ResourceKey, number>>` + `outputPct?: Partial<Record<ResourceKey, number>>`，沿用 `discoverOnly: true`）：
  | id | name | output | outputPct |
  |---|---|---|---|
  | `rubbleBelt` | 碎星矿带 | `{ mineral: 2 }` | `{ mineral: 0.02 }` |
  | `heliumNebula` | 氦闪气云 | `{ energy: 1.5 }` | `{ energy: 0.02 }` |
  | `riftChasm` | 深空裂谷 | `{ mineral: 1, tech: 0.4 }` | `{ mineral: 0.01, tech: 0.01 }` |
- `production.ts`：`productionReport` 加入点 = `applyPlanetMechanics` 之后、`permMult` 之前：
  `planetOutput[key] = (def.output[key] × techMult[key] + def.outputPct[key] × nominalAfterMechanics[key]) × (1 + outputBonus)`
  ——基础值吃 techMult（不吃 activePlanet 机制：产出型不参与切换）；比例部分基于机制后 nominal（天然含 tech/机制/主基地规模，**无递归**：基数为建筑管线产出）；整体随后 ×permMult（占比恒 2%/2%/1%）；天体产出无 `consumes`、不参与能源折减、不受军力截断。
- `types.ts`：`PlanetState` 扩 `outputBonus?: number`（可选字段，`?? 0` 容错——顶层 `planets` 仅 `isPlainObject` 校验，**零迁移，schemaVersion 保持 6**）。
- `exploration.ts` `settleOne` 重复发现补偿：
  - faction 已发现 → `favor = min(100, favor + 5)`（新增 `EXPEDITION_REPEAT_FAVOR_GAIN = 5`），否则创建。
  - planet 已发现 → `outputBonus = min(0.5, (outputBonus ?? 0) + 0.1)`（新增 `EXPEDITION_OUTPUT_BONUS_STEP = 0.1` / `EXPEDITION_OUTPUT_BONUS_CAP = 0.5`），否则解锁创建。
- `expeditionPool`：3 新天体各 w1 入池（与物流港/拓荒一致）；势力 w2、资源补偿 w = max(2, 6-已收集) 不变。
- `balance.ts`：新增上述 3 个常数（探索族分组）。

**Blocked by:** None（独立于 01；产出计算不依赖多槽）

**Status:** resolved

- [x] `data.ts`：3 产出天体 def + `PlanetDef.output/outputPct` 类型
- [x] `production.ts`：产出管线公式（加入点/无递归/不吃 activePlanet/不吃能源折减）+ 测试
- [x] `types.ts`：`PlanetState.outputBonus?`
- [x] `exploration.ts`：重复发现补偿（favor +5 / outputBonus +0.1 封顶 0.5）+ 奖池 3 天体 w1
- [x] `balance.ts`：`EXPEDITION_REPEAT_FAVOR_GAIN` / `EXPEDITION_OUTPUT_BONUS_STEP/CAP`
- [x] 测试：产出公式（2×techMult×（1+bonus）+ nominal×2%；NG+ 下占比不变量 ~2%；无递归）、重复发现补偿路径、奖池权重

**Acceptance:** 3 产出天体发现即产矿/能/科（比例挂钩，占比恒定）；重复发现势力 +5 好感封顶 100、天体 +10% 产出封顶 +50%；奖池含 5 天体；零存档迁移（outputBonus 可选字段容错）。
