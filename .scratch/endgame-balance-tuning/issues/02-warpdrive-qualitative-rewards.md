# 02 — warpDrive 满级质变（Lv10 派遣军力 −10% / Lv20 护航费 −10%）

**What to build:** 星舰推进升到 Lv10 后探索派遣军力消耗降低 10%，升到 Lv20 后护航远征费降低 10%——两个「摩擦降低」型质变让满级星舰有别于 Lv16 的可感知终点，成本曲线 1.7^lv 保持不动（科技点出口容量锚定不受扰动）。

**Blocked by:** None — can start immediately（与 01 军力容量通道相互独立，可并行）

**Status:** ready-for-agent

- [ ] 新常量入 balance.ts：`WARP_EXPEDITION_COST_REDUCTION = 0.1`、`WARP_ESCORT_FEE_REDUCTION = 0.1`
- [ ] `expeditionMilitaryCost`：`warpDrive ≥ 10` 时 ×(1 − 0.1)；`< 10` 与现状逐字节一致（存量测试不破）
- [ ] `escortFee`：`warpDrive ≥ 20` 时 ×(1 − 0.1)；`< 20` 与现状逐字节一致（存量测试不破）
- [ ] 科技卡 desc/effect label 更新：「Lv10 派遣军力 −10% / Lv20 护航费 −10%」
- [ ] balance-sim 断言：`Lv10 派遣军力 = 0.9×原值`、`Lv20 护航费 = 0.9×原值`（质变生效且锚定产出不脱钩）
- [ ] 护航收获倍率/离线封顶不变（不与跃迁枢纽叠加，ADR-0026 否决项复核）
- [ ] 无 SCHEMA 升级（读 techLevels.warpDrive，零迁移）
