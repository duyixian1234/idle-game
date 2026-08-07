# 01 — 星舰科技线全链路（定义 + 升级 + 战力挂点）

**What to build:** 通关后解锁的星舰科技线（TECHS 新条目，Lv1-20）完整可用：玩家通关后能研发并升级星舰科技，每级舰队战力 +10%（与军械科技乘积），成本按 1.7^n 递增（base = 100k 矿物 + 20k 科技点）；科技卡片经现有科技页渲染自动出现。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 通关前（playing）星舰科技不可研发，通关后（ended/infinite）可研发
- [ ] Lv1→Lv20 逐级可升，Lv20 后不可再升（maxLevel 生效）
- [ ] 升级成本 = 100k 矿物 + 20k 科技点 × 1.7^当前等级（Lv0 即 base）
- [ ] `fleetPower` 反映星舰倍率：`count × 1200 × (1+0.1×militaryLv) × (1+0.1×warpLv)`
- [ ] 星舰等级 0 时 `fleetPower` 与现状逐字节一致（存量测试不破）
- [ ] 科技页出现新线卡片，显示等级/成本/效果（复用现有 TECHS 渲染）
- [ ] 无 SCHEMA 升级（techLevels 新 key 零迁移）
