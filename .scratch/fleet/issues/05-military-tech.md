# 05 — 军械科技舰队放大器

**What to build:** 攻占链的军械科技（militaryTech，Lv1-5，攻占虫群前哨解锁）从"军力产出提升"扩展出舰队维度：每级舰队战力 +`FLEET_POWER_TECH_PER_LEVEL`%（balance-sim 定标，锚点 ±10%，满级 ≈ 1.5× 基础）。军械科技投资在舰队时代依然有价值，与骚扰防御形成联动。

**Blocked by:** 01 — 数据模型 prefactor；04 — 舰队防御闭环

**Status:** resolved

- [x] 舰队战力公式接入军械科技倍率（`1 + FLEET_POWER_TECH_PER_LEVEL × militaryTechLevel`），常数入 balance.ts
- [x] 战力预览 UI 反映科技倍率（`data-fleet-*` 战力行含科技贡献）
- [x] 引擎单测：科技 0/1/满级倍率正确；倍率变化改变自动迎击判定边界（如铁卫 70 在 3 艘无科技不够、科技 Lv2+ 够）
- [x] 全量 vitest 回归绿 + typecheck clean
