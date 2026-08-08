# 03 — 存档迁移 v15（折算返还升级投入）

**What to build:** SCHEMA 14→15，新增 `migrateV14ToV15`（参照 `migrateV13ToV14` 链式范式，挂载于迁移链末尾）。遍历 7 普通建筑 `upgrades[id]`，用原 `upgradeCost` 公式倒算每级投入（按 costKey 分矿物/能源/科技），累加返还 `state.resources`；unique `upgrades` 不动。`SCHEMA_VERSION` 升至 15。ADR-0036 决策5 / ADR-0005 链式迁移范式。

**Blocked by:** 01（砍升级后迁移目标 7 id 明确，且 01 删了 upgradeCost 普通分支——迁移需在 01 之前用原公式快照倒算，或迁移函数内置原公式副本）

**Status:** done

- [x] `SCHEMA_VERSION = 15`，老档（v14）加载触发 `migrateV14ToV15`
- [x] 7 普通建筑 `upgrades>0` 的老档：每级投入按原 `upgradeCost` 公式倒算，资源正确返还到 `state.resources`，`upgrades[id]` 清零
- [x] unique 建筑 `upgrades` 不动（starportMine/stellarArray/thinkTank/ringSmelter/dock 保留等级）
- [x] 迁移后存档可正常游玩，无资源凭空消失/凭空增加（迁移前后资源守恒校验）
- [x] save.test 老档 fixture 迁移断言绿（含 upgrades=0 与 upgrades>0 两类 fixture）
