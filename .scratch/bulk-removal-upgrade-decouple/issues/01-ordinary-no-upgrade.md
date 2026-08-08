# 01 — 砍普通建筑升级（机制二分引擎+UI）

**What to build:** 7 个普通可多次购买建筑（miner/solar/lab/refinery/deepDrill/barracks/militaryPort）取消升级能力，产出回归 `produces×count`（数量维度）；等级维度仅留 unique 大件（×2/级）与科技（×1.7^level）。引擎层 `upgradeBuilding` 对 7 id 封死拒绝、`upgradeCost` 删普通分支（unique 分支保留）、`ordinaryUpgradeCostValue` 删、`production` 的 `pipelineNominal` 去 levelMultiplier 普通应用；常量 `UPGRADE_PREMIUM`/`ORDINARY_UPGRADE_LEVEL_GROWTH`/`LEVEL_COST_FACTOR` 删、`buildingCost` 等级因子（`1+0.05×level`）随 upgrades 恒 0 简化。UI 层 build panel 移除升级按钮与 militaryPort 预览/title 分支。军力容量 `militaryCap` 公式不动（portLevel 恒 0 自然失效）。SHARED 保留：`LEVEL_PRODUCTION_BONUS`/`levelMultiplier`/`UNIQUE_UPGRADE_GROWTH`/unique 升级全链路。ADR-0036。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 7 普通建筑 `upgradeBuilding` 调用被拒绝（返回错误/无操作），unique 建筑 `upgradeBuilding` 正常
- [x] 普通建筑产出 = `produces×count`（无 levelMultiplier 放大），unique 产出仍随 levelMultiplier 增长
- [x] `militaryCap` portLevel 恒 0：25 军港 = 5100 容量；COERCION 解锁 5000 仍由 25 军港达成；militaryCap5k 成就触发不变
- [x] build panel 普通建筑无升级按钮、无 +50%/级 预览；unique 建筑升级按钮正常
- [x] buildings.test 普通升级封死断言 + 产出回归断言绿；unique 升级测试保留绿
- [x] 删 cost-softcap 升级温和增长组、post100-cost-curve 升级段测试；military.test 删军港升级段、加 portLevel 恒 0 断言
- [x] SHARED 常量/函数保留未误删（LEVEL_PRODUCTION_BONUS/levelMultiplier/UNIQUE_UPGRADE_GROWTH）
