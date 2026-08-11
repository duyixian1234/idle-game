# 02 — 军械科技等级上限 5 → 10

**What to build:** 军械科技（militaryTech）`maxLevel` 从 5 提升到 10，所有数值公式不变（产出每级 +0.5、军力容量每级 +10%、舰队战力每级 +10%）——Lv10 军力产出 ×5.5、容量 ×2、舰队战力 ×2。同步更新受影响的注释与测试基准。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `data.ts` `militaryTech.maxLevel: 5 → 10`（`descArgs` 不变——描述每级效果与上限无关）
- [x] `fleet.ts` `fleetPower` 注释同步：「满级 Lv5 = 1.5×」→「满级 Lv10 = 2×」（`FLEET_POWER_TECH_PER_LEVEL` 数值不变）
- [x] `military.test.ts`：满级断言 5 → 10（Lv10 升级返回「已满级」、等级保持 10；Lv5 升级现在应成功）
- [x] `military.test.ts` / `fleet.test.ts`：新增 militaryTech Lv10 边界断言——`militaryCap` 容量 ×(1+0.1×10)=×2、`fleetPower` 战力 ×(1+0.1×10)=×2
- [x] `balance-simulation.test.ts` 满配基准复核（`militaryTech = 5` 处按模拟语义判断：终局满配 → 升 Lv10；中期配置 → 保留）——守卫测试「后期形态」升军械 Lv10 满配并重算（guard 22,000 / cap 40,200 / 回充 47.31s）；组合/中间档位测试保留 Lv5
- [x] `production.test.ts` / `conquest.test.ts` / `fleet.test.ts` 中 Lv5 档位引用复核（中间级合法，保留）
- [x] `vitest run` 全绿（980 passed）+ `tsc --noEmit` 零错误
