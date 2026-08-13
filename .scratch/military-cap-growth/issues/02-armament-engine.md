## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

深空军备科技线实现，让 ticket 01 的红测试转绿：

1. **`TechEffectMilitaryCapAll`**：`{ kind: 'militaryCapAll'; pct: number }`，并入 `TechEffect` union（data.ts 326-332 行）。
2. **`deepArmament` 科技 def**：`cost: INFINITE_TECH_COST_BASE`、`effect: { kind: 'militaryCapAll', pct: INFINITE_TECH_PCT_PER_LEVEL }`、`maxLevel: INFINITE_TECH_MAX_LEVEL`、`afterEnding: true`，置于无限科技族（deepNavigation 之后）。
3. **`militaryCap()` 乘数轴**（production.ts:33-42）：新增 `× (1 + INFINITE_TECH_PCT_PER_LEVEL × (techLevels.deepArmament ?? 0))`，置于虫洞项之后。
4. **`canTechUpgrade`**（tech.ts:19-25）：upgradable 判定新增 `militaryCapAll` kind。
5. **i18n**：`tech.deepArmament.name/desc`（zh/en，+2%/级 军力容量）。

`productionMultipliers` 的 `productionAll` 分支不动——`militaryCapAll` 不进产出倍率，军力容量单独结算。

## Acceptance criteria

- [ ] ticket 01 红测试转绿（militaryCap 放大/叠乘/canTechUpgrade/NG+ 重置）
- [ ] 新增科技在科技面板可见（含效果文案）
- [ ] tsc + 相关测试全绿，现有测试不回归

## Blocked by

- https://github.com/duyixian1234/idle-game/issues/37

## Status

ready-for-agent
