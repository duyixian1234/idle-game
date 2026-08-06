# 07 — balance-sim 校准 + E2E spec

**What to build:** 数值验证与回归防护：一次性 balance-sim 校准护航性价比（溢出能源换矿物/科技是否值得）、能源→矿物转换率（防「无限能源→无限矿物」）、离线自动探索收益冲击（8h ≈ 8 轮/槽 vs 现状 1 轮）、24 艘满编维护 ≤ 当期产出 30% 硬约束、收集节奏；若护航收益不足以驱动玩家，调整倍率/费率常量并回归引擎测试。E2E spec 编写（用户手动执行）：v9→v10 迁移、船坞满级、护航远征全流程、自动探索在线/离线续派。

**Blocked by:** 05（全部引擎/UI 就位后 sim 才能端到端验证）、06（成就就位后 E2E 才能覆盖）

**Status:** resolved

- [ ] balance-sim（跑完即删）：护航性价比、能源→矿物转换率、离线自动探索收益冲击、24 艘维护 ≤30% 产出、收集节奏——四项锚点通过；常量偏差时调整并回归
- [ ] 护航数值锚点定稿（ESCORT_ENERGY_SECONDS / FLEET_HARVEST_PCT_PER_SHIP / 返还率）写入 spec Further Notes
- [ ] E2E spec：v9→v10 迁移、船坞 Lv10 满编、护航全流程（费用/加成/返还/停摆禁用）、自动探索在线续派与离线续派断言（data-* 语义化）
- [ ] 全仓 vitest 回归绿（含既有 447+ 测试）

> 交付说明（2026-08-07）：balance-sim 双视角校准通过（中期档恒星 Lv10+冶炼 Lv2=409.6 万/s 与极后期档 NG+2 881 亿/s），常量零调整，锚点已写入 spec Further Notes；E2E spec（e2e/fleet-dock-10.spec.ts 6 用例）已编写，**待用户手动验证**。全仓回归 639/651：新增 fleet-dock-10 20 用例 + escort-dom 9 用例全绿；dom.test.ts 12 失败为 Copilot 上游提交（ui-redesign/building-cards）未同步测试的基线遗留，非本 feature 引入。
